import React from 'react';
import {
  CityNetworkData,
  EdgeData,
  NodeData,
  OptimizationProgress,
  OptimizationResult,
  SignalConfig,
  SimulationSnapshot,
} from '../types/simulation';
import { MAX_GREEN_SECONDS, MIN_GREEN_SECONDS } from '../engine/validator';
import { OBJECTIVE_WEIGHTS } from '../engine/optimizer';
import {
  Sliders,
  Sparkles,
  Trash2,
  ArrowLeftRight,
  CopyPlus,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Columns,
  RotateCcw,
  Play,
  ChevronRight,
} from 'lucide-react';

export type RightPanelTab = 'INSPECTOR' | 'OPTIMIZER';

interface RightPanelProps {
  activeTab: RightPanelTab;
  onChangeTab: (tab: RightPanelTab) => void;
  network: CityNetworkData;
  snapshot: SimulationSnapshot;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onSelectNode: (id: string | null) => void;
  onSelectEdge: (id: string | null) => void;
  onUpdateNodeSignal: (nodeId: string, signal: SignalConfig) => void;
  onDeleteNode: (nodeId: string) => void;
  onUpdateEdge: (edgeId: string, patch: Partial<EdgeData>) => void;
  onReverseEdge: (edgeId: string) => void;
  onAddOppositeEdge: (edgeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  optBudget: number;
  onChangeOptBudget: (budget: number) => void;
  isOptimizing: boolean;
  optProgress: OptimizationProgress | null;
  optResult: OptimizationResult | null;
  onStartOptimization: () => void;
  onCancelOptimization: () => void;
  onApplyOptimizedSignals: () => void;
  onRestoreBaselineSignals: () => void;
  isSplitComparison: boolean;
  onToggleSplitComparison: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  activeTab,
  onChangeTab,
  network,
  snapshot,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
  onUpdateNodeSignal,
  onDeleteNode,
  onUpdateEdge,
  onReverseEdge,
  onAddOppositeEdge,
  onDeleteEdge,
  optBudget,
  onChangeOptBudget,
  isOptimizing,
  optProgress,
  optResult,
  onStartOptimization,
  onCancelOptimization,
  onApplyOptimizedSignals,
  onRestoreBaselineSignals,
  isSplitComparison,
  onToggleSplitComparison,
  collapsed,
  onToggleCollapse,
}) => {
  if (collapsed) {
    return (
      <aside className="side-panel right-panel collapsed">
        <button
          type="button"
          className="collapse-toggle-btn"
          onClick={onToggleCollapse}
          title="우측 속성·최적화 패널 열기"
        >
          <Sliders size={16} />
        </button>
      </aside>
    );
  }

  const selectedNode: NodeData | undefined = selectedNodeId
    ? network.nodes.find((n) => n.id === selectedNodeId)
    : undefined;
  const selectedEdge: EdgeData | undefined = selectedEdgeId
    ? network.edges.find((e) => e.id === selectedEdgeId)
    : undefined;

  const handleCycleChange = (node: NodeData, targetCycle: number) => {
    const sig = node.signal;
    const clearance = 2 * (sig.yellowSeconds + sig.allRedSeconds);
    const availGreen = Math.max(MIN_GREEN_SECONDS * 2, targetCycle - clearance);
    const currentTotalGreen = Math.max(1, sig.nsGreenSeconds + sig.ewGreenSeconds);
    const nsRatio = sig.nsGreenSeconds / currentTotalGreen;

    const newNs = Math.max(
      MIN_GREEN_SECONDS,
      Math.min(MAX_GREEN_SECONDS, Math.round(availGreen * nsRatio))
    );
    const newEw = Math.max(
      MIN_GREEN_SECONDS,
      Math.min(MAX_GREEN_SECONDS, Math.round(availGreen - newNs))
    );
    const newCycle = newNs + newEw + clearance;

    onUpdateNodeSignal(node.id, {
      ...sig,
      nsGreenSeconds: newNs,
      ewGreenSeconds: newEw,
      offsetSeconds: sig.offsetSeconds % newCycle,
    });
  };

  const oppositeEdgeExists = selectedEdge
    ? network.edges.some((e) => e.from === selectedEdge.to && e.to === selectedEdge.from)
    : false;

  return (
    <aside className="side-panel right-panel">
      <div className="panel-top-tabs">
        <button
          type="button"
          className={`panel-tab-btn ${activeTab === 'INSPECTOR' ? 'active' : ''}`}
          onClick={() => onChangeTab('INSPECTOR')}
        >
          <Sliders size={14} />
          <span>속성·신호 편집</span>
        </button>
        <button
          type="button"
          className={`panel-tab-btn ${activeTab === 'OPTIMIZER' ? 'active' : ''}`}
          onClick={() => onChangeTab('OPTIMIZER')}
        >
          <Sparkles size={14} />
          <span>신호 최적화·비교</span>
        </button>
        <button
          type="button"
          className="panel-collapse-icon"
          onClick={onToggleCollapse}
          title="패널 접기"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="panel-scroll-content">
        {activeTab === 'INSPECTOR' ? (
          <>
            {selectedNode ? (
              <div className="inspector-card">
                <div className="inspector-header">
                  <div>
                    <span className="badge-tag cyan">교차로 #{selectedNode.id}</span>
                    <h3 className="inspector-title">{selectedNode.name}</h3>
                  </div>
                  <label className="switch-label">
                    <input
                      type="checkbox"
                      checked={selectedNode.signal.enabled}
                      onChange={(e) =>
                        onUpdateNodeSignal(selectedNode.id, {
                          ...selectedNode.signal,
                          enabled: e.target.checked,
                        })
                      }
                    />
                    <span>신호 제어</span>
                  </label>
                </div>

                {(() => {
                  const nStat = snapshot.nodeStats[selectedNode.id];
                  const sig = selectedNode.signal;
                  const clearance = 2 * (sig.yellowSeconds + sig.allRedSeconds);
                  const cycle = sig.nsGreenSeconds + sig.ewGreenSeconds + clearance;
                  const nsPct = Math.round((sig.nsGreenSeconds / cycle) * 100);
                  const ewPct = Math.round((sig.ewGreenSeconds / cycle) * 100);

                  return (
                    <>
                      {/* Live Signal Phase Bar */}
                      <div className="signal-phase-box">
                        <div className="phase-box-row">
                          <span className="phase-axis-pill">
                            남북(NS):{' '}
                            <strong className={`light-text ${nStat?.nsLight.toLowerCase()}`}>
                              {nStat?.nsLight === 'GREEN'
                                ? '녹색 (진행)'
                                : nStat?.nsLight === 'YELLOW'
                                ? '황색 (주의)'
                                : '적색 (정지)'}
                            </strong>
                          </span>
                          <span className="phase-axis-pill">
                            동서(EW):{' '}
                            <strong className={`light-text ${nStat?.ewLight.toLowerCase()}`}>
                              {nStat?.ewLight === 'GREEN'
                                ? '녹색 (진행)'
                                : nStat?.ewLight === 'YELLOW'
                                ? '황색 (주의)'
                                : '적색 (정지)'}
                            </strong>
                          </span>
                        </div>

                        <div className="cycle-proportion-bar" title={`총 주기 ${cycle}초`}>
                          <div
                            className="seg ns-green"
                            style={{ width: `${(sig.nsGreenSeconds / cycle) * 100}%` }}
                          >
                            NS {sig.nsGreenSeconds}s
                          </div>
                          <div
                            className="seg clearance"
                            style={{
                              width: `${((sig.yellowSeconds + sig.allRedSeconds) / cycle) * 100}%`,
                            }}
                          />
                          <div
                            className="seg ew-green"
                            style={{ width: `${(sig.ewGreenSeconds / cycle) * 100}%` }}
                          >
                            EW {sig.ewGreenSeconds}s
                          </div>
                          <div
                            className="seg clearance"
                            style={{
                              width: `${((sig.yellowSeconds + sig.allRedSeconds) / cycle) * 100}%`,
                            }}
                          />
                        </div>
                        <div className="cycle-meta-note">
                          주기 <strong>{cycle}초</strong> (NS {nsPct}% · EW {ewPct}% · 황색{' '}
                          {sig.yellowSeconds}s + 전적색 {sig.allRedSeconds}s 안전전환)
                        </div>
                      </div>

                      {/* Sliders for Signal Cycle & Green Split */}
                      <div className="control-group">
                        <div className="control-label-row">
                          <span>전체 신호 주기 (Cycle)</span>
                          <span className="mono-val">{cycle}초</span>
                        </div>
                        <input
                          type="range"
                          min={22}
                          max={150}
                          step={2}
                          value={cycle}
                          disabled={!sig.enabled}
                          onChange={(e) => handleCycleChange(selectedNode, Number(e.target.value))}
                        />
                      </div>

                      <div className="control-group">
                        <div className="control-label-row">
                          <span>남북(NS) 녹색 시간 (최소 {MIN_GREEN_SECONDS}s)</span>
                          <span className="mono-val emerald">{sig.nsGreenSeconds}초</span>
                        </div>
                        <input
                          type="range"
                          min={MIN_GREEN_SECONDS}
                          max={MAX_GREEN_SECONDS}
                          step={1}
                          value={sig.nsGreenSeconds}
                          disabled={!sig.enabled}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            onUpdateNodeSignal(selectedNode.id, {
                              ...sig,
                              nsGreenSeconds: val,
                            });
                          }}
                        />
                      </div>

                      <div className="control-group">
                        <div className="control-label-row">
                          <span>동서(EW) 녹색 시간 (최소 {MIN_GREEN_SECONDS}s)</span>
                          <span className="mono-val cyan">{sig.ewGreenSeconds}초</span>
                        </div>
                        <input
                          type="range"
                          min={MIN_GREEN_SECONDS}
                          max={MAX_GREEN_SECONDS}
                          step={1}
                          value={sig.ewGreenSeconds}
                          disabled={!sig.enabled}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            onUpdateNodeSignal(selectedNode.id, {
                              ...sig,
                              ewGreenSeconds: val,
                            });
                          }}
                        />
                      </div>

                      <div className="control-group">
                        <div className="control-label-row">
                          <span>연동 오프셋 (Green Wave Offset)</span>
                          <span className="mono-val">{sig.offsetSeconds}초</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={Math.max(1, cycle - 1)}
                          step={1}
                          value={sig.offsetSeconds}
                          disabled={!sig.enabled}
                          onChange={(e) =>
                            onUpdateNodeSignal(selectedNode.id, {
                              ...sig,
                              offsetSeconds: Number(e.target.value),
                            })
                          }
                        />
                      </div>

                      {/* Real-time Directional Queue & Telemetry */}
                      <div className="telemetry-grid">
                        <div className="telemetry-cell">
                          <span className="t-label">남북(NS) 대기차량</span>
                          <strong className="t-val">{nStat?.nsWaitingVehicles ?? 0}대</strong>
                          <span className="t-sub">
                            평균 대기 {(nStat?.nsAvgWaitSeconds ?? 0).toFixed(1)}s
                          </span>
                        </div>
                        <div className="telemetry-cell">
                          <span className="t-label">동서(EW) 대기차량</span>
                          <strong className="t-val">{nStat?.ewWaitingVehicles ?? 0}대</strong>
                          <span className="t-sub">
                            평균 대기 {(nStat?.ewAvgWaitSeconds ?? 0).toFixed(1)}s
                          </span>
                        </div>
                        <div className="telemetry-cell">
                          <span className="t-label">누적 통과 차량</span>
                          <strong className="t-val">{nStat?.throughputVehicles ?? 0}대</strong>
                          <span className="t-sub">교차로 처리량</span>
                        </div>
                        <div className="telemetry-cell">
                          <span className="t-label">하류 막힘(Spillback)</span>
                          <strong className="t-val rose">
                            {nStat?.spillbackBlockedCount ?? 0}회
                          </strong>
                          <span className="t-sub">진입 제한 횟수</span>
                        </div>
                      </div>

                      {network.nodes.length > 2 && (
                        <button
                          type="button"
                          className="danger-outline-btn full-width"
                          onClick={() => onDeleteNode(selectedNode.id)}
                        >
                          <Trash2 size={14} /> 교차로 및 연결 도로 삭제 (초기화)
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : selectedEdge ? (
              <div className="inspector-card">
                <div className="inspector-header">
                  <div>
                    <span className="badge-tag amber">도로 구간 #{selectedEdge.id}</span>
                    <h3 className="inspector-title">{selectedEdge.name}</h3>
                    <p className="inspector-sub">
                      {selectedEdge.from} → {selectedEdge.to} · 길이 {selectedEdge.lengthMeters}m ·
                      수용량 {selectedEdge.capacity}대
                    </p>
                  </div>
                </div>

                {selectedEdge.id === 'E_SHORTCUT_NS' && (
                  <div className="braess-callout">
                    <Sparkles size={15} />
                    <div>
                      <strong>브래스의 역설 핵심 실험 구간</strong>
                      <p>
                        아래 <strong>[도로 삭제]</strong> 버튼을 눌러 지름길을 제거한 뒤 재생하면,
                        차량이 2차선 우회 간선으로 분산되어 통행시간이 오히려 단축됩니다!
                      </p>
                    </div>
                  </div>
                )}

                <div className="control-group">
                  <div className="control-label-row">
                    <span>차선 수 (Lanes)</span>
                    <span className="mono-val">{selectedEdge.lanes}차선</span>
                  </div>
                  <div className="segmented-row">
                    {[1, 2, 3].map((laneNum) => (
                      <button
                        key={laneNum}
                        type="button"
                        className={`seg-btn ${selectedEdge.lanes === laneNum ? 'active' : ''}`}
                        onClick={() => onUpdateEdge(selectedEdge.id, { lanes: laneNum })}
                      >
                        {laneNum}차선
                      </button>
                    ))}
                  </div>
                </div>

                <div className="control-group">
                  <div className="control-label-row">
                    <span>제한 속도 (Speed Limit)</span>
                    <span className="mono-val cyan">{selectedEdge.speedLimitKmh} km/h</span>
                  </div>
                  <input
                    type="range"
                    min={30}
                    max={80}
                    step={5}
                    value={selectedEdge.speedLimitKmh}
                    onChange={(e) =>
                      onUpdateEdge(selectedEdge.id, { speedLimitKmh: Number(e.target.value) })
                    }
                  />
                  <div className="quick-chips-row">
                    {[30, 40, 50, 60, 75].map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        className={`chip-btn ${
                          selectedEdge.speedLimitKmh === spd ? 'active' : ''
                        }`}
                        onClick={() => onUpdateEdge(selectedEdge.id, { speedLimitKmh: spd })}
                      >
                        {spd}km/h
                      </button>
                    ))}
                  </div>
                </div>

                {(() => {
                  const eStat = snapshot.edgeStats[selectedEdge.id];
                  return (
                    <div className="telemetry-grid">
                      <div className="telemetry-cell">
                        <span className="t-label">구간 점유 / 수용량</span>
                        <strong className="t-val">
                          {eStat?.vehicleCount ?? 0} / {selectedEdge.capacity}대
                        </strong>
                        <span className="t-sub">
                          포화도 {Math.round((eStat?.densityRatio ?? 0) * 100)}%
                        </span>
                      </div>
                      <div className="telemetry-cell">
                        <span className="t-label">대기 차량 · 대기시간</span>
                        <strong className="t-val">{eStat?.waitingCount ?? 0}대</strong>
                        <span className="t-sub">
                          평균 {(eStat?.avgWaitSeconds ?? 0).toFixed(1)}s
                        </span>
                      </div>
                      <div className="telemetry-cell">
                        <span className="t-label">현재 평균 속도</span>
                        <strong className="t-val">
                          {(eStat?.avgSpeedKmh ?? selectedEdge.speedLimitKmh).toFixed(1)} km/h
                        </strong>
                        <span className="t-sub">제한 {selectedEdge.speedLimitKmh} km/h</span>
                      </div>
                      <div className="telemetry-cell">
                        <span className="t-label">스필백 진입차단</span>
                        <strong className="t-val rose">{eStat?.spillbackBlocks ?? 0}회</strong>
                        <span className="t-sub">하류 포화 대기</span>
                      </div>
                    </div>
                  );
                })()}

                <div className="edge-actions-stack">
                  <button
                    type="button"
                    className="secondary-action-btn"
                    onClick={() => onReverseEdge(selectedEdge.id)}
                  >
                    <ArrowLeftRight size={14} /> 통행 방향 반전 ({selectedEdge.to} →{' '}
                    {selectedEdge.from})
                  </button>
                  {!oppositeEdgeExists && (
                    <button
                      type="button"
                      className="secondary-action-btn"
                      onClick={() => onAddOppositeEdge(selectedEdge.id)}
                    >
                      <CopyPlus size={14} /> 반대 방향 도로 추가 (양방향화)
                    </button>
                  )}
                  <button
                    type="button"
                    className="danger-outline-btn"
                    onClick={() => onDeleteEdge(selectedEdge.id)}
                  >
                    <Trash2 size={14} /> 도로 삭제 (일시정지 및 초기화)
                  </button>
                </div>
              </div>
            ) : (
              <div className="inspector-empty-state">
                <div className="empty-hint-box">
                  <h4>지도에서 교차로 또는 도로를 선택하세요</h4>
                  <p>
                    교차로를 클릭하면 <strong>신호 주기·방향별 녹색 시간·오프셋</strong>을 즉시
                    조절할 수 있고, 도로를 클릭하면 <strong>차선·제한속도·방향·삭제</strong> 실험을
                    할 수 있습니다.
                  </p>
                </div>

                <div className="quick-pick-section">
                  <h5>주요 교차로 빠른 선택</h5>
                  <div className="quick-pick-list">
                    {network.nodes.map((n) => {
                      const st = snapshot.nodeStats[n.id];
                      return (
                        <button
                          key={n.id}
                          type="button"
                          className="quick-pick-item"
                          onClick={() => {
                            onSelectNode(n.id);
                            onSelectEdge(null);
                          }}
                        >
                          <div>
                            <strong>{n.name}</strong>
                            <span className="sub-id"> ({n.id})</span>
                          </div>
                          <div className="pick-Right">
                            <span className="mono-badge">
                              NS {n.signal.nsGreenSeconds}s / EW {n.signal.ewGreenSeconds}s
                            </span>
                            {(st?.waitingVehicles ?? 0) > 0 && (
                              <span className="wait-pill">{st?.waitingVehicles}대 대기</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="quick-pick-section">
                  <h5>주요 도로 구간 빠른 선택</h5>
                  <div className="quick-pick-list">
                    {network.edges.slice(0, 8).map((e) => {
                      const st = snapshot.edgeStats[e.id];
                      return (
                        <button
                          key={e.id}
                          type="button"
                          className="quick-pick-item"
                          onClick={() => {
                            onSelectEdge(e.id);
                            onSelectNode(null);
                          }}
                        >
                          <div className="truncate-name">
                            <strong>{e.name}</strong>
                          </div>
                          <div className="pick-Right">
                            <span className="mono-badge">
                              {e.lanes}차선 · {e.speedLimitKmh}km/h
                            </span>
                            {(st?.waitingCount ?? 0) > 0 && (
                              <span className="wait-pill">{st?.waitingCount}대</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          /* OPTIMIZER TAB */
          <div className="optimizer-container">
            <div className="opt-card">
              <div className="opt-header">
                <h4>자동 신호 최적화 실험실</h4>
                <p>
                  동일한 초기 상태·수요·시드에서 각 교차로의 주기와 방향별 녹색 시간·오프셋을 탐색하고,
                  별도 검증 시드(Out-of-sample)에서 과적합 여부를 교차 검증합니다.
                </p>
              </div>

              <div className="control-group">
                <div className="control-label-row">
                  <span>탐색 평가 예산 (Evaluation Budget)</span>
                  <span className="mono-val">{optBudget}회 시뮬레이션</span>
                </div>
                <div className="segmented-row">
                  {[16, 24, 36].map((b) => (
                    <button
                      key={b}
                      type="button"
                      disabled={isOptimizing}
                      className={`seg-btn ${optBudget === b ? 'active' : ''}`}
                      onClick={() => onChangeOptBudget(b)}
                    >
                      {b}회 ({b === 16 ? '고속' : b === 24 ? '표준' : '정밀'})
                    </button>
                  ))}
                </div>
                <div className="opt-meta-row">
                  <span>워밍업 구간: 0~30초</span>
                  <span>본 평가 구간: 30~150초</span>
                </div>
              </div>

              {!isOptimizing ? (
                <button
                  type="button"
                  className="primary-neon-btn full-width"
                  onClick={onStartOptimization}
                >
                  <Sparkles size={16} /> 신호 최적화 탐색 실행
                </button>
              ) : (
                <div className="opt-progress-box">
                  <div className="opt-progress-top">
                    <span className="pulse-dot" />
                    <span className="opt-phase-text">
                      {optProgress?.message || '최적화 Worker 준비 중...'}
                    </span>
                  </div>
                  <div className="progress-bar-track">
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            ((optProgress?.currentEvaluation ?? 1) /
                              Math.max(1, optProgress?.totalBudget ?? optBudget)) *
                              100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="opt-progress-foot">
                    <span>
                      진행률: {optProgress?.currentEvaluation ?? 0} /{' '}
                      {optProgress?.totalBudget ?? optBudget}
                    </span>
                    <button
                      type="button"
                      className="danger-small-btn"
                      onClick={onCancelOptimization}
                    >
                      최적화 취소
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Objective Function Formula & Weights Card */}
            <div className="objective-explainer-card">
              <h5>목적함수 (Objective Function J — 낮을수록 우수)</h5>
              <div className="formula-code">
                J = {OBJECTIVE_WEIGHTS.travelTime.toFixed(1)}·T_travel +{' '}
                {OBJECTIVE_WEIGHTS.activeWait.toFixed(1)}·W_active +{' '}
                {OBJECTIVE_WEIGHTS.externalQueue.toFixed(1)}·Q_ext −{' '}
                {OBJECTIVE_WEIGHTS.throughputCompletionPct.toFixed(1)}·R_done(%)
              </div>
              <ul className="weight-reasons-list">
                <li>
                  <strong>T_travel (단위: s, 가중치 {OBJECTIVE_WEIGHTS.travelTime})</strong>: 도착
                  완료 차량의 평균 통행 시간.
                </li>
                <li>
                  <strong>W_active (단위: s, 가중치 {OBJECTIVE_WEIGHTS.activeWait})</strong>: 도로
                  위 미완료 차량의 평균 누적 대기 시간. 일부 차량만 빠르게 통과시키고 타 방향을
                  적색으로 굶기는 기아(Starvation) 현상을 방지하기 위해 통행시간보다 높은 가중치를
                  부여.
                </li>
                <li>
                  <strong>Q_ext (단위: 대, 가중치 {OBJECTIVE_WEIGHTS.externalQueue} s/대)</strong>:
                  도로 포화로 진입하지 못한 외부 대기열 페널티.
                </li>
                <li>
                  <strong>R_done (단위: %, 가중치 −{OBJECTIVE_WEIGHTS.throughputCompletionPct})</strong>
                  : 생성 수요 대비 도착 완료율 보상항.
                </li>
              </ul>
            </div>

            {/* Optimization Result & Out-of-Sample Validation Comparison */}
            {optResult && (
              <div className="opt-result-card">
                <div
                  className={`result-banner ${
                    !optResult.improved
                      ? 'neutral'
                      : optResult.overfitWarning
                      ? 'warning'
                      : 'success'
                  }`}
                >
                  {!optResult.improved ? (
                    <XCircle size={16} />
                  ) : optResult.overfitWarning ? (
                    <AlertTriangle size={16} />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  <span>{optResult.summaryMessage}</span>
                </div>

                <div className="comparison-table-wrap">
                  <h6>학습 시드(#{optResult.trainSeed}) 및 검증 시드(#{optResult.validationSeed}) 비교</h6>
                  <table className="comparison-table">
                    <thead>
                      <tr>
                        <th>평가 지표</th>
                        <th>학습전</th>
                        <th>학습후</th>
                        <th>검증전</th>
                        <th>검증후</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>목적함수 점수 (J↓)</td>
                        <td>{optResult.trainBaseline.totalScore.toFixed(1)}</td>
                        <td className="highlight-cyan">
                          {optResult.trainOptimized.totalScore.toFixed(1)}
                        </td>
                        <td>{optResult.valBaseline.totalScore.toFixed(1)}</td>
                        <td className="highlight-cyan">
                          {optResult.valOptimized.totalScore.toFixed(1)}
                        </td>
                      </tr>
                      <tr>
                        <td>도착 완료 차량 (대↑)</td>
                        <td>{optResult.trainBaseline.completedVehicles}</td>
                        <td className="highlight-emerald">
                          {optResult.trainOptimized.completedVehicles}
                        </td>
                        <td>{optResult.valBaseline.completedVehicles}</td>
                        <td className="highlight-emerald">
                          {optResult.valOptimized.completedVehicles}
                        </td>
                      </tr>
                      <tr>
                        <td>평균 통행시간 (s↓)</td>
                        <td>{optResult.trainBaseline.avgTravelTimeSeconds}s</td>
                        <td className="highlight-cyan">
                          {optResult.trainOptimized.avgTravelTimeSeconds}s
                        </td>
                        <td>{optResult.valBaseline.avgTravelTimeSeconds}s</td>
                        <td className="highlight-cyan">
                          {optResult.valOptimized.avgTravelTimeSeconds}s
                        </td>
                      </tr>
                      <tr>
                        <td>미완료 평균대기 (s↓)</td>
                        <td>{optResult.trainBaseline.activeAvgWaitSeconds}s</td>
                        <td className="highlight-cyan">
                          {optResult.trainOptimized.activeAvgWaitSeconds}s
                        </td>
                        <td>{optResult.valBaseline.activeAvgWaitSeconds}s</td>
                        <td className="highlight-cyan">
                          {optResult.valOptimized.activeAvgWaitSeconds}s
                        </td>
                      </tr>
                      <tr>
                        <td>미진입 외부대기 (대↓)</td>
                        <td>{optResult.trainBaseline.externalQueueCount}</td>
                        <td>{optResult.trainOptimized.externalQueueCount}</td>
                        <td>{optResult.valBaseline.externalQueueCount}</td>
                        <td>{optResult.valOptimized.externalQueueCount}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="opt-action-buttons">
                  {optResult.improved && (
                    <button
                      type="button"
                      className="primary-neon-btn"
                      onClick={onApplyOptimizedSignals}
                    >
                      <Play size={14} /> 개선 신호 적용 및 비교 주행
                    </button>
                  )}
                  <button
                    type="button"
                    className={`secondary-action-btn ${isSplitComparison ? 'active' : ''}`}
                    onClick={onToggleSplitComparison}
                  >
                    <Columns size={14} />{' '}
                    {isSplitComparison ? '단일 지도 뷰로 돌아가기' : '전·후 지도 나란히 비교'}
                  </button>
                  <button
                    type="button"
                    className="secondary-action-btn"
                    onClick={onRestoreBaselineSignals}
                  >
                    <RotateCcw size={14} /> 기존(Baseline) 신호 복원
                  </button>
                </div>

                {/* Signal Plan Diffs */}
                <div className="signal-diffs-box">
                  <h6>교차로별 신호 변경 내역 (NS녹색 / EW녹색 / 오프셋)</h6>
                  <div className="diff-list">
                    {optResult.diffs.map((d) => {
                      const changed =
                        d.beforeNsGreen !== d.afterNsGreen ||
                        d.beforeEwGreen !== d.afterEwGreen ||
                        d.beforeOffset !== d.afterOffset;
                      return (
                        <div key={d.nodeId} className={`diff-row ${changed ? 'changed' : ''}`}>
                          <span className="diff-node-name">{d.nodeName}</span>
                          <span className="diff-vals">
                            {d.beforeNsGreen}s/{d.beforeEwGreen}s (+{d.beforeOffset}s) →{' '}
                            <strong>
                              {d.afterNsGreen}s/{d.afterEwGreen}s (+{d.afterOffset}s)
                            </strong>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
