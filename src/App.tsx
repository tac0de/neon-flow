import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CityNetworkData,
  EdgeData,
  NodeData,
  OptimizationProgress,
  OptimizationResult,
  RoutingMode,
  SignalConfig,
  SimulationSnapshot,
} from './types/simulation';
import {
  BUILTIN_SCENARIOS,
  createCommuteRushScenario,
} from './data/scenarios';
import { TrafficSimulator } from './engine/simulator';
import {
  computeEdgeCapacity,
  computeEdgeLength,
  validateRoadAddition,
} from './engine/router';
import { validateAndSanitizeNetworkJson } from './engine/validator';
import { TopBar } from './components/TopBar';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel, RightPanelTab } from './components/RightPanel';
import { CityCanvas, EditorToolMode } from './components/CityCanvas';
import { MetricsChart } from './components/MetricsChart';
import { JsonImportModal } from './components/JsonImportModal';
import {
  WorkerRequestMessage,
  WorkerResponseMessage,
} from './worker/simWorker';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

const LOCAL_STORAGE_KEY = 'neon_flow_saved_city_v1';

export const App: React.FC = () => {
  // Initial network & synchronous initial snapshot so frame 0 has real vehicles immediately
  const [network, setNetwork] = useState<CityNetworkData>(() =>
    createCommuteRushScenario()
  );
  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(() => {
    const initialSim = new TrafficSimulator(createCommuteRushScenario());
    return initialSim.getSnapshot();
  });

  // Playback state (auto-starts playing so user sees moving city within 1 second)
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [renderTimeMs, setRenderTimeMs] = useState<number>(0.8);

  // Selection & Tool state
  const [toolMode, setToolMode] = useState<EditorToolMode>('SELECT');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('N22');
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(false);
  const [rightTab, setRightTab] = useState<RightPanelTab>('INSPECTOR');

  // Responsive panel collapse state
  const [leftCollapsed, setLeftCollapsed] = useState<boolean>(false);
  const [rightCollapsed, setRightCollapsed] = useState<boolean>(false);

  // Optimization & Comparison state
  const [optBudget, setOptBudget] = useState<number>(20);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [optProgress, setOptProgress] = useState<OptimizationProgress | null>(
    null
  );
  const [optResult, setOptResult] = useState<OptimizationResult | null>(null);
  const [isSplitComparison, setIsSplitComparison] = useState<boolean>(false);
  const [comparisonSnapshot, setComparisonSnapshot] =
    useState<SimulationSnapshot | null>(null);
  const [comparisonNetwork, setComparisonNetwork] =
    useState<CityNetworkData | null>(null);

  // Modals & Banners
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [banner, setBanner] = useState<{
    type: 'info' | 'warn' | 'success';
    text: string;
  } | null>(null);
  const [hasLocalSave, setHasLocalSave] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem(LOCAL_STORAGE_KEY));
    } catch {
      return false;
    }
  });

  // Worker & Session Synchronization Refs
  const workerRef = useRef<Worker | null>(null);
  const sessionIdRef = useRef<number>(1);
  const activeOptRunIdRef = useRef<string | null>(null);
  const fallbackSimRef = useRef<TrafficSimulator | null>(null);
  const comparisonSimRef = useRef<TrafficSimulator | null>(null);

  const showNotice = useCallback(
    (text: string, type: 'info' | 'warn' | 'success' = 'info') => {
      setBanner({ text, type });
    },
    []
  );

  // Initialize Web Worker
  useEffect(() => {
    try {
      const worker = new Worker(
        new URL('./worker/simWorker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
        const msg = event.data;
        if (!msg) return;

        // Guard against stale session messages
        if (msg.sessionId !== sessionIdRef.current) {
          return;
        }

        if (msg.type === 'SNAPSHOT') {
          setSnapshot(msg.snapshot);
        } else if (msg.type === 'OPT_PROGRESS') {
          if (msg.runId !== activeOptRunIdRef.current) return;
          setOptProgress(msg.progress);
        } else if (msg.type === 'OPT_RESULT') {
          if (msg.runId !== activeOptRunIdRef.current) return;
          activeOptRunIdRef.current = null;
          setIsOptimizing(false);
          setOptProgress(null);
          setOptResult(msg.result);
          setComparisonSnapshot(msg.result.baselineSnapshot);
          showNotice(
            msg.result.summaryMessage,
            msg.result.improved ? 'success' : 'info'
          );
        } else if (msg.type === 'OPT_CANCELLED') {
          if (msg.runId === activeOptRunIdRef.current) {
            activeOptRunIdRef.current = null;
            setIsOptimizing(false);
            setOptProgress(null);
          }
        }
      };

      workerRef.current = worker;
      const initMsg: WorkerRequestMessage = {
        type: 'INIT_NETWORK',
        sessionId: sessionIdRef.current,
        network,
      };
      worker.postMessage(initMsg);

      return () => {
        worker.terminate();
        workerRef.current = null;
      };
    } catch {
      // Fallback to local simulator if Worker initialization is unavailable
      fallbackSimRef.current = new TrafficSimulator(network);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Resets simulation to t=0 with `nextNet`, increments `sessionId` so stale Worker messages are ignored,
   * and optionally cancels ongoing optimization.
   */
  const resetSimulationWithNetwork = useCallback(
    (
      nextNet: CityNetworkData,
      options?: {
        keepOptResult?: boolean;
        pause?: boolean;
        setupBaselineComparison?: CityNetworkData | null;
      }
    ) => {
      sessionIdRef.current += 1;
      const newSessionId = sessionIdRef.current;

      if (activeOptRunIdRef.current) {
        activeOptRunIdRef.current = null;
        setIsOptimizing(false);
        setOptProgress(null);
      }

      if (!options?.keepOptResult) {
        setOptResult(null);
        setIsSplitComparison(false);
        setComparisonSnapshot(null);
        setComparisonNetwork(null);
        comparisonSimRef.current = null;
      } else if (options?.setupBaselineComparison) {
        const baseSim = new TrafficSimulator(options.setupBaselineComparison);
        comparisonSimRef.current = baseSim;
        setComparisonNetwork(options.setupBaselineComparison);
        setComparisonSnapshot(baseSim.getSnapshot());
      }

      if (options?.pause !== undefined) {
        setIsPlaying(!options.pause);
      }

      setNetwork(nextNet);

      // Compute synchronous t=0 snapshot immediately so UI never flashes stale data
      const immediateSim = new TrafficSimulator(nextNet);
      setSnapshot(immediateSim.getSnapshot());
      fallbackSimRef.current = immediateSim;

      if (workerRef.current) {
        const initMsg: WorkerRequestMessage = {
          type: 'INIT_NETWORK',
          sessionId: newSessionId,
          network: nextNet,
        };
        workerRef.current.postMessage(initMsg);
      }
    },
    []
  );

  // Fixed-timestep simulation loop decoupled from rendering framerate
  useEffect(() => {
    if (!isPlaying) return;

    // Base dt is 0.2s (200ms at 1x speed).
    // At 0.5x: 1 step every 400ms
    // At 1x: 1 step every 200ms
    // At 2x: 1 step every 100ms
    // At 4x: 2 steps every 100ms
    const intervalMs =
      speedMultiplier === 0.5
        ? 400
        : speedMultiplier === 1
        ? 200
        : 100;
    const stepsPerTick = speedMultiplier === 4 ? 2 : 1;

    const timer = window.setInterval(() => {
      if (workerRef.current) {
        const stepMsg: WorkerRequestMessage = {
          type: 'STEP_SIMULATION',
          sessionId: sessionIdRef.current,
          steps: stepsPerTick,
        };
        workerRef.current.postMessage(stepMsg);
      } else if (fallbackSimRef.current) {
        setSnapshot(fallbackSimRef.current.step(stepsPerTick));
      }

      if (comparisonSimRef.current) {
        setComparisonSnapshot(comparisonSimRef.current.step(stepsPerTick));
      }
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [isPlaying, speedMultiplier]);

  const handleStepOnce = () => {
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'STEP_SIMULATION',
        sessionId: sessionIdRef.current,
        steps: 1,
      } satisfies WorkerRequestMessage);
    } else if (fallbackSimRef.current) {
      setSnapshot(fallbackSimRef.current.step(1));
    }
    if (comparisonSimRef.current) {
      setComparisonSnapshot(comparisonSimRef.current.step(1));
    }
  };

  const handleSelectScenario = (scenarioId: string) => {
    const factory = BUILTIN_SCENARIOS[scenarioId];
    if (!factory) return;
    const nextNet = factory();
    setSelectedNodeId(nextNet.nodes[Math.floor(nextNet.nodes.length / 2)]?.id || null);
    setSelectedEdgeId(null);
    resetSimulationWithNetwork(nextNet, { pause: false });
    showNotice(`'${nextNet.name}' 시나리오가 로드되었습니다.`, 'info');
  };

  // Live intersection signal edit
  const handleUpdateNodeSignal = (nodeId: string, signal: SignalConfig) => {
    setNetwork((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, signal } : n)),
    }));
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'UPDATE_NODE_SIGNAL',
        sessionId: sessionIdRef.current,
        nodeId,
        signal,
      } satisfies WorkerRequestMessage);
    } else if (fallbackSimRef.current) {
      fallbackSimRef.current.updateNodeSignal(nodeId, signal);
      setSnapshot(fallbackSimRef.current.getSnapshot());
    }
  };

  // Structural Edits (Pause & Reset to t=0 to guarantee vehicle conservation & route consistency)
  const handleUpdateEdge = (edgeId: string, patch: Partial<EdgeData>) => {
    const nextEdges = network.edges.map((e) => {
      if (e.id !== edgeId) return e;
      const updated = { ...e, ...patch };
      updated.capacity = computeEdgeCapacity(updated.lengthMeters, updated.lanes);
      return updated;
    });
    const nextNet: CityNetworkData = { ...network, edges: nextEdges };
    resetSimulationWithNetwork(nextNet, { pause: false });
    showNotice('도로 속성(차선·제한속도)이 변경되어 시뮬레이션을 재시작했습니다.', 'info');
  };

  const handleReverseEdge = (edgeId: string) => {
    const target = network.edges.find((e) => e.id === edgeId);
    if (!target) return;
    const otherEdges = network.edges.filter((e) => e.id !== edgeId);
    const check = validateRoadAddition(
      network.nodes,
      otherEdges,
      target.to,
      target.from
    );
    if (!check.valid) {
      showNotice(check.reason || '통행 방향을 반전할 수 없습니다.', 'warn');
      return;
    }
    const fromNode = network.nodes.find((n) => n.id === target.to)!;
    const toNode = network.nodes.find((n) => n.id === target.from)!;
    const reversed: EdgeData = {
      ...target,
      id: `E_${fromNode.id}_${toNode.id}`,
      name: `${fromNode.name} → ${toNode.name}`,
      from: fromNode.id,
      to: toNode.id,
    };
    const nextNet: CityNetworkData = {
      ...network,
      edges: [...otherEdges, reversed],
    };
    setSelectedEdgeId(reversed.id);
    resetSimulationWithNetwork(nextNet, { pause: true });
    showNotice(
      `도로 방향을 '${fromNode.name} → ${toNode.name}'(으)로 반전하고 시뮬레이션을 초기화했습니다.`,
      'info'
    );
  };

  const handleAddOppositeEdge = (edgeId: string) => {
    const target = network.edges.find((e) => e.id === edgeId);
    if (!target) return;
    const check = validateRoadAddition(
      network.nodes,
      network.edges,
      target.to,
      target.from
    );
    if (!check.valid) {
      showNotice(check.reason || '반대 방향 도로를 추가할 수 없습니다.', 'warn');
      return;
    }
    const fromNode = network.nodes.find((n) => n.id === target.to)!;
    const toNode = network.nodes.find((n) => n.id === target.from)!;
    const opposite: EdgeData = {
      id: `E_${fromNode.id}_${toNode.id}_${Date.now() % 1000}`,
      name: `${fromNode.name} → ${toNode.name}`,
      from: fromNode.id,
      to: toNode.id,
      lanes: target.lanes,
      speedLimitKmh: target.speedLimitKmh,
      lengthMeters: target.lengthMeters,
      capacity: computeEdgeCapacity(target.lengthMeters, target.lanes),
    };
    const nextNet: CityNetworkData = {
      ...network,
      edges: [...network.edges, opposite],
    };
    resetSimulationWithNetwork(nextNet, { pause: false });
    showNotice(`반대 방향 도로('${opposite.name}')가 추가되었습니다.`, 'success');
  };

  const handleDeleteEdge = (edgeId: string) => {
    const target = network.edges.find((e) => e.id === edgeId);
    if (!target) return;
    const nextNet: CityNetworkData = {
      ...network,
      edges: network.edges.filter((e) => e.id !== edgeId),
    };
    setSelectedEdgeId(null);
    resetSimulationWithNetwork(nextNet, { pause: false });
    showNotice(
      `도로 '${target.name}'을(를) 제거하고 경로를 재탐색했습니다.`,
      'info'
    );
  };

  const handleAddRoad = (fromId: string, toId: string) => {
    const check = validateRoadAddition(network.nodes, network.edges, fromId, toId);
    if (!check.valid) {
      showNotice(check.reason || '도로를 추가할 수 없습니다.', 'warn');
      return;
    }
    const fromNode = network.nodes.find((n) => n.id === fromId)!;
    const toNode = network.nodes.find((n) => n.id === toId)!;
    const lengthMeters = computeEdgeLength(fromNode, toNode);
    const newEdge: EdgeData = {
      id: `E_${fromId}_${toId}`,
      name: `${fromNode.name} → ${toNode.name}`,
      from: fromId,
      to: toId,
      lanes: 2,
      speedLimitKmh: 55,
      lengthMeters,
      capacity: computeEdgeCapacity(lengthMeters, 2),
    };
    const nextNet: CityNetworkData = {
      ...network,
      edges: [...network.edges, newEdge],
    };
    setSelectedEdgeId(newEdge.id);
    setSelectedNodeId(null);
    setToolMode('SELECT');
    resetSimulationWithNetwork(nextNet, { pause: false });
    showNotice(`신규 도로 '${newEdge.name}'이(가) 추가되었습니다.`, 'success');
  };

  const handleAddNode = (x: number, y: number) => {
    const idx = network.nodes.length + 1;
    const newId = `N_NEW_${idx}`;
    const newNode: NodeData = {
      id: newId,
      name: `신규 교차로 #${idx}`,
      x,
      y,
      signal: {
        enabled: true,
        nsGreenSeconds: 24,
        ewGreenSeconds: 24,
        yellowSeconds: 2,
        allRedSeconds: 1,
        offsetSeconds: 0,
      },
    };
    const nextNet: CityNetworkData = {
      ...network,
      nodes: [...network.nodes, newNode],
    };
    setSelectedNodeId(newNode.id);
    setSelectedEdgeId(null);
    setToolMode('SELECT');
    resetSimulationWithNetwork(nextNet, { pause: true });
    showNotice(
      `교차로 '${newNode.name}'이(가) 추가되었습니다. [도로 추가] 도구로 기존 교차로와 연결하세요.`,
      'success'
    );
  };

  const handleDeleteNode = (nodeId: string) => {
    if (network.nodes.length <= 2) {
      showNotice('최소 2개 이상의 교차로가 필요합니다.', 'warn');
      return;
    }
    const nextNet: CityNetworkData = {
      ...network,
      nodes: network.nodes.filter((n) => n.id !== nodeId),
      edges: network.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
      demands: network.demands.filter(
        (d) => d.origin !== nodeId && d.destination !== nodeId
      ),
    };
    setSelectedNodeId(null);
    resetSimulationWithNetwork(nextNet, { pause: true });
    showNotice(`교차로 '${nodeId}' 및 연결 도로가 삭제되었습니다.`, 'info');
  };

  // Quick Braess Shortcut Toggle for Scenario 3
  const handleQuickBraessToggle = () => {
    const hasShortcut = network.edges.some((e) => e.id === 'E_SHORTCUT_NS');
    if (hasShortcut) {
      // Save baseline with shortcut before removing so user can compare!
      const baselineWithShortcut: CityNetworkData = JSON.parse(
        JSON.stringify(network)
      );
      const nextNet: CityNetworkData = {
        ...network,
        edges: network.edges.filter((e) => e.id !== 'E_SHORTCUT_NS'),
      };
      setSelectedEdgeId(null);
      resetSimulationWithNetwork(nextNet, {
        keepOptResult: true,
        pause: false,
        setupBaselineComparison: baselineWithShortcut,
      });
      setIsSplitComparison(true);
      showNotice(
        '우회 실험: 중앙 지름길 도로(E_SHORTCUT_NS)를 제거하고 기존(좌측)과 개선(우측) 비교 주행을 시작했습니다!',
        'success'
      );
    } else {
      const nHub = network.nodes.find((n) => n.id === 'N_HUB');
      const sHub = network.nodes.find((n) => n.id === 'S_HUB');
      if (!nHub || !sHub) return;
      const shortcutEdge: EdgeData = {
        id: 'E_SHORTCUT_NS',
        name: '중앙 지름길 (브래스 연결로)',
        from: 'N_HUB',
        to: 'S_HUB',
        lanes: 1,
        speedLimitKmh: 80,
        lengthMeters: 130,
        capacity: computeEdgeCapacity(130, 1),
      };
      const nextNet: CityNetworkData = {
        ...network,
        edges: [...network.edges, shortcutEdge],
      };
      resetSimulationWithNetwork(nextNet, { pause: false });
      showNotice('중앙 지름길 도로(E_SHORTCUT_NS)를 다시 복원했습니다.', 'info');
    }
  };

  // OD Demand handlers
  const handleUpdateDemand = (odId: string, vehiclesPerHour: number) => {
    const nextNet: CityNetworkData = {
      ...network,
      demands: network.demands.map((d) =>
        d.id === odId ? { ...d, vehiclesPerHour } : d
      ),
    };
    resetSimulationWithNetwork(nextNet, { pause: false });
  };

  const handleAddDemand = (
    origin: string,
    destination: string,
    vehiclesPerHour: number
  ) => {
    const newOd = {
      id: `OD_${Date.now() % 10000}`,
      origin,
      destination,
      vehiclesPerHour,
    };
    const nextNet: CityNetworkData = {
      ...network,
      demands: [...network.demands, newOd],
    };
    resetSimulationWithNetwork(nextNet, { pause: false });
    showNotice('신규 출발·목적지(OD) 수요가 추가되었습니다.', 'success');
  };

  const handleDeleteDemand = (odId: string) => {
    const nextNet: CityNetworkData = {
      ...network,
      demands: network.demands.filter((d) => d.id !== odId),
    };
    resetSimulationWithNetwork(nextNet, { pause: false });
  };

  // Global Config handlers
  const handleChangeSeed = (seed: number) => {
    const nextNet: CityNetworkData = {
      ...network,
      config: { ...network.config, seed },
    };
    resetSimulationWithNetwork(nextNet, { pause: false });
  };

  const handleChangeDemandMultiplier = (demandMultiplier: number) => {
    const nextNet: CityNetworkData = {
      ...network,
      config: { ...network.config, demandMultiplier },
    };
    resetSimulationWithNetwork(nextNet, { pause: false });
  };

  const handleChangeRoutingMode = (routingMode: RoutingMode) => {
    const nextNet: CityNetworkData = {
      ...network,
      config: { ...network.config, routingMode },
    };
    resetSimulationWithNetwork(nextNet, { pause: false });
  };

  // Signal Optimization handlers
  const handleStartOptimization = () => {
    setRightTab('OPTIMIZER');
    setRightCollapsed(false);

    const runId = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    activeOptRunIdRef.current = runId;
    setIsOptimizing(true);
    setOptProgress({
      runId,
      currentEvaluation: 0,
      totalBudget: optBudget,
      phase: 'BASELINE',
      bestTrainObjective: 0,
      baselineTrainObjective: 0,
      message: 'Web Worker에서 신호 최적화 평가를 시작합니다...',
    });

    if (workerRef.current) {
      const req: WorkerRequestMessage = {
        type: 'RUN_OPTIMIZATION',
        sessionId: sessionIdRef.current,
        runId,
        network,
        budget: optBudget,
        warmupSeconds: 30,
        evalHorizonSeconds: 140,
      };
      workerRef.current.postMessage(req);
    }
  };

  const handleCancelOptimization = () => {
    const runId = activeOptRunIdRef.current;
    activeOptRunIdRef.current = null;
    setIsOptimizing(false);
    setOptProgress(null);

    if (workerRef.current && runId) {
      workerRef.current.postMessage({
        type: 'CANCEL_OPTIMIZATION',
        runId,
      } satisfies WorkerRequestMessage);
    }
    showNotice('신호 최적화 탐색을 취소했습니다.', 'info');
  };

  const handleApplyOptimizedSignals = () => {
    if (!optResult) return;

    const baselineNet: CityNetworkData = JSON.parse(JSON.stringify(network));
    for (const n of baselineNet.nodes) {
      if (optResult.baselineSignals[n.id]) {
        n.signal = { ...optResult.baselineSignals[n.id] };
      }
    }

    const optimizedNet: CityNetworkData = JSON.parse(JSON.stringify(network));
    for (const n of optimizedNet.nodes) {
      if (optResult.optimizedSignals[n.id]) {
        n.signal = { ...optResult.optimizedSignals[n.id] };
      }
    }

    resetSimulationWithNetwork(optimizedNet, {
      keepOptResult: true,
      pause: false,
      setupBaselineComparison: baselineNet,
    });
    setIsSplitComparison(true);
    showNotice(
      '개선된 신호 계획을 적용하고 동일 초기 상태·시드에서 전·후 나란히 비교 주행을 시작했습니다.',
      'success'
    );
  };

  const handleRestoreBaselineSignals = () => {
    if (!optResult) return;
    const restoredNet: CityNetworkData = JSON.parse(JSON.stringify(network));
    for (const n of restoredNet.nodes) {
      if (optResult.baselineSignals[n.id]) {
        n.signal = { ...optResult.baselineSignals[n.id] };
      }
    }
    resetSimulationWithNetwork(restoredNet, {
      keepOptResult: true,
      pause: false,
    });
    setIsSplitComparison(false);
    showNotice('기존(Baseline) 신호 설정으로 복원했습니다.', 'info');
  };

  // LocalStorage & JSON Export/Import
  const handleSaveLocal = () => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(network));
      setHasLocalSave(true);
      showNotice('현재 도시 구조·수요·신호 설정을 브라우저 로컬 저장소에 저장했습니다.', 'success');
    } catch {
      showNotice('로컬 저장소 쓰기에 실패했습니다.', 'warn');
    }
  };

  const handleLoadLocal = () => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) {
        showNotice('저장된 로컬 설정이 없습니다.', 'warn');
        return;
      }
      const parsed = JSON.parse(raw);
      const val = validateAndSanitizeNetworkJson(parsed);
      if (!val.valid || !val.sanitizedData) {
        showNotice(`저장된 데이터 검증 실패: ${val.errors.join(', ')}`, 'warn');
        return;
      }
      resetSimulationWithNetwork(val.sanitizedData, { pause: false });
      showNotice('로컬 저장소에서 도시 설정을 불러왔습니다.', 'success');
    } catch {
      showNotice('로컬 저장 데이터를 읽는 중 오류가 발생했습니다.', 'warn');
    }
  };

  const handleExportJson = () => {
    const jsonStr = JSON.stringify(network, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neon-flow-${network.id}-seed${network.config.seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotice('도시 설정 JSON 파일을 내보냈습니다.', 'success');
  };

  const handleImportValidNetwork = (
    importedNet: CityNetworkData,
    warnings: string[]
  ) => {
    setSelectedNodeId(importedNet.nodes[0]?.id || null);
    setSelectedEdgeId(null);
    resetSimulationWithNetwork(importedNet, { pause: false });
    if (warnings.length > 0) {
      showNotice(`JSON 불러오기 완료 (보정 알림: ${warnings[0]})`, 'info');
    } else {
      showNotice(`'${importedNet.name}' JSON 설정을 성공적으로 불러왔습니다.`, 'success');
    }
  };

  return (
    <div className="app-shell">
      <TopBar
        network={network}
        snapshot={snapshot}
        isPlaying={isPlaying}
        speedMultiplier={speedMultiplier}
        renderTimeMs={renderTimeMs}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        onStepOnce={handleStepOnce}
        onReset={() => resetSimulationWithNetwork(network, { keepOptResult: true })}
        onChangeSpeed={setSpeedMultiplier}
        onSelectScenario={handleSelectScenario}
        onChangeSeed={handleChangeSeed}
        onChangeDemandMultiplier={handleChangeDemandMultiplier}
        onChangeRoutingMode={handleChangeRoutingMode}
        onQuickStartOptimize={handleStartOptimization}
        isOptimizing={isOptimizing}
      />

      {banner && (
        <div className={`global-banner ${banner.type}`}>
          <div className="banner-content">
            {banner.type === 'warn' ? (
              <AlertCircle size={15} />
            ) : (
              <CheckCircle2 size={15} />
            )}
            <span>{banner.text}</span>
          </div>
          <button
            type="button"
            className="banner-close"
            onClick={() => setBanner(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <main className="workspace-main">
        <LeftPanel
          network={network}
          snapshot={snapshot}
          toolMode={toolMode}
          onChangeToolMode={setToolMode}
          onUpdateDemand={handleUpdateDemand}
          onAddDemand={handleAddDemand}
          onDeleteDemand={handleDeleteDemand}
          onSelectNode={setSelectedNodeId}
          onSelectEdge={setSelectedEdgeId}
          onQuickBraessToggle={handleQuickBraessToggle}
          onQuickOptimize={handleStartOptimization}
          onSaveLocal={handleSaveLocal}
          onLoadLocal={handleLoadLocal}
          hasLocalSave={hasLocalSave}
          onExportJson={handleExportJson}
          onOpenImportModal={() => setIsImportModalOpen(true)}
          collapsed={leftCollapsed}
          onToggleCollapse={() => setLeftCollapsed((c) => !c)}
        />

        <div className="center-stage">
          <CityCanvas
            network={network}
            snapshot={snapshot}
            comparisonSnapshot={
              comparisonSnapshot || optResult?.baselineSnapshot || null
            }
            comparisonNetwork={comparisonNetwork || network}
            isSplitComparison={isSplitComparison}
            onToggleSplitComparison={() => setIsSplitComparison((s) => !s)}
            showHeatmap={showHeatmap}
            onToggleHeatmap={() => setShowHeatmap((h) => !h)}
            toolMode={toolMode}
            selectedNodeId={selectedNodeId}
            selectedEdgeId={selectedEdgeId}
            onSelectNode={(id) => {
              setSelectedNodeId(id);
              if (id) setRightTab('INSPECTOR');
            }}
            onSelectEdge={(id) => {
              setSelectedEdgeId(id);
              if (id) setRightTab('INSPECTOR');
            }}
            onAddRoad={handleAddRoad}
            onAddNode={handleAddNode}
            onRenderTimeMs={setRenderTimeMs}
            onValidationBanner={(msg) => {
              if (msg) showNotice(msg, 'warn');
            }}
          />

          <MetricsChart
            history={snapshot.history}
            baselineHistory={
              comparisonSnapshot?.history ||
              optResult?.baselineSnapshot.history ||
              null
            }
            warmupSeconds={optResult?.warmupSeconds ?? 30}
          />
        </div>

        <RightPanel
          activeTab={rightTab}
          onChangeTab={setRightTab}
          network={network}
          snapshot={snapshot}
          selectedNodeId={selectedNodeId}
          selectedEdgeId={selectedEdgeId}
          onSelectNode={setSelectedNodeId}
          onSelectEdge={setSelectedEdgeId}
          onUpdateNodeSignal={handleUpdateNodeSignal}
          onDeleteNode={handleDeleteNode}
          onUpdateEdge={handleUpdateEdge}
          onReverseEdge={handleReverseEdge}
          onAddOppositeEdge={handleAddOppositeEdge}
          onDeleteEdge={handleDeleteEdge}
          optBudget={optBudget}
          onChangeOptBudget={setOptBudget}
          isOptimizing={isOptimizing}
          optProgress={optProgress}
          optResult={optResult}
          onStartOptimization={handleStartOptimization}
          onCancelOptimization={handleCancelOptimization}
          onApplyOptimizedSignals={handleApplyOptimizedSignals}
          onRestoreBaselineSignals={handleRestoreBaselineSignals}
          isSplitComparison={isSplitComparison}
          onToggleSplitComparison={() => setIsSplitComparison((s) => !s)}
          collapsed={rightCollapsed}
          onToggleCollapse={() => setRightCollapsed((c) => !c)}
        />
      </main>

      <JsonImportModal
        isOpen={isImportModalOpen}
        currentNetwork={network}
        onClose={() => setIsImportModalOpen(false)}
        onImportValidNetwork={handleImportValidNetwork}
      />
    </div>
  );
};

export default App;
