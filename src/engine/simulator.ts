import {
  BottleneckDiagnostic,
  CityNetworkData,
  EdgeData,
  EdgeRuntimeStats,
  ExternalQueueItem,
  NodeData,
  NodeRuntimeStats,
  SignalConfig,
  SignalPhaseState,
  SimulationSnapshot,
  TimeSeriesPoint,
  VehicleState,
} from '../types/simulation';
import { SeededRandom } from './prng';
import {
  computeEdgeCapacity,
  findShortestPath,
  getApproachAxis,
  getIncomingApproachDirection,
  getTurnType,
  VEHICLE_EFFECTIVE_LENGTH_METERS,
} from './router';

const ACCEL_MPS2 = 3.2;
const STOP_LINE_BUFFER_METERS = 0.5;
const WAITING_SPEED_THRESHOLD_MPS = 1.5;

interface DemandSpawnerState {
  odId: string;
  accumulator: number;
  nextThreshold: number;
}

export class TrafficSimulator {
  private network: CityNetworkData;
  private nodeMap: Map<string, NodeData>;
  private edgeMap: Map<string, EdgeData>;
  private rng: SeededRandom;
  private spawners: DemandSpawnerState[];

  private tickCount = 0;
  private timeSeconds = 0;
  private nextVehicleId = 1;

  private totalGenerated = 0;
  private completedVehiclesCount = 0;
  private totalCompletedTravelTimeSeconds = 0;

  private externalQueues: ExternalQueueItem[] = [];
  private vehicles: VehicleState[] = [];

  private edgeStats: Record<string, EdgeRuntimeStats> = {};
  private nodeStats: Record<string, NodeRuntimeStats> = {};
  private cumulativeEdgeEntered: Record<string, number> = {};
  private cumulativeEdgeSpillback: Record<string, number> = {};
  private cumulativeNodeThroughput: Record<string, number> = {};
  private cumulativeNodeSpillback: Record<string, number> = {};

  private routeCache: Map<string, string[] | null> = new Map();
  private history: TimeSeriesPoint[] = [];
  private lastPerfSimStepMs = 0;

  constructor(network: CityNetworkData) {
    // Deep clone network so external mutations do not corrupt running state
    this.network = JSON.parse(JSON.stringify(network)) as CityNetworkData;
    this.nodeMap = new Map();
    this.edgeMap = new Map();
    this.rng = new SeededRandom(this.network.config.seed);
    this.spawners = [];
    this.rebuildMapsAndReset();
  }

  private rebuildMapsAndReset(): void {
    this.nodeMap.clear();
    this.edgeMap.clear();

    for (const n of this.network.nodes) {
      this.nodeMap.set(n.id, n);
    }
    for (const e of this.network.edges) {
      e.capacity = computeEdgeCapacity(e.lengthMeters, e.lanes);
      this.edgeMap.set(e.id, e);
    }

    this.rng = new SeededRandom(this.network.config.seed);
    this.tickCount = 0;
    this.timeSeconds = 0;
    this.nextVehicleId = 1;
    this.totalGenerated = 0;
    this.completedVehiclesCount = 0;
    this.totalCompletedTravelTimeSeconds = 0;
    this.externalQueues = [];
    this.vehicles = [];
    this.history = [];
    this.routeCache.clear();

    this.spawners = this.network.demands.map((od) => ({
      odId: od.id,
      accumulator: 0,
      // Deterministic initial threshold in [0.6, 1.1]
      nextThreshold: 0.6 + this.rng.next() * 0.5,
    }));

    this.cumulativeEdgeEntered = {};
    this.cumulativeEdgeSpillback = {};
    for (const e of this.network.edges) {
      this.cumulativeEdgeEntered[e.id] = 0;
      this.cumulativeEdgeSpillback[e.id] = 0;
    }

    this.cumulativeNodeThroughput = {};
    this.cumulativeNodeSpillback = {};
    for (const n of this.network.nodes) {
      this.cumulativeNodeThroughput[n.id] = 0;
      this.cumulativeNodeSpillback[n.id] = 0;
    }

    if (
      this.network.config.initialActiveVehicles &&
      this.network.config.initialActiveVehicles > 0
    ) {
      this.seedInitialVehicles(this.network.config.initialActiveVehicles);
    }

    this.refreshRuntimeStats();
    this.recordHistoryPoint();
  }

  private seedInitialVehicles(targetCount: number): void {
    const validRoutes: { odId: string; origin: string; destination: string; route: string[] }[] = [];
    for (const od of this.network.demands) {
      const r = this.resolveRoute(od.origin, od.destination);
      if (r && r.length > 0) {
        validRoutes.push({
          odId: od.id,
          origin: od.origin,
          destination: od.destination,
          route: r,
        });
      }
    }
    if (validRoutes.length === 0) return;

    // Distribute vehicles across edges and lanes respecting >= 7.5m headway
    const edgeLaneNextPos = new Map<string, number>();
    for (const e of this.network.edges) {
      for (let l = 0; l < e.lanes; l++) {
        edgeLaneNextPos.set(`${e.id}:${l}`, e.lengthMeters - 6.0);
      }
    }

    let placed = 0;
    let attempts = 0;
    const maxAttempts = targetCount * 8;

    while (placed < targetCount && attempts < maxAttempts) {
      attempts++;
      const tmpl = validRoutes[placed % validRoutes.length];
      const routeIdx = this.rng.nextInt(0, tmpl.route.length - 1);
      const edgeId = tmpl.route[routeIdx];
      const edge = this.edgeMap.get(edgeId);
      if (!edge) continue;

      let chosenLane = -1;
      let chosenPos = -1;
      for (let l = 0; l < edge.lanes; l++) {
        const key = `${edge.id}:${l}`;
        const pos = edgeLaneNextPos.get(key) ?? -1;
        if (pos >= 0) {
          chosenLane = l;
          chosenPos = pos;
          edgeLaneNextPos.set(key, pos - VEHICLE_EFFECTIVE_LENGTH_METERS - 0.5);
          break;
        }
      }

      if (chosenLane >= 0 && chosenPos >= 0) {
        this.totalGenerated += 1;
        this.cumulativeEdgeEntered[edge.id] = (this.cumulativeEdgeEntered[edge.id] || 0) + 1;
        this.vehicles.push({
          id: this.nextVehicleId++,
          odId: tmpl.odId,
          origin: tmpl.origin,
          destination: tmpl.destination,
          routeEdgeIds: [...tmpl.route],
          routeIndex: routeIdx,
          currentEdgeId: edge.id,
          lane: chosenLane,
          distanceMeters: Number(chosenPos.toFixed(2)),
          speedMps: Number(((edge.speedLimitKmh / 3.6) * 0.7).toFixed(2)),
          spawnTimeSeconds: 0,
          enterNetworkTimeSeconds: 0,
          waitTimeSeconds: 0,
          isWaiting: false,
          blockedBySpillback: false,
        });
        placed++;
      }
    }
  }

  public reset(newNetwork?: CityNetworkData): void {
    if (newNetwork) {
      this.network = JSON.parse(JSON.stringify(newNetwork)) as CityNetworkData;
    }
    this.rebuildMapsAndReset();
  }

  public getNetwork(): CityNetworkData {
    return this.network;
  }

  /**
   * Updates signal timings live or before run
   */
  public updateNodeSignal(nodeId: string, signal: SignalConfig): void {
    const node = this.nodeMap.get(nodeId);
    if (node) {
      node.signal = { ...signal };
      this.refreshRuntimeStats();
    }
  }

  public applySignalPlan(signals: Record<string, SignalConfig>): void {
    for (const [nodeId, sig] of Object.entries(signals)) {
      const node = this.nodeMap.get(nodeId);
      if (node) {
        node.signal = { ...sig };
      }
    }
    this.refreshRuntimeStats();
  }

  /**
   * Evaluates the deterministic signal state of a node at time `t`
   */
  public static evaluateSignalState(
    signal: SignalConfig,
    timeSeconds: number
  ): {
    phase: SignalPhaseState;
    phaseElapsedSeconds: number;
    phaseDurationSeconds: number;
    cycleSeconds: number;
    nsLight: 'GREEN' | 'YELLOW' | 'RED';
    ewLight: 'GREEN' | 'YELLOW' | 'RED';
  } {
    const nsG = Math.max(5, signal.nsGreenSeconds);
    const ewG = Math.max(5, signal.ewGreenSeconds);
    const yel = Math.max(1, signal.yellowSeconds);
    const allRed = Math.max(1, signal.allRedSeconds);
    const cycle = nsG + yel + allRed + ewG + yel + allRed;

    if (!signal.enabled) {
      return {
        phase: 'NS_GREEN',
        phaseElapsedSeconds: 0,
        phaseDurationSeconds: cycle,
        cycleSeconds: cycle,
        nsLight: 'GREEN',
        ewLight: 'GREEN',
      };
    }

    const localT = (((timeSeconds + signal.offsetSeconds) % cycle) + cycle) % cycle;

    const t1 = nsG;
    const t2 = t1 + yel;
    const t3 = t2 + allRed;
    const t4 = t3 + ewG;
    const t5 = t4 + yel;

    if (localT < t1) {
      return {
        phase: 'NS_GREEN',
        phaseElapsedSeconds: localT,
        phaseDurationSeconds: nsG,
        cycleSeconds: cycle,
        nsLight: 'GREEN',
        ewLight: 'RED',
      };
    } else if (localT < t2) {
      return {
        phase: 'NS_YELLOW',
        phaseElapsedSeconds: localT - t1,
        phaseDurationSeconds: yel,
        cycleSeconds: cycle,
        nsLight: 'YELLOW',
        ewLight: 'RED',
      };
    } else if (localT < t3) {
      return {
        phase: 'ALL_RED_NS_TO_EW',
        phaseElapsedSeconds: localT - t2,
        phaseDurationSeconds: allRed,
        cycleSeconds: cycle,
        nsLight: 'RED',
        ewLight: 'RED',
      };
    } else if (localT < t4) {
      return {
        phase: 'EW_GREEN',
        phaseElapsedSeconds: localT - t3,
        phaseDurationSeconds: ewG,
        cycleSeconds: cycle,
        nsLight: 'RED',
        ewLight: 'GREEN',
      };
    } else if (localT < t5) {
      return {
        phase: 'EW_YELLOW',
        phaseElapsedSeconds: localT - t4,
        phaseDurationSeconds: yel,
        cycleSeconds: cycle,
        nsLight: 'RED',
        ewLight: 'YELLOW',
      };
    } else {
      return {
        phase: 'ALL_RED_EW_TO_NS',
        phaseElapsedSeconds: localT - t5,
        phaseDurationSeconds: allRed,
        cycleSeconds: cycle,
        nsLight: 'RED',
        ewLight: 'RED',
      };
    }
  }

  /**
   * Advances simulation by `steps` fixed time intervals (`dtSeconds = 0.2s`).
   */
  public step(steps = 1): SimulationSnapshot {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = this.network.config.dtSeconds || 0.2;

    for (let s = 0; s < steps; s++) {
      this.tickCount += 1;
      this.timeSeconds = Number((this.tickCount * dt).toFixed(2));

      // Invalidate route cache periodically when in congested dynamic routing mode
      if (this.network.config.routingMode === 'congested' && this.tickCount % 15 === 0) {
        this.routeCache.clear();
      }

      // 1. Spawn new demand into externalQueues
      this.spawnDemands(dt);

      // 2. Move vehicles on edges, obey signals & car-following, process transitions & completions
      this.updateVehiclesOnNetwork(dt);

      // 3. Try to admit vehicles from externalQueues onto entry edges
      this.processExternalQueues(dt);

      // 4. Refresh per-edge and per-node runtime telemetry
      this.refreshRuntimeStats();

      // 5. Record time-series history every 2.0 seconds of simulation time (every 10 ticks)
      if (this.tickCount % 10 === 0) {
        this.recordHistoryPoint();
      }
    }

    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.lastPerfSimStepMs = Number((t1 - t0).toFixed(2));

    return this.getSnapshot();
  }

  private resolveRoute(origin: string, destination: string): string[] | null {
    const key = `${origin}->${destination}`;
    if (this.routeCache.has(key)) {
      return this.routeCache.get(key) ?? null;
    }
    const route = findShortestPath(
      this.network.nodes,
      this.network.edges,
      origin,
      destination,
      this.network.config.routingMode,
      this.edgeStats
    );
    this.routeCache.set(key, route);
    return route;
  }

  private spawnDemands(dt: number): void {
    const mult = this.network.config.demandMultiplier;

    for (let i = 0; i < this.network.demands.length; i++) {
      const od = this.network.demands[i];
      const spawner = this.spawners[i];
      if (!spawner) continue;

      const effectiveVph = Math.max(0, od.vehiclesPerHour * mult);
      const ratePerSec = effectiveVph / 3600;
      spawner.accumulator += ratePerSec * dt;

      while (spawner.accumulator >= spawner.nextThreshold) {
        spawner.accumulator -= spawner.nextThreshold;
        // Mean of [0.75, 1.25] is 1.0 -> unbiased expected rate with realistic headway jitter
        spawner.nextThreshold = 0.75 + this.rng.next() * 0.5;

        const route = this.resolveRoute(od.origin, od.destination);
        const isDisconnected = !route || route.length === 0;

        this.totalGenerated += 1;
        this.externalQueues.push({
          id: this.nextVehicleId++,
          odId: od.id,
          origin: od.origin,
          destination: od.destination,
          routeEdgeIds: route ? [...route] : [],
          spawnTimeSeconds: this.timeSeconds,
          waitTimeSeconds: 0,
          disconnected: isDisconnected,
        });
      }
    }
  }

  /**
   * Finds a lane on `edge` that has space at the entrance (distanceMeters >= 7.5m for all vehicles on that lane),
   * and verifies total vehicles on `edge` < `edge.capacity`.
   */
  private findAvailableEntryLane(
    edge: EdgeData,
    vehiclesByEdge: Map<string, VehicleState[]>
  ): number | null {
    const list = vehiclesByEdge.get(edge.id) || [];
    if (list.length >= edge.capacity) {
      return null;
    }

    // Check each lane for tail clearance >= VEHICLE_EFFECTIVE_LENGTH_METERS (7.5m)
    let bestLane: number | null = null;
    let maxTailClearance = -1;

    for (let lane = 0; lane < edge.lanes; lane++) {
      let minDistOnLane = Infinity;
      for (const v of list) {
        if (v.lane === lane && v.distanceMeters < minDistOnLane) {
          minDistOnLane = v.distanceMeters;
        }
      }
      if (minDistOnLane >= VEHICLE_EFFECTIVE_LENGTH_METERS) {
        if (minDistOnLane > maxTailClearance) {
          maxTailClearance = minDistOnLane;
          bestLane = lane;
        }
      }
    }

    return bestLane;
  }

  private processExternalQueues(dt: number): void {
    if (this.externalQueues.length === 0) return;

    const vehiclesByEdge = new Map<string, VehicleState[]>();
    for (const v of this.vehicles) {
      let arr = vehiclesByEdge.get(v.currentEdgeId);
      if (!arr) {
        arr = [];
        vehiclesByEdge.set(v.currentEdgeId, arr);
      }
      arr.push(v);
    }

    const remainingQueue: ExternalQueueItem[] = [];

    for (const item of this.externalQueues) {
      // Re-resolve if previously disconnected or in congested mode
      if (item.disconnected || this.network.config.routingMode === 'congested') {
        const refreshed = this.resolveRoute(item.origin, item.destination);
        if (refreshed && refreshed.length > 0) {
          item.routeEdgeIds = [...refreshed];
          item.disconnected = false;
        } else {
          item.disconnected = true;
        }
      }

      if (item.disconnected || item.routeEdgeIds.length === 0) {
        item.waitTimeSeconds += dt;
        remainingQueue.push(item);
        continue;
      }

      const firstEdgeId = item.routeEdgeIds[0];
      const firstEdge = this.edgeMap.get(firstEdgeId);
      if (!firstEdge) {
        item.disconnected = true;
        item.waitTimeSeconds += dt;
        remainingQueue.push(item);
        continue;
      }

      const lane = this.findAvailableEntryLane(firstEdge, vehiclesByEdge);
      if (lane !== null) {
        const initialSpeed = Math.min(firstEdge.speedLimitKmh / 3.6, 9.0);
        const newVeh: VehicleState = {
          id: item.id,
          odId: item.odId,
          origin: item.origin,
          destination: item.destination,
          routeEdgeIds: item.routeEdgeIds,
          routeIndex: 0,
          currentEdgeId: firstEdge.id,
          lane,
          distanceMeters: 0,
          speedMps: initialSpeed,
          spawnTimeSeconds: item.spawnTimeSeconds,
          enterNetworkTimeSeconds: this.timeSeconds,
          waitTimeSeconds: item.waitTimeSeconds,
          isWaiting: false,
          blockedBySpillback: false,
        };
        this.vehicles.push(newVeh);
        let arr = vehiclesByEdge.get(firstEdge.id);
        if (!arr) {
          arr = [];
          vehiclesByEdge.set(firstEdge.id, arr);
        }
        arr.push(newVeh);
        this.cumulativeEdgeEntered[firstEdge.id] =
          (this.cumulativeEdgeEntered[firstEdge.id] || 0) + 1;
      } else {
        item.waitTimeSeconds += dt;
        remainingQueue.push(item);
      }
    }

    this.externalQueues = remainingQueue;
  }

  private updateVehiclesOnNetwork(dt: number): void {
    if (this.vehicles.length === 0) return;

    // Precompute current signal states at all nodes
    const nodeSignals = new Map<
      string,
      ReturnType<typeof TrafficSimulator.evaluateSignalState>
    >();
    for (const n of this.network.nodes) {
      nodeSignals.set(n.id, TrafficSimulator.evaluateSignalState(n.signal, this.timeSeconds));
    }

    // Group vehicles by edge:
    // - initialVehiclesByEdge: frozen snapshot at start of tick so each vehicle is updated at most once per tick
    // - liveVehiclesByEdge: updated as vehicles cross intersections to enforce capacity & 7.5m tail clearance
    const initialVehiclesByEdge = new Map<string, VehicleState[]>();
    const liveVehiclesByEdge = new Map<string, VehicleState[]>();
    for (const v of this.vehicles) {
      let initList = initialVehiclesByEdge.get(v.currentEdgeId);
      if (!initList) {
        initList = [];
        initialVehiclesByEdge.set(v.currentEdgeId, initList);
      }
      initList.push(v);

      let liveList = liveVehiclesByEdge.get(v.currentEdgeId);
      if (!liveList) {
        liveList = [];
        liveVehiclesByEdge.set(v.currentEdgeId, liveList);
      }
      liveList.push(v);
    }

    const survivingVehicles: VehicleState[] = [];

    // Process edges in deterministic order
    for (const edge of this.network.edges) {
      const edgeVehicles = initialVehiclesByEdge.get(edge.id);
      if (!edgeVehicles || edgeVehicles.length === 0) continue;

      const fromNode = this.nodeMap.get(edge.from);
      const toNode = this.nodeMap.get(edge.to);
      if (!fromNode || !toNode) continue;

      const approachDir = getIncomingApproachDirection(fromNode, toNode);
      const approachAxis = getApproachAxis(approachDir);
      const sigState = nodeSignals.get(toNode.id)!;
      const lightColor = approachAxis === 'NS' ? sigState.nsLight : sigState.ewLight;

      const vMax = edge.speedLimitKmh / 3.6;
      const stopLinePos = Math.max(0, edge.lengthMeters - STOP_LINE_BUFFER_METERS);

      // Pre-group by lane BEFORE iterating so mutating `veh.lane` during transition to `nextEdge`
      // never causes the vehicle to be matched again by a later lane index on the current edge.
      const vehiclesByLane: VehicleState[][] = Array.from({ length: edge.lanes }, () => []);
      for (const v of edgeVehicles) {
        const safeLane = Math.max(0, Math.min(edge.lanes - 1, v.lane));
        vehiclesByLane[safeLane].push(v);
      }

      // Process lane by lane
      for (let lane = 0; lane < edge.lanes; lane++) {
        const laneVehicles = vehiclesByLane[lane].sort(
          (a, b) => b.distanceMeters - a.distanceMeters
        ); // Front-most vehicle first

        let leaderNewPos: number | null = null;

        for (let idx = 0; idx < laneVehicles.length; idx++) {
          const veh = laneVehicles[idx];
          veh.blockedBySpillback = false;

          if (idx === 0) {
            // Lead vehicle in lane approaching stop line / intersection
            const distToStopLine = stopLinePos - veh.distanceMeters;
            const desiredSpeed = Math.min(vMax, veh.speedMps + ACCEL_MPS2 * dt);
            const potentialAdvance = desiredSpeed * dt;

            // Check if signal allows crossing the intersection
            let signalAllowsPass = false;
            if (lightColor === 'GREEN') {
              signalAllowsPass = true;
            } else if (lightColor === 'YELLOW') {
              // Only cross on yellow if already committed right at the stop line and moving
              signalAllowsPass = distToStopLine <= 3.0 && veh.speedMps >= 4.0;
            } else {
              // RED: strictly forbidden to cross
              signalAllowsPass = false;
            }

            if (veh.distanceMeters + potentialAdvance >= stopLinePos) {
              // Vehicle is attempting to reach/cross the stop line
              if (!signalAllowsPass) {
                // Must stop at stop line
                const newPos = Math.max(veh.distanceMeters, stopLinePos);
                veh.speedMps = (newPos - veh.distanceMeters) / dt;
                veh.distanceMeters = newPos;
                veh.isWaiting = veh.speedMps < WAITING_SPEED_THRESHOLD_MPS;
                if (veh.isWaiting) veh.waitTimeSeconds += dt;
                leaderNewPos = veh.distanceMeters;
                survivingVehicles.push(veh);
                continue;
              }

              // Signal allows passage! Check if this is the final edge in the vehicle's route
              const isFinalEdge = veh.routeIndex >= veh.routeEdgeIds.length - 1;
              if (isFinalEdge) {
                // Vehicle exits the network and completes its trip
                this.completedVehiclesCount += 1;
                this.totalCompletedTravelTimeSeconds +=
                  this.timeSeconds - veh.spawnTimeSeconds;
                this.cumulativeNodeThroughput[toNode.id] =
                  (this.cumulativeNodeThroughput[toNode.id] || 0) + 1;
                const prevLive = liveVehiclesByEdge.get(edge.id);
                if (prevLive) {
                  const rmIdx = prevLive.indexOf(veh);
                  if (rmIdx >= 0) prevLive.splice(rmIdx, 1);
                }
                // Since vehicle exited, it no longer blocks followers on this edge
                leaderNewPos = null;
                continue;
              }

              // Vehicle needs to transition to nextEdge
              const nextEdgeId = veh.routeEdgeIds[veh.routeIndex + 1];
              const nextEdge = this.edgeMap.get(nextEdgeId);
              if (!nextEdge) {
                // Route broken due to road edit; hold at stop line
                const newPos = Math.max(veh.distanceMeters, stopLinePos);
                veh.speedMps = 0;
                veh.distanceMeters = newPos;
                veh.isWaiting = true;
                veh.waitTimeSeconds += dt;
                leaderNewPos = veh.distanceMeters;
                survivingVehicles.push(veh);
                continue;
              }

              // Spillback check: Does nextEdge have capacity and entry tail space (>= 7.5m)?
              const targetLane = this.findAvailableEntryLane(nextEdge, liveVehiclesByEdge);
              if (targetLane === null) {
                // Downstream road is full! Spillback prevents entering intersection.
                const newPos = Math.max(veh.distanceMeters, stopLinePos);
                veh.speedMps = (newPos - veh.distanceMeters) / dt;
                veh.distanceMeters = newPos;
                veh.blockedBySpillback = true;
                veh.isWaiting = veh.speedMps < WAITING_SPEED_THRESHOLD_MPS;
                if (veh.isWaiting) veh.waitTimeSeconds += dt;
                this.cumulativeEdgeSpillback[edge.id] =
                  (this.cumulativeEdgeSpillback[edge.id] || 0) + 1;
                this.cumulativeNodeSpillback[toNode.id] =
                  (this.cumulativeNodeSpillback[toNode.id] || 0) + 1;
                leaderNewPos = veh.distanceMeters;
                survivingVehicles.push(veh);
                continue;
              }

              // Transition onto nextEdge at distanceMeters = 0 (strictly preserving >= 7.5m headway behind any vehicle on nextEdge)
              const nextToNode = this.nodeMap.get(nextEdge.to);
              let turnFactor = 1.0;
              if (nextToNode) {
                const turn = getTurnType(fromNode, toNode, nextToNode);
                turnFactor = turn === 'STRAIGHT' ? 1.0 : turn === 'RIGHT' ? 0.82 : 0.74;
              }

              const nextVMax = nextEdge.speedLimitKmh / 3.6;
              const prevLive = liveVehiclesByEdge.get(edge.id);
              if (prevLive) {
                const rmIdx = prevLive.indexOf(veh);
                if (rmIdx >= 0) prevLive.splice(rmIdx, 1);
              }

              veh.routeIndex += 1;
              veh.currentEdgeId = nextEdge.id;
              veh.lane = targetLane;
              veh.distanceMeters = 0;
              veh.speedMps = Math.min(nextVMax, Math.max(4.0, desiredSpeed * turnFactor));
              veh.isWaiting = veh.speedMps < WAITING_SPEED_THRESHOLD_MPS;
              if (veh.isWaiting) veh.waitTimeSeconds += dt;

              let nextLive = liveVehiclesByEdge.get(nextEdge.id);
              if (!nextLive) {
                nextLive = [];
                liveVehiclesByEdge.set(nextEdge.id, nextLive);
              }
              nextLive.push(veh);

              this.cumulativeEdgeEntered[nextEdge.id] =
                (this.cumulativeEdgeEntered[nextEdge.id] || 0) + 1;
              this.cumulativeNodeThroughput[toNode.id] =
                (this.cumulativeNodeThroughput[toNode.id] || 0) + 1;

              leaderNewPos = null;
              survivingVehicles.push(veh);
            } else {
              // Lead vehicle is still approaching the stop line
              let targetSpeed = desiredSpeed;
              if (!signalAllowsPass && distToStopLine < 28) {
                // Smooth braking curve approaching red/yellow light
                const safeBrakeSpeed = Math.max(0, distToStopLine / 1.4);
                targetSpeed = Math.min(targetSpeed, safeBrakeSpeed);
              }
              const newPos = Math.min(stopLinePos, veh.distanceMeters + targetSpeed * dt);
              veh.speedMps = (newPos - veh.distanceMeters) / dt;
              veh.distanceMeters = newPos;
              veh.isWaiting = veh.speedMps < WAITING_SPEED_THRESHOLD_MPS;
              if (veh.isWaiting) veh.waitTimeSeconds += dt;
              leaderNewPos = veh.distanceMeters;
              survivingVehicles.push(veh);
            }
          } else {
            // Following vehicle in the same lane: strictly enforce minimum headway gap (7.5m)
            const desiredSpeed = Math.min(vMax, veh.speedMps + ACCEL_MPS2 * dt);
            let maxAllowedPos = stopLinePos;

            if (leaderNewPos !== null) {
              maxAllowedPos = Math.min(
                maxAllowedPos,
                leaderNewPos - VEHICLE_EFFECTIVE_LENGTH_METERS
              );
            }

            const availableGap = maxAllowedPos - veh.distanceMeters;
            const safeFollowSpeed = Math.max(0, availableGap / 0.75);
            const actualSpeed = Math.min(desiredSpeed, safeFollowSpeed);

            const newPos = Math.max(
              veh.distanceMeters,
              Math.min(maxAllowedPos, veh.distanceMeters + actualSpeed * dt)
            );
            veh.speedMps = (newPos - veh.distanceMeters) / dt;
            veh.distanceMeters = newPos;
            veh.isWaiting = veh.speedMps < WAITING_SPEED_THRESHOLD_MPS;
            if (veh.isWaiting) veh.waitTimeSeconds += dt;

            leaderNewPos = veh.distanceMeters;
            survivingVehicles.push(veh);
          }
        }
      }
    }

    this.vehicles = survivingVehicles;
  }

  private refreshRuntimeStats(): void {
    const newEdgeStats: Record<string, EdgeRuntimeStats> = {};
    const vehiclesByEdge = new Map<string, VehicleState[]>();

    for (const v of this.vehicles) {
      let arr = vehiclesByEdge.get(v.currentEdgeId);
      if (!arr) {
        arr = [];
        vehiclesByEdge.set(v.currentEdgeId, arr);
      }
      arr.push(v);
    }

    for (const e of this.network.edges) {
      const list = vehiclesByEdge.get(e.id) || [];
      const count = list.length;
      let waitingCount = 0;
      let sumSpeedMps = 0;
      let sumWaitSec = 0;

      for (const v of list) {
        if (v.isWaiting) waitingCount++;
        sumSpeedMps += v.speedMps;
        sumWaitSec += v.waitTimeSeconds;
      }

      const avgSpeedKmh = count > 0 ? (sumSpeedMps / count) * 3.6 : e.speedLimitKmh;
      const avgWaitSeconds = count > 0 ? sumWaitSec / count : 0;
      const densityRatio = e.capacity > 0 ? count / e.capacity : 0;
      const speedDropRatio =
        count > 0 ? Math.max(0, 1 - avgSpeedKmh / Math.max(1, e.speedLimitKmh)) : 0;
      const congestionScore = Math.min(1, densityRatio * 0.65 + speedDropRatio * 0.35);

      newEdgeStats[e.id] = {
        edgeId: e.id,
        vehicleCount: count,
        capacity: e.capacity,
        densityRatio,
        waitingCount,
        avgSpeedKmh,
        avgWaitSeconds,
        cumulativeEntered: this.cumulativeEdgeEntered[e.id] || 0,
        spillbackBlocks: this.cumulativeEdgeSpillback[e.id] || 0,
        congestionScore,
      };
    }

    this.edgeStats = newEdgeStats;

    const newNodeStats: Record<string, NodeRuntimeStats> = {};
    for (const n of this.network.nodes) {
      const sig = TrafficSimulator.evaluateSignalState(n.signal, this.timeSeconds);
      const incoming = this.network.edges.filter((e) => e.to === n.id);

      let waitingVehicles = 0;
      let totalWaitSum = 0;
      let totalCount = 0;

      let nsWaiting = 0;
      let ewWaiting = 0;
      let nsWaitSum = 0;
      let ewWaitSum = 0;
      let nsCount = 0;
      let ewCount = 0;

      for (const e of incoming) {
        const fromNode = this.nodeMap.get(e.from);
        if (!fromNode) continue;
        const axis = getApproachAxis(getIncomingApproachDirection(fromNode, n));
        const list = vehiclesByEdge.get(e.id) || [];

        for (const v of list) {
          totalCount++;
          totalWaitSum += v.waitTimeSeconds;
          if (v.isWaiting) waitingVehicles++;

          if (axis === 'NS') {
            nsCount++;
            nsWaitSum += v.waitTimeSeconds;
            if (v.isWaiting) nsWaiting++;
          } else {
            ewCount++;
            ewWaitSum += v.waitTimeSeconds;
            if (v.isWaiting) ewWaiting++;
          }
        }
      }

      newNodeStats[n.id] = {
        nodeId: n.id,
        phase: sig.phase,
        phaseElapsedSeconds: sig.phaseElapsedSeconds,
        phaseDurationSeconds: sig.phaseDurationSeconds,
        cycleSeconds: sig.cycleSeconds,
        nsLight: sig.nsLight,
        ewLight: sig.ewLight,
        waitingVehicles,
        avgWaitSeconds: totalCount > 0 ? totalWaitSum / totalCount : 0,
        nsWaitingVehicles: nsWaiting,
        ewWaitingVehicles: ewWaiting,
        nsAvgWaitSeconds: nsCount > 0 ? nsWaitSum / nsCount : 0,
        ewAvgWaitSeconds: ewCount > 0 ? ewWaitSum / ewCount : 0,
        spillbackBlockedCount: this.cumulativeNodeSpillback[n.id] || 0,
        throughputVehicles: this.cumulativeNodeThroughput[n.id] || 0,
      };
    }

    this.nodeStats = newNodeStats;
  }

  private computeBottlenecks(): BottleneckDiagnostic[] {
    const diagnostics: BottleneckDiagnostic[] = [];

    for (const e of this.network.edges) {
      const st = this.edgeStats[e.id];
      if (!st) continue;

      if (st.waitingCount < 2 && st.densityRatio < 0.45 && st.avgWaitSeconds < 8) {
        continue;
      }

      const fromNode = this.nodeMap.get(e.from);
      const toNode = this.nodeMap.get(e.to);
      if (!fromNode || !toNode) continue;

      const outgoingFromTarget = this.network.edges.filter(
        (out) => out.from === toNode.id && out.to !== fromNode.id
      );
      const downstreamFull = outgoingFromTarget.some(
        (out) => (this.edgeStats[out.id]?.densityRatio ?? 0) >= 0.72
      );

      const axis = getApproachAxis(getIncomingApproachDirection(fromNode, toNode));
      const sig = toNode.signal;
      const totalGreen = Math.max(1, sig.nsGreenSeconds + sig.ewGreenSeconds);
      const axisGreenShare =
        axis === 'NS' ? sig.nsGreenSeconds / totalGreen : sig.ewGreenSeconds / totalGreen;

      const nodeSt = this.nodeStats[toNode.id];
      const opposingWaiting =
        axis === 'NS' ? (nodeSt?.ewWaitingVehicles ?? 0) : (nodeSt?.nsWaitingVehicles ?? 0);

      let primaryCause: BottleneckDiagnostic['primaryCause'] = 'CAPACITY_EXCEEDED';
      let explanation = '';

      if (st.spillbackBlocks > 2 || downstreamFull) {
        primaryCause = 'DOWNSTREAM_SPILLBACK';
        explanation = `하류 구간 포화로 인해 '${toNode.name}' 녹색 신호에도 진입하지 못하는 스필백(Spillback ${st.spillbackBlocks}회) 발생`;
      } else if (
        sig.enabled &&
        (axisGreenShare < 0.42 || (st.waitingCount >= opposingWaiting + 3 && axisGreenShare <= 0.55))
      ) {
        primaryCause = 'SIGNAL_IMBALANCE';
        const axisLabel = axis === 'NS' ? '남북(NS)축' : '동서(EW)축';
        explanation = `'${toNode.name}' ${axisLabel} 녹색 배분(${Math.round(
          axisGreenShare * 100
        )}%)이 유입 대기열(${st.waitingCount}대) 대비 부족하여 적색 대기 누적`;
      } else {
        primaryCause = 'CAPACITY_EXCEEDED';
        explanation = `수요 집중으로 도로 수용량(${st.vehicleCount}/${st.capacity}대, 포화도 ${Math.round(
          st.densityRatio * 100
        )}%) 한계 도달`;
      }

      const severity: BottleneckDiagnostic['severity'] =
        st.densityRatio >= 0.75 || st.avgWaitSeconds >= 22
          ? 'CRITICAL'
          : st.densityRatio >= 0.55 || st.avgWaitSeconds >= 12
          ? 'HIGH'
          : 'MODERATE';

      diagnostics.push({
        edgeId: e.id,
        edgeName: e.name,
        fromNodeId: e.from,
        toNodeId: e.to,
        severity,
        densityRatio: st.densityRatio,
        waitingCount: st.waitingCount,
        avgWaitSeconds: st.avgWaitSeconds,
        primaryCause,
        explanation,
      });
    }

    diagnostics.sort((a, b) => {
      const scoreA = a.densityRatio * 50 + a.avgWaitSeconds + a.waitingCount * 2;
      const scoreB = b.densityRatio * 50 + b.avgWaitSeconds + b.waitingCount * 2;
      return scoreB - scoreA;
    });

    return diagnostics.slice(0, 6);
  }

  private recordHistoryPoint(): void {
    const snap = this.computeAggregateMetrics();
    this.history.push({
      timeSeconds: this.timeSeconds,
      totalGenerated: this.totalGenerated,
      activeVehicles: this.vehicles.length,
      completedVehicles: this.completedVehiclesCount,
      externalQueue: this.externalQueues.length,
      waitingVehicles: snap.waitingVehiclesCount + this.externalQueues.length,
      avgTravelTimeSeconds: snap.avgTravelTimeSeconds,
      activeAvgWaitSeconds: snap.activeAvgWaitSeconds,
      networkAvgSpeedKmh: snap.networkAvgSpeedKmh,
    });

    if (this.history.length > 360) {
      this.history.shift();
    }
  }

  private computeAggregateMetrics(): {
    waitingVehiclesCount: number;
    avgTravelTimeSeconds: number;
    activeAvgWaitSeconds: number;
    externalQueueAvgWaitSeconds: number;
    networkAvgSpeedKmh: number;
    disconnectedDemandCount: number;
  } {
    let waitingVehiclesCount = 0;
    let activeWaitSum = 0;
    let speedSumMps = 0;

    for (const v of this.vehicles) {
      if (v.isWaiting) waitingVehiclesCount++;
      activeWaitSum += v.waitTimeSeconds;
      speedSumMps += v.speedMps;
    }

    let extWaitSum = 0;
    let disconnectedDemandCount = 0;
    for (const q of this.externalQueues) {
      extWaitSum += q.waitTimeSeconds;
      if (q.disconnected) disconnectedDemandCount++;
    }

    // Check if any OD pair in network has no valid route
    for (const od of this.network.demands) {
      const r = this.resolveRoute(od.origin, od.destination);
      if (!r || r.length === 0) {
        disconnectedDemandCount = Math.max(disconnectedDemandCount, 1);
      }
    }

    const avgTravelTimeSeconds =
      this.completedVehiclesCount > 0
        ? this.totalCompletedTravelTimeSeconds / this.completedVehiclesCount
        : 0;

    const activeAvgWaitSeconds =
      this.vehicles.length > 0 ? activeWaitSum / this.vehicles.length : 0;

    const externalQueueAvgWaitSeconds =
      this.externalQueues.length > 0 ? extWaitSum / this.externalQueues.length : 0;

    const networkAvgSpeedKmh =
      this.vehicles.length > 0 ? (speedSumMps / this.vehicles.length) * 3.6 : 0;

    return {
      waitingVehiclesCount,
      avgTravelTimeSeconds,
      activeAvgWaitSeconds,
      externalQueueAvgWaitSeconds,
      networkAvgSpeedKmh,
      disconnectedDemandCount,
    };
  }

  public getSnapshot(): SimulationSnapshot {
    const agg = this.computeAggregateMetrics();
    const activeCount = this.vehicles.length;
    const extCount = this.externalQueues.length;
    const conservationValid =
      this.totalGenerated === activeCount + this.completedVehiclesCount + extCount;

    return {
      timeSeconds: this.timeSeconds,
      tickCount: this.tickCount,
      totalGenerated: this.totalGenerated,
      activeVehiclesCount: activeCount,
      completedVehiclesCount: this.completedVehiclesCount,
      externalQueueCount: extCount,
      conservationValid,
      waitingVehiclesCount: agg.waitingVehiclesCount,
      avgTravelTimeSeconds: agg.avgTravelTimeSeconds,
      activeAvgWaitSeconds: agg.activeAvgWaitSeconds,
      externalQueueAvgWaitSeconds: agg.externalQueueAvgWaitSeconds,
      networkAvgSpeedKmh: agg.networkAvgSpeedKmh,
      disconnectedDemandCount: agg.disconnectedDemandCount,
      vehicles: this.vehicles.map((v) => ({ ...v })),
      edgeStats: { ...this.edgeStats },
      nodeStats: { ...this.nodeStats },
      bottlenecks: this.computeBottlenecks(),
      history: [...this.history],
      perfSimStepMs: this.lastPerfSimStepMs,
    };
  }
}
