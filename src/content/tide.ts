// The Tide (ADR-0017 rung 1) — the Sunken Mire's signature mechanic as a PURE
// function of the real clock: no server, no tick loop (ADR-0001/0002), exactly
// like the day/night nightness() and the Guardian's authored schedule. Every
// client derives the identical water level from Date.now(); the server never
// adjudicates it (the harvest gate is client-side, same trust model as the pack
// cap). The period is PASSED IN so this module stays node-importable like
// guardian.ts — no browser globals, no ../config import.
//
// One ordinary cycle floods and ebbs on a ~35-min period (config TIDE_PERIOD_MS)
// that deliberately does NOT evenly divide 24h, so the deeper "spring" tide —
// riding a slow swell every SPRING_EVERY cycles — drifts its appointment across
// the day (a fixed-schedule player still meets both phases; ADR-0017 gotcha).

/** every Nth ordinary cycle swells into a spring tide (deeper flood, lower ebb) */
export const SPRING_EVERY = 5;

/** the flood/ebb thresholds on the 0..1 height, with a neutral band between */
export const FLOOD_ABOVE = 0.6;
export const EXPOSED_BELOW = 0.4;
/** the height above which a spring tide is "in appointment" (the deep-tide event) */
export const SPRING_HEIGHT = 0.9;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const wrap01 = (n: number, span: number) => ((n % span) + span) % span / span;

/** 0..1 phase through one tide cycle (0 = ebb trough, 0.5 = flood crest) */
export function tidePhase(now: number, periodMs: number): number {
  return wrap01(now, periodMs);
}

/** 0..1 spring swell: 0 = neap (shallow), 1 = spring (deep), over SPRING_EVERY cycles */
export function springSwell(now: number, periodMs: number): number {
  const sp = wrap01(now, periodMs * SPRING_EVERY);
  return 0.5 - 0.5 * Math.cos(sp * Math.PI * 2);
}

/**
 * Water height 0..1 (0 = fully ebbed/exposed, 1 = full flood). A smooth cosine
 * so the water eases in and out; the spring swell stretches the amplitude around
 * the midline so spring tides flood higher AND ebb lower than neap tides.
 */
export function tideHeight(now: number, periodMs: number): number {
  const base = 0.5 - 0.5 * Math.cos(tidePhase(now, periodMs) * Math.PI * 2);
  const amp = 0.85 + 0.35 * springSwell(now, periodMs); // 0.85 (neap) .. 1.20 (spring)
  return clamp01(0.5 + (base - 0.5) * amp);
}

/** is the water high enough to slow wading? (whole-district flood phase) */
export function tideFloods(now: number, periodMs: number): boolean {
  return tideHeight(now, periodMs) >= FLOOD_ABOVE;
}

/** is the water low enough that the reed banks stand exposed for harvest? */
export function tideExposed(now: number, periodMs: number): boolean {
  return tideHeight(now, periodMs) <= EXPOSED_BELOW;
}

/**
 * Was the bank exposed at any point within ±slackMs of `now`? The slack is a
 * latency grace (the eyeOpenWithin idiom, guardian.ts): a swing at the edge of
 * the ebb still lands. slackMs must stay well under the period or it swallows a
 * whole phase — config dev-scales it for the shortened test periods.
 */
export function tideExposedWithin(now: number, periodMs: number, slackMs: number): boolean {
  return (
    tideExposed(now, periodMs) ||
    tideExposed(now - slackMs, periodMs) ||
    tideExposed(now + slackMs, periodMs)
  );
}

/** the deep spring-tide "appointment": an unusually high flood on the spring crest */
export function isSpringTide(now: number, periodMs: number): boolean {
  return springSwell(now, periodMs) > 0.85 && tideHeight(now, periodMs) >= SPRING_HEIGHT;
}

/** ms until the next ebb trough (phase 0) — for a "the tide turns in …" hint */
export function msToNextEbb(now: number, periodMs: number): number {
  const p = tidePhase(now, periodMs);
  return Math.round((1 - p) % 1 * periodMs) || periodMs;
}
