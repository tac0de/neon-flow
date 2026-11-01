import React, { useState } from 'react';
import {
  CityNetworkData,
  ODDemand,
  SimulationSnapshot,
} from '../types/simulation';
import { EditorToolMode } from './CityCanvas';
import { findShortestPath } from '../engine/router';
import {
  MousePointer,
  GitBranchPlus,
  PlusCircle,
  AlertOctagon,
  Navigation2,
  Download,
  Upload,
  Save,
  FolderOpen,
  Trash2,
  Plus,
  ChevronLeft,
  Wrench,
  Sparkles,
} from 'lucide-react';

interface LeftPanelProps {
  network: CityNetworkData;
  snapshot: SimulationSnapshot;
  toolMode: EditorToolMode;
  onChangeToolMode: (mode: EditorToolMode) => void;
  onUpdateDemand: (odId: string, vehiclesPerHour: number) => void;
  onAddDemand: (origin: string, destination: string, vehiclesPerHour: number) => void;
  onDeleteDemand: (odId: string) => void;
  onSelectNode: (nodeId: string | null) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onQuickBraessToggle: () => void;
  onQuickOptimize: () => void;
  onSaveLocal: () => void;
  onLoadLocal: () => void;
  hasLocalSave: boolean;
  onExportJson: () => void;
  onOpenImportModal: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const LeftPanel: React.FC<LeftPanelProps> = ({
  network,
  snapshot,
  toolMode,
  onChangeToolMode,
  onUpdateDemand,
  onAddDemand,
  onDeleteDemand,
  onSelectNode,
  onSelectEdge,
  onQuickBraessToggle,
  onQuickOptimize,
  onSaveLocal,
  onLoadLocal,
  hasLocalSave,
  onExportJson,
  onOpenImportModal,
  collapsed,
  onToggleCollapse,
}) => {
  const [newOrigin, setNewOrigin] = useState<string>(network.nodes[0]?.id || '');
  const [newDest, setNewDest] = useState<string>(
    network.nodes[network.nodes.length - 1]?.id || ''
  );
  const [newVph, setNewVph] = useState<number>(600);

  if (collapsed) {
    return (
      <aside className="side-panel left-panel collapsed">
        <button
          type="button"
          className="collapse-toggle-btn"
          onClick={onToggleCollapse}
          title="좌측 도구·수요·진단 패널 열기"
        >
          <Wrench size={16} />
        </button>
      </aside>
    );
  }

  const nodeMap = new Map(network.nodes.map((n) => [n.id, n]));
  const hasBraessShortcut = network.edges.some((e) => e.id === 'E_SHORTCUT_NS');

  const handleCreateDemand = (e: React.FormEvent) => {
    e.preventDefault();
    const orig = newOrigin || network.nodes[0]?.id;
    const dest = newDest || network.nodes[1]?.id;
    if (!orig || !dest || orig === dest) return;
    onAddDemand(orig, dest, newVph);
  };

  return (
    <aside className="side-panel left-panel">
      <div className="panel-header-bar">
        <div className="panel-header-title">
          <Wrench size={14} className="icon-cyan" />
          <span>도시 편집 도구 & 수요·병목 진단</span>
        </div>
        <button
          type="button"
          className="panel-collapse-icon"
          onClick={onToggleCollapse}
          title="패널 접기"
        >
          <ChevronLeft size={15} />
        </button>
      </div>

      <div className="panel-scroll-content">
        {/* 1. Map Interaction Tool Selector */}
        <section className="panel-section">
          <h4 className="section-heading">지도 조작 도구</h4>
          <div className="tool-buttons-grid">
            <button
              type="button"
              className={`tool-mode-btn ${toolMode === 'SELECT' ? 'active' : ''}`}
              onClick={() => onChangeToolMode('SELECT')}
            >
              <MousePointer size={14} />
              <span>선택·속성편집</span>
            </button>
            <button
              type="button"
              className={`tool-mode-btn ${toolMode === 'ADD_ROAD' ? 'active' : ''}`}
              onClick={() => onChangeToolMode('ADD_ROAD')}
            >
              <GitBranchPlus size={14} />
              <span>도로 추가</span>
            </button>
            <button
              type="button"
              className={`tool-mode-btn ${toolMode === 'ADD_NODE' ? 'active' : ''}`}
              onClick={() => onChangeToolMode('ADD_NODE')}
            >
              <PlusCircle size={14} />
              <span>교차로 추가</span>
            </button>
          </div>
        </section>

        {/* 2. Scenario Context & 1-Minute Quick Experiment Card */}
        <section className="panel-section scenario-guide-card">
          <div className="scenario-guide-title">{network.name}</div>
          <p className="scenario-guide-desc">{network.description}</p>
          {network.hypothesis && (
            <div className="scenario-hypothesis">
              <strong>실험 포인트:</strong> {network.hypothesis}
            </div>
          )}
          <div className="scenario-quick-actions">
            {network.id === 'braess_detour' ? (
              <button
                type="button"
                className="primary-neon-btn small full-width"
                onClick={onQuickBraessToggle}
              >
                <Sparkles size={13} />
                {hasBraessShortcut
                  ? '실험: 중앙 지름길 도로(E_SHORTCUT_NS) 제거하기'
                  : '실험: 중앙 지름길 도로(E_SHORTCUT_NS) 다시 추가하기'}
              </button>
            ) : (
              <button
                type="button"
                className="primary-neon-btn small full-width"
                onClick={onQuickOptimize}
              >
                <Sparkles size={13} /> 1분 실험: 신호 최적화 비교 실행
              </button>
            )}
          </div>
        </section>

        {/* 3. Live Bottleneck & Cause Diagnostics */}
        <section className="panel-section">
          <div className="section-heading-row">
            <h4 className="section-heading">
              <AlertOctagon size={13} className="icon-rose" /> 실시간 정체 구간 및 원인 진단
            </h4>
            <span className="count-pill">{snapshot.bottlenecks.length}건</span>
          </div>

          {snapshot.bottlenecks.length === 0 ? (
            <div className="calm-status-box">
              현재 심각한 정체 병목 구간이 없습니다. 수요 배율을 높이거나 신호를 변경해 실험해
              보세요.
            </div>
          ) : (
            <div className="bottleneck-list">
              {snapshot.bottlenecks.map((b) => (
                <button
                  key={b.edgeId}
                  type="button"
                  className={`bottleneck-item severity-${b.severity.toLowerCase()}`}
                  onClick={() => {
                    onSelectEdge(b.edgeId);
                    onSelectNode(null);
                  }}
                >
                  <div className="b-top-row">
                    <span className="b-edge-name">{b.edgeName}</span>
                    <span className={`b-cause-tag ${b.primaryCause.toLowerCase()}`}>
                      {b.primaryCause === 'SIGNAL_IMBALANCE'
                        ? '신호불균형'
                        : b.primaryCause === 'DOWNSTREAM_SPILLBACK'
                        ? '하류포화(Spillback)'
                        : '용량초과'}
                    </span>
                  </div>
                  <p className="b-explanation">{b.explanation}</p>
                  <div className="b-metrics-row">
                    <span>포화도 {Math.round(b.densityRatio * 100)}%</span>
                    <span>대기 {b.waitingCount}대</span>
                    <span>평균대기 {b.avgWaitSeconds.toFixed(1)}s</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 4. Origin-Destination (OD) Demand Editor */}
        <section className="panel-section">
          <div className="section-heading-row">
            <h4 className="section-heading">
              <Navigation2 size={13} className="icon-cyan" /> 출발·목적지(OD) 시간당 수요
            </h4>
            <span className="count-pill">{network.demands.length}개 경로</span>
          </div>

          <div className="od-list">
            {network.demands.map((od: ODDemand) => {
              const origName = nodeMap.get(od.origin)?.name || od.origin;
              const destName = nodeMap.get(od.destination)?.name || od.destination;
              const route = findShortestPath(
                network.nodes,
                network.edges,
                od.origin,
                od.destination
              );
              const isDisconnected = !route || route.length === 0;
              const effectiveVph = Math.round(
                od.vehiclesPerHour * network.config.demandMultiplier
              );

              return (
                <div
                  key={od.id}
                  className={`od-card ${isDisconnected ? 'disconnected' : ''}`}
                >
                  <div className="od-card-top">
                    <div className="od-route-names">
                      <strong>{origName}</strong> → <strong>{destName}</strong>
                      {isDisconnected && (
                        <span className="disconnected-badge">경로 단절 (미진입 대기)</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="icon-del-btn"
                      onClick={() => onDeleteDemand(od.id)}
                      title="수요 삭제"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="od-slider-row">
                    <input
                      type="range"
                      min={0}
                      max={2400}
                      step={50}
                      value={od.vehiclesPerHour}
                      onChange={(e) => onUpdateDemand(od.id, Number(e.target.value))}
                    />
                    <span className="od-vph-val">{effectiveVph} 대/시</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add New OD Pair Form */}
          <form className="add-od-form" onSubmit={handleCreateDemand}>
            <div className="add-od-title">신규 출발·목적지 수요 추가</div>
            <div className="add-od-selects">
              <select
                aria-label="출발 교차로 선택"
                value={newOrigin}
                onChange={(e) => setNewOrigin(e.target.value)}
              >
                {network.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    출발: {n.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="도착 교차로 선택"
                value={newDest}
                onChange={(e) => setNewDest(e.target.value)}
              >
                {network.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    도착: {n.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="add-od-bottom">
              <input
                type="number"
                aria-label="신규 시간당 차량 수"
                min={50}
                max={3000}
                step={50}
                value={newVph}
                onChange={(e) => setNewVph(Number(e.target.value))}
              />
              <span className="unit-txt">대/시</span>
              <button
                type="submit"
                className="secondary-action-btn small"
                disabled={newOrigin === newDest}
              >
                <Plus size={13} /> 추가
              </button>
            </div>
          </form>
        </section>

        {/* 5. LocalStorage & JSON Export / Import */}
        <section className="panel-section">
          <h4 className="section-heading">도시 설정 저장 및 JSON 입출력</h4>
          <div className="storage-buttons-grid">
            <button type="button" className="secondary-action-btn" onClick={onSaveLocal}>
              <Save size={13} /> 로컬 저장
            </button>
            <button
              type="button"
              className="secondary-action-btn"
              onClick={onLoadLocal}
              disabled={!hasLocalSave}
            >
              <FolderOpen size={13} /> 저장본 불러오기
            </button>
            <button type="button" className="secondary-action-btn" onClick={onExportJson}>
              <Download size={13} /> JSON 내보내기
            </button>
            <button type="button" className="secondary-action-btn" onClick={onOpenImportModal}>
              <Upload size={13} /> JSON 가져오기
            </button>
          </div>
        </section>
      </div>
    </aside>
  );
};
