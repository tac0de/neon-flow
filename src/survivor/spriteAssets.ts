import { EnemyType, SurvivorClassId } from '../types/survivor';

/**
 * High-detail top-down SVG vehicle & boss sprites (oriented facing +X right, viewBox 0 0 120 80).
 * Also exported to /public/assets/sprites/*.svg and preloaded into HTMLImageElement cache.
 */
export const PLAYER_CLASS_SVGS: Record<SurvivorClassId, string> = {
  INTERCEPTOR: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80">
    <defs>
      <linearGradient id="bodyGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#082f49"/>
        <stop offset="55%" stop-color="#0284c7"/>
        <stop offset="100%" stop-color="#22d3ee"/>
      </linearGradient>
    </defs>
    <!-- Rear Thruster Flames -->
    <polygon points="4,26 18,22 18,32" fill="#38bdf8" opacity="0.85"/>
    <polygon points="4,54 18,48 18,58" fill="#38bdf8" opacity="0.85"/>
    <!-- Wheels -->
    <rect x="24" y="10" width="20" height="8" rx="3" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5"/>
    <rect x="74" y="10" width="20" height="8" rx="3" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5"/>
    <rect x="24" y="62" width="20" height="8" rx="3" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5"/>
    <rect x="74" y="62" width="20" height="8" rx="3" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5"/>
    <!-- Main Chassis -->
    <path d="M16,20 L88,16 L112,26 L112,54 L88,64 L16,60 Z" fill="url(#bodyGrad)" stroke="#e0f2fe" stroke-width="2.2"/>
    <!-- Hood Stripes -->
    <path d="M72,26 L106,30 L106,50 L72,54 Z" fill="#0f172a" opacity="0.65"/>
    <line x1="75" y1="40" x2="110" y2="40" stroke="#22d3ee" stroke-width="2.5"/>
    <!-- Windshield & Cabin -->
    <polygon points="42,24 72,22 80,28 80,52 72,58 42,56" fill="#040d1a" stroke="#38bdf8" stroke-width="1.5"/>
    <!-- Police Siren Lightbar -->
    <rect x="52" y="25" width="10" height="14" rx="2" fill="#f43f5e" stroke="#ffffff" stroke-width="1"/>
    <rect x="52" y="41" width="10" height="14" rx="2" fill="#22d3ee" stroke="#ffffff" stroke-width="1"/>
    <!-- Headlights -->
    <rect x="106" y="24" width="6" height="8" rx="2" fill="#ffffff"/>
    <rect x="106" y="48" width="6" height="8" rx="2" fill="#ffffff"/>
  </svg>`,

  TOW_MECH: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80">
    <!-- Heavy Treads / Wheels -->
    <rect x="18" y="8" width="28" height="10" rx="3" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5"/>
    <rect x="68" y="8" width="26" height="10" rx="3" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5"/>
    <rect x="18" y="62" width="28" height="10" rx="3" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5"/>
    <rect x="68" y="62" width="26" height="10" rx="3" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5"/>
    <!-- Armored Tow Bed -->
    <rect x="14" y="16" width="84" height="48" rx="6" fill="#78350f" stroke="#fbbf24" stroke-width="2.2"/>
    <rect x="52" y="20" width="42" height="40" rx="4" fill="#d97706" stroke="#fde68a" stroke-width="1.5"/>
    <!-- Cabin Windshield -->
    <rect x="68" y="24" width="20" height="32" rx="3" fill="#0f172a" stroke="#fbbf24" stroke-width="1.5"/>
    <!-- Magnetic Tow Boom Crane -->
    <line x1="20" y1="40" x2="54" y2="40" stroke="#fde047" stroke-width="6" stroke-linecap="round"/>
    <circle cx="34" cy="40" r="10" fill="#0f172a" stroke="#f59e0b" stroke-width="3"/>
    <circle cx="34" cy="40" r="4" fill="#38bdf8"/>
    <!-- Front Bulldozer Ram Plow -->
    <path d="M98,12 L114,20 L114,60 L98,68 Z" fill="#f59e0b" stroke="#ffffff" stroke-width="2"/>
  </svg>`,

  SIGNAL_DRONE: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80">
    <!-- 4 Quad-Rotor Nacelles -->
    <circle cx="30" cy="18" r="14" fill="#064e3b" stroke="#34d399" stroke-width="2.2"/>
    <circle cx="90" cy="18" r="14" fill="#064e3b" stroke="#34d399" stroke-width="2.2"/>
    <circle cx="30" cy="62" r="14" fill="#064e3b" stroke="#34d399" stroke-width="2.2"/>
    <circle cx="90" cy="62" r="14" fill="#064e3b" stroke="#34d399" stroke-width="2.2"/>
    <!-- Rotor Blades -->
    <line x1="20" y1="18" x2="40" y2="18" stroke="#a7f3d0" stroke-width="2.5"/>
    <line x1="80" y1="18" x2="100" y2="18" stroke="#a7f3d0" stroke-width="2.5"/>
    <line x1="20" y1="62" x2="40" y2="62" stroke="#a7f3d0" stroke-width="2.5"/>
    <line x1="80" y1="62" x2="100" y2="62" stroke="#a7f3d0" stroke-width="2.5"/>
    <!-- Frame Struts -->
    <line x1="30" y1="18" x2="90" y2="62" stroke="#10b981" stroke-width="4"/>
    <line x1="30" y1="62" x2="90" y2="18" stroke="#10b981" stroke-width="4"/>
    <!-- Central Diamond Hull -->
    <polygon points="24,40 60,20 108,40 60,60" fill="#065f46" stroke="#6ee7b7" stroke-width="2.2"/>
    <!-- Traffic Signal Core Triad -->
    <circle cx="48" cy="40" r="5" fill="#f43f5e"/>
    <circle cx="62" cy="40" r="5" fill="#f59e0b"/>
    <circle cx="76" cy="40" r="6" fill="#10b981" stroke="#ffffff" stroke-width="1.5"/>
  </svg>`,

  EMP_SWEEPER: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80">
    <!-- 6 Armored Wheels -->
    <rect x="16" y="8" width="18" height="8" rx="2" fill="#0f172a" stroke="#c084fc" stroke-width="1.5"/>
    <rect x="50" y="8" width="18" height="8" rx="2" fill="#0f172a" stroke="#c084fc" stroke-width="1.5"/>
    <rect x="82" y="8" width="18" height="8" rx="2" fill="#0f172a" stroke="#c084fc" stroke-width="1.5"/>
    <rect x="16" y="64" width="18" height="8" rx="2" fill="#0f172a" stroke="#c084fc" stroke-width="1.5"/>
    <rect x="50" y="64" width="18" height="8" rx="2" fill="#0f172a" stroke="#c084fc" stroke-width="1.5"/>
    <rect x="82" y="64" width="18" height="8" rx="2" fill="#0f172a" stroke="#c084fc" stroke-width="1.5"/>
    <!-- Heavy APC Body -->
    <polygon points="12,22 22,14 96,14 112,26 112,54 96,66 22,66 12,58" fill="#4c1d95" stroke="#e879f9" stroke-width="2.2"/>
    <!-- Twin EMP Tesla Coils -->
    <circle cx="42" cy="40" r="13" fill="#1e1b4b" stroke="#22d3ee" stroke-width="2.5"/>
    <circle cx="42" cy="40" r="6" fill="#e879f9"/>
    <circle cx="72" cy="40" r="11" fill="#1e1b4b" stroke="#c084fc" stroke-width="2"/>
    <circle cx="72" cy="40" r="5" fill="#38bdf8"/>
    <!-- Front Slit Visor -->
    <polygon points="90,24 106,30 106,50 90,56" fill="#090d16" stroke="#22d3ee" stroke-width="1.5"/>
  </svg>`,

  CYBER_MEDIC: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80">
    <!-- Wheels -->
    <rect x="22" y="10" width="20" height="8" rx="3" fill="#0f172a" stroke="#fb7185" stroke-width="1.5"/>
    <rect x="76" y="10" width="20" height="8" rx="3" fill="#0f172a" stroke="#fb7185" stroke-width="1.5"/>
    <rect x="22" y="62" width="20" height="8" rx="3" fill="#0f172a" stroke="#fb7185" stroke-width="1.5"/>
    <rect x="76" y="62" width="20" height="8" rx="3" fill="#0f172a" stroke="#fb7185" stroke-width="1.5"/>
    <!-- White & Crimson Responder Hull -->
    <rect x="14" y="16" width="96" height="48" rx="10" fill="#f8fafc" stroke="#f43f5e" stroke-width="2.5"/>
    <path d="M72,16 L102,16 C108,16 110,22 110,28 L110,52 C110,58 108,64 102,64 L72,64 Z" fill="#e11d48"/>
    <!-- Windshield -->
    <rect x="78" y="22" width="20" height="36" rx="4" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5"/>
    <!-- Neon Red Cross Emblem on Roof -->
    <rect x="38" y="26" width="12" height="28" rx="2" fill="#f43f5e"/>
    <rect x="30" y="34" width="28" height="12" rx="2" fill="#f43f5e"/>
    <!-- Emergency Beacons -->
    <circle cx="70" cy="24" r="4" fill="#22d3ee"/>
    <circle cx="70" cy="56" r="4" fill="#22d3ee"/>
  </svg>`,

  RAIL_ENFORCER: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80">
    <!-- Wheels -->
    <rect x="20" y="10" width="22" height="8" rx="2" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5"/>
    <rect x="74" y="10" width="22" height="8" rx="2" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5"/>
    <rect x="20" y="62" width="22" height="8" rx="2" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5"/>
    <rect x="74" y="62" width="22" height="8" rx="2" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5"/>
    <!-- Armored Hull -->
    <polygon points="12,18 94,16 112,26 112,54 94,64 12,62" fill="#1e3a8a" stroke="#60a5fa" stroke-width="2.2"/>
    <!-- Roof-Mounted Electromagnetic Railgun -->
    <rect x="22" y="31" width="96" height="18" rx="3" fill="#0f172a" stroke="#fde047" stroke-width="2"/>
    <line x1="28" y1="40" x2="118" y2="40" stroke="#22d3ee" stroke-width="4"/>
    <circle cx="46" cy="40" r="8" fill="#0284c7" stroke="#fde047" stroke-width="2"/>
  </svg>`,
};

export const ENEMY_TYPE_SVGS: Record<EnemyType, string> = {
  CUT_IN_TAXI: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 64" width="100" height="64">
    <rect x="16" y="8" width="16" height="6" rx="2" fill="#090d16"/>
    <rect x="66" y="8" width="16" height="6" rx="2" fill="#090d16"/>
    <rect x="16" y="50" width="16" height="6" rx="2" fill="#090d16"/>
    <rect x="66" y="50" width="16" height="6" rx="2" fill="#090d16"/>
    <rect x="10" y="12" width="80" height="40" rx="8" fill="#eab308" stroke="#fef08a" stroke-width="2"/>
    <polygon points="56,16 76,18 76,46 56,48" fill="#0f172a"/>
    <!-- TAXI Roof Lightbox -->
    <rect x="36" y="22" width="14" height="20" rx="3" fill="#fef08a" stroke="#0f172a" stroke-width="1.5"/>
    <rect x="86" y="16" width="5" height="7" fill="#ffffff"/>
    <rect x="86" y="41" width="5" height="7" fill="#ffffff"/>
  </svg>`,

  RUSH_SEDAN: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 64" width="100" height="64">
    <rect x="16" y="8" width="16" height="6" rx="2" fill="#090d16"/>
    <rect x="66" y="8" width="16" height="6" rx="2" fill="#090d16"/>
    <rect x="16" y="50" width="16" height="6" rx="2" fill="#090d16"/>
    <rect x="66" y="50" width="16" height="6" rx="2" fill="#090d16"/>
    <rect x="10" y="13" width="80" height="38" rx="9" fill="#0284c7" stroke="#7dd3fc" stroke-width="1.8"/>
    <rect x="32" y="18" width="42" height="28" rx="4" fill="#091326"/>
    <rect x="10" y="16" width="4" height="8" fill="#f43f5e"/>
    <rect x="10" y="40" width="4" height="8" fill="#f43f5e"/>
    <rect x="86" y="16" width="4" height="8" fill="#fef08a"/>
    <rect x="86" y="40" width="4" height="8" fill="#fef08a"/>
  </svg>`,

  SPILLBACK_SUV: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 72" width="110" height="72">
    <rect x="16" y="6" width="20" height="8" rx="2" fill="#090d16"/>
    <rect x="72" y="6" width="20" height="8" rx="2" fill="#090d16"/>
    <rect x="16" y="58" width="20" height="8" rx="2" fill="#090d16"/>
    <rect x="72" y="58" width="20" height="8" rx="2" fill="#090d16"/>
    <rect x="10" y="12" width="88" height="48" rx="7" fill="#ea580c" stroke="#fdba74" stroke-width="2.2"/>
    <rect x="22" y="18" width="42" height="36" rx="3" fill="#431407" stroke="#fb923c" stroke-width="1.2"/>
    <rect x="68" y="17" width="18" height="38" rx="3" fill="#0f172a"/>
    <line x1="100" y1="16" x2="100" y2="56" stroke="#e2e8f0" stroke-width="3.5"/>
  </svg>`,

  DOUBLE_PARK_VAN: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 116 74" width="116" height="74">
    <rect x="8" y="12" width="96" height="50" rx="5" fill="#6b21a8" stroke="#d8b4fe" stroke-width="2.2"/>
    <rect x="12" y="16" width="62" height="42" fill="#581c87" stroke="#a855f7" stroke-width="1.5"/>
    <line x1="26" y1="16" x2="26" y2="58" stroke="#9333ea" stroke-width="2"/>
    <line x1="42" y1="16" x2="42" y2="58" stroke="#9333ea" stroke-width="2"/>
    <line x1="58" y1="16" x2="58" y2="58" stroke="#9333ea" stroke-width="2"/>
    <rect x="78" y="17" width="18" height="40" rx="3" fill="#0f172a"/>
    <circle cx="20" cy="37" r="6" fill="#f59e0b"/>
  </svg>`,

  ROGUE_RACER: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 68" width="110" height="68">
    <!-- Afterburner flame -->
    <polygon points="2,24 14,20 14,28" fill="#fbbf24"/>
    <polygon points="2,44 14,40 14,48" fill="#fbbf24"/>
    <!-- Widebody Aero Chassis -->
    <polygon points="14,14 82,10 106,24 106,44 82,58 14,54" fill="#e11d48" stroke="#fda4af" stroke-width="2"/>
    <!-- Rear Carbon GT Spoiler -->
    <rect x="10" y="12" width="8" height="44" rx="2" fill="#090d16" stroke="#f43f5e" stroke-width="1.5"/>
    <!-- Cockpit Tear-drop -->
    <polygon points="36,22 72,18 84,26 84,42 72,50 36,46" fill="#090d16" stroke="#fb7185" stroke-width="1.5"/>
    <!-- Racing Stripes -->
    <line x1="20" y1="34" x2="104" y2="34" stroke="#fde047" stroke-width="2.5"/>
  </svg>`,

  OVERLOAD_TRUCK: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 136 82" width="136" height="82">
    <rect x="8" y="12" width="84" height="58" rx="4" fill="#991b1b" stroke="#fca5a5" stroke-width="2.2"/>
    <line x1="26" y1="12" x2="26" y2="70" stroke="#ef4444" stroke-width="2"/>
    <line x1="46" y1="12" x2="46" y2="70" stroke="#ef4444" stroke-width="2"/>
    <line x1="66" y1="12" x2="66" y2="70" stroke="#ef4444" stroke-width="2"/>
    <!-- Semi Cab -->
    <rect x="94" y="16" width="34" height="50" rx="6" fill="#dc2626" stroke="#fef2f2" stroke-width="2"/>
    <rect x="104" y="21" width="16" height="40" rx="3" fill="#090d16"/>
  </svg>`,

  HAZMAT_TANKER: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 78" width="130" height="78">
    <!-- Cylindrical Chemical Tank -->
    <rect x="10" y="14" width="80" height="50" rx="22" fill="#1e293b" stroke="#84cc16" stroke-width="2.5"/>
    <rect x="24" y="24" width="52" height="30" rx="12" fill="#65a30d" stroke="#bef264" stroke-width="1.5"/>
    <circle cx="50" cy="39" r="9" fill="#0f172a" stroke="#fde047" stroke-width="2"/>
    <circle cx="50" cy="39" r="4" fill="#f43f5e"/>
    <!-- Cab -->
    <rect x="92" y="18" width="30" height="42" rx="5" fill="#4d7c0f" stroke="#d9f99d" stroke-width="2"/>
    <rect x="100" y="22" width="14" height="34" rx="2" fill="#090d16"/>
  </svg>`,

  BOSS_JUGGERNAUT: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 104" width="170" height="104">
    <!-- Heavy Multi-Axle Armored Trailer -->
    <rect x="10" y="14" width="134" height="76" rx="8" fill="#881337" stroke="#fb7185" stroke-width="3"/>
    <rect x="20" y="22" width="76" height="60" rx="4" fill="#4c0519" stroke="#f43f5e" stroke-width="2"/>
    <!-- Twin Plasma Reactors -->
    <circle cx="42" cy="52" r="14" fill="#0f172a" stroke="#fde047" stroke-width="2.5"/>
    <circle cx="42" cy="52" r="7" fill="#f43f5e"/>
    <circle cx="74" cy="52" r="14" fill="#0f172a" stroke="#fde047" stroke-width="2.5"/>
    <circle cx="74" cy="52" r="7" fill="#f43f5e"/>
    <!-- Armored Cockpit -->
    <rect x="104" y="24" width="28" height="56" rx="4" fill="#090d16" stroke="#fda4af" stroke-width="2"/>
    <!-- Spiked Front Ram -->
    <polygon points="144,10 166,22 154,36 168,52 154,68 166,82 144,94" fill="#f59e0b" stroke="#fef08a" stroke-width="2"/>
  </svg>`,

  BOSS_BUS_TITAN: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 104" width="180" height="104">
    <!-- Articulated Double-Decker Bus Titan -->
    <rect x="8" y="14" width="74" height="76" rx="8" fill="#b45309" stroke="#fde047" stroke-width="3"/>
    <rect x="82" y="22" width="12" height="60" fill="#1e293b"/>
    <rect x="94" y="14" width="76" height="76" rx="10" fill="#d97706" stroke="#fef08a" stroke-width="3"/>
    <!-- Roof Missile Pods -->
    <circle cx="44" cy="52" r="15" fill="#0f172a" stroke="#f43f5e" stroke-width="2.5"/>
    <circle cx="126" cy="52" r="15" fill="#0f172a" stroke="#22d3ee" stroke-width="2.5"/>
    <!-- Panoramic Windshield -->
    <rect x="148" y="20" width="18" height="64" rx="5" fill="#090d16" stroke="#38bdf8" stroke-width="2"/>
  </svg>`,

  BOSS_BRAESS: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 116" width="190" height="116">
    <!-- Supreme Braess Leviathan Dreadnought -->
    <polygon points="12,18 148,10 184,30 184,86 148,106 12,98" fill="#500724" stroke="#f472b6" stroke-width="3.5"/>
    <polygon points="26,28 136,22 162,38 162,78 136,94 26,88" fill="#1e1b4b" stroke="#22d3ee" stroke-width="2"/>
    <!-- Central Paradox Core -->
    <circle cx="88" cy="58" r="24" fill="#090d16" stroke="#fde047" stroke-width="3"/>
    <polygon points="88,38 106,58 88,78 70,58" fill="#ec4899" stroke="#ffffff" stroke-width="1.5"/>
    <!-- Front Laser Mandibles -->
    <polygon points="162,18 188,28 162,38" fill="#22d3ee"/>
    <polygon points="162,78 188,88 162,98" fill="#22d3ee"/>
  </svg>`,
};

class SpriteAssetCache {
  private classImages: Partial<Record<SurvivorClassId, HTMLImageElement>> = {};
  private enemyImages: Partial<Record<EnemyType, HTMLImageElement>> = {};
  private initialized = false;

  public ensureLoaded(): void {
    if (this.initialized || typeof Image === 'undefined') return;
    this.initialized = true;

    for (const [id, svg] of Object.entries(PLAYER_CLASS_SVGS) as [
      SurvivorClassId,
      string
    ][]) {
      const img = new Image();
      img.src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
      this.classImages[id] = img;
    }

    for (const [type, svg] of Object.entries(ENEMY_TYPE_SVGS) as [
      EnemyType,
      string
    ][]) {
      const img = new Image();
      img.src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
      this.enemyImages[type] = img;
    }
  }

  public getClassSprite(id: SurvivorClassId): HTMLImageElement | undefined {
    this.ensureLoaded();
    return this.classImages[id];
  }

  public getEnemySprite(type: EnemyType): HTMLImageElement | undefined {
    this.ensureLoaded();
    return this.enemyImages[type];
  }

  public getClassDataUri(id: SurvivorClassId): string {
    return `data:image/svg+xml;utf8,${encodeURIComponent(PLAYER_CLASS_SVGS[id])}`;
  }

  public getEnemyDataUri(type: EnemyType): string {
    return `data:image/svg+xml;utf8,${encodeURIComponent(ENEMY_TYPE_SVGS[type])}`;
  }
}

export const spriteCache = new SpriteAssetCache();
