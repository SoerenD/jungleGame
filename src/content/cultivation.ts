// Cultivation (ADR-0017 rung 3) — the Green Terraces' signature mechanic as a
// PURE function of the real clock: no server, no tick loop (ADR-0001/0002),
// exactly like the Tide's tideHeight() and the Guardian's authored schedule.
// Every client derives the identical growth stage of a wildgrain bed from
// Date.now(); the server never adjudicates it (the harvest gate is client-side,
// same trust model as the Tide reed-exposure gate + the pack cap). The period is
// PASSED IN so this module stays node-importable like tide.ts/echoes.ts — no
// browser globals, no ../config import.
//
// The new verb vs. the Tide: the Tide is a single GLOBAL phase (one water level
// for the whole district), while Cultivation gives EACH BED its own phase offset
// derived from the bed's numeric seed (its node id upstream), so ripeness sweeps
// the field as a spatial gradient and players route between ripe beds. The whole
// schedule then ROTATES every real week via cultivationWeek(now) — the echoes.ts
// vaultWeek idiom: a MONOTONE INTEGER seed (floor(now / 7d)), NOT a `now % 24h`
// divisor phase (the trap tide.ts warns about). This is the renewable "return
// hook": each real week reseeds every bed's appointment.

/** one week in ms — the weekly-reseed rotation unit (floor(now / WEEK_MS)) */
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** the four growth stages of a wildgrain bed, bare soil → golden harvest */
export type WildgrainStage = 'bare' | 'sprout' | 'green' | 'ripe';

/**
 * Fraction of the cycle spent RIPE (the final, harvestable window). The three
 * growing stages share the remaining 1 - RIPE_FRACTION. Kept generous enough
 * that a routed player reliably meets a ripe bed even at the production period.
 */
export const RIPE_FRACTION = 0.2;

/** growth-position (0..1 through one cycle) boundaries between the four stages:
 *  bare [0,SPROUT) · sprout [SPROUT,GREEN) · green [GREEN,RIPE) · ripe [RIPE,1) */
export const STAGE_SPROUT = 0.27;
export const STAGE_GREEN = 0.53;
export const STAGE_RIPE = 1 - RIPE_FRACTION; // 0.80

/**
 * A small deterministic 32-bit integer hash (mulberry32's final mixing step).
 * Pure: the same input always yields the same 0..0xffffffff output, no state.
 * Used to scatter each bed's phase offset so beds don't ripen in lockstep.
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
 * 24h-divisor trap (echoes.ts vaultWeek, ADR-0017 rung 2/3 gotcha). Every bed's
 * phase offset folds this in, so the whole field's schedule rotates each week.
 */
export function cultivationWeek(now: number): number {
  return Math.floor(now / WEEK_MS);
}

/**
 * This bed's phase offset in [0, periodMs). Folds the bed's numeric seed with
 * cultivationWeek(now) through hash32, so (a) each bed sits at its own point in
 * the growth cycle (the spatial ripeness gradient) and (b) the whole schedule
 * shifts every real week (the reseed return-hook). Pure and deterministic —
 * same (bedSeed, week) always maps to the same offset.
 */
export function bedPhase(now: number, bedSeed: number, periodMs: number): number {
  const week = cultivationWeek(now);
  // mix the seed and week so neither dominates and adjacent seeds don't cluster
  const mixed = (Math.imul(bedSeed >>> 0, 0x9e3779b1) ^ Math.imul(week, 0x85ebca6b)) >>> 0;
  const u = hash32(mixed) / 0x1_0000_0000; // 0..1 (never exactly 1)
  return u * periodMs;
}

/**
 * This bed's growth position 0..1 through the current cycle (0 = freshly reset
 * bare soil, → 1 = end of the ripe window). Pure f(clock, seed): the bed's phase
 * offset advances the clock so each bed reads a different point of the shared
 * cycle. The weekly reseed re-rolls the offset, which is the intended once-a-week
 * discontinuity (the field's appointments rotate).
 */
export function wildgrainGrowth(now: number, bedSeed: number, periodMs: number): number {
  const t = now + bedPhase(now, bedSeed, periodMs);
  return (((t % periodMs) + periodMs) % periodMs) / periodMs;
}

/** this bed's discrete growth stage at `now` (drives the bed's sprite/tint) */
export function wildgrainStage(now: number, bedSeed: number, periodMs: number): WildgrainStage {
  const g = wildgrainGrowth(now, bedSeed, periodMs);
  if (g >= STAGE_RIPE) return 'ripe';
  if (g >= STAGE_GREEN) return 'green';
  if (g >= STAGE_SPROUT) return 'sprout';
  return 'bare';
}

/** is this bed in its ripe window right now? (the raw harvest predicate) */
export function wildgrainRipe(now: number, bedSeed: number, periodMs: number): boolean {
  return wildgrainStage(now, bedSeed, periodMs) === 'ripe';
}

/**
 * Was this bed ripe at any point within ±slackMs of `now`? The slack is a
 * latency grace (the tide.ts tideExposedWithin / guardian.ts eyeOpenWithin
 * idiom): a swing at the very edge of the ripe window still lands. slackMs must
 * stay well under the ripe window (RIPE_FRACTION × periodMs) or it swallows a
 * whole stage — config dev-scales it for the shortened test periods.
 */
export function wildgrainRipeWithin(
  now: number,
  bedSeed: number,
  periodMs: number,
  slackMs: number,
): boolean {
  return (
    wildgrainRipe(now, bedSeed, periodMs) ||
    wildgrainRipe(now - slackMs, bedSeed, periodMs) ||
    wildgrainRipe(now + slackMs, bedSeed, periodMs)
  );
}

/**
 * ms until this bed NEXT enters its ripe window — for a HUD "ripens in …" hint.
 * Returns 0 when the bed is already ripe. Projected linearly within the current
 * week (bedPhase is constant across a week); a week boundary reseeds the offset,
 * so the HUD simply re-derives after the once-weekly rotation (the same authored
 * simplicity as tide.ts msToNextEbb, which ignores the slow spring drift).
 */
export function msToNextRipe(now: number, bedSeed: number, periodMs: number): number {
  const g = wildgrainGrowth(now, bedSeed, periodMs);
  if (g >= STAGE_RIPE) return 0; // already ripe
  return Math.round((STAGE_RIPE - g) * periodMs);
}
