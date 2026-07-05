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
 */
import type { ToolId } from './items';

/** arena playfield in tiles (matches the arena rect in world-data.json) */
export const ARENA_W = 17;
export const ARENA_H = 13;

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
 * scale-up with the base tool's crit + cadence.
 */
export const WEAPON_COMBAT: Partial<Record<ToolId, WeaponCombat>> = {
  bow: { min: 2, max: 2, critChance: 0.06, critMult: 1.5, attackMs: 500 },
  pickaxe: { min: 2, max: 3, critChance: 0.1, critMult: 1.8, attackMs: 400 },
  axe: { min: 2, max: 4, critChance: 0.16, critMult: 2.0, attackMs: 556 },
  ancient_pickaxe: { min: 3, max: 5, critChance: 0.1, critMult: 1.8, attackMs: 400 },
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
 */
export function rollGuardianDamage(tool: ToolId | undefined, rng: () => number): { damage: number; crit: boolean } {
  const w = weaponCombat(tool);
  const base = w.min + Math.floor(rng() * (w.max - w.min + 1));
  const crit = w.critChance > 0 && rng() < w.critChance;
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

export function furyPhaseAt(elapsedMs: number, awakeMs: number): FuryPhase {
  const f = elapsedMs / awakeMs;
  if (f >= FURY_THRESHOLDS[1]) return FURY_PHASES[2];
  if (f >= FURY_THRESHOLDS[0]) return FURY_PHASES[1];
  return FURY_PHASES[0];
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
export function waveInfoAt(elapsedMs: number, awakeMs: number): WaveInfo {
  let startMs = 0;
  let index = 0;
  let lungeCount = 0;
  for (;;) {
    const phase = furyPhaseAt(startMs, awakeMs);
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
 * Danger tiles of a slam wave, in arena-local coordinates, as a W*H boolean
 * grid. The four authored pattern families are unchanged from v2; fury only
 * parameterizes them with extra scattered pounds (`density`). Each leaves
 * dodgeable safe ground.
 */
export function waveTiles(index: number, density = 1): boolean[] {
  const grid = new Array<boolean>(ARENA_W * ARENA_H).fill(false);
  const rng = mulberry32(0x9e3779b9 ^ (index * 2654435761));
  const set = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < ARENA_W && y < ARENA_H) grid[y * ARENA_W + x] = true;
  };
  const family = index % 4;
  if (family === 0) {
    // ring around the arena center — safe inside and outside
    const cx = ARENA_W / 2 - 0.5;
    const cy = ARENA_H / 2 - 0.5;
    const r = 2.5 + rng() * (Math.min(ARENA_W, ARENA_H) / 2 - 3);
    for (let y = 0; y < ARENA_H; y++) {
      for (let x = 0; x < ARENA_W; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (Math.abs(d - r) <= 1.1) set(x, y);
      }
    }
  } else if (family === 1) {
    // cross: one 2-wide row band + one 2-wide column band
    const ry = 1 + Math.floor(rng() * (ARENA_H - 3));
    const cx = 1 + Math.floor(rng() * (ARENA_W - 3));
    for (let x = 0; x < ARENA_W; x++) {
      set(x, ry);
      set(x, ry + 1);
    }
    for (let y = 0; y < ARENA_H; y++) {
      set(cx, y);
      set(cx + 1, y);
    }
  } else if (family === 2) {
    // rhythm stripes: alternating 2-wide column bands, parity flips per wave
    const parity = Math.floor(rng() * 2);
    for (let x = 0; x < ARENA_W; x++) {
      if (Math.floor(x / 2) % 2 === parity) {
        for (let y = 0; y < ARENA_H; y++) set(x, y);
      }
    }
  } else {
    // scattered slams: a handful of 2x2 pounds
    const blobs = 5 + Math.floor(rng() * 3);
    for (let b = 0; b < blobs; b++) {
      const x = Math.floor(rng() * (ARENA_W - 1));
      const y = Math.floor(rng() * (ARENA_H - 1));
      set(x, y);
      set(x + 1, y);
      set(x, y + 1);
      set(x + 1, y + 1);
    }
  }
  // fury densification: extra 2x2 pounds on top of the base family
  const extra = Math.round((density - 1) * 6);
  for (let b = 0; b < extra; b++) {
    const x = Math.floor(rng() * (ARENA_W - 1));
    const y = Math.floor(rng() * (ARENA_H - 1));
    set(x, y);
    set(x + 1, y);
    set(x, y + 1);
    set(x + 1, y + 1);
  }
  return grid;
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
export function lungeTarget(lungeIndex: number): ArenaSpot {
  const rng = mulberry32(0x51ed270b ^ (lungeIndex * 2654435761));
  return {
    ax: 2 + Math.floor(rng() * (ARENA_W - 4)),
    ay: 2 + Math.floor(rng() * (ARENA_H - 4)),
  };
}

/** where the Guardian stands after `lungeCount` completed lunges */
export function guardianSpotAt(lungeCount: number, home: ArenaSpot): ArenaSpot {
  return lungeCount === 0 ? home : lungeTarget(lungeCount);
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
export function guardianPoseAt(elapsedMs: number, awakeMs: number, home: ArenaSpot, entrance?: ArenaSpot): GuardianPose {
  const w = waveInfoAt(elapsedMs, awakeMs);
  if (w.index === 0 && entrance) {
    if (w.msIntoWave >= w.phase.telegraphMs) {
      return { spot: entrance, target: null, windup: false, airborne: false, leapT: 1 }; // Ward slammed
    }
    const t0 = w.msIntoWave / w.phase.telegraphMs;
    if (t0 < 0.35) return { spot: home, target: entrance, windup: true, airborne: false, leapT: 0 };
    return { spot: home, target: entrance, windup: false, airborne: true, leapT: (t0 - 0.35) / 0.65 };
  }
  const from = guardianSpotAt(w.lungeCount, home);
  if (w.kind !== 'lunge') return { spot: from, target: null, windup: false, airborne: false, leapT: 0 };
  const target = lungeTarget(w.lungeCount + 1);
  if (w.msIntoWave >= w.phase.telegraphMs) {
    return { spot: target, target: null, windup: false, airborne: false, leapT: 1 }; // landed
  }
  const t = w.msIntoWave / w.phase.telegraphMs;
  if (t < 0.35) return { spot: from, target, windup: true, airborne: false, leapT: 0 };
  return { spot: from, target, windup: false, airborne: true, leapT: (t - 0.35) / 0.65 };
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
export function eyeOpenAt(elapsedMs: number, awakeMs: number): boolean {
  const e = eyeWindowOf(waveInfoAt(elapsedMs, awakeMs));
  return elapsedMs >= e.openMs && elapsedMs < e.closeMs;
}

/**
 * Server-side damage adjudication: was the eye open at any point within
 * [elapsedMs - slackMs, elapsedMs]? The slack absorbs report latency; only
 * SERVER elapsed time decides (ADR-0002). Slack < any wave period, so at
 * most the two boundary waves can hold an overlapping window.
 */
export function eyeOpenWithin(elapsedMs: number, awakeMs: number, slackMs: number): boolean {
  const lo = Math.max(0, elapsedMs - slackMs);
  for (const t of lo === elapsedMs ? [elapsedMs] : [lo, elapsedMs]) {
    const e = eyeWindowOf(waveInfoAt(t, awakeMs));
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
): boolean {
  if (ax < 0 || ay < 0 || ax >= ARENA_W || ay >= ARENA_H) return false;
  const lo = Math.max(0, elapsedMs - slackMs);
  const hi = elapsedMs + slackMs;
  let lastIndex = -1;
  for (const t of [lo, hi]) {
    const w = waveInfoAt(t, awakeMs);
    if (w.index === lastIndex) continue;
    lastIndex = w.index;
    const slamStart = w.startMs + w.phase.telegraphMs;
    const slamEnd = slamStart + w.phase.slamMs;
    if (hi < slamStart || lo > slamEnd) continue;
    if (w.index === 0 && entrance) {
      // wave 0 (ADR-0004): the engage-leap crashes on the arena entrance (the
      // Ward slam), NOT its authored slam tiles — the doorway is the danger
      if (Math.abs(ax - entrance.ax) <= LUNGE_ZONE && Math.abs(ay - entrance.ay) <= LUNGE_ZONE) return true;
      continue;
    }
    if (w.kind === 'lunge') {
      const target = lungeTarget(w.lungeCount + 1);
      if (Math.abs(ax - target.ax) <= LUNGE_ZONE && Math.abs(ay - target.ay) <= LUNGE_ZONE) return true;
    } else if (waveTiles(w.index, w.phase.density)[ay * ARENA_W + ax]) {
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
export function meleeRingWindow(w: WaveInfo): EyeWindow | null {
  if (w.index === 0 || w.kind === 'lunge') return null;
  return {
    openMs: w.startMs + w.phase.telegraphMs * MELEE_RING_HOT_FROM,
    closeMs: w.startMs + w.phase.telegraphMs,
  };
}

/** is arena tile (ax, ay) inside the melee ring around `centre`? */
export function inMeleeRing(ax: number, ay: number, centre: ArenaSpot): boolean {
  const d = Math.max(Math.abs(ax - centre.ax), Math.abs(ay - centre.ay));
  return d >= MELEE_RING_MIN && d <= MELEE_RING_MAX;
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
): boolean {
  if (ax < 0 || ay < 0 || ax >= ARENA_W || ay >= ARENA_H) return false;
  const lo = Math.max(0, elapsedMs - slackMs);
  const hi = elapsedMs + slackMs;
  let lastIndex = -1;
  for (const t of [lo, hi]) {
    const w = waveInfoAt(t, awakeMs);
    if (w.index === lastIndex) continue;
    lastIndex = w.index;
    const ring = meleeRingWindow(w);
    if (!ring) continue;
    if (hi < ring.openMs || lo > ring.closeMs) continue;
    if (inMeleeRing(ax, ay, guardianSpotAt(w.lungeCount, home))) return true;
  }
  return false;
}
