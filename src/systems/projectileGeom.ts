/**
 * Pure projectile geometry (no Phaser) — factored out of ProjectileSystem so the
 * arrow's reach can be unit-tested headlessly (test/systems/projectileGeom.test.ts).
 */

/** an axis-aligned rectangle in the same space as the ray origin (Phaser's
 *  camera worldView exposes exactly these fields, in world pixels) */
export interface RectLike {
  x: number;
  y: number;
  right: number;
  bottom: number;
}

/**
 * Distance from (ox,oy) along the unit ray (dx,dy) at which it LEAVES the rect.
 *
 * The Bow's arrow "flies until off-screen" (design, ADR-0018 #7): the reach is
 * where the aim ray exits the visible camera rect, NOT a player-centred radius.
 * The old half-diagonal cap only reached the far edge when the player sat at the
 * exact view centre; the follow-lerp and the district/arena camera clamp leave
 * the player off-centre, so a boss plainly on screen sat beyond the cap and the
 * arrow fizzled mid-air. Measuring the true ray-exit fixes every off-centre case
 * at any zoom.
 *
 * Standard slab test: the origin is inside the rect, so exactly one forward
 * boundary is hit per axis; the nearer of the two is the exit. An axis with a
 * ~zero direction component imposes no limit (parallel to that pair of edges).
 * Returns 0 if no positive exit exists (origin already outside / degenerate) so
 * the caller can fall back safely.
 */
export function rayExitPx(ox: number, oy: number, dx: number, dy: number, rect: RectLike, eps = 1e-6): number {
  let tExit = Infinity;
  if (dx > eps) tExit = Math.min(tExit, (rect.right - ox) / dx);
  else if (dx < -eps) tExit = Math.min(tExit, (rect.x - ox) / dx);
  if (dy > eps) tExit = Math.min(tExit, (rect.bottom - oy) / dy);
  else if (dy < -eps) tExit = Math.min(tExit, (rect.y - oy) / dy);
  return Number.isFinite(tExit) && tExit > 0 ? tExit : 0;
}
