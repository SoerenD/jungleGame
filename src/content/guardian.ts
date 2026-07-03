/**
 * The Guardian's fight schedule (ADR-0002, as amended 2026-07-03): danger
 * waves, fury phases, Eye Windows and telegraphed lunges — every one of them
 * a PURE FUNCTION of time elapsed since `summonedAt`. Every client renders
 * the identical schedule locally; the server re-derives it to adjudicate
 * knockdowns AND damage validity against server time. Nothing here may key
 * on HP or on anything Players do — the Guardian never chases, aims, or
 * reacts. Difficulty is authored, like a bullet-pattern puzzle.
 *
 * This module must stay importable from node tools (generate-map) — no
 * browser globals, no ../config import (the awake window length is passed in).
 */
import type { Inventory } from '../backend/types';

/** arena playfield in tiles (matches the arena rect in world-data.json) */
export const ARENA_W = 17;
export const ARENA_H = 13;

/** server-side tolerance for client→server latency when validating hits/knockdowns */
export const ADJUDICATION_SLACK_MS = 700;

/** every landing hit deals 1 damage; owning axe/pickaxe (or tier-2) doubles it */
export function guardianDamage(inv: Inventory): number {
  const bonus =
    (inv.axe ?? 0) > 0 || (inv.pickaxe ?? 0) > 0 || (inv.ancient_axe ?? 0) > 0 || (inv.ancient_pickaxe ?? 0) > 0;
  return bonus ? 2 : 1;
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
 * Walk the wave sequence from the summon to `elapsedMs`. Each wave's length
 * and kind come from the fury phase at the wave's START, so the whole walk
 * is reproducible from `summonedAt` alone (~90 iterations for a full fight).
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

/** the Guardian's scripted position — every client and the server derive the same */
export function guardianPoseAt(elapsedMs: number, awakeMs: number, home: ArenaSpot): GuardianPose {
  const w = waveInfoAt(elapsedMs, awakeMs);
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
export function isDangerousAt(elapsedMs: number, ax: number, ay: number, awakeMs: number, slackMs = 0): boolean {
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
    if (w.kind === 'lunge') {
      const target = lungeTarget(w.lungeCount + 1);
      if (Math.abs(ax - target.ax) <= LUNGE_ZONE && Math.abs(ay - target.ay) <= LUNGE_ZONE) return true;
    } else if (waveTiles(w.index, w.phase.density)[ay * ARENA_W + ax]) {
      return true;
    }
  }
  return false;
}
