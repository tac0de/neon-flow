import { describe, expect, it } from 'vitest';
import { TrafficSurvivorEngine } from '../survivorEngine';
import { DEFAULT_META_UPGRADES, WEAPON_DEFS } from '../survivorData';

describe('NEON FLOW: GRIDLOCK SURVIVORS Engine Suite', () => {
  it('1. 6종 기체 클래스 및 4종 도시 스테이지, 3D 빌딩 블록이 정상 초기화된다', () => {
    const classes = [
      'INTERCEPTOR',
      'TOW_MECH',
      'SIGNAL_DRONE',
      'EMP_SWEEPER',
      'CYBER_MEDIC',
      'RAIL_ENFORCER',
    ] as const;
    const stages = [
      'COMMUTE_GRID',
      'BRAESS_MAZE',
      'SEOUL_BELTWAY',
      'MEGACITY_HELL',
    ] as const;

    for (const c of classes) {
      for (const s of stages) {
        const engine = new TrafficSurvivorEngine(c, s, DEFAULT_META_UPGRADES);
        const state = engine.getState();
        expect(state.status).toBe('PLAYING');
        expect(state.player.classId).toBe(c);
        expect(state.stageId).toBe(s);
        expect(state.player.weapons.length).toBe(1);
        expect(state.player.hp).toBeGreaterThan(0);
        expect(engine.getCityBlocks().length).toBeGreaterThan(0);
      }
    }
  });

  it('2. AI 자율주행 및 10종 무기(연쇄 스파크·레일건 포함)로 체증 차량을 처치하고 콤보와 피버를 쌓는다', () => {
    const engine = new TrafficSurvivorEngine('RAIL_ENFORCER', 'COMMUTE_GRID', {
      ...DEFAULT_META_UPGRADES,
      damageLevel: 5,
    });

    const st = engine.getState();
    st.player.weapons.push(
      {
        id: 'CHAIN_SIGNAL_ARC',
        level: 4,
        evolved: false,
        cooldownTimer: 0,
        totalDamageDealt: 0,
        kills: 0,
      },
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
      }
    );

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
    expect(after.maxCombo).toBeGreaterThan(0);
    expect(after.player.creditsEarned).toBeGreaterThan(0);
  });

  it('3. 긴급 사이렌 돌파(Space) 및 전 도시 그린웨이브 동기화(Q) 스킬이 정상 작동한다', () => {
    const engine = new TrafficSurvivorEngine(
      'TOW_MECH',
      'COMMUTE_GRID',
      DEFAULT_META_UPGRADES
    );
    const st = engine.getState();
    st.gridlockGauge = 70;

    expect(engine.triggerSirenDash()).toBe(true);
    expect(st.gridlockGauge).toBeLessThan(70);
    expect(engine.triggerSirenDash()).toBe(false);

    const prevGridlock = st.gridlockGauge;
    expect(engine.triggerCitywideOverride()).toBe(true);
    expect(st.gridlockGauge).toBeLessThan(prevGridlock);
    expect(engine.triggerCitywideOverride()).toBe(false);
  });

  it('4. 레벨 5 무기와 시너지 패시브 보유 시 ★궁극 진화 선택지가 생성되고 적용된다', () => {
    const engine = new TrafficSurvivorEngine(
      'INTERCEPTOR',
      'COMMUTE_GRID',
      DEFAULT_META_UPGRADES
    );
    const st = engine.getState();

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

    boss.x = st.player.x + 65;
    boss.y = st.player.y;
    boss.hp = 1;
    st.player.weapons[0].cooldownTimer = 0;

    engine.update(0.05, { moveX: 0, moveY: 0 });

    const chest = st.pickups.find((pk) => pk.kind === 'BOSS_CHEST');
    expect(chest).toBeDefined();

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
