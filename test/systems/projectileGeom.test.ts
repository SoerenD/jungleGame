import { describe, it, expect } from 'vitest';
import { rayExitPx, type RectLike } from '../../src/systems/projectileGeom';

// The Bow's arrow reach (ProjectileSystem.arrowRangePx). The old cap was a
// player-CENTRED half-diagonal radius, so a boss on screen but off-centre (the
// follow-lerp / arena camera clamp case) sat beyond reach and the arrow fizzled
// mid-air. rayExitPx measures the true distance to where the ray leaves the
// visible camera rect, from wherever the player stands.

const view: RectLike = { x: 0, y: 0, right: 100, bottom: 100 };
const norm = (x: number, y: number): [number, number] => {
  const len = Math.hypot(x, y) || 1;
  return [x / len, y / len];
};

describe('projectileGeom.rayExitPx', () => {
  it('a centred origin reaches the edge / corner (half-diagonal parity)', () => {
    // straight right: from (50,50) the right wall is 50 px away
    expect(rayExitPx(50, 50, 1, 0, view)).toBeCloseTo(50, 5);
    // toward the corner: the centre→corner distance is half the diagonal
    const [dx, dy] = norm(1, 1);
    expect(rayExitPx(50, 50, dx, dy, view)).toBeCloseTo(Math.hypot(50, 50), 5);
  });

  it('an OFF-centre origin reaches the FAR edge — beyond the old half-diagonal cap', () => {
    // player pinned to the top-left, firing at the far corner
    const [dx, dy] = norm(1, 1);
    const reach = rayExitPx(10, 10, dx, dy, view);
    const oldHalfDiagonalCap = Math.hypot(100, 100) / 2; // ≈ 70.7 — the buggy value
    expect(reach).toBeCloseTo(Math.hypot(90, 90), 5); // ≈ 127.3
    expect(reach).toBeGreaterThan(oldHalfDiagonalCap);
  });

  it('a target near the far visible edge is now hittable where the old cap missed', () => {
    // origin off-centre at (10,10); a boss at (90,90) is plainly on screen
    const ox = 10;
    const oy = 10;
    const [dx, dy] = norm(1, 1);
    const maxPx = rayExitPx(ox, oy, dx, dy, view);
    // reproduce ProjectileSystem.rayHitPx's clamp-and-check against the boss centre
    const hit = (cx: number, cy: number, r: number, cap: number): boolean => {
      const t = Math.max(0, Math.min((cx - ox) * dx + (cy - oy) * dy, cap));
      return Math.hypot(ox + dx * t - cx, oy + dy * t - cy) <= r + 4;
    };
    const boss: [number, number, number] = [90, 90, 10];
    expect(hit(...boss, maxPx)).toBe(true); // new range: reachable
    expect(hit(...boss, Math.hypot(100, 100) / 2)).toBe(false); // old cap: fizzled short
  });

  it('axis-aligned aims never divide by zero and are limited by the other axis', () => {
    expect(rayExitPx(10, 50, 1, 0, view)).toBeCloseTo(90, 5); // only the right wall limits
    expect(rayExitPx(50, 10, 0, 1, view)).toBeCloseTo(90, 5); // only the bottom wall limits
    expect(rayExitPx(50, 50, -1, 0, view)).toBeCloseTo(50, 5); // leftward exit
  });

  it('returns 0 for a degenerate ray so the caller can fall back safely', () => {
    expect(rayExitPx(50, 50, 0, 0, view)).toBe(0); // no direction
    expect(rayExitPx(150, 50, 1, 0, view)).toBe(0); // origin outside, no forward exit
  });
});
