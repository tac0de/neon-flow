export type ApproachDirection = 'N' | 'S' | 'E' | 'W';
export type SignalAxis = 'NS' | 'EW';
export type SignalPhaseState =
  | 'NS_GREEN'
  | 'NS_YELLOW'
  | 'ALL_RED_NS_TO_EW'
  | 'EW_GREEN'
  | 'EW_YELLOW'
  | 'ALL_RED_EW_TO_NS';

export type TurnType = 'STRAIGHT' | 'LEFT' | 'RIGHT';
export type RoutingMode = 'freeflow' | 'congested';

export interface SignalConfig {
  enabled: boolean;
  nsGreenSeconds: number;
  ewGreenSeconds: number;
  yellowSeconds: number;
  allRedSeconds: number;
  offsetSeconds: number;
}

export interface NodeData {
  id: string;
  name: string;
  x: number; // meters
  y: number; // meters
  signal: SignalConfig;
}

export interface EdgeData {
  id: string;
  name: string;
  from: string;
  to: string;
  lanes: number; // 1..3
  speedLimitKmh: number; // 20..100
  lengthMeters: number; // >= 40
  capacity: number; // floor(lengthMeters / 7.5) * lanes
}

export interface ODDemand {
  id: string;
  origin: string;
  destination: string;
  vehiclesPerHour: number;
  label?: string;
}

export interface SimulationConfig {
  seed: number;
  demandMultiplier: number; // 0.25 .. 2.5
  routingMode: RoutingMode;
  dtSeconds: number; // fixed 0.2s
  initialActiveVehicles?: number; // optional initial warm traffic on network
}

export interface CityNetworkData {
  version: string; // e.g., "1.0.0"
  id: string;
  name: string;
  description: string;
  hypothesis?: string;
  nodes: NodeData[];
  edges: EdgeData[];
  demands: ODDemand[];
  config: SimulationConfig;
}

export interface VehicleState {
  id: number;
  odId: string;
  origin: string;
  destination: string;
  routeEdgeIds: string[];
  routeIndex: number;
  currentEdgeId: string;
  lane: number;
  distanceMeters: number; // 0 .. edge.lengthMeters
  speedMps: number;
  spawnTimeSeconds: number;
  enterNetworkTimeSeconds: number;
  waitTimeSeconds: number; // accumulated when speed < 1.5 m/s or in external queue
  isWaiting: boolean;
  blockedBySpillback: boolean;
}

export interface ExternalQueueItem {
  id: number;
  odId: string;
  origin: string;
  destination: string;
  routeEdgeIds: string[];
  spawnTimeSeconds: number;
  waitTimeSeconds: number;
  disconnected: boolean;
}

export interface EdgeRuntimeStats {
  edgeId: string;
  vehicleCount: number;
  capacity: number;
  densityRatio: number; // vehicleCount / capacity
  waitingCount: number;
  avgSpeedKmh: number;
  avgWaitSeconds: number;
  cumulativeEntered: number;
  spillbackBlocks: number;
  congestionScore: number; // 0..1 normalized congestion index for heatmap
}

export interface NodeRuntimeStats {
  nodeId: string;
  phase: SignalPhaseState;
  phaseElapsedSeconds: number;
  phaseDurationSeconds: number;
  cycleSeconds: number;
  nsLight: 'GREEN' | 'YELLOW' | 'RED';
  ewLight: 'GREEN' | 'YELLOW' | 'RED';
  waitingVehicles: number;
  avgWaitSeconds: number;
  nsWaitingVehicles: number;
  ewWaitingVehicles: number;
  nsAvgWaitSeconds: number;
  ewAvgWaitSeconds: number;
  spillbackBlockedCount: number;
  throughputVehicles: number;
}

export interface TimeSeriesPoint {
  timeSeconds: number;
  totalGenerated: number;
  activeVehicles: number;
  completedVehicles: number;
  externalQueue: number;
  waitingVehicles: number; // active waiting + externalQueue
  avgTravelTimeSeconds: number; // completed vehicles basis
  activeAvgWaitSeconds: number; // incomplete/active vehicles basis
  networkAvgSpeedKmh: number;
}

export interface BottleneckDiagnostic {
  edgeId: string;
  edgeName: string;
  fromNodeId: string;
  toNodeId: string;
  severity: 'CRITICAL' | 'HIGH' | 'MODERATE';
  densityRatio: number;
  waitingCount: number;
  avgWaitSeconds: number;
  primaryCause: 'SIGNAL_IMBALANCE' | 'DOWNSTREAM_SPILLBACK' | 'CAPACITY_EXCEEDED';
  explanation: string;
}

export interface SimulationSnapshot {
  timeSeconds: number;
  tickCount: number;
  totalGenerated: number;
  activeVehiclesCount: number;
  completedVehiclesCount: number;
  externalQueueCount: number;
  conservationValid: boolean; // totalGenerated === active + completed + externalQueue
  waitingVehiclesCount: number; // on-road waiting
  avgTravelTimeSeconds: number; // completed basis
  activeAvgWaitSeconds: number; // incomplete active basis
  externalQueueAvgWaitSeconds: number;
  networkAvgSpeedKmh: number;
  disconnectedDemandCount: number;
  vehicles: VehicleState[];
  edgeStats: Record<string, EdgeRuntimeStats>;
  nodeStats: Record<string, NodeRuntimeStats>;
  bottlenecks: BottleneckDiagnostic[];
  history: TimeSeriesPoint[];
  perfSimStepMs: number;
}

export interface ObjectiveBreakdown {
  totalScore: number; // lower is better
  avgTravelTimeTerm: number;
  incompleteWaitPenaltyTerm: number;
  externalQueuePenaltyTerm: number;
  throughputRewardTerm: number;
  completedVehicles: number;
  avgTravelTimeSeconds: number;
  activeAvgWaitSeconds: number;
  externalQueueCount: number;
  totalGenerated: number;
}

export interface OptimizationProgress {
  runId: string;
  currentEvaluation: number;
  totalBudget: number;
  phase: 'BASELINE' | 'SEARCHING' | 'VALIDATING' | 'COMPLETED' | 'CANCELLED';
  bestTrainObjective: number;
  baselineTrainObjective: number;
  message: string;
}

export interface SignalPlanDiff {
  nodeId: string;
  nodeName: string;
  beforeNsGreen: number;
  beforeEwGreen: number;
  beforeOffset: number;
  afterNsGreen: number;
  afterEwGreen: number;
  afterOffset: number;
}

export interface OptimizationResult {
  runId: string;
  improved: boolean;
  overfitWarning: boolean;
  summaryMessage: string;
  warmupSeconds: number;
  evalHorizonSeconds: number;
  trainSeed: number;
  validationSeed: number;
  baselineSignals: Record<string, SignalConfig>;
  optimizedSignals: Record<string, SignalConfig>;
  diffs: SignalPlanDiff[];
  trainBaseline: ObjectiveBreakdown;
  trainOptimized: ObjectiveBreakdown;
  valBaseline: ObjectiveBreakdown;
  valOptimized: ObjectiveBreakdown;
  baselineSnapshot: SimulationSnapshot;
  optimizedSnapshot: SimulationSnapshot;
}
