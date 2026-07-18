import { describe, it, expect } from 'vitest';
import {
  WEEK_MS,
  RIPE_FRACTION,
  STAGE_SPROUT,
  STAGE_GREEN,
  STAGE_RIPE,
  cultivationWeek,
  bedPhase,
  wildgrainGrowth,
  wildgrainStage,
  wildgrainRipe,
  wildgrainRipeWithin,
  msToNextRipe,
} from '../../src/content/cultivation';

const P = 20 * 60_000; // a representative cultivation period

describe('cultivation — per-bed clock mechanic', () => {
  it('cultivationWeek is a monotone integer seed of floor(now / 7d)', () => {
    expect(cultivationWeek(0)).toBe(0);
    expect(cultivationWeek(WEEK_MS - 1)).toBe(0);
    expect(cultivationWeek(WEEK_MS)).toBe(1);
    expect(cultivationWeek(WEEK_MS * 3.5)).toBe(3);
    // strictly non-decreasing across time
    let prev = -1;
    for (let i = 0; i < 20; i++) {
      const w = cultivationWeek(i * WEEK_MS * 0.4);
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
  });

  it('bedPhase is deterministic and bounded to [0, period)', () => {
    const now = 5 * WEEK_MS + 12345;
    expect(bedPhase(now, 42, P)).toBe(bedPhase(now, 42, P)); // pure
    for (const seed of [0, 1, 7, 99, 1234, 65535]) {
      const ph = bedPhase(now, seed, P);
      expect(ph).toBeGreaterThanOrEqual(0);
      expect(ph).toBeLessThan(P);
    }
  });

  it('different beds sit at different points of the cycle (spatial gradient)', () => {
    const now = 3 * WEEK_MS;
    const phases = new Set<number>();
    for (let seed = 0; seed < 40; seed++) phases.add(Math.round(bedPhase(now, seed, P)));
    // hashing scatters the seeds — the vast majority land on distinct offsets
    expect(phases.size).toBeGreaterThan(30);
  });

  it('the weekly reseed rotates a bed to a new phase', () => {
    const seed = 77;
    const w0 = bedPhase(WEEK_MS * 2, seed, P);
    const w1 = bedPhase(WEEK_MS * 3, seed, P);
    expect(w0).not.toBeCloseTo(w1, 3); // the appointment moved
  });

  it('growth stays 0..1 and the four stages tile the cycle in order', () => {
    const seed = 5;
    for (let i = 0; i < 100; i++) {
      const now = i * (P / 100);
      const g = wildgrainGrowth(now, seed, P);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThan(1);
    }
    // stage boundaries are ordered bare < sprout < green < ripe
    expect(STAGE_SPROUT).toBeLessThan(STAGE_GREEN);
    expect(STAGE_GREEN).toBeLessThan(STAGE_RIPE);
    expect(STAGE_RIPE).toBeCloseTo(1 - RIPE_FRACTION, 10);
  });

  it('wildgrainStage maps growth position to the right discrete stage', () => {
    // drive a bed with seed 0 whose phase we can add to hit each band
    const seed = 0;
    const ph = bedPhase(0, seed, P);
    const at = (growthPos: number) => {
      // choose now so (now + ph) mod P == growthPos * P
      const now = (growthPos * P - ph + P) % P;
      return wildgrainStage(now, seed, P);
    };
    expect(at(0.0)).toBe('bare');
    expect(at(STAGE_SPROUT + 0.01)).toBe('sprout');
    expect(at(STAGE_GREEN + 0.01)).toBe('green');
    expect(at(STAGE_RIPE + 0.01)).toBe('ripe');
  });

  it('wildgrainRipe agrees with the ripe stage', () => {
    const seed = 12;
    for (let i = 0; i < 50; i++) {
      const now = i * (P / 50);
      expect(wildgrainRipe(now, seed, P)).toBe(wildgrainStage(now, seed, P) === 'ripe');
    }
  });

  it('wildgrainRipeWithin grants slack at the edge of the ripe window', () => {
    const seed = 3;
    // find a moment just before ripe: msToNextRipe small but > 0
    let found = false;
    for (let i = 0; i < 2000 && !found; i++) {
      const now = i * 1000;
      const toRipe = msToNextRipe(now, seed, P);
      if (toRipe > 0 && toRipe < 4000) {
        expect(wildgrainRipe(now, seed, P)).toBe(false);
        expect(wildgrainRipeWithin(now, seed, P, 5000)).toBe(true); // slack reaches into the window
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('msToNextRipe is 0 while ripe and counts down otherwise', () => {
    const seed = 8;
    for (let i = 0; i < 60; i++) {
      const now = i * (P / 60);
      const ms = msToNextRipe(now, seed, P);
      if (wildgrainRipe(now, seed, P)) {
        expect(ms).toBe(0);
      } else {
        expect(ms).toBeGreaterThan(0);
        expect(ms).toBeLessThanOrEqual(P);
      }
    }
  });
});
