import { describe, it, expect } from 'vitest';
import {
  SPRING_EVERY,
  FLOOD_ABOVE,
  EXPOSED_BELOW,
  tidePhase,
  springSwell,
  tideHeight,
  tideFloods,
  tideExposed,
  tideExposedWithin,
  isSpringTide,
  msToNextEbb,
} from '../../src/content/tide';

const P = 35 * 60_000; // a representative tide period (config TIDE_PERIOD_MS)

describe('tide — pure clock mechanic', () => {
  it('phase wraps 0..1 across the period and repeats', () => {
    expect(tidePhase(0, P)).toBe(0);
    expect(tidePhase(P / 2, P)).toBeCloseTo(0.5, 10);
    expect(tidePhase(P, P)).toBe(0); // wraps
    expect(tidePhase(P + P / 4, P)).toBeCloseTo(0.25, 10);
    // negative clock still wraps into 0..1
    expect(tidePhase(-P / 4, P)).toBeCloseTo(0.75, 10);
  });

  it('height eases in a cosine: ebb trough at phase 0, flood crest at phase 0.5', () => {
    const trough = tideHeight(0, P);
    const crest = tideHeight(P / 2, P);
    expect(trough).toBeLessThan(EXPOSED_BELOW);
    expect(crest).toBeGreaterThan(FLOOD_ABOVE);
    // height stays clamped to 0..1 across a full sweep
    for (let i = 0; i <= 20; i++) {
      const h = tideHeight((i / 20) * P, P);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(1);
    }
  });

  it('floods above the crest and exposes at the trough', () => {
    expect(tideFloods(P / 2, P)).toBe(true);
    expect(tideExposed(P / 2, P)).toBe(false);
    expect(tideExposed(0, P)).toBe(true);
    expect(tideFloods(0, P)).toBe(false);
  });

  it('spring swell rises and falls over SPRING_EVERY cycles', () => {
    // neap at the start, spring near the swell crest (SPRING_EVERY/2 cycles in)
    expect(springSwell(0, P)).toBeCloseTo(0, 6);
    const springPeak = springSwell((SPRING_EVERY / 2) * P, P);
    expect(springPeak).toBeGreaterThan(0.95);
    // 0..1 bounded everywhere
    for (let i = 0; i <= 30; i++) {
      const s = springSwell((i / 30) * SPRING_EVERY * P, P);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it('spring tides flood higher than neap tides', () => {
    // at 2.5 periods both the tide phase (→ flood crest) and the spring swell
    // (→ deepest) peak together, so this is the deep spring flood
    const neapCrest = tideHeight(P / 2, P);
    const springCrest = tideHeight((SPRING_EVERY / 2) * P, P);
    expect(springCrest).toBeGreaterThan(neapCrest);
  });

  it('isSpringTide only fires on the deep spring crest', () => {
    expect(isSpringTide(0, P)).toBe(false); // neap trough
    expect(isSpringTide(P / 2, P)).toBe(false); // neap crest — not deep enough
    const deep = (SPRING_EVERY / 2) * P; // swell crest AND flood crest coincide
    expect(isSpringTide(deep, P)).toBe(true);
  });

  it('tideExposedWithin grants a latency slack around the ebb edge', () => {
    // just past the exposed window at the neap crest, a slack look-back still misses
    expect(tideExposedWithin(P / 2, P, 1000)).toBe(false);
    // near the trough, the slack window catches the exposure
    const nearTrough = P * 0.02; // slightly after the ebb trough
    expect(tideExposed(nearTrough, P)).toBe(true);
    expect(tideExposedWithin(nearTrough, P, 1000)).toBe(true);
  });

  it('msToNextEbb counts down to the next trough and never returns 0 at a trough', () => {
    // at the trough the "next" ebb is a full period away, never 0
    expect(msToNextEbb(0, P)).toBe(P);
    // a quarter past the trough → three quarters remain
    expect(msToNextEbb(P / 4, P)).toBe(Math.round(0.75 * P));
    // result always within (0, P]
    for (let i = 0; i < 12; i++) {
      const ms = msToNextEbb((i / 12) * P + 1, P);
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(P);
    }
  });
});
