import { runSignalOptimizationAsync } from '../engine/optimizer';
import { TrafficSimulator } from '../engine/simulator';
import {
  CityNetworkData,
  OptimizationProgress,
  OptimizationResult,
  SignalConfig,
  SimulationSnapshot,
} from '../types/simulation';

export type WorkerRequestMessage =
  | {
      type: 'INIT_NETWORK';
      sessionId: number;
      network: CityNetworkData;
    }
  | {
      type: 'STEP_SIMULATION';
      sessionId: number;
      steps: number;
    }
  | {
      type: 'UPDATE_NODE_SIGNAL';
      sessionId: number;
      nodeId: string;
      signal: SignalConfig;
    }
  | {
      type: 'APPLY_SIGNAL_PLAN';
      sessionId: number;
      signals: Record<string, SignalConfig>;
    }
  | {
      type: 'RUN_OPTIMIZATION';
      sessionId: number;
      runId: string;
      network: CityNetworkData;
      budget: number;
      warmupSeconds: number;
      evalHorizonSeconds: number;
    }
  | {
      type: 'CANCEL_OPTIMIZATION';
      runId?: string;
    };

export type WorkerResponseMessage =
  | {
      type: 'SNAPSHOT';
      sessionId: number;
      snapshot: SimulationSnapshot;
    }
  | {
      type: 'OPT_PROGRESS';
      sessionId: number;
      runId: string;
      progress: OptimizationProgress;
    }
  | {
      type: 'OPT_RESULT';
      sessionId: number;
      runId: string;
      result: OptimizationResult;
    }
  | {
      type: 'OPT_CANCELLED';
      sessionId: number;
      runId: string;
    };

let simulator: TrafficSimulator | null = null;
let currentSessionId = 0;
let activeOptRunId: string | null = null;
const cancelledRunIds = new Set<string>();

self.onmessage = async (event: MessageEvent<WorkerRequestMessage>) => {
  const msg = event.data;
  if (!msg) return;

  switch (msg.type) {
    case 'INIT_NETWORK': {
      currentSessionId = msg.sessionId;
      // Cancel any ongoing optimization from an older session
      if (activeOptRunId) {
        cancelledRunIds.add(activeOptRunId);
        activeOptRunId = null;
      }
      simulator = new TrafficSimulator(msg.network);
      const snap = simulator.getSnapshot();
      const resp: WorkerResponseMessage = {
        type: 'SNAPSHOT',
        sessionId: msg.sessionId,
        snapshot: snap,
      };
      self.postMessage(resp);
      break;
    }

    case 'STEP_SIMULATION': {
      if (msg.sessionId !== currentSessionId || !simulator) return;
      const snap = simulator.step(msg.steps);
      const resp: WorkerResponseMessage = {
        type: 'SNAPSHOT',
        sessionId: msg.sessionId,
        snapshot: snap,
      };
      self.postMessage(resp);
      break;
    }

    case 'UPDATE_NODE_SIGNAL': {
      if (msg.sessionId !== currentSessionId || !simulator) return;
      simulator.updateNodeSignal(msg.nodeId, msg.signal);
      const snap = simulator.getSnapshot();
      const resp: WorkerResponseMessage = {
        type: 'SNAPSHOT',
        sessionId: msg.sessionId,
        snapshot: snap,
      };
      self.postMessage(resp);
      break;
    }

    case 'APPLY_SIGNAL_PLAN': {
      if (msg.sessionId !== currentSessionId || !simulator) return;
      simulator.applySignalPlan(msg.signals);
      const snap = simulator.getSnapshot();
      const resp: WorkerResponseMessage = {
        type: 'SNAPSHOT',
        sessionId: msg.sessionId,
        snapshot: snap,
      };
      self.postMessage(resp);
      break;
    }

    case 'CANCEL_OPTIMIZATION': {
      if (msg.runId) {
        cancelledRunIds.add(msg.runId);
        if (activeOptRunId === msg.runId) {
          activeOptRunId = null;
        }
      } else if (activeOptRunId) {
        cancelledRunIds.add(activeOptRunId);
        activeOptRunId = null;
      }
      break;
    }

    case 'RUN_OPTIMIZATION': {
      // Cancel any previous run immediately
      if (activeOptRunId && activeOptRunId !== msg.runId) {
        cancelledRunIds.add(activeOptRunId);
      }
      activeOptRunId = msg.runId;
      const targetSession = msg.sessionId;
      const targetRunId = msg.runId;

      const isCancelled = () =>
        cancelledRunIds.has(targetRunId) ||
        activeOptRunId !== targetRunId ||
        currentSessionId !== targetSession;

      const result = await runSignalOptimizationAsync(msg.network, {
        runId: targetRunId,
        budget: msg.budget,
        warmupSeconds: msg.warmupSeconds,
        evalHorizonSeconds: msg.evalHorizonSeconds,
        isCancelled,
        onProgress: (progress) => {
          if (isCancelled()) return;
          const pMsg: WorkerResponseMessage = {
            type: 'OPT_PROGRESS',
            sessionId: targetSession,
            runId: targetRunId,
            progress,
          };
          self.postMessage(pMsg);
        },
      });

      if (isCancelled() || !result) {
        const cMsg: WorkerResponseMessage = {
          type: 'OPT_CANCELLED',
          sessionId: targetSession,
          runId: targetRunId,
        };
        self.postMessage(cMsg);
        return;
      }

      if (activeOptRunId === targetRunId) {
        activeOptRunId = null;
      }

      const rMsg: WorkerResponseMessage = {
        type: 'OPT_RESULT',
        sessionId: targetSession,
        runId: targetRunId,
        result,
      };
      self.postMessage(rMsg);
      break;
    }
  }
};
