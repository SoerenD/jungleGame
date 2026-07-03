/**
 * The Guardian's attack pattern (ADR-0002): telegraphed danger zones on arena
 * tiles as a PURE FUNCTION of time elapsed since `summonedAt`. Every client
 * renders the identical schedule locally; the server re-derives it to
 * adjudicate knockdowns against server time. No AI, no tick loop — the
 * Guardian never chases or aims. Difficulty is authored, like a
 * bullet-pattern puzzle.
 *
 * This module must stay importable from node tools (generate-map) — no
 * browser globals, no ../config import.
 */
import type { Inventory } from '../backend/types';

/** arena playfield in tiles (matches the arena rect in world-data.json) */
export const ARENA_W = 17;
export const ARENA_H = 13;

/** one wave = telegraph → slam → calm; repeats forever while awake */
export const WAVE_MS = 5_000;
/** the telegraph glows from wave start; the slam lands this far in */
export const TELEGRAPH_MS = 1_800;
/** how long the slammed tiles stay dangerous */
export const TRIGGER_WINDOW_MS = 800;
/** server-side tolerance for client→server latency when validating a knockdown */
export const ADJUDICATION_SLACK_MS = 700;

/** every Player hit deals 1 damage; owning axe/pickaxe (or tier-2) doubles it */
export function guardianDamage(inv: Inventory): number {
  const bonus =
    (inv.axe ?? 0) > 0 || (inv.pickaxe ?? 0) > 0 || (inv.ancient_axe ?? 0) > 0 || (inv.ancient_pickaxe ?? 0) > 0;
  return bonus ? 2 : 1;
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

export interface WavePhase {
  index: number;
  /** ms into the current wave */
  phaseMs: number;
}

export function waveAt(elapsedMs: number): WavePhase {
  const index = Math.floor(elapsedMs / WAVE_MS);
  return { index, phaseMs: elapsedMs - index * WAVE_MS };
}

/**
 * Danger tiles of a wave, in arena-local coordinates, as a W*H boolean grid.
 * Authored pattern families cycle with per-wave variation; each leaves
 * dodgeable safe ground.
 */
export function waveTiles(index: number): boolean[] {
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
  return grid;
}

/**
 * Server-side adjudication: was arena tile (ax, ay) inside a slamming danger
 * zone at `elapsedMs` since the summon? `slackMs` widens the slam window to
 * absorb report latency (client clocks never decide — ADR-0002).
 */
export function isDangerousAt(elapsedMs: number, ax: number, ay: number, slackMs = 0): boolean {
  if (ax < 0 || ay < 0 || ax >= ARENA_W || ay >= ARENA_H) return false;
  const { index, phaseMs } = waveAt(elapsedMs);
  if (phaseMs < TELEGRAPH_MS - slackMs || phaseMs > TELEGRAPH_MS + TRIGGER_WINDOW_MS + slackMs) return false;
  return waveTiles(index)[ay * ARENA_W + ax];
}
