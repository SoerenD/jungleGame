import { describe, it, expect } from 'vitest';
import {
  quantizeStart,
  echoPhaseMs,
  ghostPoseAt,
  ghostTravelTiles,
  poseOnPedestal,
  ghostOnPedestal,
  vaultOpen,
  vaultWeek,
  type Ghost,
  type EchoSample,
} from '../../src/content/echoes';

const P = 12_000; // a loop period

function ghost(samples: EchoSample[], recordedAt = 0, periodMs = P): Ghost {
  return { ghostId: 'g', who: 'tester', recordedAt, periodMs, samples };
}

describe('echoes — pure replay math', () => {
  it('quantizeStart snaps a start down onto the loop grid', () => {
    expect(quantizeStart(0, P)).toBe(0);
    expect(quantizeStart(P, P)).toBe(P);
    expect(quantizeStart(P + 1234, P)).toBe(P);
    expect(quantizeStart(3 * P - 1, P)).toBe(2 * P);
    // quantised value is always a multiple of the period
    expect(quantizeStart(999_999, P) % P).toBe(0);
  });

  it('echoPhaseMs wraps elapsed time into [0, period)', () => {
    expect(echoPhaseMs(0, 0, P)).toBe(0);
    expect(echoPhaseMs(P / 2, 0, P)).toBe(P / 2);
    expect(echoPhaseMs(P, 0, P)).toBe(0);
    expect(echoPhaseMs(P + 500, 0, P)).toBe(500);
    // recording that started before `now` still wraps correctly
    expect(echoPhaseMs(P + 500, 300, P)).toBe(200);
  });

  it('ghostPoseAt returns null for an empty recording, the point for a single sample', () => {
    expect(ghostPoseAt(0, ghost([]), P)).toBeNull();
    const pose = ghostPoseAt(1234, ghost([{ t: 0, x: 4, y: 7, dir: 'left' }]), P);
    expect(pose).toEqual({ x: 4, y: 7, dir: 'left' });
  });

  it('ghostPoseAt interpolates linearly between bracketing samples', () => {
    const g = ghost([
      { t: 0, x: 0, y: 0, dir: 'right' },
      { t: P / 2, x: 10, y: 0, dir: 'right' },
    ]);
    const mid = ghostPoseAt(P / 4, g, P)!;
    expect(mid.x).toBeCloseTo(5, 6); // halfway along the first leg
    expect(mid.y).toBeCloseTo(0, 6);
    const atSecond = ghostPoseAt(P / 2, g, P)!;
    expect(atSecond.x).toBeCloseTo(10, 6);
  });

  it('ghostPoseAt eases across the loop seam back to the first sample', () => {
    const g = ghost([
      { t: 0, x: 0, y: 0 },
      { t: P / 2, x: 10, y: 0 },
    ]);
    // three-quarters through: halfway back along the return leg from (10,0) → (0,0)
    const back = ghostPoseAt((3 * P) / 4, g, P)!;
    expect(back.x).toBeCloseTo(5, 6);
  });

  it('ghostTravelTiles is the bounding-box diagonal, 0 for a near-parked recording', () => {
    expect(ghostTravelTiles([])).toBe(0);
    expect(ghostTravelTiles([{ t: 0, x: 3, y: 3 }])).toBe(0);
    const travelled = ghostTravelTiles([
      { t: 0, x: 0, y: 0 },
      { t: 1, x: 3, y: 4 },
    ]);
    expect(travelled).toBeCloseTo(5, 6); // 3-4-5 triangle
  });

  it('poseOnPedestal is a radius test around the pedestal centre', () => {
    const ped = { tx: 5, ty: 5 };
    expect(poseOnPedestal(null, ped, 1)).toBe(false);
    expect(poseOnPedestal({ x: 5, y: 5 }, ped, 0.5)).toBe(true);
    expect(poseOnPedestal({ x: 5.4, y: 5 }, ped, 0.5)).toBe(true);
    expect(poseOnPedestal({ x: 6.5, y: 5 }, ped, 0.5)).toBe(false);
  });

  it('ghostOnPedestal derives the shade pose then tests the pedestal', () => {
    const g = ghost([
      { t: 0, x: 5, y: 5 },
      { t: P / 2, x: 0, y: 0 },
    ]);
    expect(ghostOnPedestal(0, g, { tx: 5, ty: 5 }, P, 0.5)).toBe(true);
    expect(ghostOnPedestal(P / 2, g, { tx: 5, ty: 5 }, P, 0.5)).toBe(false);
  });

  it('vaultOpen requires EVERY pedestal covered at the same instant', () => {
    const peds = [
      { tx: 0, ty: 0 },
      { tx: 10, ty: 0 },
    ];
    const r = 0.5;
    // one coverer can only answer one pedestal
    expect(vaultOpen(peds, [{ x: 0, y: 0 }], r)).toBe(false);
    // two coverers, one on each → open
    expect(vaultOpen(peds, [{ x: 0, y: 0 }, { x: 10, y: 0 }], r)).toBe(true);
    // a null coverer never covers anything
    expect(vaultOpen(peds, [{ x: 0, y: 0 }, null], r)).toBe(false);
    // no pedestals → never open
    expect(vaultOpen([], [{ x: 0, y: 0 }], r)).toBe(false);
  });

  it('vaultWeek is a monotone weekly integer seed', () => {
    const week = 7 * 24 * 3600_000;
    expect(vaultWeek(0)).toBe(0);
    expect(vaultWeek(week - 1)).toBe(0);
    expect(vaultWeek(week)).toBe(1);
    expect(vaultWeek(week * 10)).toBe(10);
  });
});
