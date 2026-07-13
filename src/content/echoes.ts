// The Echoes (ADR-0017 rung 2) — the Hushdark's signature mechanic as PURE REPLAY
// MATH. Unlike the Tide (a pure function of the clock with no state), an echo is a
// RECORDED movement loop: a shade of a Player that walks a captured path forever.
// The recordings themselves are SERVER-PERSISTED and SHARED (migration 0015 +
// jw_echo_record/jw_echo_list) so players layer the shades of absent friends onto
// vault pedestals (async co-op). This module never records, stores, or ticks — it
// only derives a ghost's pose and whether pedestals are covered, all as pure
// functions of (now, recordedAt, samples[]), exactly ADR-0002 style. The samples
// and period are PASSED IN, so it stays node-importable like tide.ts/guardian.ts —
// no browser globals, no ../config import.
//
// Recording starts are QUANTISED (quantizeStart) to `serverNow mod periodMs` so
// every ghost's loop phase aligns and overlaid shades stay in sync. Anti-parking
// (ADR-0017 rung 2 refutation fix): a motionless recording carries no travel and
// is rejected at capture (ghostTravelTiles < ECHO_MIN_MOVE_TILES), so a parked
// shade can never trivially hold a pedestal; a vault opens only while EVERY
// pedestal is covered at the SAME instant, which inherently needs one moving
// coverer per pedestal.

/** the four cardinal facings a shade can carry (drives its sprite frame) */
export type EchoDir = 'up' | 'down' | 'left' | 'right';

/** one captured frame of a recording — position in TILE coordinates, t = ms since
 *  the recording's quantised start (0..periodMs) */
export interface EchoSample {
  t: number;
  x: number;
  y: number;
  dir?: EchoDir;
}

/** a persisted recording (one row of echo_ghosts): a shade that loops forever */
export interface Ghost {
  ghostId: string;
  who: string;
  /** quantised to serverNow mod periodMs so loop phases align across shades */
  recordedAt: number;
  /** the loop length this shade was captured at (dev/prod periods differ) */
  periodMs: number;
  samples: EchoSample[];
  /** 'echo' = ordinary looping shade; 'greeting' = permanent named mark for others */
  kind?: 'echo' | 'greeting';
}

/** a shade's derived position at an instant, in TILE coordinates */
export interface Pose {
  x: number;
  y: number;
  dir?: EchoDir;
}

/** round a recording START down to the loop grid so every shade shares phase */
export function quantizeStart(serverNow: number, periodMs: number): number {
  return serverNow - (((serverNow % periodMs) + periodMs) % periodMs);
}

/** 0..periodMs position within the loop for a shade recorded at `recordedAt` */
export function echoPhaseMs(now: number, recordedAt: number, periodMs: number): number {
  return (((now - recordedAt) % periodMs) + periodMs) % periodMs;
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

/**
 * The shade's pose at `now` — pure f(loop-phase, samples). Interpolates between
 * the two samples bracketing the loop phase, wrapping seamlessly across the loop
 * boundary (the last sample eases back into the first over the remaining period).
 * Returns null only for an empty recording. NO tick, NO mutation.
 */
export function ghostPoseAt(now: number, ghost: Ghost, periodMs: number): Pose | null {
  const s = ghost.samples;
  if (s.length === 0) return null;
  if (s.length === 1) return { x: s[0].x, y: s[0].y, dir: s[0].dir };
  const phase = echoPhaseMs(now, ghost.recordedAt, periodMs);
  // find the last sample at or before `phase`
  let i = -1;
  for (let k = 0; k < s.length; k++) {
    if (s[k].t <= phase) i = k;
    else break;
  }
  let a: EchoSample;
  let b: EchoSample;
  let span: number;
  let into: number;
  if (i < 0) {
    // before the first sample — wrap from the last sample across the loop seam
    a = s[s.length - 1];
    b = s[0];
    span = periodMs - a.t + b.t;
    into = phase + (periodMs - a.t);
  } else if (i >= s.length - 1) {
    // at/after the last sample — wrap from the last sample back to the first
    a = s[s.length - 1];
    b = s[0];
    span = periodMs - a.t + b.t;
    into = phase - a.t;
  } else {
    a = s[i];
    b = s[i + 1];
    span = b.t - a.t;
    into = phase - a.t;
  }
  const f = span > 0 ? Math.max(0, Math.min(1, into / span)) : 0;
  return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), dir: (f < 0.5 ? a.dir : b.dir) ?? a.dir };
}

/**
 * How far a recording roams, as the diagonal of its sample bounding box (tiles).
 * The anti-parking gauge: a recording under ECHO_MIN_MOVE_TILES is a shade that
 * barely moved and must be rejected at capture, so it can never hold a pedestal.
 */
export function ghostTravelTiles(samples: EchoSample[]): number {
  if (samples.length < 2) return 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of samples) {
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.y < minY) minY = s.y;
    if (s.y > maxY) maxY = s.y;
  }
  return Math.hypot(maxX - minX, maxY - minY);
}

/** is `pose` within `radius` tiles of the pedestal tile centre (tx,ty)? */
export function poseOnPedestal(pose: Pose | null, ped: { tx: number; ty: number }, radius: number): boolean {
  if (!pose) return false;
  return Math.hypot(pose.x - ped.tx, pose.y - ped.ty) <= radius;
}

/** is the shade standing on the pedestal at instant `now`? */
export function ghostOnPedestal(
  now: number,
  ghost: Ghost,
  ped: { tx: number; ty: number },
  periodMs: number,
  radius: number,
): boolean {
  return poseOnPedestal(ghostPoseAt(now, ghost, periodMs), ped, radius);
}

/**
 * Is a vault open at instant `now`? Open iff EVERY pedestal is covered by at least
 * one coverer (a shade pose or a live player pose) within `radius`, all at the same
 * instant. Distinct pedestal tiles + a sub-tile radius mean one coverer answers one
 * pedestal, so an N-pedestal vault inherently needs N moving coverers — the async
 * co-op puzzle, and the anti-parking guarantee (no single shade holds it open).
 */
export function vaultOpen(
  pedestals: { tx: number; ty: number }[],
  coverers: (Pose | null)[],
  radius: number,
): boolean {
  if (pedestals.length === 0) return false;
  return pedestals.every((ped) => coverers.some((c) => poseOnPedestal(c, ped, radius)));
}

/** the current vault week — floor(now / 7d). A monotone integer seed for the
 *  weekly reseed, NOT a phased cycle (so it never inherits the Tide's 24h-divisor
 *  trap, ADR-0017 rung 2 gotcha). */
export function vaultWeek(now: number): number {
  return Math.floor(now / (7 * 24 * 3600_000));
}
