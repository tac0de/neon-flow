import { describe, expect, it } from 'vitest';
import { TrafficSurvivorEngine } from '../survivorEngine';
import { DEFAULT_META_UPGRADES, WEAPON_DEFS } from '../survivorData';

describe('NEON FLOW: GRIDLOCK SURVIVORS Engine Suite', () => {
  it('1. 4종 기체 클래스 및 3종 도시 스테이지가 정상 초기화된다', () => {
    const classes = [
      'INTERCEPTOR',
      'TOW_MECH',
      'SIGNAL_DRONE',
      'EMP_SWEEPER',
    ] as const;
    const stages = ['COMMUTE_GRID', 'BRAESS_MAZE', 'MEGACITY_HELL'] as const;

    for (const c of classes) {
      for (const s of stages) {
        const engine = new TrafficSurvivorEngine(c, s, DEFAULT_META_UPGRADES);
        const state = engine.getState();
        expect(state.status).toBe('PLAYING');
        expect(state.player.classId).toBe(c);
        expect(state.stageId).toBe(s);
        expect(state.player.weapons.length).toBe(1);
        expect(state.player.hp).toBeGreaterThan(0);
      }
    }
  });

  it('2. AI 자율주행 및 자동 무기 사격으로 체증 차량을 처치하고 경험치 젬을 획득한다', () => {
    const engine = new TrafficSurvivorEngine(
      'INTERCEPTOR',
      'COMMUTE_GRID',
      {
        ...DEFAULT_META_UPGRADES,
        damageLevel: 5,
      }
    );

    // Equip extra weapons so combat clears enemies rapidly
    const st = engine.getState();
    st.player.weapons.push(
      {
        id: 'EMP_AURA',
        level: 4,
        evolved: false,
        cooldownTimer: 0,
        totalDamageDealt: 0,
        kills: 0,
      },
      {
        id: 'ROUNDABOUT_ORBITAL',
        level: 4,
        evolved: false,
        cooldownTimer: 0,
        totalDamageDealt: 0,
        kills: 0,
      },
      {
        id: 'SPEED_CAMERA_LASER',
        level: 4,
        evolved: false,
        cooldownTimer: 0,
        totalDamageDealt: 0,
        kills: 0,
      }
    );

    // Simulate 25 seconds of gameplay at dt=0.05s
    for (let i = 0; i < 500; i++) {
      if (engine.getState().status === 'LEVEL_UP') {
        const choice = engine.getState().pendingLevelChoices[0];
        if (choice) engine.applyUpgradeChoice(choice);
      }
      const aiInput = engine.computeAutoPilotInput();
      engine.update(0.05, aiInput);
    }

    const after = engine.getState();
    expect(after.elapsedSeconds).toBeGreaterThan(20);
    expect(after.player.kills).toBeGreaterThan(0);
    expect(after.player.creditsEarned).toBeGreaterThan(0);
  });

  it('3. 긴급 사이렌 돌파(Siren Dash)가 정체 게이지를 낮추고 쿨타임을 적용한다', () => {
    const engine = new TrafficSurvivorEngine(
      'TOW_MECH',
      'COMMUTE_GRID',
      DEFAULT_META_UPGRADES
    );
    const st = engine.getState();
    st.gridlockGauge = 55;

    const triggered = engine.triggerSirenDash();
    expect(triggered).toBe(true);
    expect(st.gridlockGauge).toBeLessThan(55);
    expect(st.player.sirenDashCooldown).toBeGreaterThan(0);
    expect(st.player.invulnerableTimer).toBeGreaterThan(0);

    // Cannot trigger again immediately while on cooldown
    expect(engine.triggerSirenDash()).toBe(false);
  });

  it('4. 레벨 5 무기와 시너지 패시브 보유 시 ★궁극 진화 선택지가 생성되고 적용된다', () => {
    const engine = new TrafficSurvivorEngine(
      'INTERCEPTOR',
      'COMMUTE_GRID',
      DEFAULT_META_UPGRADES
    );
    const st = engine.getState();

    // Set starting weapon GREEN_WAVE_PULSE to max level (5) and add its synergy passive OVERCLOCK_COIL
    st.player.weapons[0].level = WEAPON_DEFS.GREEN_WAVE_PULSE.maxLevel;
    st.player.passives.OVERCLOCK_COIL = 1;

    const choices = engine.generateUpgradeChoices(3);
    const evoChoice = choices.find((c) => c.kind === 'WEAPON_EVOLVE');
    expect(evoChoice).toBeDefined();
    expect(evoChoice?.weaponId).toBe('GREEN_WAVE_PULSE');
    expect(evoChoice?.isEvolution).toBe(true);

    engine.applyUpgradeChoice(evoChoice!);
    expect(st.player.weapons[0].evolved).toBe(true);
    expect(st.player.weapons[0].level).toBe(6);
  });

  it('5. 보스 차량 처치 시 과태료 보물상자(BOSS_CHEST)가 드롭되고 획득 시 보상이 지급된다', () => {
    const engine = new TrafficSurvivorEngine(
      'EMP_SWEEPER',
      'COMMUTE_GRID',
      DEFAULT_META_UPGRADES
    );
    const st = engine.getState();

    const boss = engine.spawnBoss('BOSS_JUGGERNAUT');
    expect(st.activeBossAlert).toContain('트레일러');

    // Move boss within EMP_AURA radius (105m) but outside immediate chest pickup radius (38m)
    boss.x = st.player.x + 65;
    boss.y = st.player.y;
    boss.hp = 1;
    st.player.weapons[0].cooldownTimer = 0;

    engine.update(0.05, { moveX: 0, moveY: 0 });

    const chest = st.pickups.find((pk) => pk.kind === 'BOSS_CHEST');
    expect(chest).toBeDefined();

    // Move player onto chest to collect it
    st.player.x = chest!.x;
    st.player.y = chest!.y;
    engine.update(0.05, { moveX: 0, moveY: 0 });

    expect(st.status).toBe('CHEST_OPEN');
    expect(st.pendingChestRewards.length).toBeGreaterThan(0);
    engine.closeChestModal();
    expect(st.status).toBe('PLAYING');
  });

  it('6. 교차로 신호 마비 미션 구역 안에서 대기하면 신호 연동 최적화가 완료된다', () => {
    const engine = new TrafficSurvivorEngine(
      'SIGNAL_DRONE',
      'COMMUTE_GRID',
      DEFAULT_META_UPGRADES
    );
    const st = engine.getState();

    // Advance until activeMission spawns
    for (let i = 0; i < 120 && !st.activeMission; i++) {
      engine.update(0.05, { moveX: 0, moveY: 0 });
    }
    expect(st.activeMission).not.toBeNull();

    const mission = st.activeMission!;
    st.player.x = mission.x;
    st.player.y = mission.y;
    st.gridlockGauge = 60;

    for (let i = 0; i < 60 && st.activeMission; i++) {
      if (st.status === 'LEVEL_UP') {
        engine.applyUpgradeChoice(st.pendingLevelChoices[0]);
      }
      st.player.x = mission.x;
      st.player.y = mission.y;
      engine.update(0.05, { moveX: 0, moveY: 0 });
    }

    expect(st.missionsCompleted).toBe(1);
    expect(st.gridlockGauge).toBeLessThan(45);
  });
});
