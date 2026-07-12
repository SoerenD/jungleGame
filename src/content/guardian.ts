/**
 * The Guardian's fight schedule (ADR-0002, as amended by ADR-0004): danger
 * waves, fury phases, Eye Windows and telegraphed lunges — every one of them
 * a PURE FUNCTION of `elapsedMs`, the time since the first strike (`engagedAt`;
 * callers pass `now − engagedAt`). Every client renders the identical schedule
 * locally; the server re-derives it to adjudicate knockdowns AND damage
 * validity against server time. Nothing here may key on HP or on anything
 * Players do — the Guardian never chases, aims, or reacts. Difficulty is
 * authored, like a bullet-pattern puzzle. (Wave 0 optionally forces its
 * leap/danger to the arena entrance — the Ward slam — when an `entrance` spot
 * is supplied; that is the sole, discrete engage event, not adaptive AI.)
 *
 * This module must stay importable from node tools (generate-map) — no
 * browser globals, no ../config import (the awake window length is passed in).
 *
 * ADR-0017 T0: every schedule function is parameterized by a WardenKit and
 * defaults to GUARDIAN_KIT, so a future Warden is a second kit object — never
 * a second engine. Existing exports keep their signatures and behavior.
 */
import type { ToolId } from './items';

/** arena playfield in tiles (matches the arena rect in world-data.json) */
export const ARENA_W = 17;
export const ARENA_H = 13;

// ------------------------------------------------------------- Warden kits

/**
 * One authored fight's parameter bundle. Kits are pure data + pure functions,
 * node-importable like the rest; nothing in a kit may key on HP or Players.
 */
export interface WardenKit {
  /** stable id for art/i18n lookups — never enters the schedule maths */
  id: string;
  /** arena playfield in tiles */
  arenaW: number;
  arenaH: number;
  /** authored escalation phases; phases[i+1] applies past furyThresholds[i] */
  phases: FuryPhase[];
  /** phase transitions at fixed fractions of the awake window — TIME ONLY, never HP */
  furyThresholds: readonly number[];
  /** deterministic danger pattern of slam wave `index` as an arenaW*arenaH grid */
  waveTiles(index: number, density: number): boolean[];
  /** seed of the pre-determined lunge-landing sequence */
  lungeSeed: number;
  /** landing zone half-size: lunges knock down a (2z+1)² square around the spot */
  lungeZone: number;
  /** melee danger-ring band, Chebyshev distance from the scripted centre */
  meleeRingMin: number;
  meleeRingMax: number;
  /** the ring is hot from this fraction of the wind-up through to the slam */
  meleeRingHotFrom: number;
  /** fraction of a telegraph spent rearing up before going airborne */
  lungeWindupFrac: number;
  /** engage leap (wave 0 Ward slam): beat held at the gate / return-arc length */
  engageHoldMs: number;
  engageReturnMs: number;
}

/** server-side tolerance for client→server latency when validating hits/knockdowns */
export const ADJUDICATION_SLACK_MS = 700;

// ------------------------------------------------------------- weapon damage

/**
 * Cosmetic multiplier applied to on-screen damage + HP ONLY (the float text and
 * the HP bar) — never to the authoritative roll or the stored pool (ADR-0006
 * §5). Because it hits damage and HP identically it is provably balance-neutral:
 * hits-to-kill is unchanged. Pure data — safe for node importers.
 */
export const GUARDIAN_DISPLAY_SCALE = 6;

/**
 * One weapon's Guardian-combat profile (ADR-0006). Numbers are BASE
 * (pre-display-scale) units, the same small magnitude as the retired flat model
 * (~2–3 per hit); the ×GUARDIAN_DISPLAY_SCALE happens at render time only.
 * **DPS = avg band × attack speed × crit factor** is the balance axis, not the
 * per-hit number. `attackMs` is the COMBAT swing cadence — it applies only when
 * striking the Guardian; harvesting always keeps config's uniform
 * SWING_CADENCE_MS (§4). Bare hands and any non-combat Tool fall back to
 * BARE_HANDS: a weak, crit-less baseline (never locked out — but bring a weapon).
 */
export interface WeaponCombat {
  /** inclusive damage band, base units */
  min: number;
  max: number;
  /** passive crit chance 0..1 (0 → cannot crit) */
  critChance: number;
  /** crit damage multiplier on the rolled band value */
  critMult: number;
  /** combat-only swing cadence in ms (= 1000 / attacks-per-second) */
  attackMs: number;
}

/** bare hands / any non-combat Tool: weakest, never crits, slow */
export const BARE_HANDS: WeaponCombat = { min: 1, max: 2, critChance: 0, critMult: 1, attackMs: 667 };

/**
 * The Tools that meaningfully strike the Guardian; anything else → BARE_HANDS.
 * Intended relationships (hold these when tuning integers): Bow ≈ 60% of melee
 * DPS (a safety tax for hitting from range); axe ≈ pickaxe DPS but opposite feel
 * (axe wide/swingy/high-crit, pickaxe fast/steady/narrow); ancients a ~×1.6 band
 * scale-up with the base tool's crit. The Ancient Pickaxe alone pays a small
 * cadence tax over its base tool (460 vs 400 ms) so the whole top CRAFTED melee
 * tier — ancient axe/pickaxe, Sword, Forgebrand — converges at ~9.4 net DPS:
 * the harvest key that opens the Delve must never outclass the pure-combat
 * weapons forged from its loot (only the Fabled tier sits above, ~12+).
 */
export const WEAPON_COMBAT: Partial<Record<ToolId, WeaponCombat>> = {
  bow: { min: 2, max: 2, critChance: 0.06, critMult: 1.5, attackMs: 500 },
  pickaxe: { min: 2, max: 3, critChance: 0.1, critMult: 1.8, attackMs: 400 },
  axe: { min: 2, max: 4, critChance: 0.16, critMult: 2.0, attackMs: 556 },
  ancient_pickaxe: { min: 3, max: 5, critChance: 0.1, critMult: 1.8, attackMs: 460 },
  ancient_axe: { min: 3, max: 6, critChance: 0.16, critMult: 2.0, attackMs: 556 },
  // The Sword (ADR-0007): the game's first PURE-COMBAT weapon — no harvest use.
  // It sits at the top of the melee band (≈ ancient-axe DPS) with its own crit +
  // cadence, and unlike every other weapon it strikes Husks, the Deep Guardian,
  // AND the Guardian. Crafted from Delve loot; plugs straight into this table.
  sword: { min: 3, max: 5, critChance: 0.14, critMult: 1.9, attackMs: 480 },
  // The Forgebrand (ADR-0011): the Deep's PURE-COMBAT reward — a molten
  // two-hander and a true SIDEGRADE to the Sword, not an upgrade. It trades the
  // Sword's tempo for weight: a SLOWER cadence (640 vs 480 ms) and a heavier,
  // higher per-hit band (4–6 vs 3–5) with a punchier crit, tuned so its net DPS
  // ~9.4 ≈ the Sword's ~9.4 — the axe-vs-pickaxe "same DPS, opposite feel" at the
  // top melee tier. Like the Sword it strikes Husks, both bosses, and the Guardian.
  forgebrand: { min: 4, max: 6, critChance: 0.2, critMult: 2.0, attackMs: 640 },
  // The Fabled set — rare (~1%) BOSS-ONLY world-drops, one clear tier above every
  // crafted weapon (net DPS ~11–12 base vs the ~9.4 top of the crafted tier).
  // fabled_sword: the Sword's keen tempo, sharper. fabled_axe: the Ancient Axe's
  // wide high-crit weight, heavier. fabled_bow: still range-taxed vs melee, but
  // roughly double the plain Bow. All three strike Husks, both bosses, and the Guardian.
  fabled_sword: { min: 4, max: 6, critChance: 0.18, critMult: 2.0, attackMs: 460 },
  fabled_axe: { min: 4, max: 7, critChance: 0.22, critMult: 2.1, attackMs: 540 },
  fabled_bow: { min: 3, max: 4, critChance: 0.12, critMult: 1.7, attackMs: 460 },
};

/** the combat profile of the in-hand Tool (bare hands / non-combat → BARE_HANDS) */
export function weaponCombat(tool: ToolId | undefined): WeaponCombat {
  return (tool && WEAPON_COMBAT[tool]) || BARE_HANDS;
}

/**
 * Roll one landing hit's damage + crit for the in-hand Tool, using an INJECTED
 * rng (backends pass Math.random) so this module stays node-importable — no
 * browser globals, no config/inventory read. Damage is in base units; a crit
 * multiplies the rolled band value. The Tool is already ownership-validated by
 * the caller. Replaces the retired flat guardianDamage().
 *
 * `band` is the worn Armor's flat band raise (ADR-0017 §3, the Hushsteel
 * Helm): it widens the roll's min/max BEFORE the crit multiplier, applied to
 * whatever is in hand (bare hands included — the helm weights the blow, not
 * the weapon). Passed in like `bonusCrit` so this module stays inventory-blind.
 */
export function rollGuardianDamage(
  tool: ToolId | undefined,
  rng: () => number,
  bonusCrit = 0,
  band?: { bandMin: number; bandMax: number },
): { damage: number; crit: boolean } {
  const w = weaponCombat(tool);
  const lo = w.min + (band?.bandMin ?? 0);
  const hi = w.max + (band?.bandMax ?? 0);
  const base = lo + Math.floor(rng() * (Math.max(lo, hi) - lo + 1));
  // ADR-0013: the Village's collective crit buff sharpens weapons that can
  // already crit; bare hands stay crit-less by design.
  const chance = w.critChance > 0 ? Math.min(1, w.critChance + bonusCrit) : 0;
  const crit = chance > 0 && rng() < chance;
  const damage = Math.max(1, Math.round(crit ? base * w.critMult : base));
  return { damage, crit };
}

/** average band value in base units */
export function weaponAvg(w: WeaponCombat): number {
  return (w.min + w.max) / 2;
}

/** a weapon's DPS in DISPLAY units: avg band × crit factor × attacks-per-second × scale */
export function weaponDps(tool: ToolId | undefined): number {
  const w = weaponCombat(tool);
  const critFactor = 1 + w.critChance * (w.critMult - 1);
  return weaponAvg(w) * critFactor * (1000 / w.attackMs) * GUARDIAN_DISPLAY_SCALE;
}

/**
 * One-line tooltip summary: band · crit · attack speed · DPS, all in display
 * units. Localizable via `labels` (the caller in a browser passes translations);
 * the defaults keep this node-importable with no i18n dependency.
 */
export function weaponStatLine(
  tool: ToolId | undefined,
  labels: { dmg: string; crit: string; noCrit: string; dps: string } = { dmg: 'dmg', crit: 'crit', noCrit: 'no crit', dps: 'DPS' },
): string {
  const w = weaponCombat(tool);
  const s = GUARDIAN_DISPLAY_SCALE;
  const band = w.min === w.max ? `${w.min * s}` : `${w.min * s}–${w.max * s}`;
  const crit = w.critChance > 0 ? `${Math.round(w.critChance * 100)}% ×${w.critMult.toFixed(1)} ${labels.crit}` : labels.noCrit;
  const aps = (1000 / w.attackMs).toFixed(1);
  return `⚔ ${band} ${labels.dmg} · ${crit} · ${aps}/s · ~${Math.round(weaponDps(tool))} ${labels.dps}`;
}

/**
 * The same band · crit · attack speed · DPS numbers as `weaponStatLine`, but as
 * separate display-unit pieces so a multi-line panel (the inventory hover popup,
 * hud.ts) can put each on its own row. Keeps the ×scale + crit-factor maths in
 * one place; node-importable, no i18n.
 */
export function weaponStatParts(tool: ToolId | undefined): {
  band: string;
  canCrit: boolean;
  critPct: number;
  critMult: number;
  aps: string;
  dps: number;
} {
  const w = weaponCombat(tool);
  const s = GUARDIAN_DISPLAY_SCALE;
  return {
    band: w.min === w.max ? `${w.min * s}` : `${w.min * s}–${w.max * s}`,
    canCrit: w.critChance > 0,
    critPct: Math.round(w.critChance * 100),
    critMult: w.critMult,
    aps: (1000 / w.attackMs).toFixed(2),
    dps: Math.round(weaponDps(tool)),
  };
}

// ------------------------------------------------------------- fury phases

/**
 * One authored fury phase. Waves shorten, danger densifies, Eye Windows
 * shrink and lunges come more often as the fight escalates.
 */
export interface FuryPhase {
  index: 0 | 1 | 2;
  name: 'calm' | 'restless' | 'fury';
  /** one wave = telegraph → slam → Eye Window; repeats while the phase lasts */
  wavePeriodMs: number;
  /** the telegraph glows from wave start; the slam lands this far in */
  telegraphMs: number;
  /** how long the slammed tiles stay dangerous */
  slamMs: number;
  /** the Eye Window opens right after the slam window, for this long */
  eyeMs: number;
  /** danger-tile density multiplier (extra scattered pounds on the base family) */
  density: number;
  /** every Nth wave is a telegraphed lunge instead of a tile slam */
  lungeEvery: number;
}

export const FURY_PHASES: FuryPhase[] = [
  { index: 0, name: 'calm', wavePeriodMs: 5_000, telegraphMs: 1_800, slamMs: 800, eyeMs: 2_400, density: 1.0, lungeEvery: 5 },
  { index: 1, name: 'restless', wavePeriodMs: 4_200, telegraphMs: 1_500, slamMs: 800, eyeMs: 1_900, density: 1.35, lungeEvery: 4 },
  { index: 2, name: 'fury', wavePeriodMs: 3_400, telegraphMs: 1_200, slamMs: 800, eyeMs: 1_400, density: 1.7, lungeEvery: 3 },
];

/** phase transitions at fixed fractions of the awake window — TIME ONLY, never HP */
export const FURY_THRESHOLDS = [0.4, 0.75] as const;

export function furyPhaseAt(elapsedMs: number, awakeMs: number, kit: WardenKit = GUARDIAN_KIT): FuryPhase {
  const f = elapsedMs / awakeMs;
  for (let i = kit.furyThresholds.length - 1; i >= 0; i--) {
    if (f >= kit.furyThresholds[i]) return kit.phases[i + 1];
  }
  return kit.phases[0];
}

// ------------------------------------------------------------- the wave walk

/** a slam wave pounds authored tiles; a lunge wave relocates the Guardian */
export interface WaveInfo {
  index: number;
  /** elapsed ms at which this wave started */
  startMs: number;
  phase: FuryPhase;
  msIntoWave: number;
  kind: 'slam' | 'lunge';
  /** lunges completed BEFORE this wave — identifies where the Guardian stands */
  lungeCount: number;
}

/**
 * Walk the wave sequence from the first strike to `elapsedMs`. Each wave's
 * length and kind come from the fury phase at the wave's START, so the whole
 * walk is reproducible from `engagedAt` alone (~90 iterations for a full fight).
 */
export function waveInfoAt(elapsedMs: number, awakeMs: number, kit: WardenKit = GUARDIAN_KIT): WaveInfo {
  let startMs = 0;
  let index = 0;
  let lungeCount = 0;
  for (;;) {
    const phase = furyPhaseAt(startMs, awakeMs, kit);
    const kind: WaveInfo['kind'] = index > 0 && index % phase.lungeEvery === 0 ? 'lunge' : 'slam';
    if (elapsedMs < startMs + phase.wavePeriodMs) {
      return { index, startMs, phase, msIntoWave: elapsedMs - startMs, kind, lungeCount };
    }
    if (kind === 'lunge') lungeCount++;
    startMs += phase.wavePeriodMs;
    index++;
  }
}

// deterministic per-wave RNG — same as the map generator's
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The Guardian's four authored slam families (ring / cross / rhythm stripes /
 * scattered pounds), unchanged from v2, as a kit-pluggable factory: a future
 * Warden may reuse them on its own arena + seed, or bring its own pattern fn.
 * Fury only parameterizes them with extra scattered pounds (`density`). Each
 * leaves dodgeable safe ground.
 */
export function makeSlamFamilyWaveTiles(w: number, h: number, seed: number): WardenKit['waveTiles'] {
  return (index: number, density: number): boolean[] => {
    const grid = new Array<boolean>(w * h).fill(false);
    const rng = mulberry32(seed ^ (index * 2654435761));
    const set = (x: number, y: number) => {
      if (x >= 0 && y >= 0 && x < w && y < h) grid[y * w + x] = true;
    };
    const family = index % 4;
    if (family === 0) {
      // ring around the arena center — safe inside and outside
      const cx = w / 2 - 0.5;
      const cy = h / 2 - 0.5;
      const r = 2.5 + rng() * (Math.min(w, h) / 2 - 3);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const d = Math.hypot(x - cx, y - cy);
          if (Math.abs(d - r) <= 1.1) set(x, y);
        }
      }
    } else if (family === 1) {
      // cross: one 2-wide row band + one 2-wide column band
      const ry = 1 + Math.floor(rng() * (h - 3));
      const cx = 1 + Math.floor(rng() * (w - 3));
      for (let x = 0; x < w; x++) {
        set(x, ry);
        set(x, ry + 1);
      }
      for (let y = 0; y < h; y++) {
        set(cx, y);
        set(cx + 1, y);
      }
    } else if (family === 2) {
      // rhythm stripes: alternating 2-wide column bands, parity flips per wave
      const parity = Math.floor(rng() * 2);
      for (let x = 0; x < w; x++) {
        if (Math.floor(x / 2) % 2 === parity) {
          for (let y = 0; y < h; y++) set(x, y);
        }
      }
    } else {
      // scattered slams: a handful of 2x2 pounds
      const blobs = 5 + Math.floor(rng() * 3);
      for (let b = 0; b < blobs; b++) {
        const x = Math.floor(rng() * (w - 1));
        const y = Math.floor(rng() * (h - 1));
        set(x, y);
        set(x + 1, y);
        set(x, y + 1);
        set(x + 1, y + 1);
      }
    }
    // fury densification: extra 2x2 pounds on top of the base family
    const extra = Math.round((density - 1) * 6);
    for (let b = 0; b < extra; b++) {
      const x = Math.floor(rng() * (w - 1));
      const y = Math.floor(rng() * (h - 1));
      set(x, y);
      set(x + 1, y);
      set(x, y + 1);
      set(x + 1, y + 1);
    }
    return grid;
  };
}

/** danger tiles of the kit's slam wave `index`, in arena-local coordinates */
export function waveTiles(index: number, density = 1, kit: WardenKit = GUARDIAN_KIT): boolean[] {
  return kit.waveTiles(index, density);
}

// ------------------------------------------------------------- lunges

export interface ArenaSpot {
  ax: number;
  ay: number;
}

/** landing zone half-size: lunges knock down a 3x3 around the landing spot */
export const LUNGE_ZONE = 1;

/**
 * Pre-determined landing spot of the Nth lunge (1-based) — pure f(index),
 * kept a full zone inside the arena border.
 */
export function lungeTarget(lungeIndex: number, kit: WardenKit = GUARDIAN_KIT): ArenaSpot {
  const rng = mulberry32(kit.lungeSeed ^ (lungeIndex * 2654435761));
  return {
    ax: 2 + Math.floor(rng() * (kit.arenaW - 4)),
    ay: 2 + Math.floor(rng() * (kit.arenaH - 4)),
  };
}

/** where the Guardian stands after `lungeCount` completed lunges */
export function guardianSpotAt(lungeCount: number, home: ArenaSpot, kit: WardenKit = GUARDIAN_KIT): ArenaSpot {
  return lungeCount === 0 ? home : lungeTarget(lungeCount, kit);
}

export interface GuardianPose {
  /** center tile it currently occupies (the landing spot once it lands) */
  spot: ArenaSpot;
  /** during a lunge wave: where it will crash down */
  target: ArenaSpot | null;
  /** rearing up before the leap */
  windup: boolean;
  airborne: boolean;
  /** 0..1 through the leap while airborne */
  leapT: number;
}

/**
 * The Guardian's scripted position — every client and the server derive the
 * same. v5 (ADR-0004): wave 0 is the ENGAGE LEAP. When an `entrance` spot is
 * supplied, wave 0 forces the Guardian to bound from `home` to the arena
 * entrance and slam the Ward shut (reusing the ordinary lunge windup/airborne
 * curve; only the target is overridden). Purely additive — wave ≥1 and every
 * authored number are untouched; omit `entrance` and behaviour is unchanged.
 */
export function guardianPoseAt(
  elapsedMs: number,
  awakeMs: number,
  home: ArenaSpot,
  entrance?: ArenaSpot,
  kit: WardenKit = GUARDIAN_KIT,
): GuardianPose {
  const w = waveInfoAt(elapsedMs, awakeMs, kit);
  const wind = kit.lungeWindupFrac;
  if (w.index === 0 && entrance) {
    const teleg = w.phase.telegraphMs;
    // OUT: rear up at home, then leap home → entrance, crashing the Ward shut at `teleg`
    if (w.msIntoWave < teleg) {
      const t0 = w.msIntoWave / teleg;
      if (t0 < wind) return { spot: home, target: entrance, windup: true, airborne: false, leapT: 0 };
      return { spot: home, target: entrance, windup: false, airborne: true, leapT: (t0 - wind) / (1 - wind) };
    }
    // landed on the entrance (Ward slammed). Hold a beat at the gate, then LEAP
    // BACK home — a visible bound, not a teleport — settling just as wave 0's
    // first Eye Window opens. Purely the engage-leap's return arc; wave ≥1 and
    // every authored number stay untouched.
    const sinceSlam = w.msIntoWave - teleg;
    if (sinceSlam < kit.engageHoldMs) return { spot: entrance, target: null, windup: false, airborne: false, leapT: 1 };
    if (sinceSlam < kit.engageHoldMs + kit.engageReturnMs) {
      return { spot: entrance, target: home, windup: false, airborne: true, leapT: (sinceSlam - kit.engageHoldMs) / kit.engageReturnMs };
    }
    return { spot: home, target: null, windup: false, airborne: false, leapT: 0 };
  }
  const from = guardianSpotAt(w.lungeCount, home, kit);
  if (w.kind !== 'lunge') return { spot: from, target: null, windup: false, airborne: false, leapT: 0 };
  const target = lungeTarget(w.lungeCount + 1, kit);
  if (w.msIntoWave >= w.phase.telegraphMs) {
    return { spot: target, target: null, windup: false, airborne: false, leapT: 1 }; // landed
  }
  const t = w.msIntoWave / w.phase.telegraphMs;
  if (t < wind) return { spot: from, target, windup: true, airborne: false, leapT: 0 };
  return { spot: from, target, windup: false, airborne: true, leapT: (t - wind) / (1 - wind) };
}

// ------------------------------------------------------------- Eye Windows

export interface EyeWindow {
  openMs: number;
  closeMs: number;
}

/** the Eye Window of one wave: opens right after the slam window closes */
export function eyeWindowOf(w: WaveInfo): EyeWindow {
  const openMs = w.startMs + w.phase.telegraphMs + w.phase.slamMs;
  return { openMs, closeMs: Math.min(openMs + w.phase.eyeMs, w.startMs + w.phase.wavePeriodMs) };
}

/** is the amber eye open at this instant? (client-side rendering/prediction) */
export function eyeOpenAt(elapsedMs: number, awakeMs: number, kit: WardenKit = GUARDIAN_KIT): boolean {
  const e = eyeWindowOf(waveInfoAt(elapsedMs, awakeMs, kit));
  return elapsedMs >= e.openMs && elapsedMs < e.closeMs;
}

/**
 * Server-side damage adjudication: was the eye open at any point within
 * [elapsedMs - slackMs, elapsedMs]? The slack absorbs report latency; only
 * SERVER elapsed time decides (ADR-0002). Slack < any wave period, so at
 * most the two boundary waves can hold an overlapping window.
 */
export function eyeOpenWithin(elapsedMs: number, awakeMs: number, slackMs: number, kit: WardenKit = GUARDIAN_KIT): boolean {
  const lo = Math.max(0, elapsedMs - slackMs);
  for (const t of lo === elapsedMs ? [elapsedMs] : [lo, elapsedMs]) {
    const e = eyeWindowOf(waveInfoAt(t, awakeMs, kit));
    if (lo < e.closeMs && elapsedMs >= e.openMs) return true;
  }
  return false;
}

// ------------------------------------------------------------- knockdowns

/**
 * Server-side knockdown adjudication: was arena tile (ax, ay) inside a
 * slamming danger zone — tile wave or lunge landing — within ±slackMs of
 * `elapsedMs` since the summon? Client clocks never decide (ADR-0002).
 */
export function isDangerousAt(
  elapsedMs: number,
  ax: number,
  ay: number,
  awakeMs: number,
  slackMs = 0,
  entrance?: ArenaSpot,
  kit: WardenKit = GUARDIAN_KIT,
): boolean {
  if (ax < 0 || ay < 0 || ax >= kit.arenaW || ay >= kit.arenaH) return false;
  const lo = Math.max(0, elapsedMs - slackMs);
  const hi = elapsedMs + slackMs;
  let lastIndex = -1;
  for (const t of [lo, hi]) {
    const w = waveInfoAt(t, awakeMs, kit);
    if (w.index === lastIndex) continue;
    lastIndex = w.index;
    const slamStart = w.startMs + w.phase.telegraphMs;
    const slamEnd = slamStart + w.phase.slamMs;
    if (hi < slamStart || lo > slamEnd) continue;
    if (w.index === 0 && entrance) {
      // wave 0 (ADR-0004): the engage-leap crashes on the arena entrance (the
      // Ward slam), NOT its authored slam tiles — the doorway is the danger
      if (Math.abs(ax - entrance.ax) <= kit.lungeZone && Math.abs(ay - entrance.ay) <= kit.lungeZone) return true;
      continue;
    }
    if (w.kind === 'lunge') {
      const target = lungeTarget(w.lungeCount + 1, kit);
      if (Math.abs(ax - target.ax) <= kit.lungeZone && Math.abs(ay - target.ay) <= kit.lungeZone) return true;
    } else if (kit.waveTiles(w.index, w.phase.density)[ay * kit.arenaW + ax]) {
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- melee danger-ring

/**
 * The authored melee tax (ADR-0006 §7). A danger-ring hugs the Guardian's 3×3
 * footprint — the arena tiles at Chebyshev distance MELEE_RING_MIN..MAX from its
 * scripted centre, i.e. exactly where a melee attacker must stand. A Bow user
 * (~8 tiles out) sits clear of it. The ring is hot only during the wind-up slice
 * of each stationary slam wave, so camping on the body between Eye Windows costs
 * knockdowns while ranged play stays safe — the higher melee DPS taxed
 * positionally, never reactively. Like every danger source here it is a PURE
 * function of the schedule + the Guardian's scripted spot (ADR-0002): the
 * Guardian never reacts. Lunge waves and wave 0 (the Ward slam) carry no ring.
 */
export const MELEE_RING_MIN = 2;
export const MELEE_RING_MAX = 3;
/** the ring is hot from this fraction of the wind-up through to the slam */
export const MELEE_RING_HOT_FROM = 0.45;

/** the ring's hot window within a wave, or null if this wave carries no ring */
export function meleeRingWindow(w: WaveInfo, kit: WardenKit = GUARDIAN_KIT): EyeWindow | null {
  if (w.index === 0 || w.kind === 'lunge') return null;
  return {
    openMs: w.startMs + w.phase.telegraphMs * kit.meleeRingHotFrom,
    closeMs: w.startMs + w.phase.telegraphMs,
  };
}

/** is arena tile (ax, ay) inside the melee ring around `centre`? */
export function inMeleeRing(ax: number, ay: number, centre: ArenaSpot, kit: WardenKit = GUARDIAN_KIT): boolean {
  const d = Math.max(Math.abs(ax - centre.ax), Math.abs(ay - centre.ay));
  return d >= kit.meleeRingMin && d <= kit.meleeRingMax;
}

/**
 * Server-side melee-ring adjudication: was tile (ax, ay) inside the HOT ring
 * around the Guardian's scripted spot within ±slackMs of `elapsedMs`? Mirrors
 * isDangerousAt's slack discipline; `home` locates the ring's centre via the
 * same guardianSpotAt() every client renders with.
 */
export function inMeleeRingDangerAt(
  elapsedMs: number,
  ax: number,
  ay: number,
  awakeMs: number,
  home: ArenaSpot,
  slackMs = 0,
  kit: WardenKit = GUARDIAN_KIT,
): boolean {
  if (ax < 0 || ay < 0 || ax >= kit.arenaW || ay >= kit.arenaH) return false;
  const lo = Math.max(0, elapsedMs - slackMs);
  const hi = elapsedMs + slackMs;
  let lastIndex = -1;
  for (const t of [lo, hi]) {
    const w = waveInfoAt(t, awakeMs, kit);
    if (w.index === lastIndex) continue;
    lastIndex = w.index;
    const ring = meleeRingWindow(w, kit);
    if (!ring) continue;
    if (hi < ring.openMs || lo > ring.closeMs) continue;
    if (inMeleeRing(ax, ay, guardianSpotAt(w.lungeCount, home, kit), kit)) return true;
  }
  return false;
}

// ------------------------------------------------------------- the first kit

/**
 * The Guardian — the ladder's rung 0 and the kit every legacy export defaults
 * to. Defined last so it can bundle the authored tables/constants above, which
 * remain the exported single source of the Guardian's numbers.
 */
export const GUARDIAN_KIT: WardenKit = {
  id: 'guardian',
  arenaW: ARENA_W,
  arenaH: ARENA_H,
  phases: FURY_PHASES,
  furyThresholds: FURY_THRESHOLDS,
  waveTiles: makeSlamFamilyWaveTiles(ARENA_W, ARENA_H, 0x9e3779b9),
  lungeSeed: 0x51ed270b,
  lungeZone: LUNGE_ZONE,
  meleeRingMin: MELEE_RING_MIN,
  meleeRingMax: MELEE_RING_MAX,
  meleeRingHotFrom: MELEE_RING_HOT_FROM,
  lungeWindupFrac: 0.35,
  engageHoldMs: 220,
  engageReturnMs: 560,
};
