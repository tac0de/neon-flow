import { describe, expect, it } from 'vitest';
import {
  createBraessDetourScenario,
  createCommuteRushScenario,
  createMegacityStressScenario,
  createSignalBottleneckScenario,
} from '../../data/scenarios';
import { evaluateSignalPlan, runSignalOptimization } from '../optimizer';
import { computeEdgeCapacity, VEHICLE_EFFECTIVE_LENGTH_METERS } from '../router';
import { TrafficSimulator } from '../simulator';
import { validateAndSanitizeNetworkJson } from '../validator';
import { CityNetworkData } from '../../types/simulation';

describe('NEON FLOW Core Simulation & Verification Suite', () => {
  it('1. 적색 신호에서 차량이 정지한다 (Vehicles strictly stop at red signals)', () => {
    const net: CityNetworkData = {
      version: '1.0.0',
      id: 'red_light_test',
      name: 'Red Light Test',
      description: '',
      nodes: [
        {
          id: 'N1',
          name: 'Origin',
          x: 100,
          y: 200,
          signal: { enabled: false, nsGreenSeconds: 30, ewGreenSeconds: 30, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 0 },
        },
        {
          id: 'N2',
          name: 'Signal Stop',
          x: 300,
          y: 200,
          // Edge N1->N2 is Eastbound (EW axis). Set NS green to 90s so EW light stays RED for 90+ seconds!
          signal: { enabled: true, nsGreenSeconds: 90, ewGreenSeconds: 10, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 0 },
        },
      ],
      edges: [
        {
          id: 'E1',
          name: 'Approach',
          from: 'N1',
          to: 'N2',
          lanes: 1,
          speedLimitKmh: 60,
          lengthMeters: 200,
          capacity: computeEdgeCapacity(200, 1),
        },
      ],
      demands: [{ id: 'OD1', origin: 'N1', destination: 'N2', vehiclesPerHour: 1800 }],
      config: { seed: 42, demandMultiplier: 1.0, routingMode: 'freeflow', dtSeconds: 0.2 },
    };

    const sim = new TrafficSimulator(net);
    // Step 40 seconds (200 ticks) while EW signal is continuously RED
    const snap = sim.step(200);

    expect(snap.nodeStats['N2'].ewLight).toBe('RED');
    expect(snap.completedVehiclesCount).toBe(0); // Zero vehicles may cross the red light!
    expect(snap.activeVehiclesCount).toBeGreaterThan(0);

    // Lead vehicle should be stopped right before the stop line (lengthMeters - 0.5 = 199.5m)
    const maxDist = Math.max(...snap.vehicles.map((v) => v.distanceMeters));
    expect(maxDist).toBeLessThanOrEqual(199.5);
    expect(snap.waitingVehiclesCount).toBeGreaterThan(0);
  });

  it('2. 앞차나 막힌 다음 도로를 통과하지 않는다 (Headway gap >= 7.5m and Spillback prevention)', () => {
    const net: CityNetworkData = {
      version: '1.0.0',
      id: 'spillback_test',
      name: 'Spillback & Headway Test',
      description: '',
      nodes: [
        {
          id: 'A',
          name: 'A',
          x: 100,
          y: 200,
          signal: { enabled: false, nsGreenSeconds: 30, ewGreenSeconds: 30, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 0 },
        },
        {
          id: 'B',
          name: 'B (Green Junction)',
          x: 300,
          y: 200,
          // Always GREEN on EW axis
          signal: { enabled: false, nsGreenSeconds: 30, ewGreenSeconds: 30, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 0 },
        },
        {
          id: 'C',
          name: 'C (Blocked Exit)',
          x: 360,
          y: 200,
          // Always RED on EW axis for 90s so short road B->C fills up completely!
          signal: { enabled: true, nsGreenSeconds: 90, ewGreenSeconds: 8, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 0 },
        },
      ],
      edges: [
        {
          id: 'E_AB',
          name: 'Upstream',
          from: 'A',
          to: 'B',
          lanes: 1,
          speedLimitKmh: 60,
          lengthMeters: 200,
          capacity: computeEdgeCapacity(200, 1),
        },
        {
          id: 'E_BC',
          name: 'Short Downstream',
          from: 'B',
          to: 'C',
          lanes: 1,
          speedLimitKmh: 60,
          lengthMeters: 45, // capacity = floor(45 / 7.5) = 6 vehicles
          capacity: computeEdgeCapacity(45, 1),
        },
      ],
      demands: [{ id: 'OD_AC', origin: 'A', destination: 'C', vehiclesPerHour: 2400 }],
      config: { seed: 7, demandMultiplier: 1.0, routingMode: 'freeflow', dtSeconds: 0.2 },
    };

    const sim = new TrafficSimulator(net);
    const snap = sim.step(300); // 60 seconds

    // 1. Downstream road E_BC must never exceed its capacity (6 vehicles)
    const bcVehicles = snap.vehicles
      .filter((v) => v.currentEdgeId === 'E_BC')
      .sort((a, b) => b.distanceMeters - a.distanceMeters);
    expect(bcVehicles.length).toBeLessThanOrEqual(6);

    // 2. Upstream road E_AB must have vehicles blocked by spillback even though node B is GREEN
    expect(snap.edgeStats['E_AB'].spillbackBlocks).toBeGreaterThan(0);

    // 3. Check minimum headway between consecutive vehicles on the same edge & lane
    for (const edgeId of ['E_AB', 'E_BC']) {
      const list = snap.vehicles
        .filter((v) => v.currentEdgeId === edgeId && v.lane === 0)
        .sort((a, b) => b.distanceMeters - a.distanceMeters);
      for (let i = 1; i < list.length; i++) {
        const gap = list[i - 1].distanceMeters - list[i].distanceMeters;
        expect(gap).toBeGreaterThanOrEqual(VEHICLE_EFFECTIVE_LENGTH_METERS - 1e-6);
      }
    }
  });

  it('3. 단절된 경로와 잘못된 JSON을 안전하게 처리한다 (Safe handling of disconnected OD & invalid JSON)', () => {
    const invalidJson = {
      version: '1.0.0',
      nodes: [{ id: 'N1', x: 0, y: 0 }], // fewer than 2 nodes
      edges: [{ id: 'E1', from: 'N1', to: 'NON_EXISTENT' }],
      demands: [],
    };
    const valRes = validateAndSanitizeNetworkJson(invalidJson);
    expect(valRes.valid).toBe(false);
    expect(valRes.errors.length).toBeGreaterThan(0);

    // Test disconnected OD pair handling in simulator
    const scenario = createCommuteRushScenario();
    scenario.demands.push({
      id: 'OD_DISCONNECTED',
      origin: 'N23',
      destination: 'N11',
      vehiclesPerHour: 600,
    });
    // Remove all outgoing edges from N23 to make N23->N11 completely unreachable
    scenario.edges = scenario.edges.filter((e) => e.from !== 'N23');

    const sim = new TrafficSimulator(scenario);
    const snap = sim.step(100);
    expect(snap.conservationValid).toBe(true);
    expect(snap.disconnectedDemandCount).toBeGreaterThan(0);
    expect(snap.externalQueueCount).toBeGreaterThan(0);
  });

  it('4 & 5. 같은 시드에서 결과가 재현되며 배속(스텝 분할)을 바꿔도 동일 시간 결과는 같다', () => {
    const net1 = createCommuteRushScenario();
    const net2 = createCommuteRushScenario();
    const net3 = createCommuteRushScenario();

    const sim1 = new TrafficSimulator(net1);
    const sim2 = new TrafficSimulator(net2);
    const sim3 = new TrafficSimulator(net3);

    // sim1: 1x speed (1 tick at a time for 300 ticks = 60.0s)
    for (let i = 0; i < 300; i++) sim1.step(1);

    // sim2: 4x speed (4 ticks at a time for 75 calls = 300 ticks = 60.0s)
    for (let i = 0; i < 75; i++) sim2.step(4);

    // sim3: batch step(300)
    sim3.step(300);

    const s1 = sim1.getSnapshot();
    const s2 = sim2.getSnapshot();
    const s3 = sim3.getSnapshot();

    expect(s1.timeSeconds).toBe(60);
    expect(s2.timeSeconds).toBe(60);
    expect(s1.totalGenerated).toBe(s2.totalGenerated);
    expect(s1.completedVehiclesCount).toBe(s2.completedVehiclesCount);
    expect(s1.activeVehiclesCount).toBe(s2.activeVehiclesCount);
    expect(s1.externalQueueCount).toBe(s2.externalQueueCount);
    expect(s1.avgTravelTimeSeconds).toBeCloseTo(s2.avgTravelTimeSeconds, 6);
    expect(s1.avgTravelTimeSeconds).toBeCloseTo(s3.avgTravelTimeSeconds, 6);
  });

  it('6. 차량 수 보존식이 모든 시점에 성립한다 (totalGenerated === externalQueue + active + completed)', () => {
    const sim = new TrafficSimulator(createCommuteRushScenario());
    for (let step = 1; step <= 400; step += 10) {
      const snap = sim.step(10);
      expect(snap.conservationValid).toBe(true);
      expect(snap.totalGenerated).toBe(
        snap.externalQueueCount + snap.activeVehiclesCount + snap.completedVehiclesCount
      );
    }
  });

  it('7. 저장 후 다시 불러오면 설정이 유지된다 (JSON export & import roundtrip fidelity)', () => {
    const orig = createSignalBottleneckScenario();
    orig.nodes[1].signal.nsGreenSeconds = 18;
    orig.nodes[1].signal.ewGreenSeconds = 36;
    orig.config.seed = 777;
    orig.config.demandMultiplier = 1.35;

    const exportedJson = JSON.stringify(orig);
    const parsed = JSON.parse(exportedJson);
    const validated = validateAndSanitizeNetworkJson(parsed);

    expect(validated.valid).toBe(true);
    expect(validated.sanitizedData?.config.seed).toBe(777);
    expect(validated.sanitizedData?.config.demandMultiplier).toBe(1.35);
    expect(validated.sanitizedData?.nodes[1].signal.nsGreenSeconds).toBe(18);
    expect(validated.sanitizedData?.nodes[1].signal.ewGreenSeconds).toBe(36);
  });

  it('8 & 9. 신호 최적화 취소 동작 및 개선 전후 지표의 실제 시뮬레이션 일치 검증', () => {
    const net = createSignalBottleneckScenario();

    // Test cancellation mid-run
    let evalCalls = 0;
    const cancelledRes = runSignalOptimization(net, {
      runId: 'run_cancel_test',
      budget: 16,
      warmupSeconds: 20,
      evalHorizonSeconds: 90,
      onProgress: () => {
        evalCalls++;
      },
      isCancelled: () => evalCalls >= 3,
    });
    expect(cancelledRes).toBeNull();

    // Test full optimization on Signal Bottleneck scenario
    const optRes = runSignalOptimization(net, {
      runId: 'run_full_test',
      budget: 14,
      warmupSeconds: 20,
      evalHorizonSeconds: 100,
    });

    expect(optRes).not.toBeNull();
    expect(optRes!.improved).toBe(true);
    expect(optRes!.trainOptimized.totalScore).toBeLessThan(optRes!.trainBaseline.totalScore);

    // Verify that running the simulator directly with baselineSignals and optimizedSignals produces the EXACT metrics reported
    const directBaseline = evaluateSignalPlan(
      net,
      optRes!.baselineSignals,
      optRes!.trainSeed,
      optRes!.warmupSeconds,
      optRes!.evalHorizonSeconds
    );
    const directOptimized = evaluateSignalPlan(
      net,
      optRes!.optimizedSignals,
      optRes!.trainSeed,
      optRes!.warmupSeconds,
      optRes!.evalHorizonSeconds
    );

    expect(directBaseline.breakdown.totalScore).toBe(optRes!.trainBaseline.totalScore);
    expect(directOptimized.breakdown.totalScore).toBe(optRes!.trainOptimized.totalScore);
    expect(directOptimized.breakdown.completedVehicles).toBeGreaterThanOrEqual(
      directBaseline.breakdown.completedVehicles
    );
  });

  it('시나리오 3 (우회 실험 / 브래스의 역설): 지름길 도로 제거 시 통행시간 및 대기시간이 실제로 개선된다', () => {
    const withShortcut = createBraessDetourScenario();
    const withoutShortcut = createBraessDetourScenario();
    withoutShortcut.edges = withoutShortcut.edges.filter((e) => e.id !== 'E_SHORTCUT_NS');

    const simWith = new TrafficSimulator(withShortcut);
    const simWithout = new TrafficSimulator(withoutShortcut);

    // Run 140 seconds (700 ticks)
    const snapWith = simWith.step(700);
    const snapWithout = simWithout.step(700);

    // Without the Braess shortcut, S_HUB is not choked by NS/EW phase conflict and 1-lane queuing,
    // resulting in higher completed vehicles and lower waiting delay!
    expect(snapWithout.completedVehiclesCount).toBeGreaterThan(snapWith.completedVehiclesCount);
    expect(snapWithout.activeAvgWaitSeconds).toBeLessThan(snapWith.activeAvgWaitSeconds);
  });

  it('10. 데스크톱 1,000대 차량 동시 주행 성능 및 보존식 검증 (1,000+ active vehicles benchmark)', () => {
    const mega = createMegacityStressScenario();
    const sim = new TrafficSimulator(mega);
    const initialSnap = sim.getSnapshot();

    expect(initialSnap.activeVehiclesCount).toBeGreaterThanOrEqual(1000);
    expect(initialSnap.conservationValid).toBe(true);

    const t0 = performance.now();
    const snapAfter = sim.step(50); // 50 steps of 1,000+ vehicles
    const elapsedMs = performance.now() - t0;
    const avgMsPerStep = elapsedMs / 50;

    expect(snapAfter.conservationValid).toBe(true);
    expect(snapAfter.activeVehiclesCount).toBeGreaterThan(900);
    // Single step for 1,000+ vehicles should be well under 16ms (typically < 2ms)
    expect(avgMsPerStep).toBeLessThan(16);
  });
});
