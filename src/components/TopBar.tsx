import React from 'react';
import {
  CityNetworkData,
  RoutingMode,
  SimulationSnapshot,
} from '../types/simulation';
import {
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  Cpu,
  StepForward,
  Gamepad2,
} from 'lucide-react';

interface TopBarProps {
  network: CityNetworkData;
  snapshot: SimulationSnapshot;
  isPlaying: boolean;
  speedMultiplier: number;
  renderTimeMs: number;
  onTogglePlay: () => void;
  onStepOnce: () => void;
  onReset: () => void;
  onChangeSpeed: (speed: number) => void;
  onSelectScenario: (scenarioId: string) => void;
  onChangeSeed: (seed: number) => void;
  onChangeDemandMultiplier: (mult: number) => void;
  onChangeRoutingMode: (mode: RoutingMode) => void;
  onQuickStartOptimize: () => void;
  isOptimizing: boolean;
  onSwitchToSurvivorMode?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  network,
  snapshot,
  isPlaying,
  speedMultiplier,
  renderTimeMs,
  onTogglePlay,
  onStepOnce,
  onReset,
  onChangeSpeed,
  onSelectScenario,
  onChangeSeed,
  onChangeDemandMultiplier,
  onChangeRoutingMode,
  onQuickStartOptimize,
  isOptimizing,
  onSwitchToSurvivorMode,
}) => {
  const speeds = [0.5, 1, 2, 4];

  return (
    <header className="top-bar">
      {/* Row 1: Brand, Scenario, Playback, Global Params, Quick Optimize */}
      <div className="top-bar-primary">
        <div className="brand-block">
          <div className="neon-logo-mark">NF</div>
          <div>
            <div className="brand-title">NEON FLOW</div>
            <div className="brand-sub">URBAN TRAFFIC SANDBOX</div>
          </div>
        </div>

        <div className="scenario-selector-wrap">
          <label className="ctrl-mini-label" htmlFor="scenario-select">
            시나리오 프리셋
          </label>
          <select
            id="scenario-select"
            className="neon-select"
            value={network.id}
            onChange={(e) => onSelectScenario(e.target.value)}
          >
            <option value="commute_rush">1. 출퇴근 혼잡 (도심 수요 집중)</option>
            <option value="signal_bottleneck">2. 교차로 병목 (비효율 신호 배분)</option>
            <option value="braess_detour">3. 우회 실험 (도로 추가의 역설)</option>
            <option value="megacity_stress">4. 1,000대 부하 벤치마크 (메가시티)</option>
          </select>
        </div>

        <div className="playback-controls-group">
          <button
            type="button"
            className={`play-btn ${isPlaying ? 'playing' : 'paused'}`}
            onClick={onTogglePlay}
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
            <span>{isPlaying ? '일시정지' : '재생'}</span>
          </button>
          <button
            type="button"
            className="icon-ctrl-btn"
            onClick={onStepOnce}
            disabled={isPlaying}
            title="1스텝 (+0.2초) 진행"
          >
            <StepForward size={15} />
          </button>
          <button
            type="button"
            className="icon-ctrl-btn"
            onClick={onReset}
            title="초기화 (t = 0.0s)"
          >
            <RotateCcw size={15} />
          </button>

          <div className="speed-pills">
            {speeds.map((spd) => (
              <button
                key={spd}
                type="button"
                className={`speed-pill ${speedMultiplier === spd ? 'active' : ''}`}
                onClick={() => onChangeSpeed(spd)}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>

        <div className="sim-params-group">
          <div className="param-item">
            <label className="ctrl-mini-label" htmlFor="demand-mult-range">
              전체 수요 배율: <strong>{Math.round(network.config.demandMultiplier * 100)}%</strong>
            </label>
            <input
              id="demand-mult-range"
              type="range"
              min={0.25}
              max={2.25}
              step={0.25}
              value={network.config.demandMultiplier}
              onChange={(e) => onChangeDemandMultiplier(Number(e.target.value))}
            />
          </div>

          <div className="param-item seed-item">
            <label className="ctrl-mini-label" htmlFor="seed-input">
              고정 시드(Seed)
            </label>
            <input
              id="seed-input"
              type="number"
              className="seed-input"
              value={network.config.seed}
              onChange={(e) => onChangeSeed(Math.floor(Number(e.target.value) || 1))}
            />
          </div>

          <div className="param-item">
            <label className="ctrl-mini-label" htmlFor="routing-select">
              경로 탐색 기준
            </label>
            <select
              id="routing-select"
              className="neon-select compact"
              value={network.config.routingMode}
              onChange={(e) => onChangeRoutingMode(e.target.value as RoutingMode)}
            >
              <option value="freeflow">Dijkstra (자유류 최단시간)</option>
              <option value="congested">Dijkstra (실시간 혼잡반영)</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="top-optimize-cta"
            onClick={onQuickStartOptimize}
            disabled={isOptimizing}
          >
            <Sparkles size={15} />
            <span>{isOptimizing ? '최적화 탐색 중...' : '신호 최적화'}</span>
          </button>

          {onSwitchToSurvivorMode && (
            <button
              type="button"
              className="top-survivor-switch-btn"
              onClick={onSwitchToSurvivorMode}
            >
              <Gamepad2 size={15} />
              <span>뱀서류 게임 모드</span>
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Live KPI Strip & Conservation Verification */}
      <div className="top-kpi-strip">
        <div className="kpi-card">
          <span className="kpi-label">시뮬레이션 시각</span>
          <strong className="kpi-value mono">{snapshot.timeSeconds.toFixed(1)}s</strong>
          <span className="kpi-sub">{snapshot.tickCount} ticks (Δt=0.2s)</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">평균 통행 시간 (도착 차량 기준)</span>
          <strong className="kpi-value cyan mono">
            {snapshot.completedVehiclesCount > 0
              ? `${snapshot.avgTravelTimeSeconds.toFixed(1)}s`
              : '— (도착 대기)'}
          </strong>
          <span className="kpi-sub">
            미완료 차량 평균대기: <strong>{snapshot.activeAvgWaitSeconds.toFixed(1)}s</strong>
          </span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">완료 차량 수 (Throughput)</span>
          <strong className="kpi-value emerald mono">{snapshot.completedVehiclesCount}대</strong>
          <span className="kpi-sub">
            완료율:{' '}
            {snapshot.totalGenerated > 0
              ? `${Math.round((snapshot.completedVehiclesCount / snapshot.totalGenerated) * 100)}%`
              : '0%'}
          </span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">도로 위 차량 · 정지 대기열</span>
          <strong className="kpi-value mono">
            {snapshot.activeVehiclesCount}대{' '}
            <span className="rose-inline">(대기 {snapshot.waitingVehiclesCount}대)</span>
          </strong>
          <span className="kpi-sub">
            평균 속도: {snapshot.networkAvgSpeedKmh.toFixed(1)} km/h
          </span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">미진입 수요 (외부 대기열)</span>
          <strong
            className={`kpi-value mono ${
              snapshot.externalQueueCount > 0 ? 'amber' : ''
            }`}
          >
            {snapshot.externalQueueCount}대
          </strong>
          <span className="kpi-sub">
            {snapshot.disconnectedDemandCount > 0
              ? `⚠ 단절 경로 ${snapshot.disconnectedDemandCount}건 포함`
              : `외부 평균대기 ${snapshot.externalQueueAvgWaitSeconds.toFixed(1)}s`}
          </span>
        </div>

        <div className="kpi-card conservation-card">
          <div className="conservation-top">
            <span className="kpi-label">차량 수 보존식 (생성 = 외부대기 + 주행 + 도착)</span>
            <span className={`conservation-badge ${snapshot.conservationValid ? 'ok' : 'err'}`}>
              <CheckCircle2 size={11} /> {snapshot.conservationValid ? '보존식 성립' : '오류'}
            </span>
          </div>
          <div className="conservation-formula mono">
            생성 {snapshot.totalGenerated} = 대기 {snapshot.externalQueueCount} + 주행{' '}
            {snapshot.activeVehiclesCount} + 도착 {snapshot.completedVehiclesCount}
          </div>
        </div>

        <div className="kpi-card perf-card">
          <span className="kpi-label">
            <Cpu size={11} /> 연산·렌더링 성능
          </span>
          <div className="perf-vals mono">
            <span>Sim: {snapshot.perfSimStepMs.toFixed(2)}ms</span>
            <span>Render: {renderTimeMs.toFixed(2)}ms</span>
          </div>
          <span className="kpi-sub">Web Worker 분리 구동</span>
        </div>
      </div>
    </header>
  );
};
