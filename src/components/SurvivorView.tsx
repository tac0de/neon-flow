import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  MetaUpgradesState,
  PassiveId,
  SurvivorClassId,
  SurvivorGameState,
  SurvivorStageId,
} from '../types/survivor';
import {
  loadMetaUpgrades,
  META_UPGRADE_ITEMS,
  PASSIVE_DEFS,
  saveMetaUpgrades,
  SURVIVOR_CLASSES,
  SURVIVOR_STAGES,
  WEAPON_DEFS,
} from '../survivor/survivorData';
import { TrafficSurvivorEngine } from '../survivor/survivorEngine';
import { soundEngine } from '../survivor/soundEngine';
import { spriteCache } from '../survivor/spriteAssets';
import { TrafficSimulator } from '../engine/simulator';
import {
  Bot,
  Cpu,
  Flame,
  FlaskConical,
  Gamepad2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  Shield,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';

interface SurvivorViewProps {
  onSwitchToLabMode: () => void;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export const SurvivorView: React.FC<SurvivorViewProps> = ({
  onSwitchToLabMode,
}) => {
  const [meta, setMeta] = useState<MetaUpgradesState>(() => loadMetaUpgrades());
  const [selectedClass, setSelectedClass] =
    useState<SurvivorClassId>('INTERCEPTOR');
  const [selectedStage, setSelectedStage] =
    useState<SurvivorStageId>('COMMUTE_GRID');

  const engineRef = useRef<TrafficSurvivorEngine>(
    null as unknown as TrafficSurvivorEngine
  );
  if (!engineRef.current) {
    spriteCache.ensureLoaded();
    engineRef.current = new TrafficSurvivorEngine(
      'INTERCEPTOR',
      'COMMUTE_GRID',
      loadMetaUpgrades()
    );
  }

  const [uiState, setUiState] = useState<SurvivorGameState>(() =>
    engineRef.current.getState()
  );
  const [isLobbyOpen, setIsLobbyOpen] = useState<boolean>(false);
  const [autoPilot, setAutoPilot] = useState<boolean>(false);
  const [soundMuted, setSoundMuted] = useState<boolean>(() =>
    soundEngine.isMuted()
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const keysRef = useRef<Set<string>>(new Set());
  const pointerDragRef = useRef<{
    active: boolean;
    originX: number;
    originY: number;
    currX: number;
    currY: number;
  }>({
    active: false,
    originX: 0,
    originY: 0,
    currX: 0,
    currY: 0,
  });

  const startNewRun = useCallback(
    (
      classId: SurvivorClassId = selectedClass,
      stageId: SurvivorStageId = selectedStage
    ) => {
      const latestMeta = loadMetaUpgrades();
      const newEngine = new TrafficSurvivorEngine(classId, stageId, latestMeta);
      engineRef.current = newEngine;
      setUiState({ ...newEngine.getState() });
      setIsLobbyOpen(false);
    },
    [selectedClass, selectedStage]
  );

  // Expose window debug/showcase hook for automated video recording & testing
  useEffect(() => {
    const win = window as unknown as {
      __NEON_SURVIVOR__?: {
        getEngine: () => TrafficSurvivorEngine;
        setAutoPilot: (v: boolean) => void;
        openLobby: (v: boolean) => void;
        startRun: (c: SurvivorClassId, s: SurvivorStageId) => void;
      };
    };
    win.__NEON_SURVIVOR__ = {
      getEngine: () => engineRef.current,
      setAutoPilot: (v: boolean) => setAutoPilot(v),
      openLobby: (v: boolean) => setIsLobbyOpen(v),
      startRun: (c: SurvivorClassId, s: SurvivorStageId) => {
        setSelectedClass(c);
        setSelectedStage(s);
        startNewRun(c, s);
      },
    };
  }, [startNewRun]);

  // Persist credits & records when Victory or Game Over occurs
  const prevStatusRef = useRef<SurvivorGameState['status']>('PLAYING');
  useEffect(() => {
    const curStatus = uiState.status;
    if (
      prevStatusRef.current === 'PLAYING' &&
      (curStatus === 'VICTORY' || curStatus === 'GAME_OVER')
    ) {
      setMeta((prev) => {
        const updated: MetaUpgradesState = {
          ...prev,
          credits: prev.credits + uiState.player.creditsEarned,
          bestTimeSeconds: Math.max(
            prev.bestTimeSeconds,
            Math.floor(uiState.elapsedSeconds)
          ),
          totalVehiclesCleared:
            prev.totalVehiclesCleared + uiState.player.kills,
          totalRuns: prev.totalRuns + 1,
        };
        saveMetaUpgrades(updated);
        return updated;
      });
    }
    prevStatusRef.current = curStatus;
  }, [
    uiState.status,
    uiState.player.creditsEarned,
    uiState.elapsedSeconds,
    uiState.player.kills,
  ]);

  // Keyboard listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      keysRef.current.add(code);

      const eng = engineRef.current;
      const st = eng.getState();

      if (code === 'Space' && st.status === 'PLAYING' && !isLobbyOpen) {
        e.preventDefault();
        eng.triggerSirenDash();
      } else if (code === 'KeyQ' && st.status === 'PLAYING' && !isLobbyOpen) {
        e.preventDefault();
        eng.triggerCitywideOverride();
      } else if (st.status === 'LEVEL_UP') {
        if (code === 'Digit1' && st.pendingLevelChoices[0]) {
          eng.applyUpgradeChoice(st.pendingLevelChoices[0]);
          setUiState({ ...eng.getState() });
        } else if (code === 'Digit2' && st.pendingLevelChoices[1]) {
          eng.applyUpgradeChoice(st.pendingLevelChoices[1]);
          setUiState({ ...eng.getState() });
        } else if (code === 'Digit3' && st.pendingLevelChoices[2]) {
          eng.applyUpgradeChoice(st.pendingLevelChoices[2]);
          setUiState({ ...eng.getState() });
        } else if (code === 'KeyR') {
          eng.rerollLevelChoices();
          setUiState({ ...eng.getState() });
        }
      } else if (code === 'Escape' && !isLobbyOpen) {
        if (st.status === 'PLAYING') {
          eng.setStatus('PAUSED');
          setUiState({ ...eng.getState() });
        } else if (st.status === 'PAUSED') {
          eng.setStatus('PLAYING');
          setUiState({ ...eng.getState() });
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [isLobbyOpen]);

  // Main 60 FPS Game Loop + Canvas Renderer
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let hudSyncTimer = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const eng = engineRef.current;
      const st = eng.getState();

      if (st.status === 'PLAYING' && !isLobbyOpen) {
        let moveX = 0;
        let moveY = 0;
        const keys = keysRef.current;

        if (keys.has('KeyW') || keys.has('ArrowUp')) moveY -= 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) moveY += 1;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) moveX -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) moveX += 1;

        if (moveX === 0 && moveY === 0 && pointerDragRef.current.active) {
          const dx =
            pointerDragRef.current.currX - pointerDragRef.current.originX;
          const dy =
            pointerDragRef.current.currY - pointerDragRef.current.originY;
          const dist = Math.hypot(dx, dy);
          if (dist > 8) {
            moveX = dx / dist;
            moveY = dy / dist;
          }
        }

        if (moveX === 0 && moveY === 0 && autoPilot) {
          const aiInput = eng.computeAutoPilotInput();
          moveX = aiInput.moveX;
          moveY = aiInput.moveY;
        }

        eng.update(dt, { moveX, moveY });
      }

      renderSurvivorCanvas(
        canvasRef.current,
        containerRef.current,
        eng,
        pointerDragRef.current
      );

      hudSyncTimer += dt;
      if (hudSyncTimer >= 0.065 || st.status !== 'PLAYING') {
        hudSyncTimer = 0;
        setUiState({ ...eng.getState() });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [autoPilot, isLobbyOpen]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    pointerDragRef.current = {
      active: true,
      originX: x,
      originY: y,
      currX: x,
      currY: y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointerDragRef.current.active) return;
    const rect = e.currentTarget.getBoundingClientRect();
    pointerDragRef.current.currX = e.clientX - rect.left;
    pointerDragRef.current.currY = e.clientY - rect.top;
  };

  const handlePointerUp = () => {
    pointerDragRef.current.active = false;
  };

  const handleBuyMetaUpgrade = (
    key: (typeof META_UPGRADE_ITEMS)[number]['key'],
    baseCost: number,
    maxLevel: number
  ) => {
    const curLv = meta[key];
    if (curLv >= maxLevel) return;
    const cost = Math.round(baseCost * Math.pow(1.45, curLv));
    if (meta.credits < cost) return;

    const nextMeta: MetaUpgradesState = {
      ...meta,
      credits: meta.credits - cost,
      [key]: curLv + 1,
    };
    setMeta(nextMeta);
    saveMetaUpgrades(nextMeta);
    soundEngine.playLevelUp();
  };

  const p = uiState.player;
  const activeClassDef = SURVIVOR_CLASSES[p.classId];
  const xpPercent = Math.min(
    100,
    Math.round((p.xp / Math.max(1, p.xpToNext)) * 100)
  );
  const hpPercent = Math.min(
    100,
    Math.round((p.hp / Math.max(1, p.maxHp)) * 100)
  );
  const gridlockPercent = Math.min(100, Math.round(uiState.gridlockGauge));
  const feverPercent =
    uiState.feverActiveTimer > 0
      ? Math.round((uiState.feverActiveTimer / 8.0) * 100)
      : Math.round(uiState.feverGauge);

  const activeBoss = uiState.enemies.find((e) => e.isBoss);

  return (
    <div className="survivor-shell">
      {/* ==================== TACTICAL COCKPIT TOPBAR ==================== */}
      <header className="survivor-topbar">
        <div className="survivor-top-row">
          {/* Brand + Active Vehicle Cockpit Avatar */}
          <div className="cockpit-pilot-card">
            <div className="pilot-sprite-frame">
              <img
                src={spriteCache.getClassDataUri(p.classId)}
                alt={activeClassDef.name}
                className="pilot-sprite-img"
              />
              <span className="pilot-lv-badge mono">Lv.{p.level}</span>
            </div>
            <div className="pilot-meta">
              <div className="brand-title">NEON FLOW : GRIDLOCK SURVIVORS</div>
              <div className="pilot-class-name" style={{ color: activeClassDef.color }}>
                {activeClassDef.name} ·{' '}
                <span className="pilot-stage-sub">
                  {SURVIVOR_STAGES[uiState.stageId].name}
                </span>
              </div>
            </div>
          </div>

          {/* Digital Rush-Hour Clock & Wave Phase */}
          <div className="survivor-clock-box">
            <div className="clock-time mono">
              {formatTime(uiState.elapsedSeconds)}
              <span className="clock-target">
                / {formatTime(uiState.clearTimeSeconds)}
              </span>
            </div>
            <div className="clock-wave-pill">{uiState.waveLabel}</div>
          </div>

          {/* Core Gauges: HP, City Gridlock, Fever/Combo */}
          <div className="survivor-gauges-group">
            <div className="s-gauge-card">
              <div className="s-gauge-top">
                <span>
                  <Shield size={12} /> 장갑 내구도 (HP)
                </span>
                <strong className="mono">
                  {Math.ceil(p.hp)} / {p.maxHp}
                </strong>
              </div>
              <div className="s-bar-track">
                <div
                  className="s-bar-fill hp"
                  style={{ width: `${hpPercent}%` }}
                />
              </div>
            </div>

            <div className="s-gauge-card">
              <div className="s-gauge-top">
                <span>
                  <span
                    className={`traffic-led ${
                      gridlockPercent >= 80
                        ? 'red'
                        : gridlockPercent <= 35
                        ? 'green'
                        : 'amber'
                    }`}
                  />
                  도심 마비도
                </span>
                <strong
                  className={`mono ${
                    gridlockPercent >= 80
                      ? 'text-rose'
                      : gridlockPercent <= 35
                      ? 'text-emerald'
                      : 'text-amber'
                  }`}
                >
                  {gridlockPercent}%{' '}
                  {uiState.smoothFlowBuffActive
                    ? '(쾌적 +20%)'
                    : uiState.gridlockOverloadActive
                    ? '(과부하!)'
                    : ''}
                </strong>
              </div>
              <div className="s-bar-track">
                <div
                  className={`s-bar-fill gridlock ${
                    gridlockPercent >= 80
                      ? 'critical'
                      : gridlockPercent <= 35
                      ? 'smooth'
                      : 'moderate'
                  }`}
                  style={{ width: `${gridlockPercent}%` }}
                />
              </div>
            </div>

            <div
              className={`s-gauge-card ${
                uiState.feverActiveTimer > 0 ? 'fever-active-card' : ''
              }`}
            >
              <div className="s-gauge-top">
                <span>
                  <Flame size={12} />{' '}
                  {uiState.feverActiveTimer > 0
                    ? '🔥 FEVER OVERDRIVE!'
                    : '피버 게이지'}
                </span>
                <strong className="mono text-amber">
                  {uiState.comboCount > 1
                    ? `${uiState.comboCount} COMBO!`
                    : `${feverPercent}%`}
                </strong>
              </div>
              <div className="s-bar-track">
                <div
                  className={`s-bar-fill ${
                    uiState.feverActiveTimer > 0 ? 'fever-rainbow' : 'fever-charge'
                  }`}
                  style={{ width: `${feverPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Score & Credits */}
          <div className="survivor-stats-pills">
            <div className="s-stat-pill">
              <span className="lbl">단속·해소 차량</span>
              <strong className="mono cyan">{p.kills}대</strong>
            </div>
            <div className="s-stat-pill">
              <span className="lbl">과태료 크레딧</span>
              <strong className="mono amber">+{p.creditsEarned}G</strong>
            </div>
          </div>

          {/* Action Controls & Mode Switcher */}
          <div className="survivor-actions-group">
            <button
              type="button"
              className={`s-ctrl-btn siren-btn ${
                p.sirenDashCooldown <= 0 ? 'ready' : 'cooling'
              }`}
              onClick={() => engineRef.current.triggerSirenDash()}
              title="긴급 사이렌 그린웨이브 돌파 (단축키: Space)"
            >
              <Zap size={13} />
              <span>
                {p.sirenDashCooldown <= 0
                  ? '긴급돌파 [Space]'
                  : `${p.sirenDashCooldown.toFixed(1)}s`}
              </span>
            </button>

            <button
              type="button"
              className={`s-ctrl-btn override-btn ${
                p.cityOverrideCooldown <= 0 ? 'ready' : 'cooling'
              }`}
              onClick={() => engineRef.current.triggerCitywideOverride()}
              title="전 도시 신호 초록불 동기화 EMP (단축키: Q)"
            >
              <Radio size={13} />
              <span>
                {p.cityOverrideCooldown <= 0
                  ? '전도시 동기화 [Q]'
                  : `${p.cityOverrideCooldown.toFixed(1)}s`}
              </span>
            </button>

            <button
              type="button"
              className={`s-ctrl-btn ${autoPilot ? 'active-ai' : ''}`}
              onClick={() => setAutoPilot((a) => !a)}
              title="AI 자율주행 파일럿 켜기/끄기"
            >
              <Bot size={14} />
              <span>{autoPilot ? 'AI 파일럿 ON' : 'AI 파일럿'}</span>
            </button>

            <button
              type="button"
              className="s-icon-btn"
              onClick={() => {
                const muted = soundEngine.toggleMute();
                setSoundMuted(muted);
              }}
              title={soundMuted ? '사운드 켜기' : '사운드 끄기'}
            >
              {soundMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>

            <button
              type="button"
              className="s-icon-btn"
              onClick={() => {
                const eng = engineRef.current;
                const cur = eng.getState().status;
                if (cur === 'PLAYING') {
                  eng.setStatus('PAUSED');
                  setUiState({ ...eng.getState() });
                } else if (cur === 'PAUSED') {
                  eng.setStatus('PLAYING');
                  setUiState({ ...eng.getState() });
                }
              }}
              title="일시정지 / 재개 (Esc)"
            >
              {uiState.status === 'PAUSED' ? (
                <Play size={15} />
              ) : (
                <Pause size={15} />
              )}
            </button>

            <button
              type="button"
              className="s-ctrl-btn garage-btn"
              onClick={() => setIsLobbyOpen(true)}
            >
              <Gamepad2 size={13} />
              <span>본부 차고</span>
            </button>

            <button
              type="button"
              className="s-ctrl-btn lab-switch-btn"
              onClick={onSwitchToLabMode}
              title="기존 도시 교통 시뮬레이터 & 신호 최적화 실험실로 전환"
            >
              <FlaskConical size={13} />
              <span>교통 실험실</span>
            </button>
          </div>
        </div>

        {/* Full-width Neon XP Progress Bar */}
        <div className="xp-strip-wrap">
          <div className="xp-strip-fill" style={{ width: `${xpPercent}%` }} />
          <div className="xp-strip-label mono">
            LEVEL {p.level} · 통행 데이터 경험치 {p.xp} / {p.xpToNext} (
            {xpPercent}%)
          </div>
        </div>
      </header>

      {/* ==================== MAIN CANVAS STAGE ==================== */}
      <div className="survivor-stage-wrap" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="survivor-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />

        {/* Top-Center Active Boss Health Bar HUD */}
        {activeBoss && (
          <div className="boss-hud-bar-card">
            <div className="boss-hud-top">
              <div className="boss-hud-identity">
                <img
                  src={spriteCache.getEnemyDataUri(activeBoss.type)}
                  alt={activeBoss.name}
                  className="boss-hud-sprite"
                />
                <div>
                  <div className="boss-hud-name">{activeBoss.name}</div>
                  <div className="boss-hud-sub">
                    특수 단속 대상 · 처치 시 과태료 보물상자 드롭
                  </div>
                </div>
              </div>
              <div className="boss-hud-hp mono">
                {Math.ceil(activeBoss.hp).toLocaleString()} /{' '}
                {activeBoss.maxHp.toLocaleString()} HP
              </div>
            </div>
            <div className="boss-hud-track">
              <div
                className="boss-hud-fill"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, (activeBoss.hp / activeBoss.maxHp) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Boss Spawn Warning Toast */}
        {uiState.activeBossAlert && !activeBoss && (
          <div className="boss-alert-banner">
            <Sparkles size={16} />
            <span>{uiState.activeBossAlert}</span>
          </div>
        )}

        {/* Active Intersection Signal Mission HUD Callout */}
        {uiState.activeMission && (
          <div
            className="mission-hud-callout"
            style={{ top: activeBoss ? 86 : 16 }}
          >
            <div className="mission-hud-title">
              🚨 교차로 신호 마비:{' '}
              <strong>{uiState.activeMission.nodeName}</strong>
            </div>
            <div className="mission-hud-sub">
              교차로 원 안으로 진입해 신호를 해킹하세요! (진행도:{' '}
              {Math.round(uiState.activeMission.progress * 100)}% · 남은 시간:{' '}
              {Math.ceil(uiState.activeMission.timeRemaining)}s)
            </div>
          </div>
        )}

        {/* Floating Combo & Fever Badge on Right below Minimap */}
        {uiState.comboCount >= 3 && (
          <div className="combo-floating-badge">
            <div className="combo-num mono">{uiState.comboCount} HIT</div>
            <div className="combo-lbl">
              {uiState.feverActiveTimer > 0
                ? '🔥 GREEN-WAVE FEVER!'
                : '연속 정체 해소 콤보'}
            </div>
          </div>
        )}

        {/* Bottom-Left Tactical Equipment Deck */}
        <div className="survivor-inventory-dock">
          <div className="inv-row">
            <span className="inv-row-tag">장착 무기</span>
            <div className="inv-slots">
              {Array.from({ length: 6 }).map((_, idx) => {
                const w = p.weapons[idx];
                if (!w) {
                  return (
                    <div key={idx} className="inv-slot empty">
                      -
                    </div>
                  );
                }
                const def = WEAPON_DEFS[w.id];
                return (
                  <div
                    key={w.id}
                    className={`inv-slot filled ${w.evolved ? 'evolved' : ''}`}
                    style={{
                      borderColor: w.evolved ? def.evolvedColor : def.color,
                    }}
                    title={`${w.evolved ? def.evolvedName : def.name} (누적 피해: ${w.totalDamageDealt.toLocaleString()})`}
                  >
                    <div className="inv-slot-icon">{def.iconCode}</div>
                    <div
                      className="inv-slot-name"
                      style={{
                        color: w.evolved ? def.evolvedColor : def.color,
                      }}
                    >
                      {w.evolved ? '★진화' : def.name.slice(0, 4)}
                    </div>
                    <div className="inv-slot-lv mono">
                      {w.evolved ? 'MAX' : `Lv.${w.level}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="inv-row">
            <span className="inv-row-tag">보조 모듈</span>
            <div className="inv-slots">
              {Array.from({ length: 6 }).map((_, idx) => {
                const entries = Object.entries(p.passives) as [
                  PassiveId,
                  number
                ][];
                const item = entries[idx];
                if (!item) {
                  return (
                    <div key={idx} className="inv-slot empty">
                      -
                    </div>
                  );
                }
                const [pid, lv] = item;
                const def = PASSIVE_DEFS[pid];
                return (
                  <div
                    key={pid}
                    className="inv-slot filled"
                    style={{ borderColor: def.color }}
                    title={`${def.name}: ${def.description}`}
                  >
                    <div className="inv-slot-icon">{def.iconCode}</div>
                    <div
                      className="inv-slot-name"
                      style={{ color: def.color }}
                    >
                      {def.name.slice(0, 4)}
                    </div>
                    <div className="inv-slot-lv mono">Lv.{lv}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="controls-hint-bar">
            <span>이동: WASD / 방향키 / 드래그</span>
            <span>·</span>
            <span>긴급돌파: Space</span>
            <span>·</span>
            <span>도시동기화: Q</span>
            <span>·</span>
            <span className={p.onRoadSpeedBoost ? 'text-emerald' : ''}>
              {p.onRoadSpeedBoost
                ? '⚡ 도로 슬립스트림 가속 (+15%)'
                : '도로 주행 시 가속 보너스'}
            </span>
          </div>
        </div>

        {/* ==================== LEVEL UP MODAL ==================== */}
        {uiState.status === 'LEVEL_UP' && !isLobbyOpen && (
          <div className="survivor-modal-backdrop">
            <div className="survivor-modal levelup-modal">
              <div className="s-modal-header">
                <div className="s-modal-badge">LEVEL UP! → Lv.{p.level}</div>
                <h2>교통 관제 무장 시스템 업그레이드</h2>
                <p>
                  Lv.5 무기와 시너지 보조 모듈을 함께 갖추면{' '}
                  <strong className="text-amber">★궁극 진화 무기</strong>가
                  해금됩니다! (단축키 1·2·3 선택 / R 리롤)
                </p>
              </div>

              <div className="upgrade-cards-grid">
                {uiState.pendingLevelChoices.map((choice, idx) => (
                  <button
                    key={choice.key}
                    type="button"
                    className={`upgrade-card ${
                      choice.isEvolution ? 'evolution-card' : ''
                    }`}
                    style={{ borderColor: choice.color }}
                    onClick={() => {
                      engineRef.current.applyUpgradeChoice(choice);
                      setUiState({ ...engineRef.current.getState() });
                    }}
                  >
                    <div className="up-card-top">
                      <span
                        className="up-card-tag"
                        style={{
                          backgroundColor: `${choice.color}22`,
                          color: choice.color,
                        }}
                      >
                        {choice.subtitle}
                      </span>
                      <span className="up-shortcut mono">[{idx + 1}]</span>
                    </div>
                    <div
                      className="up-card-title"
                      style={{ color: choice.color }}
                    >
                      {choice.title}
                    </div>
                    <p className="up-card-desc">{choice.description}</p>
                    {choice.synergyHint && (
                      <div className="up-card-synergy">
                        <Cpu size={12} /> {choice.synergyHint}
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <div className="s-modal-footer">
                <button
                  type="button"
                  className="s-reroll-btn"
                  disabled={p.rerollsLeft <= 0}
                  onClick={() => {
                    engineRef.current.rerollLevelChoices();
                    setUiState({ ...engineRef.current.getState() });
                  }}
                >
                  <RefreshCw size={14} /> 선택지 리롤 [R] (남은 횟수:{' '}
                  {p.rerollsLeft})
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== BOSS CHEST MODAL ==================== */}
        {uiState.status === 'CHEST_OPEN' && !isLobbyOpen && (
          <div className="survivor-modal-backdrop">
            <div className="survivor-modal chest-modal">
              <div className="chest-banner-strip">
                <img
                  src="./assets/boss-showcase.jpg"
                  alt="Boss Enforcement Showcase"
                  className="chest-banner-img"
                />
                <div className="chest-banner-overlay">
                  <div className="s-modal-badge amber">
                    🎁 BOSS ENFORCEMENT JACKPOT!
                  </div>
                  <h2>보스 차량 단속 완료 · 과태료 보물상자 개방!</h2>
                  <p>
                    내구도 +35 회복, 과태료 크레딧 +60G 및 아래 2종의 무장이 즉시
                    강화되었습니다!
                  </p>
                </div>
              </div>

              <div className="chest-rewards-list">
                {uiState.pendingChestRewards.map((rw) => (
                  <div
                    key={rw.key}
                    className="chest-reward-item"
                    style={{ borderColor: rw.color }}
                  >
                    <div
                      className="chest-rw-title"
                      style={{ color: rw.color }}
                    >
                      {rw.title} <span className="mono">({rw.subtitle})</span>
                    </div>
                    <div className="chest-rw-desc">{rw.description}</div>
                  </div>
                ))}
              </div>

              <div className="s-modal-footer">
                <button
                  type="button"
                  className="s-primary-cta"
                  onClick={() => {
                    engineRef.current.closeChestModal();
                    setUiState({ ...engineRef.current.getState() });
                  }}
                >
                  확인 및 작전 계속하기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== VICTORY / GAME OVER MODAL ==================== */}
        {(uiState.status === 'VICTORY' || uiState.status === 'GAME_OVER') &&
          !isLobbyOpen && (
            <div className="survivor-modal-backdrop">
              <div className="survivor-modal result-modal">
                <div className="chest-banner-strip">
                  <img
                    src="./assets/hero-banner.jpg"
                    alt="Neon Flow Key Art"
                    className="chest-banner-img"
                  />
                  <div className="chest-banner-overlay">
                    <div
                      className={`s-modal-badge ${
                        uiState.status === 'VICTORY' ? 'emerald' : 'rose'
                      }`}
                    >
                      {uiState.status === 'VICTORY'
                        ? '🏆 RUSH HOUR CLEARED!'
                        : '🚨 GRIDLOCK OVERWHELMED'}
                    </div>
                    <h2>
                      {uiState.status === 'VICTORY'
                        ? '도심 러시아워 교통 체증 완전 해소!'
                        : '순찰 기체 파손 · 도심 정체 방어 종료'}
                    </h2>
                    <p>
                      획득한{' '}
                      <strong className="text-amber">
                        +{p.creditsEarned}G 과태료 크레딧
                      </strong>
                      이 관제 본부 금고에 누적되었습니다.
                    </p>
                  </div>
                </div>

                <div className="result-kpi-grid">
                  <div className="res-kpi">
                    <span>생존 시간</span>
                    <strong className="mono">
                      {formatTime(uiState.elapsedSeconds)}
                    </strong>
                  </div>
                  <div className="res-kpi">
                    <span>최종 레벨</span>
                    <strong className="mono cyan">Lv.{p.level}</strong>
                  </div>
                  <div className="res-kpi">
                    <span>해소 차량 수</span>
                    <strong className="mono emerald">{p.kills}대</strong>
                  </div>
                  <div className="res-kpi">
                    <span>최대 콤보 / 해킹</span>
                    <strong className="mono">
                      {uiState.maxCombo}x / {uiState.missionsCompleted}회
                    </strong>
                  </div>
                  <div className="res-kpi">
                    <span>획득 크레딧</span>
                    <strong className="mono amber">+{p.creditsEarned}G</strong>
                  </div>
                </div>

                <div className="weapon-dmg-report">
                  <div className="report-title">
                    무기별 누적 단속 피해량 리포트
                  </div>
                  {p.weapons.map((w) => {
                    const def = WEAPON_DEFS[w.id];
                    const maxDmg = Math.max(
                      1,
                      ...p.weapons.map((item) => item.totalDamageDealt)
                    );
                    const pct = Math.round((w.totalDamageDealt / maxDmg) * 100);
                    return (
                      <div key={w.id} className="dmg-row">
                        <div className="dmg-row-top">
                          <span
                            style={{
                              color: w.evolved ? def.evolvedColor : def.color,
                            }}
                          >
                            {def.iconCode}{' '}
                            {w.evolved ? def.evolvedName : def.name} (
                            {w.evolved ? 'MAX' : `Lv.${w.level}`})
                          </span>
                          <span className="mono">
                            {w.totalDamageDealt.toLocaleString()} DMG ·{' '}
                            {w.kills}대 처치
                          </span>
                        </div>
                        <div className="dmg-bar-bg">
                          <div
                            className="dmg-bar-fill"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: w.evolved
                                ? def.evolvedColor
                                : def.color,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="s-modal-footer result-actions">
                  {uiState.status === 'VICTORY' && (
                    <button
                      type="button"
                      className="s-primary-cta emerald"
                      onClick={() => {
                        engineRef.current.enterEndlessOvertime();
                        setUiState({ ...engineRef.current.getState() });
                      }}
                    >
                      <Flame size={15} /> 무한 야근 러시 계속하기 (Endless)
                    </button>
                  )}
                  <button
                    type="button"
                    className="s-primary-cta"
                    onClick={() => startNewRun(selectedClass, selectedStage)}
                  >
                    <RotateCcw size={15} /> 즉시 재출동
                  </button>
                  <button
                    type="button"
                    className="s-reroll-btn"
                    onClick={() => setIsLobbyOpen(true)}
                  >
                    <Trophy size={15} /> 관제 본부 강화소 & 기체 변경
                  </button>
                </div>
              </div>
            </div>
          )}

        {/* ==================== LOBBY & GARAGE MODAL ==================== */}
        {isLobbyOpen && (
          <div className="survivor-modal-backdrop">
            <div className="survivor-modal lobby-modal">
              {/* Hero Key Art Banner Header */}
              <div className="lobby-hero-banner">
                <img
                  src="./assets/hero-banner.jpg"
                  alt="NEON FLOW: GRIDLOCK SURVIVORS Key Art"
                  className="lobby-hero-img"
                />
                <div className="lobby-hero-overlay">
                  <div>
                    <div className="s-modal-badge">
                      NEON FLOW COMMAND GARAGE
                    </div>
                    <h2>교통 통제 기체 선택 & 영구 강화 본부</h2>
                    <p>
                      6종의 특수 교통 통제 기체와 4개의 대도시 작전 구역을
                      선택하고 과태료 크레딧으로 영구 튜닝하세요.
                    </p>
                  </div>
                  <div className="lobby-credits-box">
                    <span>보유 과태료 크레딧</span>
                    <strong className="mono amber">{meta.credits} G</strong>
                  </div>
                </div>
              </div>

              <div className="lobby-columns">
                {/* Column 1: Class & Stage Selection */}
                <div className="lobby-col">
                  <h3 className="lobby-sec-title">
                    1. 출동 기체 (클래스 6종) 선택
                  </h3>
                  <div className="class-select-grid">
                    {(Object.keys(SURVIVOR_CLASSES) as SurvivorClassId[]).map(
                      (cid) => {
                        const c = SURVIVOR_CLASSES[cid];
                        const startW = WEAPON_DEFS[c.startingWeapon];
                        const active = selectedClass === cid;
                        return (
                          <button
                            key={cid}
                            type="button"
                            className={`class-card ${active ? 'selected' : ''}`}
                            style={{
                              borderColor: active
                                ? c.color
                                : 'rgba(71,85,105,0.5)',
                            }}
                            onClick={() => setSelectedClass(cid)}
                          >
                            <div className="class-card-top-row">
                              <img
                                src={spriteCache.getClassDataUri(cid)}
                                alt={c.name}
                                className="class-card-sprite"
                              />
                              <div style={{ flex: 1 }}>
                                <div className="class-card-head">
                                  <strong style={{ color: c.color }}>
                                    {c.name}
                                  </strong>
                                  <span className="mono">HP {c.baseHp}</span>
                                </div>
                                <div className="class-sub">{c.subtitle}</div>
                              </div>
                            </div>
                            <p className="class-desc">{c.description}</p>
                            <div className="class-meta-tags">
                              <span className="tag-weapon">
                                {startW.iconCode} 시작 무기: {startW.name}
                              </span>
                              <span className="tag-perk">{c.perkLabel}</span>
                            </div>
                          </button>
                        );
                      }
                    )}
                  </div>

                  <h3 className="lobby-sec-title" style={{ marginTop: 12 }}>
                    2. 작전 도시 스테이지 (4종) 선택
                  </h3>
                  <div className="stage-select-list">
                    {(Object.keys(SURVIVOR_STAGES) as SurvivorStageId[]).map(
                      (sid) => {
                        const st = SURVIVOR_STAGES[sid];
                        const active = selectedStage === sid;
                        return (
                          <button
                            key={sid}
                            type="button"
                            className={`stage-card ${active ? 'selected' : ''}`}
                            onClick={() => setSelectedStage(sid)}
                          >
                            <div className="stage-card-top">
                              <strong>{st.name}</strong>
                              <span className="stage-diff mono">
                                {st.difficultyLabel} (
                                {'★'.repeat(st.difficultyStars)})
                              </span>
                            </div>
                            <div className="stage-desc">{st.description}</div>
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>

                {/* Column 2: Permanent Meta Upgrades + Boss Preview */}
                <div className="lobby-col">
                  <h3 className="lobby-sec-title">
                    3. 관제 본부 영구 튜닝 (크레딧 강화)
                  </h3>
                  <div className="meta-upgrade-list">
                    {META_UPGRADE_ITEMS.map((item) => {
                      const lv = meta[item.key];
                      const isMax = lv >= item.maxLevel;
                      const cost = Math.round(
                        item.baseCost * Math.pow(1.45, lv)
                      );
                      const canAfford = !isMax && meta.credits >= cost;

                      return (
                        <div key={item.key} className="meta-item-card">
                          <div className="meta-item-info">
                            <div className="meta-item-title">
                              <strong>{item.name}</strong>
                              <span className="mono cyan">
                                Lv.{lv}/{item.maxLevel} ({item.perLevelText})
                              </span>
                            </div>
                            <div className="meta-item-desc">
                              {item.description}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="meta-buy-btn mono"
                            disabled={!canAfford}
                            onClick={() =>
                              handleBuyMetaUpgrade(
                                item.key,
                                item.baseCost,
                                item.maxLevel
                              )
                            }
                          >
                            {isMax ? 'MAX' : `${cost} G`}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Boss Battle Showcase Card */}
                  <div className="boss-preview-card">
                    <img
                      src="./assets/boss-showcase.jpg"
                      alt="Boss Showdown Preview"
                      className="boss-preview-img"
                    />
                    <div className="boss-preview-caption">
                      <strong>🚨 러시아워 보스 경보</strong>: 0:45 메가 트레일러
                      · 1:40 광역버스 타이탄 · 2:30 브래스의 악령 출현!
                    </div>
                  </div>

                  <div className="career-summary-box">
                    <span>누적 출동: {meta.totalRuns}회</span>
                    <span>·</span>
                    <span>총 해소 차량: {meta.totalVehiclesCleared}대</span>
                    <span>·</span>
                    <span>최장 생존: {formatTime(meta.bestTimeSeconds)}</span>
                  </div>
                </div>
              </div>

              <div className="s-modal-footer">
                <button
                  type="button"
                  className="s-reroll-btn"
                  onClick={() => setIsLobbyOpen(false)}
                >
                  현재 작전으로 돌아가기
                </button>
                <button
                  type="button"
                  className="s-primary-cta"
                  onClick={() => startNewRun(selectedClass, selectedStage)}
                >
                  <Play size={15} /> 선택한 기체·스테이지로 출동 시작!
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== CANVAS RENDERING PIPELINE ====================
function renderSurvivorCanvas(
  canvas: HTMLCanvasElement | null,
  container: HTMLDivElement | null,
  engine: TrafficSurvivorEngine,
  pointerDrag: {
    active: boolean;
    originX: number;
    originY: number;
    currX: number;
    currY: number;
  }
): void {
  if (!canvas || !container) return;

  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const targetW = Math.floor(rect.width * dpr);
  const targetH = Math.floor(rect.height * dpr);

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const viewW = rect.width;
  const viewH = rect.height;

  const st = engine.getState();
  const net = engine.getNetwork();
  const bounds = engine.getBounds();
  const p = st.player;
  const cls = SURVIVOR_CLASSES[p.classId];

  ctx.save();
  ctx.scale(dpr, dpr);

  // 1. Deep Neon Backdrop
  const bgGrad = ctx.createRadialGradient(
    viewW * 0.5,
    viewH * 0.5,
    40,
    viewW * 0.5,
    viewH * 0.5,
    Math.max(viewW, viewH) * 0.75
  );
  bgGrad.addColorStop(0, '#09152b');
  bgGrad.addColorStop(1, '#040812');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, viewW, viewH);

  // Camera centered on player + optional Screen Shake offset
  const camScale = 1.06;
  const shakeX =
    st.screenShakeTimer > 0
      ? (Math.random() - 0.5) * st.screenShakeIntensity * 2
      : 0;
  const shakeY =
    st.screenShakeTimer > 0
      ? (Math.random() - 0.5) * st.screenShakeIntensity * 2
      : 0;

  const camX = viewW * 0.5 - p.x * camScale + shakeX;
  const camY = viewH * 0.5 - p.y * camScale + shakeY;

  ctx.save();
  ctx.translate(camX, camY);
  ctx.scale(camScale, camScale);

  // 2. World Coordinate Grid & Boundary Frame
  const gridStep = 80;
  ctx.strokeStyle = 'rgba(30, 58, 138, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = bounds.minX; gx <= bounds.maxX; gx += gridStep) {
    ctx.moveTo(gx, bounds.minY);
    ctx.lineTo(gx, bounds.maxY);
  }
  for (let gy = bounds.minY; gy <= bounds.maxY; gy += gridStep) {
    ctx.moveTo(bounds.minX, gy);
    ctx.lineTo(bounds.maxX, gy);
  }
  ctx.stroke();

  // Outer perimeter barrier
  ctx.strokeStyle = 'rgba(244, 63, 94, 0.5)';
  ctx.lineWidth = 3.5;
  ctx.strokeRect(
    bounds.minX,
    bounds.minY,
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY
  );

  // 2.5 Render 3D-style Cyberpunk City Building Blocks
  for (const b of engine.getCityBlocks()) {
    // Base footprint
    ctx.fillStyle = '#070f20';
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.6)';
    ctx.lineWidth = 1.2;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeRect(b.x, b.y, b.w, b.h);

    // Extruded roof offset
    const off = 4 * b.heightFactor;
    const rx = b.x - off;
    const ry = b.y - off;
    ctx.fillStyle = '#0b172e';
    ctx.strokeStyle = `${b.accentColor}66`;
    ctx.lineWidth = 1.4;
    ctx.fillRect(rx, ry, b.w, b.h);
    ctx.strokeRect(rx, ry, b.w, b.h);

    if (b.hasHelipad) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(rx + b.w * 0.5, ry + b.h * 0.5, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.fillText('H', rx + b.w * 0.5, ry + b.h * 0.5);
    } else if (b.label) {
      ctx.font = '700 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `${b.accentColor}aa`;
      ctx.fillText(b.label, rx + b.w * 0.5, ry + b.h * 0.5);
    }
  }

  // 3. Render City Road Network (Edges & Ambient Cars)
  const nodeMap = new Map(net.nodes.map((n) => [n.id, n]));

  for (const edge of net.edges) {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) continue;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;

    const roadW = Math.max(15, edge.lanes * 8.5);
    const latOffset = roadW * 0.55 + 2;
    const sx = from.x + nx * latOffset;
    const sy = from.y + ny * latOffset;
    const ex = to.x + nx * latOffset;
    const ey = to.y + ny * latOffset;

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = '#0f1e36';
    ctx.lineWidth = roadW;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(sx + nx * (roadW * 0.5), sy + ny * (roadW * 0.5));
    ctx.lineTo(ex + nx * (roadW * 0.5), ey + ny * (roadW * 0.5));
    ctx.moveTo(sx - nx * (roadW * 0.5), sy - ny * (roadW * 0.5));
    ctx.lineTo(ex - nx * (roadW * 0.5), ey - ny * (roadW * 0.5));
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.36)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.restore();
  }

  for (const ac of engine.getAmbientCars()) {
    const edge = net.edges.find((e) => e.id === ac.edgeId);
    if (!edge) continue;
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) continue;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const lat = 10 + ac.lane * 5;
    const cx = from.x + dx * ac.progress + nx * lat;
    const cy = from.y + dy * ac.progress + ny * lat;

    ctx.strokeStyle = `${ac.color}66`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx - ux * 5, cy - uy * 5);
    ctx.lineTo(cx + ux * 2, cy + uy * 2);
    ctx.stroke();
  }

  // 4. Render City Intersections, Crosswalks & Live Signals
  for (const node of net.nodes) {
    const sig = TrafficSimulator.evaluateSignalState(
      node.signal,
      st.elapsedSeconds
    );
    const radius = 25;

    // Crosswalk zebra stripes around intersection perimeter
    ctx.fillStyle = 'rgba(148, 163, 184, 0.22)';
    for (let i = -2; i <= 2; i++) {
      ctx.fillRect(node.x + i * 5 - 1.5, node.y - radius - 9, 3, 5);
      ctx.fillRect(node.x + i * 5 - 1.5, node.y + radius + 4, 3, 5);
      ctx.fillRect(node.x - radius - 9, node.y + i * 5 - 1.5, 5, 3);
      ctx.fillRect(node.x + radius + 4, node.y + i * 5 - 1.5, 5, 3);
    }

    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#0a1528';
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    const nsColor =
      sig.nsLight === 'GREEN'
        ? '#10b981'
        : sig.nsLight === 'YELLOW'
        ? '#f59e0b'
        : '#f43f5e';
    const ewColor =
      sig.ewLight === 'GREEN'
        ? '#10b981'
        : sig.ewLight === 'YELLOW'
        ? '#f59e0b'
        : '#f43f5e';

    ctx.fillStyle = nsColor;
    ctx.fillRect(node.x - 10, node.y - radius - 3, 20, 3.5);
    ctx.fillRect(node.x - 10, node.y + radius - 0.5, 20, 3.5);

    ctx.fillStyle = ewColor;
    ctx.fillRect(node.x - radius - 3, node.y - 10, 3.5, 20);
    ctx.fillRect(node.x + radius - 0.5, node.y - 10, 3.5, 20);

    ctx.font = '600 10px "Pretendard", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(node.name, node.x, node.y + radius + 16);
  }

  // 4.5 Render Tire Track Marks
  for (const tr of st.tireTracks) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, (tr.timer / 1.1) * 0.42);
    ctx.translate(tr.x, tr.y);
    ctx.rotate(tr.angle);
    ctx.fillStyle = tr.color;
    ctx.fillRect(-4, -7, 7, 2.2);
    ctx.fillRect(-4, 5, 7, 2.2);
    ctx.restore();
  }

  // 5. Render Active Intersection Signal Optimization Mission Zone
  if (st.activeMission) {
    const m = st.activeMission;
    const pulse = 1 + Math.sin(st.elapsedSeconds * 6) * 0.06;

    ctx.save();
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.radius * pulse, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([8, 6]);
    ctx.stroke();

    if (m.progress > 0) {
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(
        m.x,
        m.y,
        m.radius + 4,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * m.progress
      );
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 5;
      ctx.stroke();
    }

    ctx.font = '700 11px "Pretendard", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde047';
    ctx.fillText(
      `⚡ 신호 해킹 구역 (${Math.round(m.progress * 100)}%)`,
      m.x,
      m.y - m.radius - 10
    );
    ctx.restore();
  }

  // 6. Render EMP Aura Field around Player
  const empWeapon = p.weapons.find((w) => w.id === 'EMP_AURA');
  if (empWeapon) {
    const empRadius =
      WEAPON_DEFS.EMP_AURA.baseArea *
      (1 + (empWeapon.level - 1) * 0.15) *
      engine.getAreaMultiplier() *
      (empWeapon.evolved ? 1.28 : 1.0);

    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, empRadius, 0, Math.PI * 2);
    ctx.fillStyle = empWeapon.evolved
      ? 'rgba(232, 121, 249, 0.09)'
      : 'rgba(168, 85, 247, 0.07)';
    ctx.fill();
    ctx.strokeStyle = empWeapon.evolved
      ? `rgba(232, 121, 249, ${0.35 + st.empPulseVisual * 0.45})`
      : `rgba(168, 85, 247, ${0.28 + st.empPulseVisual * 0.45})`;
    ctx.lineWidth = 1.8 + st.empPulseVisual * 2;
    ctx.stroke();
    ctx.restore();
  }

  // 7. Render XP Gems & Pickups
  for (const g of st.gems) {
    const color =
      g.tier === 'ROSE'
        ? '#f43f5e'
        : g.tier === 'AMBER'
        ? '#f59e0b'
        : g.tier === 'EMERALD'
        ? '#10b981'
        : '#22d3ee';

    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = color;
    ctx.fillRect(-4.2, -4.2, 8.4, 8.4);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-4.2, -4.2, 8.4, 8.4);
    ctx.restore();
  }

  for (const pk of st.pickups) {
    const scale = 1 + Math.sin(pk.pulsePhase) * 0.12;
    ctx.save();
    ctx.translate(pk.x, pk.y);
    ctx.scale(scale, scale);

    ctx.beginPath();
    ctx.arc(0, 0, pk.radius, 0, Math.PI * 2);
    ctx.fillStyle =
      pk.kind === 'BOSS_CHEST'
        ? 'rgba(245, 158, 11, 0.3)'
        : pk.kind === 'REPAIR_KIT'
        ? 'rgba(16, 185, 129, 0.25)'
        : 'rgba(34, 211, 238, 0.25)';
    ctx.fill();
    ctx.strokeStyle =
      pk.kind === 'BOSS_CHEST'
        ? '#fbbf24'
        : pk.kind === 'REPAIR_KIT'
        ? '#34d399'
        : '#22d3ee';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = '700 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(
      pk.kind === 'BOSS_CHEST'
        ? '🎁'
        : pk.kind === 'REPAIR_KIT'
        ? '🔧'
        : '🧲',
      0,
      0
    );
    ctx.restore();
  }

  // 8. Render Deployed Signal Turrets
  for (const t of st.turrets) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(t.x, t.y, 13, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = t.evolved ? '#fde047' : '#eab308';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 4.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 9. Render Enemies using Real Top-Down Vehicle SVG Sprites!
  for (const e of st.enemies) {
    if (
      e.type === 'ROGUE_RACER' &&
      e.chargePhaseTimer &&
      e.chargePhaseTimer > 0.35 &&
      e.chargeTargetX !== undefined &&
      e.chargeTargetY !== undefined
    ) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.chargeTargetX, e.chargeTargetY);
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.8)';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);

    const w = e.radius * 2.15;
    const h = e.radius * 1.42;
    const sprite = spriteCache.getEnemySprite(e.type);

    if (e.isElite && !e.isBoss) {
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 1.15, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
      ctx.drawImage(sprite, -w * 0.5, -h * 0.5, w, h);
      if (e.hitFlashTimer > 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillRect(-w * 0.42, -h * 0.38, w * 0.84, h * 0.76);
      }
    } else {
      ctx.fillStyle = e.hitFlashTimer > 0 ? '#ffffff' : e.color;
      ctx.strokeStyle = e.isBoss ? '#fde047' : '#090d16';
      ctx.lineWidth = e.isBoss ? 2.5 : 1.2;
      ctx.beginPath();
      ctx.roundRect(-w * 0.42, -h * 0.42, w * 0.84, h * 0.84, 4);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();

    if (e.isBoss || e.isElite || e.hp < e.maxHp) {
      const barW = e.isBoss ? 72 : 28;
      const barH = e.isBoss ? 6 : 3.5;
      const bx = e.x - barW * 0.5;
      const by = e.y - e.radius - (e.isBoss ? 18 : 9);
      const ratio = Math.max(0, Math.min(1, e.hp / e.maxHp));

      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = e.isBoss ? '#f43f5e' : '#fbbf24';
      ctx.fillRect(bx, by, barW * ratio, barH);

      if (e.isBoss) {
        ctx.font = '700 10.5px "Pretendard", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fda4af';
        ctx.fillText(e.name, e.x, by - 5);
      }
    }
  }

  // 10. Render Roundabout Orbitals
  const orbWeapon = p.weapons.find((w) => w.id === 'ROUNDABOUT_ORBITAL');
  if (orbWeapon) {
    const def = WEAPON_DEFS.ROUNDABOUT_ORBITAL;
    const count =
      def.baseCount +
      (orbWeapon.level - 1) +
      engine.getBonusProjectileCount() +
      (orbWeapon.evolved ? 2 : 0);
    const orbitRadius =
      def.baseArea *
      (1 + (orbWeapon.level - 1) * 0.08) *
      engine.getAreaMultiplier();
    const orbSize =
      (orbWeapon.evolved ? 15 : 11) * engine.getAreaMultiplier();

    ctx.beginPath();
    ctx.arc(p.x, p.y, orbitRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.18)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    for (let i = 0; i < count; i++) {
      const ang = st.orbitalAngle + (i * Math.PI * 2) / count;
      const ox = p.x + Math.cos(ang) * orbitRadius;
      const oy = p.y + Math.sin(ang) * orbitRadius;

      ctx.save();
      ctx.beginPath();
      ctx.arc(ox, oy, orbSize, 0, Math.PI * 2);
      ctx.fillStyle = orbWeapon.evolved ? '#38bdf8' : '#22d3ee';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();
    }
  }

  // 11. Render Projectiles, Slashes & Lasers
  for (const s of st.slashes) {
    const alpha = Math.max(0, s.timer / s.maxTimer);
    ctx.save();
    ctx.globalAlpha = alpha * 0.65;
    ctx.beginPath();
    if (s.arcWidth >= Math.PI * 1.95) {
      ctx.arc(s.x, s.y, s.arcRadius, 0, Math.PI * 2);
    } else {
      ctx.moveTo(s.x, s.y);
      ctx.arc(
        s.x,
        s.y,
        s.arcRadius,
        s.angle - s.arcWidth * 0.5,
        s.angle + s.arcWidth * 0.5
      );
      ctx.closePath();
    }
    ctx.fillStyle = `${s.color}44`;
    ctx.fill();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.evolved ? 4 : 2.5;
    ctx.stroke();
    ctx.restore();
  }

  for (const l of st.lasers) {
    const alpha = Math.max(0, l.timer / l.maxTimer);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = l.color;
    ctx.lineWidth = l.width;
    ctx.beginPath();
    ctx.moveTo(l.x1, l.y1);
    ctx.lineTo(l.x2, l.y2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(l.x2, l.y2, 13, 0, Math.PI * 2);
    ctx.fillStyle = `${l.color}66`;
    ctx.fill();
    ctx.restore();
  }

  for (const proj of st.projectiles) {
    ctx.save();
    ctx.translate(proj.x, proj.y);
    if (proj.kind === 'BOOMERANG') {
      ctx.rotate(st.elapsedSeconds * 16);
      ctx.strokeStyle = proj.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, proj.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-proj.radius, 0);
      ctx.lineTo(proj.radius, 0);
      ctx.moveTo(0, -proj.radius);
      ctx.lineTo(0, proj.radius);
      ctx.stroke();
    } else {
      ctx.fillStyle = proj.color;
      ctx.beginPath();
      ctx.arc(0, 0, proj.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, proj.radius * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 12. Render Particles
  for (const pt of st.particles) {
    const alpha = Math.max(0, pt.timer / pt.maxTimer);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 13. Render Player Patrol Vehicle using Real Top-Down SVG Sprite!
  ctx.save();
  ctx.translate(p.x, p.y);

  if (
    p.onRoadSpeedBoost ||
    p.sirenDashActiveTimer > 0 ||
    st.feverActiveTimer > 0
  ) {
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.strokeStyle =
      st.feverActiveTimer > 0
        ? '#10b981'
        : p.sirenDashActiveTimer > 0
        ? '#fde047'
        : 'rgba(34, 211, 238, 0.5)';
    ctx.lineWidth =
      st.feverActiveTimer > 0 || p.sirenDashActiveTimer > 0 ? 3.2 : 1.6;
    ctx.stroke();
  }

  ctx.rotate(p.angle);

  // Headlight cone
  const coneGrad = ctx.createLinearGradient(12, 0, 82, 0);
  coneGrad.addColorStop(0, 'rgba(34, 211, 238, 0.34)');
  coneGrad.addColorStop(1, 'rgba(34, 211, 238, 0)');
  ctx.fillStyle = coneGrad;
  ctx.beginPath();
  ctx.moveTo(12, -7);
  ctx.lineTo(82, -28);
  ctx.lineTo(82, 28);
  ctx.lineTo(12, 7);
  ctx.closePath();
  ctx.fill();

  const playerSprite = spriteCache.getClassSprite(p.classId);
  if (
    playerSprite &&
    playerSprite.complete &&
    playerSprite.naturalWidth > 0
  ) {
    ctx.drawImage(playerSprite, -24, -16, 48, 32);
  } else {
    ctx.fillStyle = cls.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-16, -11, 32, 22, 5);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();

  // Overhead Player HP Mini Bar
  const pBarW = 38;
  const pRatio = Math.max(0, Math.min(1, p.hp / p.maxHp));
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.fillRect(p.x - pBarW * 0.5, p.y - 28, pBarW, 4.5);
  ctx.fillStyle = pRatio > 0.35 ? '#10b981' : '#f43f5e';
  ctx.fillRect(p.x - pBarW * 0.5, p.y - 28, pBarW * pRatio, 4.5);

  // 14. Render Floating Damage & Status Numbers
  for (const ft of st.floatingTexts) {
    const alpha = Math.max(0, ft.timer / ft.maxTimer);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `700 ${ft.size}px "JetBrains Mono", "Pretendard", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }

  ctx.restore(); // End world transform

  // 15. Off-screen Directional Indicator toward Active Signal Mission
  if (st.activeMission) {
    const m = st.activeMission;
    const screenMx = camX + m.x * camScale;
    const screenMy = camY + m.y * camScale;
    if (
      screenMx < 40 ||
      screenMx > viewW - 40 ||
      screenMy < 40 ||
      screenMy > viewH - 40
    ) {
      const ang = Math.atan2(m.y - p.y, m.x - p.x);
      const indDist = Math.min(viewW, viewH) * 0.38;
      const ix = viewW * 0.5 + Math.cos(ang) * indDist;
      const iy = viewH * 0.5 + Math.sin(ang) * indDist;

      ctx.save();
      ctx.translate(ix, iy);
      ctx.rotate(ang);
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-8, -8);
      ctx.lineTo(-8, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // 16. Virtual Joystick Overlay when dragging with pointer/touch
  if (pointerDrag.active) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(pointerDrag.originX, pointerDrag.originY, 38, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const dx = pointerDrag.currX - pointerDrag.originX;
    const dy = pointerDrag.currY - pointerDrag.originY;
    const d = Math.min(38, Math.hypot(dx, dy));
    const ang = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.arc(
      pointerDrag.originX + Math.cos(ang) * d,
      pointerDrag.originY + Math.sin(ang) * d,
      14,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = 'rgba(34, 211, 238, 0.7)';
    ctx.fill();
    ctx.restore();
  }

  // 17. Top-Right Tactical Minimap Radar
  const mapW = 168;
  const mapH = 128;
  const mapX = viewW - mapW - 14;
  const mapY = 14;

  ctx.save();
  ctx.fillStyle = 'rgba(6, 12, 26, 0.9)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
  ctx.lineWidth = 1.4;
  ctx.fillRect(mapX, mapY, mapW, mapH);
  ctx.strokeRect(mapX, mapY, mapW, mapH);

  const worldW = Math.max(1, bounds.maxX - bounds.minX);
  const worldH = Math.max(1, bounds.maxY - bounds.minY);
  const toMiniX = (wx: number) =>
    mapX + 8 + ((wx - bounds.minX) / worldW) * (mapW - 16);
  const toMiniY = (wy: number) =>
    mapY + 8 + ((wy - bounds.minY) / worldH) * (mapH - 16);

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.32)';
  ctx.lineWidth = 1;
  for (const e of net.edges) {
    const a = nodeMap.get(e.from);
    const b = nodeMap.get(e.to);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(toMiniX(a.x), toMiniY(a.y));
    ctx.lineTo(toMiniX(b.x), toMiniY(b.y));
    ctx.stroke();
  }

  if (st.activeMission) {
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(
      toMiniX(st.activeMission.x),
      toMiniY(st.activeMission.y),
      4.5,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  for (const e of st.enemies) {
    ctx.fillStyle = e.isBoss ? '#f43f5e' : 'rgba(248, 113, 113, 0.75)';
    ctx.fillRect(
      toMiniX(e.x) - (e.isBoss ? 3 : 1),
      toMiniY(e.y) - (e.isBoss ? 3 : 1),
      e.isBoss ? 6 : 2,
      e.isBoss ? 6 : 2
    );
  }

  ctx.fillStyle = '#22d3ee';
  ctx.beginPath();
  ctx.arc(toMiniX(p.x), toMiniY(p.y), 3.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  ctx.restore();
}
