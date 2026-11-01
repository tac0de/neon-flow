import {
  CityNetworkData,
  ObjectiveBreakdown,
  OptimizationProgress,
  OptimizationResult,
  SignalConfig,
  SignalPlanDiff,
  SimulationSnapshot,
} from '../types/simulation';
import { SeededRandom } from './prng';
import { getApproachAxis, getIncomingApproachDirection } from './router';
import { TrafficSimulator } from './simulator';
import { MAX_GREEN_SECONDS, MIN_GREEN_SECONDS } from './validator';

export const OBJECTIVE_WEIGHTS = {
  travelTime: 1.0, // s / s (도착 완료 차량 평균 통행시간 가중치)
  activeWait: 1.6, // s / s (미완료 차량 평균 대기시간 페널티 — 특정 방향 기아 방지)
  externalQueue: 2.8, // s / veh (미진입 외부 대기열 페널티 — 진입 차단 꼼수 방지)
  throughputCompletionPct: 0.9, // s / % (도착 완료율 보상항 — 처리량 증대 유도)
};

export interface OptimizationOptions {
  runId: string;
  budget?: number; // default 24
  warmupSeconds?: number; // default 30
  evalHorizonSeconds?: number; // default 150
  onProgress?: (progress: OptimizationProgress) => void;
  isCancelled?: () => boolean;
}

/**
 * Evaluates a candidate signal plan on `network` with a specific `seed`.
 *Separates `warmupSeconds` from `evalHorizonSeconds`.
 */
export function evaluateSignalPlan(
  baseNetwork: CityNetworkData,
  signals: Record<string, SignalConfig>,
  seed: number,
  warmupSeconds: number,
  evalHorizonSeconds: number
): { breakdown: ObjectiveBreakdown; snapshot: SimulationSnapshot } {
  const netCopy: CityNetworkData = JSON.parse(JSON.stringify(baseNetwork));
  netCopy.config.seed = seed;
  for (const node of netCopy.nodes) {
    if (signals[node.id]) {
      node.signal = { ...signals[node.id] };
    }
  }

  const dt = netCopy.config.dtSeconds || 0.2;
  const warmupTicks = Math.max(1, Math.round(warmupSeconds / dt));
  const totalTicks = Math.max(warmupTicks + 10, Math.round(evalHorizonSeconds / dt));
  const evalTicks = totalTicks - warmupTicks;

  const sim = new TrafficSimulator(netCopy);

  // 1. Run warm-up period
  sim.step(warmupTicks);
  const warmupSnap = sim.getSnapshot();
  const warmupCompleted = warmupSnap.completedVehiclesCount;
  const warmupTotalTravelTime = warmupSnap.avgTravelTimeSeconds * warmupCompleted;

  // 2. Run evaluation window and accumulate time-averaged active wait & external queue
  let sumActiveWait = 0;
  let sumExtQueue = 0;
  const sampleInterval = 5; // every 1.0s
  let samples = 0;

  let remaining = evalTicks;
  while (remaining > 0) {
    const chunk = Math.min(sampleInterval, remaining);
    sim.step(chunk);
    remaining -= chunk;
    const snap = sim.getSnapshot();
    sumActiveWait += snap.activeAvgWaitSeconds;
    sumExtQueue += snap.externalQueueCount;
    samples++;
  }

  const finalSnap = sim.getSnapshot();
  const totalCompleted = finalSnap.completedVehiclesCount;
  const finalTotalTravelTime = finalSnap.avgTravelTimeSeconds * totalCompleted;

  const windowCompleted = Math.max(0, totalCompleted - warmupCompleted);
  const windowTravelTime = Math.max(0, finalTotalTravelTime - warmupTotalTravelTime);

  // Use evaluation-window travel time if sufficient vehicles finished after warmup, else full horizon
  const evalAvgTravelTime =
    windowCompleted >= 5
      ? windowTravelTime / windowCompleted
      : finalSnap.avgTravelTimeSeconds > 0
      ? finalSnap.avgTravelTimeSeconds
      : evalHorizonSeconds;

  const meanEvalActiveWait =
    samples > 0 ? (sumActiveWait / samples) * 0.5 + finalSnap.activeAvgWaitSeconds * 0.5 : finalSnap.activeAvgWaitSeconds;
  const evalExtQueue =
    samples > 0 ? (sumExtQueue / samples) * 0.4 + finalSnap.externalQueueCount * 0.6 : finalSnap.externalQueueCount;

  const completionPct =
    finalSnap.totalGenerated > 0
      ? (finalSnap.completedVehiclesCount / finalSnap.totalGenerated) * 100
      : 0;

  const avgTravelTimeTerm = OBJECTIVE_WEIGHTS.travelTime * evalAvgTravelTime;
  const incompleteWaitPenaltyTerm = OBJECTIVE_WEIGHTS.activeWait * meanEvalActiveWait;
  const externalQueuePenaltyTerm = OBJECTIVE_WEIGHTS.externalQueue * evalExtQueue;
  const throughputRewardTerm = OBJECTIVE_WEIGHTS.throughputCompletionPct * completionPct;

  const totalScore = Number(
    (
      avgTravelTimeTerm +
      incompleteWaitPenaltyTerm +
      externalQueuePenaltyTerm -
      throughputRewardTerm
    ).toFixed(2)
  );

  return {
    breakdown: {
      totalScore,
      avgTravelTimeTerm: Number(avgTravelTimeTerm.toFixed(2)),
      incompleteWaitPenaltyTerm: Number(incompleteWaitPenaltyTerm.toFixed(2)),
      externalQueuePenaltyTerm: Number(externalQueuePenaltyTerm.toFixed(2)),
      throughputRewardTerm: Number(throughputRewardTerm.toFixed(2)),
      completedVehicles: finalSnap.completedVehiclesCount,
      avgTravelTimeSeconds: Number(finalSnap.avgTravelTimeSeconds.toFixed(1)),
      activeAvgWaitSeconds: Number(finalSnap.activeAvgWaitSeconds.toFixed(1)),
      externalQueueCount: finalSnap.externalQueueCount,
      totalGenerated: finalSnap.totalGenerated,
    },
    snapshot: finalSnap,
  };
}

function cloneSignalMap(signals: Record<string, SignalConfig>): Record<string, SignalConfig> {
  const out: Record<string, SignalConfig> = {};
  for (const [k, v] of Object.entries(signals)) {
    out[k] = { ...v };
  }
  return out;
}

function clampGreen(val: number): number {
  return Math.max(MIN_GREEN_SECONDS, Math.min(MAX_GREEN_SECONDS, Math.round(val)));
}

export function runSignalOptimization(
  network: CityNetworkData,
  options: OptimizationOptions
): OptimizationResult | null {
  const budget = Math.max(8, options.budget ?? 24);
  const warmupSeconds = options.warmupSeconds ?? 30;
  const evalHorizonSeconds = options.evalHorizonSeconds ?? 150;
  const trainSeed = network.config.seed;
  const validationSeed = trainSeed + 9973;

  const baselineSignals: Record<string, SignalConfig> = {};
  for (const n of network.nodes) {
    baselineSignals[n.id] = { ...n.signal };
  }

  if (options.isCancelled?.()) return null;

  options.onProgress?.({
    runId: options.runId,
    currentEvaluation: 1,
    totalBudget: budget,
    phase: 'BASELINE',
    bestTrainObjective: 0,
    baselineTrainObjective: 0,
    message: '기준 신호 설정(Baseline) 시뮬레이션 평가 중...',
  });

  const baseEval = evaluateSignalPlan(
    network,
    baselineSignals,
    trainSeed,
    warmupSeconds,
    evalHorizonSeconds
  );

  let bestSignals = cloneSignalMap(baselineSignals);
  let bestTrainBreakdown = baseEval.breakdown;
  let bestTrainSnapshot = baseEval.snapshot;

  // Analyze directional pressure at each intersection from baseline run + static demand
  const nodeMap = new Map(network.nodes.map((n) => [n.id, n]));
  const axisPressure: Record<string, { nsWeight: number; ewWeight: number }> = {};

  for (const node of network.nodes) {
    const st = baseEval.snapshot.nodeStats[node.id];
    const incomingEdges = network.edges.filter((e) => e.to === node.id);

    let nsCap = 0;
    let ewCap = 0;
    let nsFlow = 0;
    let ewFlow = 0;

    for (const e of incomingEdges) {
      const fromNode = nodeMap.get(e.from);
      if (!fromNode) continue;
      const axis = getApproachAxis(getIncomingApproachDirection(fromNode, node));
      const eSt = baseEval.snapshot.edgeStats[e.id];
      const entered = eSt?.cumulativeEntered ?? 0;
      const waitScore = (eSt?.waitingCount ?? 0) * 3 + (eSt?.avgWaitSeconds ?? 0) * 0.6;

      if (axis === 'NS') {
        nsCap += e.lanes;
        nsFlow += entered + waitScore;
      } else {
        ewCap += e.lanes;
        ewFlow += entered + waitScore;
      }
    }

    const nsTotal =
      nsFlow + (st?.nsWaitingVehicles ?? 0) * 4 + (st?.nsAvgWaitSeconds ?? 0) * 0.8 + Math.max(1, nsCap) * 2;
    const ewTotal =
      ewFlow + (st?.ewWaitingVehicles ?? 0) * 4 + (st?.ewAvgWaitSeconds ?? 0) * 0.8 + Math.max(1, ewCap) * 2;

    axisPressure[node.id] = {
      nsWeight: Math.max(1, nsTotal),
      ewWeight: Math.max(1, ewTotal),
    };
  }

  // Generate candidate pool: Stage 1 (pressure-guided cycles & green waves) + Stage 2 (local refinement)
  const rng = new SeededRandom(trainSeed + 1337);
  const targetTotalGreens = [32, 40, 48, 56, 64, 72];

  const searchBudget = Math.max(2, budget - 2); // Reserve final 2 evaluations for validation seed

  for (let evalIdx = 2; evalIdx <= searchBudget; evalIdx++) {
    if (options.isCancelled?.()) return null;

    const candidate = cloneSignalMap(bestSignals);

    if (evalIdx - 2 < targetTotalGreens.length) {
      // Stage 1: Pressure-balanced split across candidate cycle lengths + arterial offset coordination
      const totalGreenBudget = targetTotalGreens[evalIdx - 2];
      for (const node of network.nodes) {
        if (!node.signal.enabled) continue;
        const p = axisPressure[node.id] || { nsWeight: 1, ewWeight: 1 };
        const nsRatio = p.nsWeight / (p.nsWeight + p.ewWeight);
        const nsG = clampGreen(totalGreenBudget * nsRatio);
        const ewG = clampGreen(totalGreenBudget * (1 - nsRatio));
        const cycle = nsG + ewG + 2 * (node.signal.yellowSeconds + node.signal.allRedSeconds);
        // Progression offset along X+Y coordinate wave (~12.5 m/s progression speed)
        const waveOffset = Math.round(((node.x + node.y * 0.5) / 12.5) % cycle);

        candidate[node.id] = {
          ...node.signal,
          nsGreenSeconds: nsG,
          ewGreenSeconds: ewG,
          offsetSeconds: ((waveOffset % cycle) + cycle) % cycle,
        };
      }
    } else {
      // Stage 2: Coordinate & neighborhood search around current best
      // Pick 1 to 3 intersections to perturb
      const enabledNodes = network.nodes.filter((n) => n.signal.enabled);
      if (enabledNodes.length > 0) {
        const numMutate = Math.min(enabledNodes.length, rng.nextInt(1, 3));
        for (let m = 0; m < numMutate; m++) {
          const targetNode = enabledNodes[rng.nextInt(0, enabledNodes.length - 1)];
          const cur = candidate[targetNode.id];
          const mode = rng.nextInt(0, 3);

          if (mode === 0) {
            // Shift split between NS and EW keeping cycle roughly similar
            const delta = rng.nextInt(-3, 3) * 3;
            cur.nsGreenSeconds = clampGreen(cur.nsGreenSeconds + delta);
            cur.ewGreenSeconds = clampGreen(cur.ewGreenSeconds - delta);
          } else if (mode === 1) {
            // Adjust NS green directly
            const delta = rng.nextInt(-3, 3) * 4;
            cur.nsGreenSeconds = clampGreen(cur.nsGreenSeconds + delta);
          } else if (mode === 2) {
            // Adjust EW green directly
            const delta = rng.nextInt(-3, 3) * 4;
            cur.ewGreenSeconds = clampGreen(cur.ewGreenSeconds + delta);
          } else {
            // Adjust coordination offset
            const cycle =
              cur.nsGreenSeconds +
              cur.ewGreenSeconds +
              2 * (cur.yellowSeconds + cur.allRedSeconds);
            const deltaOffset = rng.nextInt(-4, 4) * 4;
            cur.offsetSeconds = (((cur.offsetSeconds + deltaOffset) % cycle) + cycle) % cycle;
          }
        }
      }
    }

    const res = evaluateSignalPlan(
      network,
      candidate,
      trainSeed,
      warmupSeconds,
      evalHorizonSeconds
    );

    if (res.breakdown.totalScore < bestTrainBreakdown.totalScore - 0.05) {
      bestSignals = candidate;
      bestTrainBreakdown = res.breakdown;
      bestTrainSnapshot = res.snapshot;
    }

    options.onProgress?.({
      runId: options.runId,
      currentEvaluation: evalIdx,
      totalBudget: budget,
      phase: 'SEARCHING',
      bestTrainObjective: bestTrainBreakdown.totalScore,
      baselineTrainObjective: baseEval.breakdown.totalScore,
      message: `후보 신호 탐색 중 (${evalIdx}/${budget}) — 현재 최적 점수: ${bestTrainBreakdown.totalScore.toFixed(1)}`,
    });
  }

  if (options.isCancelled?.()) return null;

  // Stage 3: Out-of-sample validation on `validationSeed`
  options.onProgress?.({
    runId: options.runId,
    currentEvaluation: budget - 1,
    totalBudget: budget,
    phase: 'VALIDATING',
    bestTrainObjective: bestTrainBreakdown.totalScore,
    baselineTrainObjective: baseEval.breakdown.totalScore,
    message: `검증 시드(Seed #${validationSeed})에서 과적합 여부 교차 검증 중...`,
  });

  const valBaseEval = evaluateSignalPlan(
    network,
    baselineSignals,
    validationSeed,
    warmupSeconds,
    evalHorizonSeconds
  );

  if (options.isCancelled?.()) return null;

  const valOptEval = evaluateSignalPlan(
    network,
    bestSignals,
    validationSeed,
    warmupSeconds,
    evalHorizonSeconds
  );

  const trainDelta = baseEval.breakdown.totalScore - bestTrainBreakdown.totalScore;
  const valDelta = valBaseEval.breakdown.totalScore - valOptEval.breakdown.totalScore;

  // Determine whether a genuine improvement was found
  const improvedOnTrain = trainDelta >= 0.25;
  const overfitWarning = improvedOnTrain && valDelta < -0.5;
  // Never auto-recommend a candidate that did not improve on training seed
  const improved = improvedOnTrain && valDelta >= -0.5;

  if (!improvedOnTrain) {
    // Keep baseline if no improvement
    bestSignals = cloneSignalMap(baselineSignals);
    bestTrainBreakdown = baseEval.breakdown;
    bestTrainSnapshot = baseEval.snapshot;
  }

  const diffs: SignalPlanDiff[] = network.nodes.map((n) => {
    const b = baselineSignals[n.id];
    const a = bestSignals[n.id];
    return {
      nodeId: n.id,
      nodeName: n.name,
      beforeNsGreen: b.nsGreenSeconds,
      beforeEwGreen: b.ewGreenSeconds,
      beforeOffset: b.offsetSeconds,
      afterNsGreen: a.nsGreenSeconds,
      afterEwGreen: a.ewGreenSeconds,
      afterOffset: a.offsetSeconds,
    };
  });

  let summaryMessage = '';
  if (!improvedOnTrain) {
    summaryMessage =
      '개선 없음: 현재 신호 설정이 주어진 수요와 제약 조건에서 이미 최적 수준이므로 기존 설정을 유지합니다.';
  } else if (overfitWarning) {
    summaryMessage = `학습 시드(#${trainSeed})에서는 점수가 ${trainDelta.toFixed(
      1
    )}점 개선되었으나, 검증 시드(#${validationSeed})에서는 개선되지 않아 과적합(Overfitting) 주의가 필요합니다.`;
  } else {
    summaryMessage = `신호 최적화 완료: 학습 시드(#${trainSeed})에서 목적함수 ${trainDelta.toFixed(
      1
    )}점 개선, 검증 시드(#${validationSeed})에서도 ${valDelta.toFixed(1)}점 일반화 개선을 확인했습니다.`;
  }

  options.onProgress?.({
    runId: options.runId,
    currentEvaluation: budget,
    totalBudget: budget,
    phase: 'COMPLETED',
    bestTrainObjective: bestTrainBreakdown.totalScore,
    baselineTrainObjective: baseEval.breakdown.totalScore,
    message: summaryMessage,
  });

  return {
    runId: options.runId,
    improved,
    overfitWarning,
    summaryMessage,
    warmupSeconds,
    evalHorizonSeconds,
    trainSeed,
    validationSeed,
    baselineSignals,
    optimizedSignals: bestSignals,
    diffs,
    trainBaseline: baseEval.breakdown,
    trainOptimized: bestTrainBreakdown,
    valBaseline: valBaseEval.breakdown,
    valOptimized: improvedOnTrain ? valOptEval.breakdown : valBaseEval.breakdown,
    baselineSnapshot: baseEval.snapshot,
    optimizedSnapshot: bestTrainSnapshot,
  };
}

/**
 * Async version of `runSignalOptimization` that yields to the event loop between candidate evaluations
 * so Web Workers can stream real-time progress updates and process `CANCEL_OPTIMIZATION` messages immediately.
 */
export async function runSignalOptimizationAsync(
  network: CityNetworkData,
  options: OptimizationOptions
): Promise<OptimizationResult | null> {
  const budget = Math.max(8, options.budget ?? 24);
  const warmupSeconds = options.warmupSeconds ?? 30;
  const evalHorizonSeconds = options.evalHorizonSeconds ?? 150;
  const trainSeed = network.config.seed;
  const validationSeed = trainSeed + 9973;

  const yieldTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  const baselineSignals: Record<string, SignalConfig> = {};
  for (const n of network.nodes) {
    baselineSignals[n.id] = { ...n.signal };
  }

  if (options.isCancelled?.()) return null;

  options.onProgress?.({
    runId: options.runId,
    currentEvaluation: 1,
    totalBudget: budget,
    phase: 'BASELINE',
    bestTrainObjective: 0,
    baselineTrainObjective: 0,
    message: '기준 신호 설정(Baseline) 시뮬레이션 평가 중...',
  });
  await yieldTick();
  if (options.isCancelled?.()) return null;

  const baseEval = evaluateSignalPlan(
    network,
    baselineSignals,
    trainSeed,
    warmupSeconds,
    evalHorizonSeconds
  );

  let bestSignals = cloneSignalMap(baselineSignals);
  let bestTrainBreakdown = baseEval.breakdown;
  let bestTrainSnapshot = baseEval.snapshot;

  const nodeMap = new Map(network.nodes.map((n) => [n.id, n]));
  const axisPressure: Record<string, { nsWeight: number; ewWeight: number }> = {};

  for (const node of network.nodes) {
    const st = baseEval.snapshot.nodeStats[node.id];
    const incomingEdges = network.edges.filter((e) => e.to === node.id);

    let nsCap = 0;
    let ewCap = 0;
    let nsFlow = 0;
    let ewFlow = 0;

    for (const e of incomingEdges) {
      const fromNode = nodeMap.get(e.from);
      if (!fromNode) continue;
      const axis = getApproachAxis(getIncomingApproachDirection(fromNode, node));
      const eSt = baseEval.snapshot.edgeStats[e.id];
      const entered = eSt?.cumulativeEntered ?? 0;
      const waitScore = (eSt?.waitingCount ?? 0) * 3 + (eSt?.avgWaitSeconds ?? 0) * 0.6;

      if (axis === 'NS') {
        nsCap += e.lanes;
        nsFlow += entered + waitScore;
      } else {
        ewCap += e.lanes;
        ewFlow += entered + waitScore;
      }
    }

    const nsTotal =
      nsFlow +
      (st?.nsWaitingVehicles ?? 0) * 4 +
      (st?.nsAvgWaitSeconds ?? 0) * 0.8 +
      Math.max(1, nsCap) * 2;
    const ewTotal =
      ewFlow +
      (st?.ewWaitingVehicles ?? 0) * 4 +
      (st?.ewAvgWaitSeconds ?? 0) * 0.8 +
      Math.max(1, ewCap) * 2;

    axisPressure[node.id] = {
      nsWeight: Math.max(1, nsTotal),
      ewWeight: Math.max(1, ewTotal),
    };
  }

  const rng = new SeededRandom(trainSeed + 1337);
  const targetTotalGreens = [32, 40, 48, 56, 64, 72];
  const searchBudget = Math.max(2, budget - 2);

  for (let evalIdx = 2; evalIdx <= searchBudget; evalIdx++) {
    await yieldTick();
    if (options.isCancelled?.()) return null;

    const candidate = cloneSignalMap(bestSignals);

    if (evalIdx - 2 < targetTotalGreens.length) {
      const totalGreenBudget = targetTotalGreens[evalIdx - 2];
      for (const node of network.nodes) {
        if (!node.signal.enabled) continue;
        const p = axisPressure[node.id] || { nsWeight: 1, ewWeight: 1 };
        const nsRatio = p.nsWeight / (p.nsWeight + p.ewWeight);
        const nsG = clampGreen(totalGreenBudget * nsRatio);
        const ewG = clampGreen(totalGreenBudget * (1 - nsRatio));
        const cycle = nsG + ewG + 2 * (node.signal.yellowSeconds + node.signal.allRedSeconds);
        const waveOffset = Math.round(((node.x + node.y * 0.5) / 12.5) % cycle);

        candidate[node.id] = {
          ...node.signal,
          nsGreenSeconds: nsG,
          ewGreenSeconds: ewG,
          offsetSeconds: ((waveOffset % cycle) + cycle) % cycle,
        };
      }
    } else {
      const enabledNodes = network.nodes.filter((n) => n.signal.enabled);
      if (enabledNodes.length > 0) {
        const numMutate = Math.min(enabledNodes.length, rng.nextInt(1, 3));
        for (let m = 0; m < numMutate; m++) {
          const targetNode = enabledNodes[rng.nextInt(0, enabledNodes.length - 1)];
          const cur = candidate[targetNode.id];
          const mode = rng.nextInt(0, 3);

          if (mode === 0) {
            const delta = rng.nextInt(-3, 3) * 3;
            cur.nsGreenSeconds = clampGreen(cur.nsGreenSeconds + delta);
            cur.ewGreenSeconds = clampGreen(cur.ewGreenSeconds - delta);
          } else if (mode === 1) {
            const delta = rng.nextInt(-3, 3) * 4;
            cur.nsGreenSeconds = clampGreen(cur.nsGreenSeconds + delta);
          } else if (mode === 2) {
            const delta = rng.nextInt(-3, 3) * 4;
            cur.ewGreenSeconds = clampGreen(cur.ewGreenSeconds + delta);
          } else {
            const cycle =
              cur.nsGreenSeconds +
              cur.ewGreenSeconds +
              2 * (cur.yellowSeconds + cur.allRedSeconds);
            const deltaOffset = rng.nextInt(-4, 4) * 4;
            cur.offsetSeconds = (((cur.offsetSeconds + deltaOffset) % cycle) + cycle) % cycle;
          }
        }
      }
    }

    const res = evaluateSignalPlan(
      network,
      candidate,
      trainSeed,
      warmupSeconds,
      evalHorizonSeconds
    );

    if (res.breakdown.totalScore < bestTrainBreakdown.totalScore - 0.05) {
      bestSignals = candidate;
      bestTrainBreakdown = res.breakdown;
      bestTrainSnapshot = res.snapshot;
    }

    options.onProgress?.({
      runId: options.runId,
      currentEvaluation: evalIdx,
      totalBudget: budget,
      phase: 'SEARCHING',
      bestTrainObjective: bestTrainBreakdown.totalScore,
      baselineTrainObjective: baseEval.breakdown.totalScore,
      message: `후보 신호 탐색 중 (${evalIdx}/${budget}) — 현재 최적 점수: ${bestTrainBreakdown.totalScore.toFixed(1)}`,
    });
  }

  await yieldTick();
  if (options.isCancelled?.()) return null;

  options.onProgress?.({
    runId: options.runId,
    currentEvaluation: budget - 1,
    totalBudget: budget,
    phase: 'VALIDATING',
    bestTrainObjective: bestTrainBreakdown.totalScore,
    baselineTrainObjective: baseEval.breakdown.totalScore,
    message: `검증 시드(Seed #${validationSeed})에서 과적합 여부 교차 검증 중...`,
  });

  const valBaseEval = evaluateSignalPlan(
    network,
    baselineSignals,
    validationSeed,
    warmupSeconds,
    evalHorizonSeconds
  );

  await yieldTick();
  if (options.isCancelled?.()) return null;

  const valOptEval = evaluateSignalPlan(
    network,
    bestSignals,
    validationSeed,
    warmupSeconds,
    evalHorizonSeconds
  );

  const trainDelta = baseEval.breakdown.totalScore - bestTrainBreakdown.totalScore;
  const valDelta = valBaseEval.breakdown.totalScore - valOptEval.breakdown.totalScore;

  const improvedOnTrain = trainDelta >= 0.25;
  const overfitWarning = improvedOnTrain && valDelta < -0.5;
  const improved = improvedOnTrain && valDelta >= -0.5;

  if (!improvedOnTrain) {
    bestSignals = cloneSignalMap(baselineSignals);
    bestTrainBreakdown = baseEval.breakdown;
    bestTrainSnapshot = baseEval.snapshot;
  }

  const diffs: SignalPlanDiff[] = network.nodes.map((n) => {
    const b = baselineSignals[n.id];
    const a = bestSignals[n.id];
    return {
      nodeId: n.id,
      nodeName: n.name,
      beforeNsGreen: b.nsGreenSeconds,
      beforeEwGreen: b.ewGreenSeconds,
      beforeOffset: b.offsetSeconds,
      afterNsGreen: a.nsGreenSeconds,
      afterEwGreen: a.ewGreenSeconds,
      afterOffset: a.offsetSeconds,
    };
  });

  let summaryMessage = '';
  if (!improvedOnTrain) {
    summaryMessage =
      '개선 없음: 현재 신호 설정이 주어진 수요와 제약 조건에서 이미 최적 수준이므로 기존 설정을 유지합니다.';
  } else if (overfitWarning) {
    summaryMessage = `학습 시드(#${trainSeed})에서는 점수가 ${trainDelta.toFixed(
      1
    )}점 개선되었으나, 검증 시드(#${validationSeed})에서는 개선되지 않아 과적합(Overfitting) 주의가 필요합니다.`;
  } else {
    summaryMessage = `신호 최적화 완료: 학습 시드(#${trainSeed})에서 목적함수 ${trainDelta.toFixed(
      1
    )}점 개선, 검증 시드(#${validationSeed})에서도 ${valDelta.toFixed(1)}점 일반화 개선을 확인했습니다.`;
  }

  options.onProgress?.({
    runId: options.runId,
    currentEvaluation: budget,
    totalBudget: budget,
    phase: 'COMPLETED',
    bestTrainObjective: bestTrainBreakdown.totalScore,
    baselineTrainObjective: baseEval.breakdown.totalScore,
    message: summaryMessage,
  });

  return {
    runId: options.runId,
    improved,
    overfitWarning,
    summaryMessage,
    warmupSeconds,
    evalHorizonSeconds,
    trainSeed,
    validationSeed,
    baselineSignals,
    optimizedSignals: bestSignals,
    diffs,
    trainBaseline: baseEval.breakdown,
    trainOptimized: bestTrainBreakdown,
    valBaseline: valBaseEval.breakdown,
    valOptimized: improvedOnTrain ? valOptEval.breakdown : valBaseEval.breakdown,
    baselineSnapshot: baseEval.snapshot,
    optimizedSnapshot: bestTrainSnapshot,
  };
}
