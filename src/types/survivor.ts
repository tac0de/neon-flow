export type SurvivorClassId =
  | 'INTERCEPTOR'
  | 'TOW_MECH'
  | 'SIGNAL_DRONE'
  | 'EMP_SWEEPER';

export type SurvivorStageId =
  | 'COMMUTE_GRID'
  | 'BRAESS_MAZE'
  | 'MEGACITY_HELL';

export type WeaponId =
  | 'GREEN_WAVE_PULSE'
  | 'TOW_WHIP'
  | 'ROUNDABOUT_ORBITAL'
  | 'EMP_AURA'
  | 'SPEED_CAMERA_LASER'
  | 'DETOUR_MISSILE'
  | 'HIPASS_BOOMERANG'
  | 'SIGNAL_TURRET';

export type PassiveId =
  | 'OVERCLOCK_COIL'
  | 'AMPLIFIER_RADAR'
  | 'TURBO_LANE_ENGINE'
  | 'MULTI_LANE_CPU'
  | 'HIGH_VOLTAGE_CELL'
  | 'MAGNET_TRANSPONDER';

export type EnemyType =
  | 'CUT_IN_TAXI'
  | 'RUSH_SEDAN'
  | 'SPILLBACK_SUV'
  | 'DOUBLE_PARK_VAN'
  | 'ROGUE_RACER'
  | 'OVERLOAD_TRUCK'
  | 'BOSS_JUGGERNAUT'
  | 'BOSS_BUS_TITAN'
  | 'BOSS_BRAESS';

export interface SurvivorClassDef {
  id: SurvivorClassId;
  name: string;
  subtitle: string;
  description: string;
  color: string;
  accentColor: string;
  startingWeapon: WeaponId;
  baseHp: number;
  baseSpeed: number; // m/s in world coordinates
  armor: number;
  perkLabel: string;
  bonuses: {
    damageMult?: number;
    cooldownMult?: number;
    areaMult?: number;
    speedMult?: number;
    magnetMult?: number;
  };
}

export interface SurvivorStageDef {
  id: SurvivorStageId;
  name: string;
  subtitle: string;
  description: string;
  difficultyLabel: string;
  difficultyStars: number;
  scenarioKey: string;
  enemyHpMult: number;
  spawnRateMult: number;
  creditBonusMult: number;
  clearTimeSeconds: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  evolvedName: string;
  evolvedDescription: string;
  synergyPassive: PassiveId;
  description: string;
  color: string;
  evolvedColor: string;
  baseDamage: number;
  baseCooldown: number;
  baseArea: number;
  baseCount: number;
  maxLevel: number; // 5 (level 6 = evolved)
  levelDescriptions: string[];
}

export interface PassiveDef {
  id: PassiveId;
  name: string;
  description: string;
  color: string;
  maxLevel: number;
  statPerLevelLabel: string;
  synergyWeapon: WeaponId;
}

export interface ActiveWeaponInstance {
  id: WeaponId;
  level: number; // 1..5, 6 = Evolved!
  evolved: boolean;
  cooldownTimer: number;
  totalDamageDealt: number;
  kills: number;
}

export interface UpgradeChoice {
  key: string;
  kind: 'WEAPON_NEW' | 'WEAPON_UPGRADE' | 'WEAPON_EVOLVE' | 'PASSIVE_NEW' | 'PASSIVE_UPGRADE' | 'EMERGENCY_REPAIR';
  weaponId?: WeaponId;
  passiveId?: PassiveId;
  title: string;
  subtitle: string;
  description: string;
  currentLevel: number;
  nextLevel: number;
  color: string;
  isEvolution?: boolean;
  synergyHint?: string;
}

export interface SurvivorPlayer {
  classId: SurvivorClassId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  shield: number;
  level: number;
  xp: number;
  xpToNext: number;
  kills: number;
  creditsEarned: number;
  rerollsLeft: number;
  invulnerableTimer: number;
  sirenDashCooldown: number;
  sirenDashActiveTimer: number;
  onRoadSpeedBoost: boolean;
  weapons: ActiveWeaponInstance[];
  passives: Partial<Record<PassiveId, number>>;
}

export interface EnemyEntity {
  id: number;
  type: EnemyType;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  contactDamage: number;
  xpValue: number;
  creditValue: number;
  color: string;
  isBoss: boolean;
  isElite: boolean;
  hitFlashTimer: number;
  slowTimer: number;
  knockbackVx: number;
  knockbackVy: number;
  chargePhaseTimer?: number;
  chargeTargetX?: number;
  chargeTargetY?: number;
  specialCooldown?: number;
}

export interface ProjectileEntity {
  id: number;
  weaponId: WeaponId;
  kind: 'PULSE' | 'MISSILE' | 'BOOMERANG' | 'BOSS_HAZARD' | 'TURRET_BOLT';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  pierce: number;
  hitEnemyIds: Set<number>;
  lifeTimer: number;
  maxLife: number;
  color: string;
  evolved: boolean;
  returning?: boolean;
  aoeRadius?: number;
  isEnemyProjectile?: boolean;
}

export interface SlashEffect {
  id: number;
  x: number;
  y: number;
  angle: number;
  arcRadius: number;
  arcWidth: number;
  color: string;
  evolved: boolean;
  timer: number;
  maxTimer: number;
}

export interface LaserBeamEffect {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  timer: number;
  maxTimer: number;
}

export interface SignalTurretEntity {
  id: number;
  x: number;
  y: number;
  radius: number;
  fireTimer: number;
  fireInterval: number;
  damage: number;
  lifeTimer: number;
  maxLife: number;
  evolved: boolean;
}

export interface XpGemEntity {
  id: number;
  x: number;
  y: number;
  value: number;
  tier: 'CYAN' | 'EMERALD' | 'AMBER' | 'ROSE';
  magnetized: boolean;
}

export interface PickupEntity {
  id: number;
  kind: 'REPAIR_KIT' | 'GREEN_WAVE_MAGNET' | 'BOSS_CHEST' | 'CREDIT_BAG';
  x: number;
  y: number;
  radius: number;
  pulsePhase: number;
}

export interface FloatingText {
  id: number;
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  size: number;
  timer: number;
  maxTimer: number;
}

export interface ParticleEffect {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  timer: number;
  maxTimer: number;
}

export interface IntersectionMission {
  nodeId: string;
  nodeName: string;
  x: number;
  y: number;
  radius: number;
  progress: number; // 0 .. 1
  requiredSeconds: number;
  timeRemaining: number;
  rewardXp: number;
  rewardCredits: number;
}

export interface AmbientRoadCar {
  edgeId: string;
  lane: number;
  progress: number; // 0 .. 1
  speedFrac: number;
  color: string;
}

export interface MetaUpgradesState {
  credits: number;
  damageLevel: number; // +8% per level (max 5)
  hpLevel: number; // +15 HP per level (max 5)
  speedLevel: number; // +5% per level (max 5)
  cooldownLevel: number; // -4% per level (max 5)
  xpGainLevel: number; // +10% per level (max 5)
  magnetLevel: number; // +15% per level (max 5)
  bestTimeSeconds: number;
  totalVehiclesCleared: number;
  totalRuns: number;
}

export interface SurvivorGameState {
  status: 'LOBBY' | 'PLAYING' | 'PAUSED' | 'LEVEL_UP' | 'CHEST_OPEN' | 'VICTORY' | 'GAME_OVER';
  stageId: SurvivorStageId;
  elapsedSeconds: number;
  clearTimeSeconds: number;
  isEndlessOvertime: boolean;
  waveNumber: number;
  waveLabel: string;
  gridlockGauge: number; // 0 .. 100 (%)
  gridlockOverloadActive: boolean;
  smoothFlowBuffActive: boolean;
  missionsCompleted: number;
  activeBossAlert: string | null;
  activeBossAlertTimer: number;
  empPulseVisual: number;
  orbitalAngle: number;
  player: SurvivorPlayer;
  enemies: EnemyEntity[];
  projectiles: ProjectileEntity[];
  slashes: SlashEffect[];
  lasers: LaserBeamEffect[];
  turrets: SignalTurretEntity[];
  gems: XpGemEntity[];
  pickups: PickupEntity[];
  floatingTexts: FloatingText[];
  particles: ParticleEffect[];
  activeMission: IntersectionMission | null;
  pendingLevelChoices: UpgradeChoice[];
  pendingChestRewards: UpgradeChoice[];
}
