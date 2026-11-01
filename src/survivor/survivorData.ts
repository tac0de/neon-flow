import {
  EnemyType,
  MetaUpgradesState,
  PassiveDef,
  PassiveId,
  SurvivorClassDef,
  SurvivorClassId,
  SurvivorStageDef,
  SurvivorStageId,
  WeaponDef,
  WeaponId,
} from '../types/survivor';

export const META_STORAGE_KEY = 'neon_flow_survivor_meta_v2';

export const DEFAULT_META_UPGRADES: MetaUpgradesState = {
  credits: 350, // Starter grant so players can test upgrades immediately
  damageLevel: 0,
  hpLevel: 0,
  speedLevel: 0,
  cooldownLevel: 0,
  xpGainLevel: 0,
  magnetLevel: 0,
  bestTimeSeconds: 0,
  totalVehiclesCleared: 0,
  totalRuns: 0,
};

export function loadMetaUpgrades(): MetaUpgradesState {
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_META_UPGRADES };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_META_UPGRADES,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_META_UPGRADES };
  }
}

export function saveMetaUpgrades(meta: MetaUpgradesState): void {
  try {
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // ignore storage quota errors
  }
}

export const SURVIVOR_CLASSES: Record<SurvivorClassId, SurvivorClassDef> = {
  INTERCEPTOR: {
    id: 'INTERCEPTOR',
    name: '사이버 순찰 인터셉터',
    subtitle: '고속 기동형 교통 단속 유닛',
    description:
      '연쇄 초록불 펄스를 발사해 정체 유발 차량을 신속히 해소하는 표준 인터셉터입니다.',
    color: '#22d3ee',
    accentColor: '#38bdf8',
    startingWeapon: 'GREEN_WAVE_PULSE',
    baseHp: 125,
    baseSpeed: 168,
    armor: 1,
    perkLabel: '이동속도 +12% · 투사체 연사 특화',
    bonuses: {
      speedMult: 1.12,
      cooldownMult: 0.93,
    },
  },
  TOW_MECH: {
    id: 'TOW_MECH',
    name: '헤비 마그넷 견인차',
    subtitle: '중장갑 광역 견인·돌파 장갑차',
    description:
      '거대한 플라즈마 견인 체인을 좌우로 휘둘러 끼어들기·불법주정차 군집을 단숨에 쓸어버립니다.',
    color: '#f59e0b',
    accentColor: '#fbbf24',
    startingWeapon: 'TOW_WHIP',
    baseHp: 175,
    baseSpeed: 148,
    armor: 3,
    perkLabel: '최대 체력 +35% · 공격력 +15%',
    bonuses: {
      damageMult: 1.15,
      areaMult: 1.12,
    },
  },
  SIGNAL_DRONE: {
    id: 'SIGNAL_DRONE',
    name: 'AI 신호 관제 드론',
    subtitle: '360° 회전교차로 위성 오퍼레이터',
    description:
      '주위를 공전하는 회전교차로 신호 위성으로 접근하는 칼치기 차량들을 자동 분쇄합니다.',
    color: '#10b981',
    accentColor: '#34d399',
    startingWeapon: 'ROUNDABOUT_ORBITAL',
    baseHp: 110,
    baseSpeed: 182,
    armor: 1,
    perkLabel: '쿨타임 -15% · 자력 흡수 반경 +30%',
    bonuses: {
      cooldownMult: 0.85,
      magnetMult: 1.3,
      speedMult: 1.08,
    },
  },
  EMP_SWEEPER: {
    id: 'EMP_SWEEPER',
    name: '도심 정체 파쇄 장갑차',
    subtitle: '교차로 EMP 역장 & 병목 제거 특화',
    description:
      '차량 주변에 지속적인 전자기 EMP 파동을 방출하여 몰려오는 체증 차량을 감속시키고 녹여버립니다.',
    color: '#a855f7',
    accentColor: '#c084fc',
    startingWeapon: 'EMP_AURA',
    baseHp: 155,
    baseSpeed: 154,
    armor: 2,
    perkLabel: '공격 범위 +28% · 방어 및 감속 특화',
    bonuses: {
      areaMult: 1.28,
      damageMult: 1.1,
    },
  },
  CYBER_MEDIC: {
    id: 'CYBER_MEDIC',
    name: '네온 긴급 구급차',
    subtitle: '연쇄 아크 방전 & 나노 자가수리 기체',
    description:
      '차량들 사이를 연쇄적으로 튀는 고전압 신호 아크를 발사하며, 빠른 기동력과 자력 반경을 보유합니다.',
    color: '#f43f5e',
    accentColor: '#fb7185',
    startingWeapon: 'CHAIN_SIGNAL_ARC',
    baseHp: 140,
    baseSpeed: 174,
    armor: 2,
    perkLabel: '연쇄 스파크 기본 장착 · 이속 +10% · 자력 +25%',
    bonuses: {
      speedMult: 1.1,
      magnetMult: 1.25,
      cooldownMult: 0.92,
    },
  },
  RAIL_ENFORCER: {
    id: 'RAIL_ENFORCER',
    name: '수도권 광역 전철포',
    subtitle: '초전도 차선 관통 레일건 크루저',
    description:
      '도로 일직선상의 모든 정체 차량과 보스를 단숨에 꿰뚫는 초고속 전자기 레일건을 탑재한 화력 특화 기체입니다.',
    color: '#38bdf8',
    accentColor: '#fde047',
    startingWeapon: 'RAILGUN_BEAM',
    baseHp: 135,
    baseSpeed: 158,
    armor: 2,
    perkLabel: '공격력 +22% · 공격 범위 +15%',
    bonuses: {
      damageMult: 1.22,
      areaMult: 1.15,
    },
  },
};

export const SURVIVOR_STAGES: Record<SurvivorStageId, SurvivorStageDef> = {
  COMMUTE_GRID: {
    id: 'COMMUTE_GRID',
    name: 'STAGE 1 · 도심 출퇴근 러시아워',
    subtitle: '중앙 네온광장 3×3 간선 격자망',
    description:
      '사방에서 출근 차량과 칼치기 택시가 중앙 네온광장으로 몰려듭니다. 교차로 신호 마비를 해킹하며 러시아워를 돌파하세요!',
    difficultyLabel: 'NORMAL',
    difficultyStars: 2,
    scenarioKey: 'commute_rush',
    enemyHpMult: 1.0,
    spawnRateMult: 1.0,
    creditBonusMult: 1.0,
    clearTimeSeconds: 180,
  },
  BRAESS_MAZE: {
    id: 'BRAESS_MAZE',
    name: 'STAGE 2 · 브래스의 역설 분기점',
    subtitle: '고속 지름길 병목 & 폭주족 출몰지',
    description:
      '지름길로 몰려든 차량들이 남부 합류교차로에서 폭발적인 그리드락을 유발합니다. 위험물 탱크로리 유폭을 활용하세요!',
    difficultyLabel: 'HARD',
    difficultyStars: 3,
    scenarioKey: 'braess_detour',
    enemyHpMult: 1.28,
    spawnRateMult: 1.22,
    creditBonusMult: 1.35,
    clearTimeSeconds: 180,
  },
  SEOUL_BELTWAY: {
    id: 'SEOUL_BELTWAY',
    name: 'STAGE 3 · 내부순환 네온 하이웨이',
    subtitle: '고밀도 동서 간선 병목 회랑',
    description:
      '긴 동서 간선 축을 따라 폭주 슈퍼카와 과적 트럭이 떼지어 돌진합니다. 차선 관통 무기와 신호 연동이 핵심입니다!',
    difficultyLabel: 'VERY HARD',
    difficultyStars: 4,
    scenarioKey: 'signal_bottleneck',
    enemyHpMult: 1.45,
    spawnRateMult: 1.38,
    creditBonusMult: 1.55,
    clearTimeSeconds: 180,
  },
  MEGACITY_HELL: {
    id: 'MEGACITY_HELL',
    name: 'STAGE 4 · 메가시티 대정체 지옥',
    subtitle: '4×4 초고밀도 광역 간선망 (극한 생존)',
    description:
      '과적 트레일러와 명절 귀성길 버스 군단이 끝없이 쏟아지는 극한 정체 구역입니다. 무기 ★궁극 진화가 필수입니다!',
    difficultyLabel: 'EXTREME',
    difficultyStars: 5,
    scenarioKey: 'megacity_stress',
    enemyHpMult: 1.65,
    spawnRateMult: 1.55,
    creditBonusMult: 1.85,
    clearTimeSeconds: 180,
  },
};

export const WEAPON_DEFS: Record<WeaponId, WeaponDef> = {
  GREEN_WAVE_PULSE: {
    id: 'GREEN_WAVE_PULSE',
    name: '그린웨이브 신호탄',
    iconCode: '🟢',
    evolvedName: '★ 초록불 무한 연동망',
    evolvedDescription:
      '초고속 관통 녹색 레이저 탄환을 부채꼴로 난사하여 차선 전체의 체증을 즉시 증발시킵니다.',
    synergyPassive: 'OVERCLOCK_COIL',
    description: '가장 가까운 체증 유발 차량을 향해 고밀도 녹색 신호 펄스를 연속 발사합니다.',
    color: '#10b981',
    evolvedColor: '#34d399',
    baseDamage: 25,
    baseCooldown: 0.7,
    baseArea: 1.0,
    baseCount: 1,
    maxLevel: 5,
    levelDescriptions: [
      '가장 가까운 정체 차량에 신호 펄스 1발 발사',
      '발사체 수 +1, 관통력 +1 증가',
      '피해량 +35%, 연사 쿨타임 15% 감소',
      '발사체 수 +1, 탄속 및 사거리 대폭 증가',
      '피해량 +45%, 관통력 +2 (신호 주기 가속 코일 보유 시 진화 가능)',
    ],
  },
  TOW_WHIP: {
    id: 'TOW_WHIP',
    name: '플라즈마 견인 체인',
    iconCode: '⛓️',
    evolvedName: '★ 초전자 그라비티 렉카',
    evolvedDescription:
      '전후좌우 360도 전방위로 거대한 중력 견인 폭풍을 휘둘러 모든 차량을 파쇄하고 내구도를 흡수합니다.',
    synergyPassive: 'HIGH_VOLTAGE_CELL',
    description: '차량 좌우로 강력한 자기장 견인 사슬을 휘둘러 인접한 차량들을 강하게 밀쳐냅니다.',
    color: '#f59e0b',
    evolvedColor: '#f43f5e',
    baseDamage: 36,
    baseCooldown: 1.1,
    baseArea: 118,
    baseCount: 1,
    maxLevel: 5,
    levelDescriptions: [
      '전방/측면 아크 범위에 플라즈마 견인 강타',
      '후방 추가 타격 (양방향 동시 스윙), 범위 +20%',
      '피해량 +40%, 넉백 위력 증가',
      '공격 범위 +25%, 쿨타임 15% 감소',
      '피해량 +50% (고전압 단속 배터리 보유 시 진화 가능)',
    ],
  },
  ROUNDABOUT_ORBITAL: {
    id: 'ROUNDABOUT_ORBITAL',
    name: '회전교차로 위성 드론',
    iconCode: '🛰️',
    evolvedName: '★ 메가 회전교차로 결계',
    evolvedDescription:
      '영구 지속되는 초고속 플라즈마 로터리 위성이 공전하며 접근 자체를 불허합니다.',
    synergyPassive: 'AMPLIFIER_RADAR',
    description: '플레이어 주위를 360도 공전하며 닿는 모든 위반 차량을 타격하는 로터리 위성입니다.',
    color: '#22d3ee',
    evolvedColor: '#38bdf8',
    baseDamage: 19,
    baseCooldown: 0.25,
    baseArea: 94,
    baseCount: 2,
    maxLevel: 5,
    levelDescriptions: [
      '2개의 회전교차로 위성이 주위를 공전하며 타격',
      '위성 개수 +1 (총 3기), 회전 속도 증가',
      '피해량 +35%, 공전 반경 +18%',
      '위성 개수 +1 (총 4기), 타격 판정 크기 증가',
      '위성 개수 +1 (총 5기), 피해량 +45% (광역 관제 안테나 보유 시 진화 가능)',
    ],
  },
  EMP_AURA: {
    id: 'EMP_AURA',
    name: '교차로 EMP 역장',
    iconCode: '🔮',
    evolvedName: '★ 완전 무정체 도심 돔',
    evolvedDescription:
      '거대한 청록색 EMP 돔이 주변 정체 차량의 속도를 60% 늦추고 도심 정체 게이지를 지속 정화합니다.',
    synergyPassive: 'MAGNET_TRANSPONDER',
    description: '차량 주변 반경에 주기적인 전자기 파동을 일으켜 범위 내 모든 적에게 피해와 감속을 줍니다.',
    color: '#a855f7',
    evolvedColor: '#e879f9',
    baseDamage: 16,
    baseCooldown: 0.52,
    baseArea: 108,
    baseCount: 1,
    maxLevel: 5,
    levelDescriptions: [
      '반경 108m 내 모든 체증 차량에 EMP 피해 및 25% 감속',
      '역장 반경 +25%, 피해량 +30%',
      '펄스 주기 20% 단축, 감속 효과 강화',
      '역장 반경 +25%, 피해량 +40%',
      '역장 반경 및 피해량 극대화 (하이패스 자력 수집기 보유 시 진화 가능)',
    ],
  },
  SPEED_CAMERA_LASER: {
    id: 'SPEED_CAMERA_LASER',
    name: '과속 단속 궤도 레이저',
    iconCode: '⚡',
    evolvedName: '★ 인공위성 무인 단속포',
    evolvedDescription:
      '하늘에서 붉은 궤도 단속 레이저가 연속 낙하하며 주변 차량들에게 연쇄 스파크 폭발을 일으킵니다.',
    synergyPassive: 'OVERCLOCK_COIL',
    description: '가장 체력이 높은 폭주·병목 차량 머리 위에 무인 단속 레이저 벼락을 내리꽂습니다.',
    color: '#f43f5e',
    evolvedColor: '#fb7185',
    baseDamage: 50,
    baseCooldown: 1.5,
    baseArea: 68,
    baseCount: 1,
    maxLevel: 5,
    levelDescriptions: [
      '위협 차량 1대에 고출력 단속 레이저 낙하 + 주변 범위 피해',
      '동시 단속 타겟 +1 (2대 동시 타격)',
      '피해량 +45%, 스플래시 반경 +25%',
      '동시 단속 타겟 +1 (3대), 쿨타임 18% 감소',
      '동시 타겟 +1 (4대), 피해량 +55% (신호 주기 가속 코일 보유 시 진화 가능)',
    ],
  },
  DETOUR_MISSILE: {
    id: 'DETOUR_MISSILE',
    name: '우회 유도 마이크로 드론',
    iconCode: '🚀',
    evolvedName: '★ AI 전방위 우회 폭격기',
    evolvedDescription:
      '다연장 유도 드론 편대가 정체 밀집 구역을 추적해 대형 네온 연쇄 폭발을 일으킵니다.',
    synergyPassive: 'MULTI_LANE_CPU',
    description: '적 차량을 끝까지 추적하여 폭발하는 호밍 우회 유도탄을 발사합니다.',
    color: '#38bdf8',
    evolvedColor: '#7dd3fc',
    baseDamage: 32,
    baseCooldown: 1.25,
    baseArea: 60,
    baseCount: 2,
    maxLevel: 5,
    levelDescriptions: [
      '유도 마이크로 드론 2기 발사 후 범위 폭발',
      '발사 수 +1 (3기), 폭발 반경 +20%',
      '피해량 +40%, 유도 선회력 상승',
      '발사 수 +1 (4기), 쿨타임 15% 감소',
      '발사 수 +1 (5기), 폭발 피해 +50% (다중 차선 프로세서 보유 시 진화 가능)',
    ],
  },
  HIPASS_BOOMERANG: {
    id: 'HIPASS_BOOMERANG',
    name: '하이패스 톨게이트 블레이드',
    iconCode: '💿',
    evolvedName: '★ 무정차 하이패스 폭풍',
    evolvedDescription:
      '거대한 초고속 하이패스 회전톱날이 화면 전체를 가로지르며 모든 차선의 차량을 두 번씩 베어냅니다.',
    synergyPassive: 'TURBO_LANE_ENGINE',
    description: '차선 일직선상의 모든 적을 관통한 뒤 플레이어에게 되돌아오는 부메랑 디스크입니다.',
    color: '#2dd4bf',
    evolvedColor: '#5eead4',
    baseDamage: 30,
    baseCooldown: 1.2,
    baseArea: 22,
    baseCount: 1,
    maxLevel: 5,
    levelDescriptions: [
      '무한 관통 왕복 하이패스 블레이드 1기 투척',
      '투척 개수 +1, 비행 거리 및 크기 +20%',
      '피해량 +40%, 왕복 속도 증가',
      '투척 개수 +1, 쿨타임 15% 감소',
      '피해량 +50%, 디스크 크기 대폭 확대 (버스전용차로 터보 엔진 보유 시 진화 가능)',
    ],
  },
  SIGNAL_TURRET: {
    id: 'SIGNAL_TURRET',
    name: '스마트 신호등 포탑',
    iconCode: '🚦',
    evolvedName: '★ 중앙관제 AI 메가타워',
    evolvedDescription:
      '도로 위에 고출력 AI 관제 타워를 전개하여 주변 정체 게이지를 정화하고 고속 연사 레이저를 퍼붓습니다.',
    synergyPassive: 'AMPLIFIER_RADAR',
    description: '현재 위치에 자율 사격 신호등 포탑을 설치하여 주변 체증 차량을 자동 요격합니다.',
    color: '#eab308',
    evolvedColor: '#fde047',
    baseDamage: 22,
    baseCooldown: 3.4,
    baseArea: 195,
    baseCount: 1,
    maxLevel: 5,
    levelDescriptions: [
      '8.5초간 유지되는 스마트 신호 포탑 설치',
      '포탑 연사 속도 +35%, 사거리 증가',
      '포탑 공격력 +45%, 지속시간 11초로 증가',
      '설치 주기 단축, 포탑 탄환 관통력 +1',
      '포탑 공격력 +60% 및 도심 정체 정화 효과 (광역 관제 안테나 보유 시 진화 가능)',
    ],
  },
  CHAIN_SIGNAL_ARC: {
    id: 'CHAIN_SIGNAL_ARC',
    name: '신호등 연쇄 스파크',
    iconCode: '⚡',
    evolvedName: '★ 도심 초전도 뇌전 스톰',
    evolvedDescription:
      '차량 군집 사이로 최대 9회까지 연쇄 전이되는 초고압 뇌전을 방출하여 밀집된 정체 구간을 통째로 감전시킵니다.',
    synergyPassive: 'MULTI_LANE_CPU',
    description: '인접한 체증 차량들 사이를 지그재그로 튕기며 다수의 적을 동시 타격하는 연쇄 번개입니다.',
    color: '#34d399',
    evolvedColor: '#6ee7b7',
    baseDamage: 29,
    baseCooldown: 1.05,
    baseArea: 145,
    baseCount: 3,
    maxLevel: 5,
    levelDescriptions: [
      '최대 3대의 인접 차량으로 전이되는 연쇄 스파크 방출',
      '연쇄 전이 횟수 +2 (최대 5대 타격)',
      '피해량 +40%, 전이 사거리 +25% 증가',
      '연쇄 전이 횟수 +2 (최대 7대), 쿨타임 15% 감소',
      '피해량 +50%, 감전 감속 부여 (다중 차선 프로세서 보유 시 진화 가능)',
    ],
  },
  RAILGUN_BEAM: {
    id: 'RAILGUN_BEAM',
    name: '초전도 차선 레일건',
    iconCode: '🚄',
    evolvedName: '★ 하이퍼루프 종단 파괴포',
    evolvedDescription:
      '차선 전체를 관통하는 초대형 플라즈마 레일건 광선을 다방향으로 동시 발사하여 일직선상의 모든 적을 소멸시킵니다.',
    synergyPassive: 'HIGH_VOLTAGE_CELL',
    description: '조준 방향 일직선상의 모든 체증 차량을 즉시 관통 타격하는 초고속 전자기 광선포입니다.',
    color: '#60a5fa',
    evolvedColor: '#fde047',
    baseDamage: 56,
    baseCooldown: 1.65,
    baseArea: 420,
    baseCount: 1,
    maxLevel: 5,
    levelDescriptions: [
      '전방 420m 일직선 관통 전자기 레일건 발사',
      '피해량 +35%, 빔 두께 및 사거리 +20% 확장',
      '후방 동시 발사 (전·후 양방향 관통 레일건)',
      '쿨타임 20% 감소, 피해량 +40%',
      '피해량 +55% 및 정체 게이지 감소 효과 (고전압 단속 배터리 보유 시 진화 가능)',
    ],
  },
};

export const PASSIVE_DEFS: Record<PassiveId, PassiveDef> = {
  OVERCLOCK_COIL: {
    id: 'OVERCLOCK_COIL',
    name: '신호 주기 가속 코일',
    iconCode: '⏱️',
    description: '모든 무기의 발동 쿨타임을 레벨당 10% 단축합니다.',
    color: '#38bdf8',
    maxLevel: 5,
    statPerLevelLabel: '쿨타임 -10%',
    synergyWeapon: 'GREEN_WAVE_PULSE',
  },
  AMPLIFIER_RADAR: {
    id: 'AMPLIFIER_RADAR',
    name: '광역 교통 관제 안테나',
    iconCode: '📡',
    description: '모든 무기의 공격 범위 및 폭발 반경을 레벨당 16% 확장합니다.',
    color: '#a855f7',
    maxLevel: 5,
    statPerLevelLabel: '공격 범위 +16%',
    synergyWeapon: 'ROUNDABOUT_ORBITAL',
  },
  TURBO_LANE_ENGINE: {
    id: 'TURBO_LANE_ENGINE',
    name: '버스전용차로 터보 엔진',
    iconCode: '🔥',
    description: '플레이어 차량의 이동 속도를 레벨당 12% 증가시킵니다.',
    color: '#2dd4bf',
    maxLevel: 5,
    statPerLevelLabel: '이동속도 +12%',
    synergyWeapon: 'HIPASS_BOOMERANG',
  },
  MULTI_LANE_CPU: {
    id: 'MULTI_LANE_CPU',
    name: '다중 차선 분배 프로세서',
    iconCode: '💻',
    description: '발사체·연쇄·위성 무기들의 투사체 및 타겟 수를 추가합니다.',
    color: '#10b981',
    maxLevel: 5,
    statPerLevelLabel: '투사체 개수 강화',
    synergyWeapon: 'DETOUR_MISSILE',
  },
  HIGH_VOLTAGE_CELL: {
    id: 'HIGH_VOLTAGE_CELL',
    name: '고전압 단속 배터리',
    iconCode: '🔋',
    description: '모든 교통 통제 무기의 피해량을 레벨당 18% 증폭시킵니다.',
    color: '#f59e0b',
    maxLevel: 5,
    statPerLevelLabel: '공격력 +18%',
    synergyWeapon: 'TOW_WHIP',
  },
  MAGNET_TRANSPONDER: {
    id: 'MAGNET_TRANSPONDER',
    name: '하이패스 자력 수집기',
    iconCode: '🧲',
    description: '통행권 경험치 젬 흡수 반경 +35% 및 초당 체력 자동 수리 +1.4를 부여합니다.',
    color: '#f43f5e',
    maxLevel: 5,
    statPerLevelLabel: '자력 반경 +35% · 자동수리',
    synergyWeapon: 'EMP_AURA',
  },
};

export interface EnemyArchetype {
  type: EnemyType;
  name: string;
  baseHp: number;
  baseSpeed: number;
  radius: number;
  contactDamage: number;
  xpValue: number;
  creditValue: number;
  color: string;
  isBoss: boolean;
}

export const ENEMY_ARCHETYPES: Record<EnemyType, EnemyArchetype> = {
  CUT_IN_TAXI: {
    type: 'CUT_IN_TAXI',
    name: '칼치기 총알택시',
    baseHp: 26,
    baseSpeed: 108,
    radius: 12,
    contactDamage: 8,
    xpValue: 13,
    creditValue: 2,
    color: '#facc15',
    isBoss: false,
  },
  RUSH_SEDAN: {
    type: 'RUSH_SEDAN',
    name: '나홀로 통근 세단',
    baseHp: 38,
    baseSpeed: 84,
    radius: 13,
    contactDamage: 10,
    xpValue: 16,
    creditValue: 2,
    color: '#38bdf8',
    isBoss: false,
  },
  SPILLBACK_SUV: {
    type: 'SPILLBACK_SUV',
    name: '꼬리물기 대형 SUV',
    baseHp: 82,
    baseSpeed: 72,
    radius: 16,
    contactDamage: 14,
    xpValue: 28,
    creditValue: 4,
    color: '#fb923c',
    isBoss: false,
  },
  DOUBLE_PARK_VAN: {
    type: 'DOUBLE_PARK_VAN',
    name: '불법주정차 탑차',
    baseHp: 115,
    baseSpeed: 62,
    radius: 17,
    contactDamage: 15,
    xpValue: 36,
    creditValue: 5,
    color: '#a855f7',
    isBoss: false,
  },
  ROGUE_RACER: {
    type: 'ROGUE_RACER',
    name: '폭주 칼치기 슈퍼카',
    baseHp: 68,
    baseSpeed: 138,
    radius: 13,
    contactDamage: 18,
    xpValue: 40,
    creditValue: 6,
    color: '#f43f5e',
    isBoss: false,
  },
  HAZMAT_TANKER: {
    type: 'HAZMAT_TANKER',
    name: '☢️ 위험물 유폭 탱크로리',
    baseHp: 95,
    baseSpeed: 66,
    radius: 18,
    contactDamage: 16,
    xpValue: 45,
    creditValue: 8,
    color: '#84cc16',
    isBoss: false,
  },
  OVERLOAD_TRUCK: {
    type: 'OVERLOAD_TRUCK',
    name: '과적 컨테이너 트럭',
    baseHp: 210,
    baseSpeed: 56,
    radius: 21,
    contactDamage: 22,
    xpValue: 58,
    creditValue: 9,
    color: '#ef4444',
    isBoss: false,
  },
  BOSS_JUGGERNAUT: {
    type: 'BOSS_JUGGERNAUT',
    name: '🚨 [보스] 5중 추돌 메가 트레일러',
    baseHp: 1350,
    baseSpeed: 74,
    radius: 32,
    contactDamage: 28,
    xpValue: 280,
    creditValue: 70,
    color: '#f43f5e',
    isBoss: true,
  },
  BOSS_BUS_TITAN: {
    type: 'BOSS_BUS_TITAN',
    name: '🚨 [보스] 명절 귀성길 광역버스 타이탄',
    baseHp: 2600,
    baseSpeed: 80,
    radius: 35,
    contactDamage: 34,
    xpValue: 480,
    creditValue: 115,
    color: '#f59e0b',
    isBoss: true,
  },
  BOSS_BRAESS: {
    type: 'BOSS_BRAESS',
    name: '👑 [최종보스] 브래스의 악령 · AI 폭주 메가트럭',
    baseHp: 4500,
    baseSpeed: 88,
    radius: 40,
    contactDamage: 42,
    xpValue: 950,
    creditValue: 240,
    color: '#ec4899',
    isBoss: true,
  },
};

export interface MetaUpgradeItemDef {
  key: keyof Pick<
    MetaUpgradesState,
    'damageLevel' | 'hpLevel' | 'speedLevel' | 'cooldownLevel' | 'xpGainLevel' | 'magnetLevel'
  >;
  name: string;
  description: string;
  baseCost: number;
  maxLevel: number;
  perLevelText: string;
}

export const META_UPGRADE_ITEMS: MetaUpgradeItemDef[] = [
  {
    key: 'damageLevel',
    name: '단속 출력 증폭기',
    description: '모든 무기의 기본 공격력을 영구적으로 강화합니다.',
    baseCost: 80,
    maxLevel: 5,
    perLevelText: '공격력 +10%',
  },
  {
    key: 'hpLevel',
    name: '초합금 범퍼 장갑',
    description: '차량 최대 내구도(HP)를 영구적으로 증가시킵니다.',
    baseCost: 70,
    maxLevel: 5,
    perLevelText: '최대 HP +20',
  },
  {
    key: 'cooldownLevel',
    name: '그린웨이브 연산 칩셋',
    description: '모든 무기 및 긴급 사이렌 쿨타임을 단축합니다.',
    baseCost: 95,
    maxLevel: 5,
    perLevelText: '쿨타임 -5%',
  },
  {
    key: 'speedLevel',
    name: '니트로 차선 가속기',
    description: '기본 주행 속도를 영구적으로 높입니다.',
    baseCost: 75,
    maxLevel: 5,
    perLevelText: '이동속도 +6%',
  },
  {
    key: 'xpGainLevel',
    name: '빅데이터 통행 분석기',
    description: '획득하는 통행 데이터(경험치)와 과태료 크레딧이 증가합니다.',
    baseCost: 85,
    maxLevel: 5,
    perLevelText: '경험치·크레딧 +12%',
  },
  {
    key: 'magnetLevel',
    name: '광역 하이패스 스캐너',
    description: '기본 아이템 흡수 반경과 시작 리롤 횟수를 강화합니다.',
    baseCost: 80,
    maxLevel: 5,
    perLevelText: '자력 +20% · 리롤 강화',
  },
];
