# TEMPLATE — a pure content rule module (`src/content/`)

Copied from `src/content/cultivation.ts` (ADR-0017 rung 3, shipped). Content
modules hold the game's RULES as pure functions of the real clock and their
inputs — **no server, no tick loop** (ADR-0001/0002). They must stay
**node-importable**: no browser globals, no Phaser, no `../config` import —
tunables are PASSED IN as parameters.

```ts
// Cultivation (ADR-0017 rung 3) — the Green Terraces' signature mechanic as a
// PURE function of the real clock: no server, no tick loop (ADR-0001/0002),
// exactly like the Tide's tideHeight() and the Guardian's authored schedule.
// Every client derives the identical growth stage of a wildgrain bed from
// Date.now(); the server never adjudicates it (the harvest gate is client-side,
// same trust model as the Tide reed-exposure gate + the pack cap). The period is
// PASSED IN so this module stays node-importable like tide.ts/echoes.ts — no
// browser globals, no ../config import.

/** one week in ms — the weekly-reseed rotation unit (floor(now / WEEK_MS)) */
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** the four growth stages of a wildgrain bed, bare soil → golden harvest */
export type WildgrainStage = 'bare' | 'sprout' | 'green' | 'ripe';

/**
 * A small deterministic 32-bit integer hash (mulberry32's final mixing step).
 * Pure: the same input always yields the same 0..0xffffffff output, no state.
 */
function hash32(n: number): number {
  let h = (n >>> 0) + 0x6d2b79f5;
  h = Math.imul(h ^ (h >>> 15), h | 1);
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
  return (h ^ (h >>> 14)) >>> 0;
}

/**
 * The current cultivation week — floor(now / 7d). A MONOTONE INTEGER seed for
 * the weekly reseed, NOT a phased cycle, so it never inherits the Tide's
 * 24h-divisor trap (echoes.ts vaultWeek, ADR-0017 rung 2/3 gotcha).
 */
export function cultivationWeek(now: number): number {
  return Math.floor(now / WEEK_MS);
}

/**
 * This bed's phase offset in [0, periodMs). Pure and deterministic —
 * same (bedSeed, week) always maps to the same offset.
 */
export function bedPhase(now: number, bedSeed: number, periodMs: number): number {
  const week = cultivationWeek(now);
  const mixed = (Math.imul(bedSeed >>> 0, 0x9e3779b1) ^ Math.imul(week, 0x85ebca6b)) >>> 0;
  const u = hash32(mixed) / 0x1_0000_0000; // 0..1 (never exactly 1)
  return u * periodMs;
}
```

## Rules embedded in this shape

- **Pure `f(now, seed, params)`** — every client derives the identical state
  from `Date.now()`; nothing is stored, nothing ticks (ADR-0001/0002).
- **Tunables as parameters** (`periodMs` above), never `../config` imports —
  the config value is threaded in at the call site inside a system.
- **Monotone integer seeds** for rotation (`floor(now / WEEK_MS)`), never a
  `now % period` divisor phase — the documented Tide trap.
- Header comment explains the mechanic AND its trust model in one place.
- `src/content/guardian.ts` is the canonical extreme: the ENTIRE fight is a
  pure function of `summonedAt + elapsed` (ADR-0002) and both backends
  adjudicate hits from the same schedule the client renders.
