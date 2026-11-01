import { CityNetworkData, NodeData } from '../types/simulation';
import {
  ActiveWeaponInstance,
  AmbientRoadCar,
  CityBuildingBlock,
  EnemyEntity,
  EnemyType,
  MetaUpgradesState,
  PassiveId,
  PickupEntity,
  ProjectileEntity,
  SignalTurretEntity,
  SlashEffect,
  SurvivorClassId,
  SurvivorGameState,
  SurvivorStageId,
  UpgradeChoice,
  WeaponId,
  XpGemEntity,
} from '../types/survivor';
import { BUILTIN_SCENARIOS } from '../data/scenarios';
import {
  ENEMY_ARCHETYPES,
  PASSIVE_DEFS,
  SURVIVOR_CLASSES,
  SURVIVOR_STAGES,
  WEAPON_DEFS,
} from './survivorData';
import { soundEngine } from './soundEngine';

export interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
}

export class TrafficSurvivorEngine {
  private network: CityNetworkData;
  private bounds: WorldBounds;
  private meta: MetaUpgradesState;
  private state: SurvivorGameState;
  private ambientCars: AmbientRoadCar[] = [];
  private cityBlocks: CityBuildingBlock[] = [];

  private nextEntityId = 1;
  private spawnAccumulator = 0;
  private missionCooldownTimer = 4.5;
  private tireTrackTimer = 0;
  private boss1Spawned = false;
  private boss2Spawned = false;
  private boss3Spawned = false;
  private orbitalHitCooldowns: Map<number, number> = new Map();
  private handlingHazmatChain = false;

  constructor(
    classId: SurvivorClassId,
    stageId: SurvivorStageId,
    meta: MetaUpgradesState
  ) {
    this.meta = { ...meta };
    const stageDef = SURVIVOR_STAGES[stageId];
    const factory =
      BUILTIN_SCENARIOS[stageDef.scenarioKey] || BUILTIN_SCENARIOS.commute_rush;
    this.network = factory();
    this.bounds = this.computeWorldBounds(this.network);
    this.state = this.createInitialState(classId, stageId);
    this.initAmbientCars();
    this.initCityBlocks();
  }

  private computeWorldBounds(net: CityNetworkData): WorldBounds {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const n of net.nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }

    const pad = 270;
    return {
      minX: minX - pad,
      maxX: maxX + pad,
      minY: minY - pad,
      maxY: maxY + pad,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    };
  }

  private initAmbientCars(): void {
    this.ambientCars = [];
    const palette = ['#38bdf8', '#22d3ee', '#818cf8', '#34d399'];
    for (const edge of this.network.edges) {
      const count = Math.min(3, Math.max(1, edge.lanes));
      for (let i = 0; i < count; i++) {
        this.ambientCars.push({
          edgeId: edge.id,
          lane: i % edge.lanes,
          progress: (i / count + Math.random() * 0.25) % 1,
          speedFrac: 0.16 + Math.random() * 0.12,
          color: palette[(i + edge.lanes) % palette.length],
        });
      }
    }
  }

  /**
   * Generates decorative cyberpunk city building blocks in open spaces away from roads & intersections.
   */
  private initCityBlocks(): void {
    this.cityBlocks = [];
    const billboards = [
      'NEON FLOW HQ',
      'GRIDLOCK CTRL',
      'GREEN WAVE AI',
      'CYBER TRANSIT',
      'HYPER LOOP 01',
      'SMART SIGNAL',
      'ZERO JAM ZONE',
      'TECHNO TOWER',
    ];
    const colors = ['#22d3ee', '#a855f7', '#ec4899', '#10b981', '#38bdf8', '#f59e0b'];

    let idx = 0;
    for (let x = this.bounds.minX + 60; x <= this.bounds.maxX - 120; x += 135) {
      for (let y = this.bounds.minY + 60; y <= this.bounds.maxY - 120; y += 125) {
        const cx = x + 44;
        const cy = y + 38;
        // Skip if too close to any intersection node or road
        let nearNode = false;
        for (const n of this.network.nodes) {
          if (Math.hypot(cx - n.x, cy - n.y) < 92) {
            nearNode = true;
            break;
          }
        }
        if (nearNode || this.isPointNearRoad(cx, cy, 58)) continue;

        const w = 64 + ((idx * 17) % 28);
        const h = 54 + ((idx * 23) % 24);
        this.cityBlocks.push({
          x: cx - w / 2,
          y: cy - h / 2,
          w,
          h,
          heightFactor: 1 + (idx % 3) * 0.35,
          accentColor: colors[idx % colors.length],
          label: idx % 3 === 0 ? billboards[(idx / 3) % billboards.length | 0] : undefined,
          hasHelipad: idx % 5 === 0,
        });
        idx++;
      }
    }
  }

  private createInitialState(
    classId: SurvivorClassId,
    stageId: SurvivorStageId
  ): SurvivorGameState {
    const cls = SURVIVOR_CLASSES[classId];
    const stage = SURVIVOR_STAGES[stageId];

    const startNode =
      this.network.nodes[Math.floor(this.network.nodes.length / 2)] || {
        x: this.bounds.centerX,
        y: this.bounds.centerY,
      };

    const maxHp = Math.round(cls.baseHp + this.meta.hpLevel * 20);

    return {
      status: 'PLAYING',
      stageId,
      elapsedSeconds: 0,
      clearTimeSeconds: stage.clearTimeSeconds,
      isEndlessOvertime: false,
      waveNumber: 1,
      waveLabel: 'WAVE 1 · 도심 러시아워 유입 시작',
      gridlockGauge: 12,
      gridlockOverloadActive: false,
      smoothFlowBuffActive: true,
      comboCount: 0,
      comboTimer: 0,
      maxCombo: 0,
      feverGauge: 0,
      feverActiveTimer: 0,
      screenShakeTimer: 0,
      screenShakeIntensity: 0,
      missionsCompleted: 0,
      activeBossAlert: null,
      activeBossAlertTimer: 0,
      empPulseVisual: 0,
      orbitalAngle: 0,
      player: {
        classId,
        x: startNode.x,
        y: startNode.y,
        vx: 0,
        vy: 0,
        angle: 0,
        hp: maxHp,
        maxHp,
        shield: 0,
        level: 1,
        xp: 0,
        xpToNext: 45,
        kills: 0,
        creditsEarned: 0,
        rerollsLeft: 2 + Math.floor(this.meta.magnetLevel / 2),
        invulnerableTimer: 1.0,
        sirenDashCooldown: 0,
        sirenDashActiveTimer: 0,
        cityOverrideCooldown: 0,
        onRoadSpeedBoost: true,
        weapons: [
          {
            id: cls.startingWeapon,
            level: 1,
            evolved: false,
            cooldownTimer: 0.1,
            totalDamageDealt: 0,
            kills: 0,
          },
        ],
        passives: {},
      },
      enemies: [],
      projectiles: [],
      slashes: [],
      lasers: [],
      turrets: [],
      gems: [],
      pickups: [],
      floatingTexts: [],
      particles: [],
      tireTracks: [],
      activeMission: null,
      pendingLevelChoices: [],
      pendingChestRewards: [],
    };
  }

  public getNetwork(): CityNetworkData {
    return this.network;
  }

  public getBounds(): WorldBounds {
    return this.bounds;
  }

  public getState(): SurvivorGameState {
    return this.state;
  }

  public getAmbientCars(): AmbientRoadCar[] {
    return this.ambientCars;
  }

  public getCityBlocks(): CityBuildingBlock[] {
    return this.cityBlocks;
  }

  public setStatus(status: SurvivorGameState['status']): void {
    this.state.status = status;
  }

  public enterEndlessOvertime(): void {
    this.state.isEndlessOvertime = true;
    this.state.status = 'PLAYING';
    this.state.player.hp = this.state.player.maxHp;
    this.addFloatingText(
      this.state.player.x,
      this.state.player.y - 30,
      '🔥 무한 야근 러시 돌입!',
      '#22d3ee',
      15
    );
  }

  private triggerScreenShake(intensity: number, duration: number): void {
    this.state.screenShakeIntensity = Math.max(
      this.state.screenShakeIntensity,
      intensity
    );
    this.state.screenShakeTimer = Math.max(this.state.screenShakeTimer, duration);
  }

  // ==================== STAT MULTIPLIERS ====================
  public getDamageMultiplier(): number {
    const cls = SURVIVOR_CLASSES[this.state.player.classId];
    const classMult = cls.bonuses.damageMult ?? 1.0;
    const metaMult = 1 + this.meta.damageLevel * 0.1;
    const passiveLvl = this.state.player.passives.HIGH_VOLTAGE_CELL ?? 0;
    const passiveMult = 1 + passiveLvl * 0.18;
    const feverMult = this.state.feverActiveTimer > 0 ? 1.25 : 1.0;
    return classMult * metaMult * passiveMult * feverMult;
  }

  public getCooldownMultiplier(): number {
    const cls = SURVIVOR_CLASSES[this.state.player.classId];
    const classMult = cls.bonuses.cooldownMult ?? 1.0;
    const metaMult = Math.max(0.65, 1 - this.meta.cooldownLevel * 0.05);
    const passiveLvl = this.state.player.passives.OVERCLOCK_COIL ?? 0;
    const passiveMult = Math.max(0.45, 1 - passiveLvl * 0.1);
    const feverMult = this.state.feverActiveTimer > 0 ? 0.65 : 1.0;
    return classMult * metaMult * passiveMult * feverMult;
  }

  public getAreaMultiplier(): number {
    const cls = SURVIVOR_CLASSES[this.state.player.classId];
    const classMult = cls.bonuses.areaMult ?? 1.0;
    const passiveLvl = this.state.player.passives.AMPLIFIER_RADAR ?? 0;
    const passiveMult = 1 + passiveLvl * 0.16;
    return classMult * passiveMult;
  }

  public getBonusProjectileCount(): number {
    const passiveLvl = this.state.player.passives.MULTI_LANE_CPU ?? 0;
    const feverBonus = this.state.feverActiveTimer > 0 ? 1 : 0;
    if (passiveLvl >= 5) return 3 + feverBonus;
    if (passiveLvl >= 3) return 2 + feverBonus;
    if (passiveLvl >= 1) return 1 + feverBonus;
    return feverBonus;
  }

  public getMoveSpeed(): number {
    const cls = SURVIVOR_CLASSES[this.state.player.classId];
    const classMult = cls.bonuses.speedMult ?? 1.0;
    const metaMult = 1 + this.meta.speedLevel * 0.06;
    const passiveLvl = this.state.player.passives.TURBO_LANE_ENGINE ?? 0;
    const passiveMult = 1 + passiveLvl * 0.12;
    const roadMult = this.state.player.onRoadSpeedBoost ? 1.15 : 1.0;
    const flowMult = this.state.smoothFlowBuffActive ? 1.12 : 1.0;
    const dashMult = this.state.player.sirenDashActiveTimer > 0 ? 1.85 : 1.0;
    const feverMult = this.state.feverActiveTimer > 0 ? 1.22 : 1.0;
    return (
      cls.baseSpeed *
      classMult *
      metaMult *
      passiveMult *
      roadMult *
      flowMult *
      dashMult *
      feverMult
    );
  }

  public getPickupRadius(): number {
    const cls = SURVIVOR_CLASSES[this.state.player.classId];
    const classMult = cls.bonuses.magnetMult ?? 1.0;
    const metaMult = 1 + this.meta.magnetLevel * 0.2;
    const passiveLvl = this.state.player.passives.MAGNET_TRANSPONDER ?? 0;
    const passiveMult = 1 + passiveLvl * 0.35;
    return 95 * classMult * metaMult * passiveMult;
  }

  public getXpMultiplier(): number {
    const metaMult = 1 + this.meta.xpGainLevel * 0.12;
    const flowMult = this.state.smoothFlowBuffActive ? 1.2 : 1.0;
    return metaMult * flowMult;
  }

  // ==================== ACTIVE SKILLS (SIREN DASH & CITY OVERRIDE) ====================
  public triggerSirenDash(): boolean {
    const p = this.state.player;
    if (p.sirenDashCooldown > 0 || this.state.status !== 'PLAYING') {
      return false;
    }

    p.sirenDashCooldown = Math.max(4.5, 9.5 * this.getCooldownMultiplier());
    p.sirenDashActiveTimer = 0.85;
    p.invulnerableTimer = Math.max(p.invulnerableTimer, 1.0);

    soundEngine.playSirenDash();
    this.triggerScreenShake(6, 0.25);

    this.state.gridlockGauge = Math.max(0, this.state.gridlockGauge - 10);
    const shockRadius = 215 * this.getAreaMultiplier();
    const shockDamage = 40 * this.getDamageMultiplier();

    this.slashes.push({
      id: this.nextEntityId++,
      x: p.x,
      y: p.y,
      angle: 0,
      arcRadius: shockRadius,
      arcWidth: Math.PI * 2,
      color: '#22d3ee',
      evolved: true,
      timer: 0.32,
      maxTimer: 0.32,
    });

    for (const enemy of this.state.enemies) {
      const dx = enemy.x - p.x;
      const dy = enemy.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= shockRadius) {
        const nx = dist > 0.1 ? dx / dist : 1;
        const ny = dist > 0.1 ? dy / dist : 0;
        const kb = enemy.isBoss ? 120 : 340;
        enemy.knockbackVx += nx * kb;
        enemy.knockbackVy += ny * kb;
        enemy.slowTimer = Math.max(enemy.slowTimer, 2.2);
        this.damageEnemy(
          enemy,
          shockDamage,
          p.weapons[0]?.id || 'GREEN_WAVE_PULSE'
        );
      }
    }

    this.addFloatingText(p.x, p.y - 26, '🚨 긴급 그린웨이브 돌파!', '#22d3ee', 13);
    return true;
  }

  /**
   * Second tactical skill [Q]: Citywide Green-Wave Signal Override EMP
   */
  public triggerCitywideOverride(): boolean {
    const p = this.state.player;
    if (p.cityOverrideCooldown > 0 || this.state.status !== 'PLAYING') {
      return false;
    }

    p.cityOverrideCooldown = Math.max(9.0, 18.0 * this.getCooldownMultiplier());
    soundEngine.playSignalOptimized();
    this.triggerScreenShake(8, 0.35);

    this.state.gridlockGauge = Math.max(0, this.state.gridlockGauge - 20);

    // Pull all gems within 480m
    for (const g of this.state.gems) {
      if (Math.hypot(g.x - p.x, g.y - p.y) <= 480) {
        g.magnetized = true;
      }
    }

    // Strike up to 10 enemies with green intersection lightning
    const dmg = 62 * this.getDamageMultiplier();
    const targets = [...this.state.enemies]
      .sort(
        (a, b) =>
          Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)
      )
      .slice(0, 10);

    for (const t of targets) {
      this.state.lasers.push({
        id: this.nextEntityId++,
        x1: p.x,
        y1: p.y,
        x2: t.x,
        y2: t.y,
        color: '#10b981',
        width: 4.5,
        timer: 0.32,
        maxTimer: 0.32,
      });
      t.slowTimer = Math.max(t.slowTimer, 3.0);
      this.damageEnemy(t, dmg, p.weapons[0]?.id || 'GREEN_WAVE_PULSE');
    }

    this.slashes.push({
      id: this.nextEntityId++,
      x: p.x,
      y: p.y,
      angle: 0,
      arcRadius: 340,
      arcWidth: Math.PI * 2,
      color: '#10b981',
      evolved: true,
      timer: 0.4,
      maxTimer: 0.4,
    });

    this.addFloatingText(
      p.x,
      p.y - 32,
      '🛰️ 전 도시 그린웨이브 신호 동기화! (-20% 정체)',
      '#10b981',
      14
    );
    return true;
  }

  private get slashes(): SlashEffect[] {
    return this.state.slashes;
  }

  // ==================== AUTONOMOUS AI PILOT ====================
  public computeAutoPilotInput(): { moveX: number; moveY: number } {
    const p = this.state.player;

    let closeEnemies = 0;
    let repelX = 0;
    let repelY = 0;

    for (const e of this.state.enemies) {
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      if (d < 85) {
        closeEnemies++;
      }
      if (d < 175) {
        const weight = ((175 - d) / 175) * (e.isBoss ? 3.2 : 1.3);
        repelX += (dx / d) * weight;
        repelY += (dy / d) * weight;
      }
    }

    if (closeEnemies >= 3 && p.sirenDashCooldown <= 0) {
      this.triggerSirenDash();
    }
    if (
      (this.state.enemies.length >= 12 || this.state.gridlockGauge >= 55) &&
      p.cityOverrideCooldown <= 0
    ) {
      this.triggerCitywideOverride();
    }

    let attractX = 0;
    let attractY = 0;

    for (const pk of this.state.pickups) {
      const dx = pk.x - p.x;
      const dy = pk.y - p.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const priority =
        pk.kind === 'BOSS_CHEST'
          ? 4.0
          : pk.kind === 'REPAIR_KIT' && p.hp < p.maxHp * 0.75
          ? 3.5
          : 2.2;
      attractX += (dx / d) * priority;
      attractY += (dy / d) * priority;
    }

    if (this.state.activeMission) {
      const m = this.state.activeMission;
      const dx = m.x - p.x;
      const dy = m.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > m.radius * 0.45) {
        attractX += (dx / d) * 2.8;
        attractY += (dy / d) * 2.8;
      } else {
        attractX += (-dy / Math.max(1, d)) * 0.9;
        attractY += (dx / Math.max(1, d)) * 0.9;
      }
    } else {
      let bestGemDist = Infinity;
      let gx = 0;
      let gy = 0;
      for (const g of this.state.gems) {
        const d = Math.hypot(g.x - p.x, g.y - p.y);
        if (d < bestGemDist) {
          bestGemDist = d;
          gx = g.x - p.x;
          gy = g.y - p.y;
        }
      }
      if (bestGemDist < 420 && bestGemDist > 1) {
        attractX += (gx / bestGemDist) * 1.4;
        attractY += (gy / bestGemDist) * 1.4;
      } else {
        const cx = this.bounds.centerX - p.x;
        const cy = this.bounds.centerY - p.y;
        const cd = Math.max(1, Math.hypot(cx, cy));
        if (cd > 160) {
          attractX += (cx / cd) * 1.1;
          attractY += (cy / cd) * 1.1;
        }
      }
    }

    const margin = 120;
    if (p.x < this.bounds.minX + margin) repelX += 2.5;
    if (p.x > this.bounds.maxX - margin) repelX -= 2.5;
    if (p.y < this.bounds.minY + margin) repelY += 2.5;
    if (p.y > this.bounds.maxY - margin) repelY -= 2.5;

    const totalX = repelX * 1.35 + attractX;
    const totalY = repelY * 1.35 + attractY;
    const len = Math.hypot(totalX, totalY);
    if (len < 0.05) return { moveX: 0, moveY: 0 };
    return { moveX: totalX / len, moveY: totalY / len };
  }

  // ==================== MAIN SIMULATION STEP ====================
  public update(dt: number, input: { moveX: number; moveY: number }): void {
    if (this.state.status !== 'PLAYING') return;

    const clampedDt = Math.min(0.05, Math.max(0.001, dt));
    this.state.elapsedSeconds += clampedDt;

    if (this.state.activeBossAlertTimer > 0) {
      this.state.activeBossAlertTimer = Math.max(
        0,
        this.state.activeBossAlertTimer - clampedDt
      );
      if (this.state.activeBossAlertTimer <= 0) {
        this.state.activeBossAlert = null;
      }
    }

    if (this.state.screenShakeTimer > 0) {
      this.state.screenShakeTimer = Math.max(
        0,
        this.state.screenShakeTimer - clampedDt
      );
      if (this.state.screenShakeTimer <= 0) {
        this.state.screenShakeIntensity = 0;
      }
    }

    if (this.state.comboTimer > 0) {
      this.state.comboTimer = Math.max(0, this.state.comboTimer - clampedDt);
      if (this.state.comboTimer <= 0) {
        this.state.comboCount = 0;
      }
    }

    if (this.state.feverActiveTimer > 0) {
      this.state.feverActiveTimer = Math.max(
        0,
        this.state.feverActiveTimer - clampedDt
      );
    }

    for (const ac of this.ambientCars) {
      ac.progress = (ac.progress + ac.speedFrac * clampedDt) % 1;
    }

    // 1. Update Player movement & timers
    this.updatePlayer(clampedDt, input);

    // 2. Update Wave progression & Enemy Spawning
    this.updateWaveAndSpawns(clampedDt);

    // 3. Update Intersection Signal Optimization Missions
    this.updateIntersectionMission(clampedDt);

    // 4. Fire & update Weapons
    this.updateWeapons(clampedDt);

    // 5. Update Projectiles, Turrets, Slashes, Lasers
    this.updateProjectilesAndEffects(clampedDt);

    // 6. Update Enemies & Collisions
    this.updateEnemies(clampedDt);

    // 7. Update XP Gems & Pickups
    this.updateGemsAndPickups(clampedDt);

    // 8. Update City Gridlock Gauge
    this.updateGridlockSystem(clampedDt);

    // 9. Check Victory condition at 180s (if not in Endless Overtime)
    if (
      !this.state.isEndlessOvertime &&
      this.state.elapsedSeconds >= this.state.clearTimeSeconds
    ) {
      const hasLivingFinalBoss = this.state.enemies.some(
        (e) => e.type === 'BOSS_BRAESS'
      );
      if (!hasLivingFinalBoss) {
        this.state.status = 'VICTORY';
        soundEngine.playSignalOptimized();
      }
    }
  }

  private updatePlayer(
    dt: number,
    input: { moveX: number; moveY: number }
  ): void {
    const p = this.state.player;

    if (p.invulnerableTimer > 0) {
      p.invulnerableTimer = Math.max(0, p.invulnerableTimer - dt);
    }
    if (p.sirenDashCooldown > 0) {
      p.sirenDashCooldown = Math.max(0, p.sirenDashCooldown - dt);
    }
    if (p.sirenDashActiveTimer > 0) {
      p.sirenDashActiveTimer = Math.max(0, p.sirenDashActiveTimer - dt);
    }
    if (p.cityOverrideCooldown > 0) {
      p.cityOverrideCooldown = Math.max(0, p.cityOverrideCooldown - dt);
    }

    // Passive HP regeneration from MAGNET_TRANSPONDER or CYBER_MEDIC class
    const magnetLv = p.passives.MAGNET_TRANSPONDER ?? 0;
    const medicRegen = p.classId === 'CYBER_MEDIC' ? 1.5 : 0;
    if ((magnetLv > 0 || medicRegen > 0) && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + (magnetLv * 1.4 + medicRegen) * dt);
    }

    p.onRoadSpeedBoost = this.isPointNearRoad(p.x, p.y, 26);

    const speed = this.getMoveSpeed();
    const mag = Math.hypot(input.moveX, input.moveY);
    const nx = mag > 0.01 ? input.moveX / mag : 0;
    const ny = mag > 0.01 ? input.moveY / mag : 0;

    p.vx = nx * speed;
    p.vy = ny * speed;
    p.x = Math.max(
      this.bounds.minX + 30,
      Math.min(this.bounds.maxX - 30, p.x + p.vx * dt)
    );
    p.y = Math.max(
      this.bounds.minY + 30,
      Math.min(this.bounds.maxY - 30, p.y + p.vy * dt)
    );

    if (mag > 0.05) {
      p.angle = Math.atan2(ny, nx);
      this.tireTrackTimer -= dt;
      if (this.tireTrackTimer <= 0 && this.state.tireTracks.length < 70) {
        this.tireTrackTimer = 0.055;
        this.state.tireTracks.push({
          x: p.x - Math.cos(p.angle) * 14,
          y: p.y - Math.sin(p.angle) * 14,
          angle: p.angle,
          color:
            this.state.feverActiveTimer > 0
              ? '#10b981'
              : p.sirenDashActiveTimer > 0
              ? '#fde047'
              : SURVIVOR_CLASSES[p.classId].color,
          timer: 1.1,
        });
      }
    }

    this.state.tireTracks = this.state.tireTracks.filter((tr) => {
      tr.timer -= dt;
      return tr.timer > 0;
    });
  }

  private isPointNearRoad(wx: number, wy: number, threshold: number): boolean {
    const nm = new Map<string, NodeData>();
    for (const n of this.network.nodes) nm.set(n.id, n);

    for (const e of this.network.edges) {
      const a = nm.get(e.from);
      const b = nm.get(e.to);
      if (!a || !b) continue;
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const l2 = vx * vx + vy * vy;
      if (l2 === 0) continue;
      const t = Math.max(
        0,
        Math.min(1, ((wx - a.x) * vx + (wy - a.y) * vy) / l2)
      );
      const px = a.x + t * vx;
      const py = a.y + t * vy;
      if (Math.hypot(wx - px, wy - py) <= threshold) {
        return true;
      }
    }
    return false;
  }

  // ==================== WAVE & ENEMY SPAWNING ====================
  private updateWaveAndSpawns(dt: number): void {
    const t = this.state.elapsedSeconds;
    const stage = SURVIVOR_STAGES[this.state.stageId];

    if (t < 35) {
      this.state.waveNumber = 1;
      this.state.waveLabel = 'WAVE 1 · 출근길 세단 & 칼치기 택시 유입';
    } else if (t < 75) {
      this.state.waveNumber = 2;
      this.state.waveLabel = 'WAVE 2 · 교차로 꼬리물기 SUV & 유폭 탱크로리';
    } else if (t < 120) {
      this.state.waveNumber = 3;
      this.state.waveLabel = 'WAVE 3 · 불법주정차 탑차 & 폭주 슈퍼카 출몰';
    } else if (t < 180) {
      this.state.waveNumber = 4;
      this.state.waveLabel = 'WAVE 4 · 도심 그리드락 피크 & 과적 트레일러';
    } else {
      this.state.waveNumber = 5 + Math.floor((t - 180) / 45);
      this.state.waveLabel = `OVERTIME WAVE ${this.state.waveNumber} · 무한 야근 대정체`;
    }

    if (!this.boss1Spawned && t >= 45) {
      this.boss1Spawned = true;
      this.spawnBoss('BOSS_JUGGERNAUT');
    }
    if (!this.boss2Spawned && t >= 100) {
      this.boss2Spawned = true;
      this.spawnBoss('BOSS_BUS_TITAN');
    }
    if (!this.boss3Spawned && t >= 150) {
      this.boss3Spawned = true;
      this.spawnBoss('BOSS_BRAESS');
    }

    const maxActiveEnemies = 165;
    if (this.state.enemies.length >= maxActiveEnemies) return;

    const baseRate =
      (2.5 + Math.min(7.8, t * 0.044)) * stage.spawnRateMult;
    this.spawnAccumulator += baseRate * dt;

    while (
      this.spawnAccumulator >= 1 &&
      this.state.enemies.length < maxActiveEnemies
    ) {
      this.spawnAccumulator -= 1;
      const enemyType = this.pickEnemyTypeForTime(t);
      const isElite = Math.random() < Math.min(0.17, 0.03 + t * 0.0007);
      this.spawnEnemy(enemyType, isElite);
    }
  }

  private pickEnemyTypeForTime(t: number): EnemyType {
    const r = Math.random();
    if (t < 35) {
      if (r < 0.08) return 'HAZMAT_TANKER';
      return r < 0.45 ? 'CUT_IN_TAXI' : 'RUSH_SEDAN';
    } else if (t < 75) {
      if (r < 0.12) return 'HAZMAT_TANKER';
      if (r < 0.35) return 'CUT_IN_TAXI';
      if (r < 0.72) return 'RUSH_SEDAN';
      return 'SPILLBACK_SUV';
    } else if (t < 125) {
      if (r < 0.12) return 'HAZMAT_TANKER';
      if (r < 0.28) return 'CUT_IN_TAXI';
      if (r < 0.52) return 'SPILLBACK_SUV';
      if (r < 0.78) return 'DOUBLE_PARK_VAN';
      return 'ROGUE_RACER';
    } else {
      if (r < 0.12) return 'HAZMAT_TANKER';
      if (r < 0.3) return 'ROGUE_RACER';
      if (r < 0.52) return 'SPILLBACK_SUV';
      if (r < 0.75) return 'DOUBLE_PARK_VAN';
      return 'OVERLOAD_TRUCK';
    }
  }

  private spawnEnemy(type: EnemyType, isElite: boolean): void {
    const arch = ENEMY_ARCHETYPES[type];
    const stage = SURVIVOR_STAGES[this.state.stageId];
    const p = this.state.player;

    const angle = Math.random() * Math.PI * 2;
    const dist = 390 + Math.random() * 150;
    const sx = Math.max(
      this.bounds.minX + 20,
      Math.min(this.bounds.maxX - 20, p.x + Math.cos(angle) * dist)
    );
    const sy = Math.max(
      this.bounds.minY + 20,
      Math.min(this.bounds.maxY - 20, p.y + Math.sin(angle) * dist)
    );

    const timeScale = 1 + this.state.elapsedSeconds * 0.0075;
    const eliteMult = isElite ? 2.2 : 1.0;
    const hp = Math.round(arch.baseHp * stage.enemyHpMult * timeScale * eliteMult);

    this.state.enemies.push({
      id: this.nextEntityId++,
      type,
      name: isElite ? `⚡ 정예 ${arch.name}` : arch.name,
      x: sx,
      y: sy,
      vx: 0,
      vy: 0,
      angle: 0,
      hp,
      maxHp: hp,
      speed: arch.baseSpeed * (isElite ? 1.08 : 1.0),
      radius: arch.radius * (isElite ? 1.2 : 1.0),
      contactDamage: arch.contactDamage * (isElite ? 1.25 : 1.0),
      xpValue: Math.round(arch.xpValue * (isElite ? 2.5 : 1.0)),
      creditValue: Math.round(arch.creditValue * (isElite ? 3 : 1)),
      color: arch.color,
      isBoss: false,
      isElite,
      hitFlashTimer: 0,
      slowTimer: 0,
      knockbackVx: 0,
      knockbackVy: 0,
      specialCooldown: type === 'ROGUE_RACER' ? 2.5 : undefined,
    });
  }

  public spawnBoss(type: EnemyType): EnemyEntity {
    const arch = ENEMY_ARCHETYPES[type];
    const stage = SURVIVOR_STAGES[this.state.stageId];
    const p = this.state.player;

    const angle = Math.random() * Math.PI * 2;
    const sx = Math.max(
      this.bounds.minX + 60,
      Math.min(this.bounds.maxX - 60, p.x + Math.cos(angle) * 420)
    );
    const sy = Math.max(
      this.bounds.minY + 60,
      Math.min(this.bounds.maxY - 60, p.y + Math.sin(angle) * 420)
    );

    const hp = Math.round(arch.baseHp * stage.enemyHpMult);
    const boss: EnemyEntity = {
      id: this.nextEntityId++,
      type,
      name: arch.name,
      x: sx,
      y: sy,
      vx: 0,
      vy: 0,
      angle: 0,
      hp,
      maxHp: hp,
      speed: arch.baseSpeed,
      radius: arch.radius,
      contactDamage: arch.contactDamage,
      xpValue: arch.xpValue,
      creditValue: arch.creditValue,
      color: arch.color,
      isBoss: true,
      isElite: true,
      hitFlashTimer: 0,
      slowTimer: 0,
      knockbackVx: 0,
      knockbackVy: 0,
      specialCooldown: 3.5,
    };

    this.state.enemies.push(boss);
    this.state.activeBossAlert = `${arch.name} 출현! 처치 시 과태료 보물상자 드롭!`;
    this.state.activeBossAlertTimer = 5.0;
    this.triggerScreenShake(9, 0.45);
    soundEngine.playBossAlert();
    return boss;
  }

  // ==================== INTERSECTION SIGNAL OPTIMIZATION MISSION ====================
  private updateIntersectionMission(dt: number): void {
    const p = this.state.player;

    if (!this.state.activeMission) {
      this.missionCooldownTimer -= dt;
      if (this.missionCooldownTimer <= 0 && this.network.nodes.length > 0) {
        const candidate =
          this.network.nodes[
            Math.floor(Math.random() * this.network.nodes.length)
          ];
        this.state.activeMission = {
          nodeId: candidate.id,
          nodeName: candidate.name,
          x: candidate.x,
          y: candidate.y,
          radius: 74,
          progress: 0,
          requiredSeconds: 2.1,
          timeRemaining: 28,
          rewardXp: 75 + this.state.waveNumber * 25,
          rewardCredits: 28 + this.state.waveNumber * 8,
        };
        this.addFloatingText(
          candidate.x,
          candidate.y - 34,
          `🚨 [${candidate.name}] 신호 마비 발생!`,
          '#f59e0b',
          13
        );
      }
      return;
    }

    const m = this.state.activeMission;
    m.timeRemaining -= dt;
    if (m.timeRemaining <= 0) {
      this.state.gridlockGauge = Math.min(100, this.state.gridlockGauge + 12);
      this.addFloatingText(
        m.x,
        m.y - 24,
        '⚠️ 교차로 신호 복구 실패 (+정체도)',
        '#f43f5e',
        12
      );
      this.state.activeMission = null;
      this.missionCooldownTimer = 9.0;
      return;
    }

    const dist = Math.hypot(p.x - m.x, p.y - m.y);
    if (dist <= m.radius) {
      m.progress = Math.min(1, m.progress + dt / m.requiredSeconds);
      if (m.progress >= 1) {
        this.completeIntersectionMission(m);
      }
    } else {
      m.progress = Math.max(0, m.progress - dt * 0.25);
    }
  }

  private completeIntersectionMission(
    m: NonNullable<SurvivorGameState['activeMission']>
  ): void {
    const p = this.state.player;
    soundEngine.playSignalOptimized();
    this.triggerScreenShake(7, 0.35);

    this.state.missionsCompleted += 1;
    this.state.gridlockGauge = Math.max(0, this.state.gridlockGauge - 28);
    p.hp = Math.min(p.maxHp, p.hp + 25);
    p.creditsEarned += m.rewardCredits;
    this.grantXp(m.rewardXp);

    this.slashes.push({
      id: this.nextEntityId++,
      x: m.x,
      y: m.y,
      angle: 0,
      arcRadius: 295,
      arcWidth: Math.PI * 2,
      color: '#10b981',
      evolved: true,
      timer: 0.45,
      maxTimer: 0.45,
    });

    const waveDmg = 100 * this.getDamageMultiplier();
    for (const enemy of this.state.enemies) {
      const d = Math.hypot(enemy.x - m.x, enemy.y - m.y);
      if (d <= 295) {
        this.damageEnemy(
          enemy,
          waveDmg,
          p.weapons[0]?.id || 'GREEN_WAVE_PULSE'
        );
        const nx = d > 0.1 ? (enemy.x - m.x) / d : 1;
        const ny = d > 0.1 ? (enemy.y - m.y) / d : 0;
        enemy.knockbackVx += nx * 320;
        enemy.knockbackVy += ny * 320;
      }
    }

    this.addFloatingText(
      m.x,
      m.y - 32,
      `⚡ ${m.nodeName} 신호 연동 완료! (-28% 정체 · +${m.rewardCredits}G)`,
      '#10b981',
      14
    );

    this.state.activeMission = null;
    this.missionCooldownTimer = 10.5;
  }

  // ==================== WEAPON EXECUTION ====================
  private updateWeapons(dt: number): void {
    const p = this.state.player;
    const cdMult = this.getCooldownMultiplier();
    const dmgMult = this.getDamageMultiplier();
    const areaMult = this.getAreaMultiplier();
    const bonusCount = this.getBonusProjectileCount();

    this.state.orbitalAngle = (this.state.orbitalAngle + dt * 3.5) % (Math.PI * 2);
    if (this.state.empPulseVisual > 0) {
      this.state.empPulseVisual = Math.max(0, this.state.empPulseVisual - dt * 2.2);
    }

    for (const [eid, timer] of this.orbitalHitCooldowns.entries()) {
      if (timer - dt <= 0) {
        this.orbitalHitCooldowns.delete(eid);
      } else {
        this.orbitalHitCooldowns.set(eid, timer - dt);
      }
    }

    for (const w of p.weapons) {
      const def = WEAPON_DEFS[w.id];

      if (w.id === 'ROUNDABOUT_ORBITAL') {
        this.processRoundaboutOrbitals(w, def, dmgMult, areaMult, bonusCount);
      }

      w.cooldownTimer -= dt;
      if (w.cooldownTimer > 0) continue;

      const levelSpeedFactor = Math.max(0.62, 1 - (w.level - 1) * 0.07);
      w.cooldownTimer =
        def.baseCooldown * levelSpeedFactor * cdMult * (w.evolved ? 0.72 : 1.0);

      const levelDmgFactor = 1 + (w.level - 1) * 0.32 + (w.evolved ? 0.65 : 0);
      const damage = def.baseDamage * levelDmgFactor * dmgMult;
      const count =
        def.baseCount +
        Math.floor(w.level / 2) +
        bonusCount +
        (w.evolved ? 2 : 0);

      switch (w.id) {
        case 'GREEN_WAVE_PULSE':
          this.fireGreenWavePulse(w, damage, count, areaMult);
          break;
        case 'TOW_WHIP':
          this.fireTowWhip(w, damage, areaMult);
          break;
        case 'EMP_AURA':
          this.fireEmpAura(w, damage, areaMult);
          break;
        case 'SPEED_CAMERA_LASER':
          this.fireSpeedCameraLaser(w, damage, count, areaMult);
          break;
        case 'DETOUR_MISSILE':
          this.fireDetourMissiles(w, damage, count, areaMult);
          break;
        case 'HIPASS_BOOMERANG':
          this.fireHiPassBoomerang(w, damage, count, areaMult);
          break;
        case 'SIGNAL_TURRET':
          this.deploySignalTurret(w, damage, areaMult);
          break;
        case 'CHAIN_SIGNAL_ARC':
          this.fireChainSignalArc(w, damage, count, areaMult);
          break;
        case 'RAILGUN_BEAM':
          this.fireRailgunBeam(w, damage, areaMult);
          break;
        case 'ROUNDABOUT_ORBITAL':
          break;
      }
    }
  }

  private fireGreenWavePulse(
    w: ActiveWeaponInstance,
    damage: number,
    count: number,
    areaMult: number
  ): void {
    if (this.state.enemies.length === 0) return;
    const p = this.state.player;
    const sorted = [...this.state.enemies].sort(
      (a, b) =>
        Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)
    );

    soundEngine.playShootPulse();
    const pierce =
      (w.level >= 2 ? 2 : 1) + (w.level >= 5 ? 2 : 0) + (w.evolved ? 4 : 0);
    const speed = w.evolved ? 550 : 440;

    for (let i = 0; i < count; i++) {
      const target = sorted[i % sorted.length];
      const baseAngle = Math.atan2(target.y - p.y, target.x - p.x);
      const spread = count > 1 ? (i - (count - 1) / 2) * 0.11 : 0;
      const ang = baseAngle + spread;

      this.state.projectiles.push({
        id: this.nextEntityId++,
        weaponId: w.id,
        kind: 'PULSE',
        x: p.x,
        y: p.y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        radius: (w.evolved ? 9.5 : 7) * areaMult,
        damage,
        pierce,
        hitEnemyIds: new Set(),
        lifeTimer: 1.5,
        maxLife: 1.5,
        color: w.evolved ? '#34d399' : '#10b981',
        evolved: w.evolved,
      });
    }
  }

  private fireTowWhip(
    w: ActiveWeaponInstance,
    damage: number,
    areaMult: number
  ): void {
    const p = this.state.player;
    soundEngine.playWhipSlash();

    const radius =
      WEAPON_DEFS.TOW_WHIP.baseArea *
      (1 + (w.level - 1) * 0.12) *
      areaMult *
      (w.evolved ? 1.3 : 1.0);

    const directions = w.evolved
      ? [0]
      : w.level >= 2
      ? [p.angle, p.angle + Math.PI]
      : [p.angle];

    const arcWidth = w.evolved ? Math.PI * 2 : Math.PI * 0.85;

    for (const dir of directions) {
      this.slashes.push({
        id: this.nextEntityId++,
        x: p.x,
        y: p.y,
        angle: dir,
        arcRadius: radius,
        arcWidth,
        color: w.evolved ? '#f43f5e' : '#f59e0b',
        evolved: w.evolved,
        timer: 0.22,
        maxTimer: 0.22,
      });

      for (const e of this.state.enemies) {
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > radius + e.radius) continue;

        if (!w.evolved) {
          const angToEnemy = Math.atan2(dy, dx);
          const diff = Math.abs(
            Math.atan2(Math.sin(angToEnemy - dir), Math.cos(angToEnemy - dir))
          );
          if (diff > arcWidth * 0.55) continue;
        }

        this.damageEnemy(e, damage, w.id);
        const nx = dist > 0.1 ? dx / dist : 1;
        const ny = dist > 0.1 ? dy / dist : 0;
        const kb = e.isBoss ? 70 : 210;
        e.knockbackVx += nx * kb;
        e.knockbackVy += ny * kb;
      }
    }

    if (w.evolved && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + 2.5);
    }
  }

  private processRoundaboutOrbitals(
    w: ActiveWeaponInstance,
    def: (typeof WEAPON_DEFS)['ROUNDABOUT_ORBITAL'],
    dmgMult: number,
    areaMult: number,
    bonusCount: number
  ): void {
    const p = this.state.player;
    const count =
      def.baseCount + (w.level - 1) + bonusCount + (w.evolved ? 2 : 0);
    const orbitRadius = def.baseArea * (1 + (w.level - 1) * 0.08) * areaMult;
    const orbSize = (w.evolved ? 17 : 13) * areaMult;
    const damage =
      def.baseDamage *
      (1 + (w.level - 1) * 0.3 + (w.evolved ? 0.6 : 0)) *
      dmgMult;

    for (let i = 0; i < count; i++) {
      const ang = this.state.orbitalAngle + (i * Math.PI * 2) / count;
      const ox = p.x + Math.cos(ang) * orbitRadius;
      const oy = p.y + Math.sin(ang) * orbitRadius;

      for (const e of this.state.enemies) {
        if (this.orbitalHitCooldowns.has(e.id)) continue;
        const dist = Math.hypot(e.x - ox, e.y - oy);
        if (dist <= orbSize + e.radius) {
          this.orbitalHitCooldowns.set(e.id, 0.28);
          this.damageEnemy(e, damage, w.id);
          const dCenter = Math.max(1, Math.hypot(e.x - p.x, e.y - p.y));
          const nx = (e.x - p.x) / dCenter;
          const ny = (e.y - p.y) / dCenter;
          e.knockbackVx += nx * (e.isBoss ? 40 : 125);
          e.knockbackVy += ny * (e.isBoss ? 40 : 125);
        }
      }
    }
  }

  private fireEmpAura(
    w: ActiveWeaponInstance,
    damage: number,
    areaMult: number
  ): void {
    const p = this.state.player;
    const radius =
      WEAPON_DEFS.EMP_AURA.baseArea *
      (1 + (w.level - 1) * 0.15) *
      areaMult *
      (w.evolved ? 1.28 : 1.0);

    this.state.empPulseVisual = 1.0;
    if (w.evolved) {
      this.state.gridlockGauge = Math.max(0, this.state.gridlockGauge - 0.6);
    }

    for (const e of this.state.enemies) {
      const dist = Math.hypot(e.x - p.x, e.y - p.y);
      if (dist <= radius + e.radius) {
        this.damageEnemy(e, damage, w.id);
        e.slowTimer = Math.max(e.slowTimer, w.evolved ? 1.8 : 1.1);
      }
    }
  }

  private fireSpeedCameraLaser(
    w: ActiveWeaponInstance,
    damage: number,
    count: number,
    areaMult: number
  ): void {
    if (this.state.enemies.length === 0) return;
    soundEngine.playLaserStrike();

    const p = this.state.player;
    const inRange = this.state.enemies.filter(
      (e) => Math.hypot(e.x - p.x, e.y - p.y) <= 520
    );
    const pool = inRange.length > 0 ? inRange : this.state.enemies;
    const sorted = [...pool].sort((a, b) => b.hp - a.hp);

    const splashRadius =
      WEAPON_DEFS.SPEED_CAMERA_LASER.baseArea *
      areaMult *
      (w.evolved ? 1.35 : 1.0);
    const strikeCount = Math.min(sorted.length, Math.max(1, count - 1));

    for (let i = 0; i < strikeCount; i++) {
      const target = sorted[i];
      this.state.lasers.push({
        id: this.nextEntityId++,
        x1: target.x,
        y1: target.y - 260,
        x2: target.x,
        y2: target.y,
        color: w.evolved ? '#fb7185' : '#f43f5e',
        width: w.evolved ? 6 : 4,
        timer: 0.24,
        maxTimer: 0.24,
      });

      for (const e of this.state.enemies) {
        const d = Math.hypot(e.x - target.x, e.y - target.y);
        if (d <= splashRadius + e.radius) {
          const factor = e.id === target.id ? 1.0 : 0.65;
          this.damageEnemy(e, damage * factor, w.id);
        }
      }
    }
  }

  private fireDetourMissiles(
    w: ActiveWeaponInstance,
    damage: number,
    count: number,
    areaMult: number
  ): void {
    if (this.state.enemies.length === 0) return;
    const p = this.state.player;
    const aoeRadius =
      WEAPON_DEFS.DETOUR_MISSILE.baseArea * areaMult * (w.evolved ? 1.3 : 1.0);

    for (let i = 0; i < count; i++) {
      const target = this.state.enemies[(i * 3) % this.state.enemies.length];
      const ang =
        Math.atan2(target.y - p.y, target.x - p.x) +
        (Math.random() - 0.5) * 0.5;
      const speed = w.evolved ? 360 : 290;

      this.state.projectiles.push({
        id: this.nextEntityId++,
        weaponId: w.id,
        kind: 'MISSILE',
        x: p.x,
        y: p.y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        radius: 7.5 * areaMult,
        damage,
        pierce: 1,
        hitEnemyIds: new Set(),
        lifeTimer: 2.2,
        maxLife: 2.2,
        color: w.evolved ? '#7dd3fc' : '#38bdf8',
        evolved: w.evolved,
        aoeRadius,
      });
    }
  }

  private fireHiPassBoomerang(
    w: ActiveWeaponInstance,
    damage: number,
    count: number,
    areaMult: number
  ): void {
    const p = this.state.player;
    const baseAng = p.angle;
    const speed = w.evolved ? 430 : 350;

    for (let i = 0; i < count; i++) {
      const ang = baseAng + (i * Math.PI * 2) / Math.max(1, count);
      this.state.projectiles.push({
        id: this.nextEntityId++,
        weaponId: w.id,
        kind: 'BOOMERANG',
        x: p.x,
        y: p.y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        radius: (w.evolved ? 19 : 14) * areaMult,
        damage,
        pierce: 999,
        hitEnemyIds: new Set(),
        lifeTimer: 1.7,
        maxLife: 1.7,
        color: w.evolved ? '#5eead4' : '#2dd4bf',
        evolved: w.evolved,
        returning: false,
      });
    }
  }

  private deploySignalTurret(
    w: ActiveWeaponInstance,
    damage: number,
    areaMult: number
  ): void {
    const p = this.state.player;
    const maxTurrets = w.evolved ? 4 : 2 + (w.level >= 4 ? 1 : 0);
    if (this.state.turrets.length >= maxTurrets) {
      this.state.turrets.shift();
    }

    const life = w.level >= 3 ? 11.0 : 8.5;
    this.state.turrets.push({
      id: this.nextEntityId++,
      x: p.x + (Math.random() - 0.5) * 36,
      y: p.y + (Math.random() - 0.5) * 36,
      radius: WEAPON_DEFS.SIGNAL_TURRET.baseArea * areaMult,
      fireTimer: 0.15,
      fireInterval: w.evolved ? 0.32 : w.level >= 2 ? 0.48 : 0.65,
      damage,
      lifeTimer: life,
      maxLife: life,
      evolved: w.evolved,
    });
  }

  /**
   * NEW WEAPON: CHAIN_SIGNAL_ARC (신호등 연쇄 스파크)
   */
  private fireChainSignalArc(
    w: ActiveWeaponInstance,
    damage: number,
    count: number,
    areaMult: number
  ): void {
    if (this.state.enemies.length === 0) return;
    const p = this.state.player;
    const jumpRange =
      WEAPON_DEFS.CHAIN_SIGNAL_ARC.baseArea *
      areaMult *
      (1 + (w.level - 1) * 0.08);
    const maxJumps = count + (w.level >= 2 ? 1 : 0) + (w.evolved ? 3 : 0);

    const visited = new Set<number>();
    let currX = p.x;
    let currY = p.y;

    soundEngine.playShootPulse();

    for (let j = 0; j < maxJumps; j++) {
      let bestTarget: EnemyEntity | null = null;
      let bestDist = j === 0 ? 320 : jumpRange;

      for (const e of this.state.enemies) {
        if (visited.has(e.id) || e.hp <= 0) continue;
        const d = Math.hypot(e.x - currX, e.y - currY);
        if (d <= bestDist) {
          bestDist = d;
          bestTarget = e;
        }
      }

      if (!bestTarget) break;
      visited.add(bestTarget.id);

      this.state.lasers.push({
        id: this.nextEntityId++,
        x1: currX,
        y1: currY,
        x2: bestTarget.x,
        y2: bestTarget.y,
        color: w.evolved ? '#6ee7b7' : '#34d399',
        width: w.evolved ? 4.2 : 3.0,
        timer: 0.2,
        maxTimer: 0.2,
      });

      currX = bestTarget.x;
      currY = bestTarget.y;

      if (w.level >= 5 || w.evolved) {
        bestTarget.slowTimer = Math.max(bestTarget.slowTimer, 1.5);
      }
      this.damageEnemy(bestTarget, damage * Math.pow(0.92, j), w.id);
    }
  }

  /**
   * NEW WEAPON: RAILGUN_BEAM (초전도 차선 레일건)
   */
  private fireRailgunBeam(
    w: ActiveWeaponInstance,
    damage: number,
    areaMult: number
  ): void {
    const p = this.state.player;
    soundEngine.playLaserStrike();

    let baseAngle = p.angle;
    if (this.state.enemies.length > 0) {
      let nearest = this.state.enemies[0];
      let bestD = Infinity;
      for (const e of this.state.enemies) {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < bestD) {
          bestD = d;
          nearest = e;
        }
      }
      baseAngle = Math.atan2(nearest.y - p.y, nearest.x - p.x);
    }

    const beamLen =
      WEAPON_DEFS.RAILGUN_BEAM.baseArea *
      (1 + (w.level - 1) * 0.1) *
      areaMult;
    const beamHalfWidth = (w.evolved ? 24 : 15) * areaMult;

    const angles = w.evolved
      ? [
          baseAngle,
          baseAngle + Math.PI,
          baseAngle + Math.PI / 2,
          baseAngle - Math.PI / 2,
        ]
      : w.level >= 3
      ? [baseAngle, baseAngle + Math.PI]
      : [baseAngle];

    if (w.level >= 5 || w.evolved) {
      this.state.gridlockGauge = Math.max(0, this.state.gridlockGauge - 1.2);
    }

    for (const ang of angles) {
      const ux = Math.cos(ang);
      const uy = Math.sin(ang);
      const endX = p.x + ux * beamLen;
      const endY = p.y + uy * beamLen;

      this.state.lasers.push({
        id: this.nextEntityId++,
        x1: p.x,
        y1: p.y,
        x2: endX,
        y2: endY,
        color: w.evolved ? '#fde047' : '#60a5fa',
        width: w.evolved ? 8 : 5.5,
        timer: 0.26,
        maxTimer: 0.26,
      });

      for (const e of this.state.enemies) {
        const vx = e.x - p.x;
        const vy = e.y - p.y;
        const proj = vx * ux + vy * uy;
        if (proj < -e.radius || proj > beamLen + e.radius) continue;
        const perp = Math.abs(vx * -uy + vy * ux);
        if (perp <= beamHalfWidth + e.radius) {
          this.damageEnemy(e, damage, w.id);
        }
      }
    }
  }

  // ==================== PROJECTILES, TURRETS & EFFECTS ====================
  private updateProjectilesAndEffects(dt: number): void {
    const p = this.state.player;

    const nextTurrets: SignalTurretEntity[] = [];
    for (const t of this.state.turrets) {
      t.lifeTimer -= dt;
      if (t.lifeTimer <= 0) continue;

      if (t.evolved) {
        this.state.gridlockGauge = Math.max(
          0,
          this.state.gridlockGauge - 0.35 * dt
        );
      }

      t.fireTimer -= dt;
      if (t.fireTimer <= 0 && this.state.enemies.length > 0) {
        t.fireTimer = t.fireInterval;
        let nearest: EnemyEntity | null = null;
        let bestD = t.radius;
        for (const e of this.state.enemies) {
          const d = Math.hypot(e.x - t.x, e.y - t.y);
          if (d <= bestD) {
            bestD = d;
            nearest = e;
          }
        }
        if (nearest) {
          const ang = Math.atan2(nearest.y - t.y, nearest.x - t.x);
          this.state.projectiles.push({
            id: this.nextEntityId++,
            weaponId: 'SIGNAL_TURRET',
            kind: 'TURRET_BOLT',
            x: t.x,
            y: t.y,
            vx: Math.cos(ang) * 440,
            vy: Math.sin(ang) * 440,
            radius: 5.5,
            damage: t.damage,
            pierce: t.evolved ? 3 : 1,
            hitEnemyIds: new Set(),
            lifeTimer: 0.9,
            maxLife: 0.9,
            color: t.evolved ? '#fde047' : '#eab308',
            evolved: t.evolved,
          });
        }
      }
      nextTurrets.push(t);
    }
    this.state.turrets = nextTurrets;

    const nextProjectiles: ProjectileEntity[] = [];
    for (const proj of this.state.projectiles) {
      proj.lifeTimer -= dt;
      if (proj.lifeTimer <= 0) continue;

      if (proj.kind === 'MISSILE' && this.state.enemies.length > 0) {
        let nearest = this.state.enemies[0];
        let bestD = Infinity;
        for (const e of this.state.enemies) {
          const d = Math.hypot(e.x - proj.x, e.y - proj.y);
          if (d < bestD) {
            bestD = d;
            nearest = e;
          }
        }
        const desiredAng = Math.atan2(nearest.y - proj.y, nearest.x - proj.x);
        const speed = Math.hypot(proj.vx, proj.vy);
        const curAng = Math.atan2(proj.vy, proj.vx);
        const diff = Math.atan2(
          Math.sin(desiredAng - curAng),
          Math.cos(desiredAng - curAng)
        );
        const newAng = curAng + Math.max(-5.5 * dt, Math.min(5.5 * dt, diff));
        proj.vx = Math.cos(newAng) * speed;
        proj.vy = Math.sin(newAng) * speed;
      } else if (proj.kind === 'BOOMERANG') {
        if (!proj.returning && proj.lifeTimer < proj.maxLife * 0.52) {
          proj.returning = true;
          proj.hitEnemyIds.clear();
        }
        if (proj.returning) {
          const dx = p.x - proj.x;
          const dy = p.y - proj.y;
          const d = Math.max(1, Math.hypot(dx, dy));
          const speed = proj.evolved ? 460 : 380;
          proj.vx = (dx / d) * speed;
          proj.vy = (dy / d) * speed;
          if (d < 22) continue;
        }
      }

      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;

      if (proj.isEnemyProjectile) {
        const distToPlayer = Math.hypot(proj.x - p.x, proj.y - p.y);
        if (distToPlayer <= proj.radius + 14) {
          this.damagePlayer(proj.damage);
          continue;
        }
        nextProjectiles.push(proj);
        continue;
      }

      let consumed = false;
      for (const e of this.state.enemies) {
        if (proj.hitEnemyIds.has(e.id)) continue;
        const d = Math.hypot(e.x - proj.x, e.y - proj.y);
        if (d <= proj.radius + e.radius) {
          proj.hitEnemyIds.add(e.id);

          if (proj.kind === 'MISSILE' && proj.aoeRadius) {
            this.slashes.push({
              id: this.nextEntityId++,
              x: proj.x,
              y: proj.y,
              angle: 0,
              arcRadius: proj.aoeRadius,
              arcWidth: Math.PI * 2,
              color: proj.color,
              evolved: proj.evolved,
              timer: 0.2,
              maxTimer: 0.2,
            });
            for (const other of this.state.enemies) {
              if (
                Math.hypot(other.x - proj.x, other.y - proj.y) <=
                proj.aoeRadius + other.radius
              ) {
                this.damageEnemy(other, proj.damage, proj.weaponId);
              }
            }
            consumed = true;
            break;
          } else {
            this.damageEnemy(e, proj.damage, proj.weaponId);
            proj.pierce -= 1;
            if (proj.pierce <= 0) {
              consumed = true;
              break;
            }
          }
        }
      }

      if (!consumed) {
        nextProjectiles.push(proj);
      }
    }
    this.state.projectiles = nextProjectiles;

    this.state.slashes = this.state.slashes.filter((s) => {
      s.timer -= dt;
      return s.timer > 0;
    });
    this.state.lasers = this.state.lasers.filter((l) => {
      l.timer -= dt;
      return l.timer > 0;
    });
    this.state.floatingTexts = this.state.floatingTexts.filter((ft) => {
      ft.y += ft.vy * dt;
      ft.timer -= dt;
      return ft.timer > 0;
    });
    this.state.particles = this.state.particles.filter((pt) => {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.timer -= dt;
      return pt.timer > 0;
    });
  }

  // ==================== ENEMY AI, BOSS SKILLS & DAMAGE ====================
  private updateEnemies(dt: number): void {
    const p = this.state.player;
    const surviving: EnemyEntity[] = [];

    for (const e of this.state.enemies) {
      if (e.hp <= 0) continue;

      if (e.hitFlashTimer > 0)
        e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);
      if (e.slowTimer > 0) e.slowTimer = Math.max(0, e.slowTimer - dt);

      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      e.angle = Math.atan2(dy, dx);

      let speedMult = e.slowTimer > 0 ? 0.55 : 1.0;

      if (e.type === 'ROGUE_RACER' && e.specialCooldown !== undefined) {
        e.specialCooldown -= dt;
        if (e.specialCooldown <= 0) {
          e.specialCooldown = 4.2;
          e.chargePhaseTimer = 0.85;
          e.chargeTargetX = p.x + (dx / dist) * 140;
          e.chargeTargetY = p.y + (dy / dist) * 140;
        }
        if (e.chargePhaseTimer && e.chargePhaseTimer > 0) {
          e.chargePhaseTimer -= dt;
          speedMult = e.chargePhaseTimer > 0.35 ? 0.25 : 2.35;
        }
      }

      if (e.isBoss && e.specialCooldown !== undefined) {
        e.specialCooldown -= dt;
        if (e.specialCooldown <= 0) {
          e.specialCooldown = e.type === 'BOSS_BRAESS' ? 3.2 : 4.5;
          const boltCount = e.type === 'BOSS_BRAESS' ? 8 : 5;
          for (let b = 0; b < boltCount; b++) {
            const ang = e.angle + ((b - (boltCount - 1) / 2) * Math.PI) / 6;
            this.state.projectiles.push({
              id: this.nextEntityId++,
              weaponId: 'GREEN_WAVE_PULSE',
              kind: 'BOSS_HAZARD',
              x: e.x,
              y: e.y,
              vx: Math.cos(ang) * 210,
              vy: Math.sin(ang) * 210,
              radius: 8,
              damage: 14,
              pierce: 1,
              hitEnemyIds: new Set(),
              lifeTimer: 2.6,
              maxLife: 2.6,
              color: '#f43f5e',
              evolved: false,
              isEnemyProjectile: true,
            });
          }
        }
      }

      const moveSpeed = e.speed * speedMult;
      e.vx = (dx / dist) * moveSpeed + e.knockbackVx;
      e.vy = (dy / dist) * moveSpeed + e.knockbackVy;

      e.knockbackVx *= Math.pow(0.04, dt);
      e.knockbackVy *= Math.pow(0.04, dt);

      e.x += e.vx * dt;
      e.y += e.vy * dt;

      for (const other of surviving) {
        const ox = e.x - other.x;
        const oy = e.y - other.y;
        const od = Math.hypot(ox, oy);
        const minGap = (e.radius + other.radius) * 0.82;
        if (od > 0.01 && od < minGap) {
          const push = (minGap - od) * 0.35;
          e.x += (ox / od) * push;
          e.y += (oy / od) * push;
        }
      }

      const playerDist = Math.hypot(p.x - e.x, p.y - e.y);
      if (playerDist <= e.radius + 14) {
        this.damagePlayer(e.contactDamage);
      }

      surviving.push(e);
    }

    this.state.enemies = surviving;
  }

  private damageEnemy(
    enemy: EnemyEntity,
    rawDamage: number,
    sourceWeaponId: WeaponId
  ): void {
    if (enemy.hp <= 0) return;

    const dmg = Math.max(1, Math.round(rawDamage));
    enemy.hp -= dmg;
    enemy.hitFlashTimer = 0.12;

    const weaponInst = this.state.player.weapons.find(
      (w) => w.id === sourceWeaponId
    );
    if (weaponInst) {
      weaponInst.totalDamageDealt += dmg;
    }

    if (this.state.floatingTexts.length < 48) {
      this.addFloatingText(
        enemy.x + (Math.random() - 0.5) * 14,
        enemy.y - enemy.radius - 4,
        `${dmg}`,
        enemy.isBoss ? '#fb7185' : '#f8fafc',
        enemy.isBoss ? 13 : 11
      );
    }

    if (enemy.hp <= 0) {
      this.handleEnemyKilled(enemy, weaponInst);
    }
  }

  private handleEnemyKilled(
    enemy: EnemyEntity,
    weaponInst?: ActiveWeaponInstance
  ): void {
    const p = this.state.player;
    p.kills += 1;
    if (weaponInst) {
      weaponInst.kills += 1;
    }

    // Update Combo & Fever Gauge
    this.state.comboCount += 1;
    this.state.comboTimer = 3.4;
    if (this.state.comboCount > this.state.maxCombo) {
      this.state.maxCombo = this.state.comboCount;
    }

    if (this.state.feverActiveTimer <= 0) {
      this.state.feverGauge = Math.min(
        100,
        this.state.feverGauge + (enemy.isBoss ? 35 : 2.5)
      );
      if (this.state.feverGauge >= 100) {
        this.state.feverGauge = 0;
        this.state.feverActiveTimer = 8.0;
        soundEngine.playSignalOptimized();
        this.addFloatingText(
          p.x,
          p.y - 38,
          '🔥 GREEN-WAVE FEVER TIME! (8초간 초고속 연사·가속!)',
          '#fde047',
          15
        );
      }
    }

    const creditGain = Math.max(
      1,
      Math.round(
        enemy.creditValue *
          SURVIVOR_STAGES[this.state.stageId].creditBonusMult *
          this.getXpMultiplier()
      )
    );
    p.creditsEarned += creditGain;

    this.state.gridlockGauge = Math.max(
      0,
      this.state.gridlockGauge - (enemy.isBoss ? 18 : 0.45)
    );

    // HAZMAT_TANKER Chain Explosion!
    if (enemy.type === 'HAZMAT_TANKER' && !this.handlingHazmatChain) {
      this.handlingHazmatChain = true;
      const blastRadius = 140;
      const blastDmg = 95 * this.getDamageMultiplier();
      this.triggerScreenShake(5, 0.22);

      this.slashes.push({
        id: this.nextEntityId++,
        x: enemy.x,
        y: enemy.y,
        angle: 0,
        arcRadius: blastRadius,
        arcWidth: Math.PI * 2,
        color: '#84cc16',
        evolved: true,
        timer: 0.35,
        maxTimer: 0.35,
      });

      this.addFloatingText(
        enemy.x,
        enemy.y - 24,
        '☢️ 탱크로리 유폭!',
        '#bef264',
        13
      );

      for (const other of this.state.enemies) {
        if (other.id !== enemy.id && other.hp > 0) {
          const d = Math.hypot(other.x - enemy.x, other.y - enemy.y);
          if (d <= blastRadius + other.radius) {
            this.damageEnemy(
              other,
              blastDmg,
              p.weapons[0]?.id || 'GREEN_WAVE_PULSE'
            );
          }
        }
      }
      this.handlingHazmatChain = false;
    }

    const pCount = enemy.isBoss ? 22 : 7;
    for (let i = 0; i < pCount && this.state.particles.length < 160; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 45 + Math.random() * 140;
      this.state.particles.push({
        id: this.nextEntityId++,
        x: enemy.x,
        y: enemy.y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        radius: enemy.isBoss ? 4.8 : 3.0,
        color: enemy.color,
        timer: 0.4,
        maxTimer: 0.4,
      });
    }

    const tier: XpGemEntity['tier'] =
      enemy.xpValue >= 50
        ? 'ROSE'
        : enemy.xpValue >= 30
        ? 'AMBER'
        : enemy.xpValue >= 15
        ? 'EMERALD'
        : 'CYAN';

    this.state.gems.push({
      id: this.nextEntityId++,
      x: enemy.x,
      y: enemy.y,
      value: enemy.xpValue,
      tier,
      magnetized: false,
    });

    if (enemy.isBoss) {
      this.triggerScreenShake(10, 0.5);
      this.state.pickups.push({
        id: this.nextEntityId++,
        kind: 'BOSS_CHEST',
        x: enemy.x,
        y: enemy.y,
        radius: 18,
        pulsePhase: 0,
      });
      this.addFloatingText(
        enemy.x,
        enemy.y - 26,
        '🎁 보스 격파! 과태료 보물상자 드롭!',
        '#fbbf24',
        15
      );
    } else if (enemy.isElite && Math.random() < 0.28) {
      this.state.pickups.push({
        id: this.nextEntityId++,
        kind: Math.random() < 0.65 ? 'REPAIR_KIT' : 'GREEN_WAVE_MAGNET',
        x: enemy.x,
        y: enemy.y,
        radius: 14,
        pulsePhase: 0,
      });
    }
  }

  private damagePlayer(rawDamage: number): void {
    const p = this.state.player;
    if (p.invulnerableTimer > 0) return;

    const cls = SURVIVOR_CLASSES[p.classId];
    const mitigated = Math.max(2, Math.round(rawDamage - cls.armor));
    p.hp = Math.max(0, p.hp - mitigated);
    p.invulnerableTimer = 0.45;
    this.triggerScreenShake(5, 0.18);

    this.addFloatingText(p.x, p.y - 22, `-${mitigated} HP`, '#f43f5e', 13);

    if (p.hp <= 0) {
      this.state.status = 'GAME_OVER';
    }
  }

  // ==================== XP GEMS, PICKUPS & LEVEL UP ====================
  private updateGemsAndPickups(dt: number): void {
    const p = this.state.player;
    const pickupRadius = this.getPickupRadius();

    const remainingGems: XpGemEntity[] = [];
    for (const g of this.state.gems) {
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= pickupRadius) {
        g.magnetized = true;
      }

      if (g.magnetized) {
        const pullSpeed = 480;
        if (dist <= 18) {
          soundEngine.playGemPickup();
          this.grantXp(Math.round(g.value * this.getXpMultiplier()));
          continue;
        }
        g.x += (dx / dist) * pullSpeed * dt;
        g.y += (dy / dist) * pullSpeed * dt;
      }

      remainingGems.push(g);
    }
    this.state.gems = remainingGems;

    const remainingPickups: PickupEntity[] = [];
    for (const pk of this.state.pickups) {
      pk.pulsePhase += dt * 4;
      const dist = Math.hypot(p.x - pk.x, p.y - pk.y);
      if (dist <= pk.radius + 20) {
        this.collectPickup(pk);
      } else {
        remainingPickups.push(pk);
      }
    }
    this.state.pickups = remainingPickups;
  }

  private collectPickup(pk: PickupEntity): void {
    const p = this.state.player;
    if (pk.kind === 'REPAIR_KIT') {
      const heal = 40;
      p.hp = Math.min(p.maxHp, p.hp + heal);
      soundEngine.playSignalOptimized();
      this.addFloatingText(
        p.x,
        p.y - 24,
        `🔧 긴급 수리 +${heal} HP`,
        '#10b981',
        13
      );
    } else if (pk.kind === 'GREEN_WAVE_MAGNET') {
      for (const g of this.state.gems) {
        g.magnetized = true;
      }
      this.state.gridlockGauge = Math.max(0, this.state.gridlockGauge - 18);
      soundEngine.playSignalOptimized();
      this.addFloatingText(
        p.x,
        p.y - 24,
        '🧲 전 도시 하이패스 자력 동기화!',
        '#22d3ee',
        14
      );
    } else if (pk.kind === 'BOSS_CHEST') {
      this.openBossChest();
    }
  }

  private grantXp(amount: number): void {
    const p = this.state.player;
    p.xp += amount;

    if (p.xp >= p.xpToNext && this.state.status === 'PLAYING') {
      p.xp -= p.xpToNext;
      p.level += 1;
      p.xpToNext = Math.round(p.xpToNext * 1.24 + 22);
      soundEngine.playLevelUp();
      this.state.pendingLevelChoices = this.generateUpgradeChoices(3);
      this.state.status = 'LEVEL_UP';
    }
  }

  // ==================== UPGRADE & EVOLUTION GENERATOR ====================
  public generateUpgradeChoices(count = 3): UpgradeChoice[] {
    const p = this.state.player;
    const pool: UpgradeChoice[] = [];

    for (const w of p.weapons) {
      const def = WEAPON_DEFS[w.id];
      const hasSynergy = (p.passives[def.synergyPassive] ?? 0) >= 1;
      if (w.level >= def.maxLevel && !w.evolved && hasSynergy) {
        pool.push({
          key: `EVOLVE_${w.id}`,
          kind: 'WEAPON_EVOLVE',
          weaponId: w.id,
          title: `${def.iconCode} ${def.evolvedName}`,
          subtitle: `궁극 진화 (${def.name} + ${PASSIVE_DEFS[def.synergyPassive].name})`,
          description: def.evolvedDescription,
          currentLevel: w.level,
          nextLevel: 6,
          color: def.evolvedColor,
          isEvolution: true,
        });
      }
    }

    for (const w of p.weapons) {
      const def = WEAPON_DEFS[w.id];
      if (w.level < def.maxLevel) {
        const nextLv = w.level + 1;
        const synPassive = PASSIVE_DEFS[def.synergyPassive];
        pool.push({
          key: `W_UP_${w.id}`,
          kind: 'WEAPON_UPGRADE',
          weaponId: w.id,
          title: `${def.iconCode} ${def.name}`,
          subtitle: `무기 강화 Lv.${w.level} → Lv.${nextLv}`,
          description:
            def.levelDescriptions[nextLv - 1] || '공격력 및 연사 성능 강화',
          currentLevel: w.level,
          nextLevel: nextLv,
          color: def.color,
          synergyHint: `진화 조합: ${synPassive.name}`,
        });
      }
    }

    if (p.weapons.length < 6) {
      const ownedIds = new Set(p.weapons.map((w) => w.id));
      for (const def of Object.values(WEAPON_DEFS)) {
        if (!ownedIds.has(def.id)) {
          const synPassive = PASSIVE_DEFS[def.synergyPassive];
          pool.push({
            key: `W_NEW_${def.id}`,
            kind: 'WEAPON_NEW',
            weaponId: def.id,
            title: `${def.iconCode} ${def.name}`,
            subtitle: '신규 교통 통제 무기 장착',
            description: def.description,
            currentLevel: 0,
            nextLevel: 1,
            color: def.color,
            synergyHint: `진화 조합: ${synPassive.name}`,
          });
        }
      }
    }

    const ownedPassiveCount = Object.keys(p.passives).length;
    for (const pDef of Object.values(PASSIVE_DEFS)) {
      const curLv = p.passives[pDef.id] ?? 0;
      if (curLv > 0 && curLv < pDef.maxLevel) {
        pool.push({
          key: `P_UP_${pDef.id}`,
          kind: 'PASSIVE_UPGRADE',
          passiveId: pDef.id,
          title: `${pDef.iconCode} ${pDef.name}`,
          subtitle: `보조 모듈 Lv.${curLv} → Lv.${curLv + 1} (${pDef.statPerLevelLabel})`,
          description: pDef.description,
          currentLevel: curLv,
          nextLevel: curLv + 1,
          color: pDef.color,
          synergyHint: `시너지 무기: ${WEAPON_DEFS[pDef.synergyWeapon].name}`,
        });
      } else if (curLv === 0 && ownedPassiveCount < 6) {
        pool.push({
          key: `P_NEW_${pDef.id}`,
          kind: 'PASSIVE_NEW',
          passiveId: pDef.id,
          title: `${pDef.iconCode} ${pDef.name}`,
          subtitle: `신규 보조 모듈 (${pDef.statPerLevelLabel})`,
          description: pDef.description,
          currentLevel: 0,
          nextLevel: 1,
          color: pDef.color,
          synergyHint: `시너지 무기: ${WEAPON_DEFS[pDef.synergyWeapon].name}`,
        });
      }
    }

    const evolutions = pool.filter((c) => c.isEvolution);
    const others = pool
      .filter((c) => !c.isEvolution)
      .sort(() => Math.random() - 0.5);

    const chosen = [...evolutions, ...others].slice(0, count);

    while (chosen.length < count) {
      chosen.push({
        key: `REPAIR_${chosen.length}`,
        kind: 'EMERGENCY_REPAIR',
        title: '🔧 긴급 정비 & 과태료 보너스',
        subtitle: '즉시 효과',
        description: '차량 내구도를 45 회복하고 통행 크레딧 +35G를 획득합니다.',
        currentLevel: 0,
        nextLevel: 1,
        color: '#10b981',
      });
    }

    return chosen;
  }

  public applyUpgradeChoice(choice: UpgradeChoice): void {
    const p = this.state.player;

    if (choice.kind === 'WEAPON_NEW' && choice.weaponId) {
      p.weapons.push({
        id: choice.weaponId,
        level: 1,
        evolved: false,
        cooldownTimer: 0.1,
        totalDamageDealt: 0,
        kills: 0,
      });
    } else if (choice.kind === 'WEAPON_UPGRADE' && choice.weaponId) {
      const target = p.weapons.find((w) => w.id === choice.weaponId);
      if (target) {
        target.level = Math.min(
          WEAPON_DEFS[target.id].maxLevel,
          target.level + 1
        );
      }
    } else if (choice.kind === 'WEAPON_EVOLVE' && choice.weaponId) {
      const target = p.weapons.find((w) => w.id === choice.weaponId);
      if (target) {
        target.level = 6;
        target.evolved = true;
        this.addFloatingText(
          p.x,
          p.y - 34,
          `★ 무기 진화: ${WEAPON_DEFS[target.id].evolvedName}!`,
          '#fde047',
          15
        );
      }
    } else if (
      (choice.kind === 'PASSIVE_NEW' || choice.kind === 'PASSIVE_UPGRADE') &&
      choice.passiveId
    ) {
      const cur = p.passives[choice.passiveId] ?? 0;
      p.passives[choice.passiveId] = Math.min(
        PASSIVE_DEFS[choice.passiveId].maxLevel,
        cur + 1
      );
    } else if (choice.kind === 'EMERGENCY_REPAIR') {
      p.hp = Math.min(p.maxHp, p.hp + 45);
      p.creditsEarned += 35;
    }

    this.state.pendingLevelChoices = [];
    this.state.status = 'PLAYING';
  }

  public rerollLevelChoices(): boolean {
    const p = this.state.player;
    if (p.rerollsLeft <= 0 || this.state.status !== 'LEVEL_UP') return false;
    p.rerollsLeft -= 1;
    this.state.pendingLevelChoices = this.generateUpgradeChoices(3);
    return true;
  }

  private openBossChest(): void {
    soundEngine.playSignalOptimized();
    const rewards = this.generateUpgradeChoices(2);
    for (const r of rewards) {
      this.applyUpgradeChoice(r);
    }
    this.state.player.creditsEarned += 60;
    this.state.player.hp = Math.min(
      this.state.player.maxHp,
      this.state.player.hp + 35
    );
    this.state.pendingChestRewards = rewards;
    this.state.status = 'CHEST_OPEN';
  }

  public closeChestModal(): void {
    this.state.pendingChestRewards = [];
    this.state.status = 'PLAYING';
  }

  // ==================== CITY GRIDLOCK GAUGE ====================
  private updateGridlockSystem(dt: number): void {
    const enemyPressure = this.state.enemies.length * 0.085;
    const naturalDecay = 1.65;
    const delta = (enemyPressure - naturalDecay) * dt;

    this.state.gridlockGauge = Math.max(
      0,
      Math.min(100, this.state.gridlockGauge + delta)
    );

    this.state.smoothFlowBuffActive = this.state.gridlockGauge <= 35;
    this.state.gridlockOverloadActive = this.state.gridlockGauge >= 95;

    if (this.state.gridlockOverloadActive) {
      this.state.player.hp = Math.max(0, this.state.player.hp - 3.5 * dt);
      if (this.state.player.hp <= 0) {
        this.state.status = 'GAME_OVER';
      }
    }
  }

  private addFloatingText(
    x: number,
    y: number,
    text: string,
    color: string,
    size = 12
  ): void {
    this.state.floatingTexts.push({
      id: this.nextEntityId++,
      x,
      y,
      vy: -26,
      text,
      color,
      size,
      timer: 0.75,
      maxTimer: 0.75,
    });
  }
}
