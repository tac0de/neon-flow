import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  MetaUpgradesState,
  PassiveId,
  SurvivorClassId,
  SurvivorGameState,
  SurvivorStageId,
  UpgradeChoice,
  WeaponId,
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
import { TrafficSimulator } from '../engine/simulator';
import {
  Bot,
  Cpu,
  Flame,
  FlaskConical,
  Gamepad2,
  Pause,
  Play,
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

  // Input state refs (WASD / Arrow keys + Mouse / Touch virtual joystick)
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

  // Start a fresh run
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
  }, [uiState.status, uiState.player.creditsEarned, uiState.elapsedSeconds, uiState.player.kills]);

  // Keyboard listeners (WASD / Arrows / Space / 1,2,3 for Level-up cards / R for Reroll)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      keysRef.current.add(code);

      const eng = engineRef.current;
      const st = eng.getState();

      if (code === 'Space' && st.status === 'PLAYING' && !isLobbyOpen) {
        e.preventDefault();
        eng.triggerSirenDash();
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
        // Compute player input vector
        let moveX = 0;
        let moveY = 0;
        const keys = keysRef.current;

        if (keys.has('KeyW') || keys.has('ArrowUp')) moveY -= 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) moveY += 1;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) moveX -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) moveX += 1;

        if (
          moveX === 0 &&
          moveY === 0 &&
          pointerDragRef.current.active
        ) {
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

      // Render Canvas
      renderSurvivorCanvas(
        canvasRef.current,
        containerRef.current,
        eng,
        pointerDragRef.current
      );

      // Sync React HUD state at ~15 Hz or immediately on modal transitions
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

  // Pointer / Touch handlers for virtual joystick
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

  // Meta Upgrade Purchase
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
  const xpPercent = Math.min(100, Math.round((p.xp / Math.max(1, p.xpToNext)) * 100));
  const hpPercent = Math.min(100, Math.round((p.hp / Math.max(1, p.maxHp)) * 100));
  const gridlockPercent = Math.min(100, Math.round(uiState.gridlockGauge));

  return (
    <div className="survivor-shell">
      {/* Top Survivor HUD Bar */}
      <header className="survivor-topbar">
        <div className="survivor-top-row">
          <div className="brand-block">
            <div className="neon-logo-mark survivor-logo">NF</div>
            <div>
              <div className="brand-title">
                NEON FLOW : GRIDLOCK SURVIVORS
              </div>
              <div className="brand-sub">
                도시 교통 체증 뱀서류 액션 · 그린웨이브 관제 서바이버
              </div>
            </div>
          </div>

          {/* Survival Clock & Wave Banner */}
          <div className="survivor-clock-box">
            <div className="clock-time mono">
              {formatTime(uiState.elapsedSeconds)}
              <span className="clock-target">
                / {formatTime(uiState.clearTimeSeconds)}
              </span>
            </div>
            <div className="clock-wave-pill">{uiState.waveLabel}</div>
          </div>

          {/* Core Gauges: HP & City Gridlock */}
          <div className="survivor-gauges-group">
            <div className="s-gauge-card">
              <div className="s-gauge-top">
                <span>
                  <Shield size={12} /> 순찰차 내구도 (Lv.{p.level})
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
                  <Flame size={12} /> 도심 정체도 (Gridlock)
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
                    ? '(쾌적 +20% XP)'
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
          </div>

          {/* Score & Credits */}
          <div className="survivor-stats-pills">
            <div className="s-stat-pill">
              <span className="lbl">해소 차량</span>
              <strong className="mono cyan">{p.kills}대</strong>
            </div>
            <div className="s-stat-pill">
              <span className="lbl">과태료 크레딧</span>
              <strong className="mono amber">
                +{p.creditsEarned}G
              </strong>
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
              className={`s-ctrl-btn ${autoPilot ? 'active-ai' : ''}`}
              onClick={() => setAutoPilot((a) => !a)}
              title="AI 자율주행 파일럿 켜기/끄기"
            >
              <Bot size={14} />
              <span>{autoPilot ? 'AI 자율주행 ON' : 'AI 자율주행'}</span>
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
              <span>차고·스테이지</span>
            </button>

            <button
              type="button"
              className="s-ctrl-btn lab-switch-btn"
              onClick={onSwitchToLabMode}
              title="기존 도시 교통 시뮬레이터 & 신호 최적화 실험실로 전환"
            >
              <FlaskConical size={13} />
              <span>교통 실험실 모드</span>
            </button>
          </div>
        </div>

        {/* Full-width Neon XP Progress Bar */}
        <div className="xp-strip-wrap">
          <div className="xp-strip-fill" style={{ width: `${xpPercent}%` }} />
          <div className="xp-strip-label mono">
            LEVEL {p.level} · 통행 데이터 경험치 {p.xp} / {p.xpToNext} ({xpPercent}%)
          </div>
        </div>
      </header>

      {/* Main Canvas Stage */}
      <div className="survivor-stage-wrap" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="survivor-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />

        {/* Boss Warning Banner */}
        {uiState.activeBossAlert && (
          <div className="boss-alert-banner">
            <Sparkles size={16} />
            <span>{uiState.activeBossAlert}</span>
          </div>
        )}

        {/* Active Intersection Signal Mission HUD Callout */}
        {uiState.activeMission && (
          <div className="mission-hud-callout">
            <div className="mission-hud-title">
              🚨 교차로 신호 마비: <strong>{uiState.activeMission.nodeName}</strong>
            </div>
            <div className="mission-hud-sub">
              원 안으로 진입해 신호를 최적화하세요! (해킹 진행도:{' '}
              {Math.round(uiState.activeMission.progress * 100)}% · 남은 시간:{' '}
              {Math.ceil(uiState.activeMission.timeRemaining)}s)
            </div>
          </div>
        )}

        {/* Bottom-Left Weapon & Passive Inventory Dock */}
        <div className="survivor-inventory-dock">
          <div className="inv-row">
            <span className="inv-row-tag">무기 슬롯</span>
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
                    title={`${w.evolved ? def.evolvedName : def.name} (피해량: ${w.totalDamageDealt.toLocaleString()})`}
                  >
                    <div
                      className="inv-slot-name"
                      style={{ color: w.evolved ? def.evolvedColor : def.color }}
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
            <span>이동: WASD / 방향키 / 마우스 드래그</span>
            <span>·</span>
            <span>긴급 돌파: Space</span>
            <span>·</span>
            <span>
              {p.onRoadSpeedBoost
                ? '⚡ 도로 슬립스트림 가속 적용 중 (+15%)'
                : '도로 위로 주행 시 가속 보너스'}
            </span>
          </div>
        </div>

        {/* ==================== LEVEL UP MODAL ==================== */}
        {uiState.status === 'LEVEL_UP' && !isLobbyOpen && (
          <div className="survivor-modal-backdrop">
            <div className="survivor-modal levelup-modal">
              <div className="s-modal-header">
                <div className="s-modal-badge">LEVEL UP! → Lv.{p.level}</div>
                <h2>교통 통제 시스템 업그레이드 선택</h2>
                <p>
                  레벨 5 무기와 대응하는 시너지 보조 모듈을 보유하면{' '}
                  <strong className="text-amber">★궁극 진화 무기</strong>가
                  등장합니다! (숫자키 1·2·3 선택 가능)
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
              <div className="s-modal-header">
                <div className="s-modal-badge amber">
                  🎁 BOSS ENFORCEMENT JACKPOT!
                </div>
                <h2>과태료 보물상자 개방 완료!</h2>
                <p>
                  보스 차량 단속 보상으로 내구도 +35 회복, 크레딧 +60G 및 아래
                  장비가 즉시 강화되었습니다!
                </p>
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
                      {rw.title}{' '}
                      <span className="mono">
                        ({rw.subtitle})
                      </span>
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
                  확인 및 전투 계속하기
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
                <div className="s-modal-header">
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
                      : '순찰 차량 파손 · 도심 정체 방어 종료'}
                  </h2>
                  <p>
                    이번 출동에서 획득한{' '}
                    <strong className="text-amber">
                      +{p.creditsEarned}G 과태료 크레딧
                    </strong>
                    이 관제 본부 금고에 저장되었습니다.
                  </p>
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
                    <span>교차로 해킹</span>
                    <strong className="mono">
                      {uiState.missionsCompleted}회
                    </strong>
                  </div>
                  <div className="res-kpi">
                    <span>획득 크레딧</span>
                    <strong className="mono amber">
                      +{p.creditsEarned}G
                    </strong>
                  </div>
                </div>

                {/* Weapon Damage Report */}
                <div className="weapon-dmg-report">
                  <div className="report-title">무기별 누적 단속 피해량 리포트</div>
                  {p.weapons.map((w) => {
                    const def = WEAPON_DEFS[w.id];
                    const maxDmg = Math.max(
                      1,
                      ...p.weapons.map((item) => item.totalDamageDealt)
                    );
                    const pct = Math.round(
                      (w.totalDamageDealt / maxDmg) * 100
                    );
                    return (
                      <div key={w.id} className="dmg-row">
                        <div className="dmg-row-top">
                          <span style={{ color: w.evolved ? def.evolvedColor : def.color }}>
                            {w.evolved ? def.evolvedName : def.name} (
                            {w.evolved ? 'MAX' : `Lv.${w.level}`})
                          </span>
                          <span className="mono">
                            {w.totalDamageDealt.toLocaleString()} DMG · {w.kills}대 처치
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
                    <Trophy size={15} /> 관제 본부 강화소 & 차량 변경
                  </button>
                </div>
              </div>
            </div>
          )}

        {/* ==================== LOBBY & GARAGE MODAL ==================== */}
        {isLobbyOpen && (
          <div className="survivor-modal-backdrop">
            <div className="survivor-modal lobby-modal">
              <div className="lobby-top-bar">
                <div>
                  <div className="s-modal-badge">
                    NEON FLOW COMMAND GARAGE
                  </div>
                  <h2>교통 통제 기체 선택 & 영구 강화 본부</h2>
                </div>
                <div className="lobby-credits-box">
                  <span>보유 과태료 크레딧</span>
                  <strong className="mono amber">{meta.credits} G</strong>
                </div>
              </div>

              <div className="lobby-columns">
                {/* Column 1: Class & Stage Selection */}
                <div className="lobby-col">
                  <h3 className="lobby-sec-title">1. 출동 기체 (클래스) 선택</h3>
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
                            <div className="class-card-head">
                              <strong style={{ color: c.color }}>
                                {c.name}
                              </strong>
                              <span className="mono">HP {c.baseHp}</span>
                            </div>
                            <div className="class-sub">{c.subtitle}</div>
                            <p className="class-desc">{c.description}</p>
                            <div className="class-meta-tags">
                              <span className="tag-weapon">
                                시작 무기: {startW.name}
                              </span>
                              <span className="tag-perk">{c.perkLabel}</span>
                            </div>
                          </button>
                        );
                      }
                    )}
                  </div>

                  <h3 className="lobby-sec-title" style={{ marginTop: 12 }}>
                    2. 작전 도시 스테이지 선택
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
                                {st.difficultyLabel} ({'★'.repeat(st.difficultyStars)})
                              </span>
                            </div>
                            <div className="stage-desc">{st.description}</div>
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>

                {/* Column 2: Permanent Meta Upgrades */}
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
                  현재 게임으로 돌아가기
                </button>
                <button
                  type="button"
                  className="s-primary-cta"
                  onClick={() => startNewRun(selectedClass, selectedStage)}
                >
                  <Play size={15} /> 선택한 기체·스테이지로 새 출동 시작!
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
  bgGrad.addColorStop(0, '#091428');
  bgGrad.addColorStop(1, '#040812');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, viewW, viewH);

  // Camera centered on player
  const camScale = 1.05;
  const camX = viewW * 0.5 - p.x * camScale;
  const camY = viewH * 0.5 - p.y * camScale;

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
  ctx.strokeStyle = 'rgba(244, 63, 94, 0.45)';
  ctx.lineWidth = 3;
  ctx.strokeRect(
    bounds.minX,
    bounds.minY,
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY
  );

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

    const roadW = Math.max(14, edge.lanes * 8);
    const latOffset = roadW * 0.55 + 2;
    const sx = from.x + nx * latOffset;
    const sy = from.y + ny * latOffset;
    const ex = to.x + nx * latOffset;
    const ey = to.y + ny * latOffset;

    // Road asphalt body
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = '#0f1e36';
    ctx.lineWidth = roadW;
    ctx.stroke();

    // Neon road rails
    ctx.beginPath();
    ctx.moveTo(sx + nx * (roadW * 0.5), sy + ny * (roadW * 0.5));
    ctx.lineTo(ex + nx * (roadW * 0.5), ey + ny * (roadW * 0.5));
    ctx.moveTo(sx - nx * (roadW * 0.5), sy - ny * (roadW * 0.5));
    ctx.lineTo(ex - nx * (roadW * 0.5), ey - ny * (roadW * 0.5));
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.32)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Center dashed lane line
    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.restore();
  }

  // Ambient flow particles along roads
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
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - ux * 5, cy - uy * 5);
    ctx.lineTo(cx + ux * 2, cy + uy * 2);
    ctx.stroke();
  }

  // 4. Render City Intersections & Live Signals
  for (const node of net.nodes) {
    const sig = TrafficSimulator.evaluateSignalState(
      node.signal,
      st.elapsedSeconds
    );
    const radius = 24;

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
    ctx.fillText(node.name, node.x, node.y + radius + 14);
  }

  // 5. Render Active Intersection Signal Optimization Mission Zone
  if (st.activeMission) {
    const m = st.activeMission;
    const pulse = 1 + Math.sin(st.elapsedSeconds * 6) * 0.06;

    // Outer capture zone
    ctx.save();
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.radius * pulse, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.11)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.75)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.stroke();

    // Progress arc
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
    ctx.fillRect(-4, -4, 8, 8);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-4, -4, 8, 8);
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
        ? 'rgba(245, 158, 11, 0.28)'
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
    ctx.arc(t.x, t.y, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = t.evolved ? '#fde047' : '#eab308';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Traffic light dots on turret
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 9. Render Enemies (Traffic Congestion Vehicles & Bosses)
  for (const e of st.enemies) {
    // If Rogue Racer is preparing a charge, draw warning trajectory line
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
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.75)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);

    const w = e.radius * 1.55;
    const h = e.radius * 1.05;

    // Vehicle chassis
    ctx.fillStyle = e.hitFlashTimer > 0 ? '#ffffff' : e.color;
    ctx.strokeStyle = e.isBoss
      ? '#fde047'
      : e.isElite
      ? '#38bdf8'
      : '#090d16';
    ctx.lineWidth = e.isBoss ? 2.8 : e.isElite ? 2 : 1.2;

    ctx.beginPath();
    ctx.roundRect(-w * 0.5, -h * 0.5, w, h, 4);
    ctx.fill();
    ctx.stroke();

    // Windshield & Headlights
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(w * 0.05, -h * 0.36, w * 0.26, h * 0.72);

    ctx.fillStyle = '#fef08a';
    ctx.fillRect(w * 0.42, -h * 0.38, 3, 3);
    ctx.fillRect(w * 0.42, h * 0.38 - 3, 3, 3);

    ctx.restore();

    // HP Bar for damaged enemies, elites, and bosses
    if (e.isBoss || e.isElite || e.hp < e.maxHp) {
      const barW = e.isBoss ? 68 : 28;
      const barH = e.isBoss ? 6 : 3.5;
      const bx = e.x - barW * 0.5;
      const by = e.y - e.radius - (e.isBoss ? 16 : 9);
      const ratio = Math.max(0, Math.min(1, e.hp / e.maxHp));

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
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

    // Subtle orbit ring
    ctx.beginPath();
    ctx.arc(p.x, p.y, orbitRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.16)';
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

  // 11. Render Projectiles, Slashes & Sky Lasers
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
    ctx.arc(l.x2, l.y2, 16, 0, Math.PI * 2);
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

  // 13. Render Player Patrol Vehicle
  ctx.save();
  ctx.translate(p.x, p.y);

  // Slipstream speed boost ring
  if (p.onRoadSpeedBoost || p.sirenDashActiveTimer > 0) {
    ctx.beginPath();
    ctx.arc(0, 0, 23, 0, Math.PI * 2);
    ctx.strokeStyle =
      p.sirenDashActiveTimer > 0
        ? '#fde047'
        : 'rgba(34, 211, 238, 0.45)';
    ctx.lineWidth = p.sirenDashActiveTimer > 0 ? 3 : 1.5;
    ctx.stroke();
  }

  ctx.rotate(p.angle);

  // Headlight cone
  const coneGrad = ctx.createLinearGradient(10, 0, 75, 0);
  coneGrad.addColorStop(0, 'rgba(34, 211, 238, 0.32)');
  coneGrad.addColorStop(1, 'rgba(34, 211, 238, 0)');
  ctx.fillStyle = coneGrad;
  ctx.beginPath();
  ctx.moveTo(10, -6);
  ctx.lineTo(75, -26);
  ctx.lineTo(75, 26);
  ctx.lineTo(10, 6);
  ctx.closePath();
  ctx.fill();

  // Player chassis
  ctx.fillStyle =
    p.invulnerableTimer > 0 && Math.floor(st.elapsedSeconds * 16) % 2 === 0
      ? '#ffffff'
      : cls.color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-15, -10, 30, 20, 5);
  ctx.fill();
  ctx.stroke();

  // Police / Traffic Control Siren Bar (Flashing Red & Cyan)
  const sirenToggle = Math.floor(st.elapsedSeconds * 10) % 2 === 0;
  ctx.fillStyle = sirenToggle ? '#f43f5e' : '#22d3ee';
  ctx.fillRect(-3, -7, 5, 6);
  ctx.fillStyle = sirenToggle ? '#22d3ee' : '#f43f5e';
  ctx.fillRect(-3, 1, 5, 6);

  ctx.restore();

  // Overhead Player HP Mini Bar
  const pBarW = 36;
  const pRatio = Math.max(0, Math.min(1, p.hp / p.maxHp));
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fillRect(p.x - pBarW * 0.5, p.y - 26, pBarW, 4.5);
  ctx.fillStyle = pRatio > 0.35 ? '#10b981' : '#f43f5e';
  ctx.fillRect(p.x - pBarW * 0.5, p.y - 26, pBarW * pRatio, 4.5);

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

  // 17. Top-Right Minimap Radar
  const mapW = 164;
  const mapH = 124;
  const mapX = viewW - mapW - 14;
  const mapY = 14;

  ctx.save();
  ctx.fillStyle = 'rgba(6, 12, 26, 0.88)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.fillRect(mapX, mapY, mapW, mapH);
  ctx.strokeRect(mapX, mapY, mapW, mapH);

  const worldW = Math.max(1, bounds.maxX - bounds.minX);
  const worldH = Math.max(1, bounds.maxY - bounds.minY);
  const toMiniX = (wx: number) =>
    mapX + 8 + ((wx - bounds.minX) / worldW) * (mapW - 16);
  const toMiniY = (wy: number) =>
    mapY + 8 + ((wy - bounds.minY) / worldH) * (mapH - 16);

  // Roads in minimap
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
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

  // Active Mission in minimap
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

  // Enemies in minimap
  for (const e of st.enemies) {
    ctx.fillStyle = e.isBoss ? '#f43f5e' : 'rgba(248, 113, 113, 0.75)';
    ctx.fillRect(
      toMiniX(e.x) - (e.isBoss ? 2.5 : 1),
      toMiniY(e.y) - (e.isBoss ? 2.5 : 1),
      e.isBoss ? 5 : 2,
      e.isBoss ? 5 : 2
    );
  }

  // Player dot in minimap
  ctx.fillStyle = '#22d3ee';
  ctx.beginPath();
  ctx.arc(toMiniX(p.x), toMiniY(p.y), 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  ctx.restore();
}
