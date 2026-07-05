/**
 * The Delve — the game's first Dungeon (ADR-0007). Unlike the Guardian's
 * authored, deterministic schedule (guardian.ts), a Dungeon is REACTIVE: its
 * Husks chase, aim and react, so their motion cannot be a pure function of time
 * and must be simulated statefully by the party's HOST client. This module holds
 * the Dungeon's pure, node-importable pieces — the one fixed interior layout, the
 * mob stat table, headcount scaling, loot ids, and a stateless mob-AI stepper the
 * host calls each frame. It carries NO scene/render/netcode and NO browser
 * globals (no window, no ../config): positions are in TILE UNITS, speeds in
 * tiles/second, so the host multiplies by TILE at the render boundary. Player→mob
 * damage reuses guardian.ts's weapon roll (ADR-0006); mob→player harm is
 * knockdown-only (no player HP). Mob HP lives only in host memory — never a DB
 * row (ADR-0007 §2). Kept importable from node tools, exactly like guardian.ts.
 */
import type { ResourceId, ToolId } from './items';
import { rollGuardianDamage } from './guardian';

// ------------------------------------------------------------- loot
/** Stage-1 loot: the common Husk drop (the farm loop) and the rare boss drop */
export const HUSK_SHARD: ResourceId = 'husk_shard';
export const DEEP_CORE: ResourceId = 'deep_core';
/** the Deep's loot (ADR-0011): common Cinder/Ember Husk drop + rare Forgeborn drop */
export const CINDER_SHARD: ResourceId = 'cinder_shard';
export const FORGE_CORE: ResourceId = 'forge_core';
/** husk shards awarded per participant at run completion (one per Husk felled) */
export const SHARD_PER_KILL = 1;
/** the rare boss Resource each participant is granted on a completed run */
export const DEEP_CORE_DROP = 1;

// ------------------------------------------------------------- interior layout
/**
 * The one fixed Delve interior (v1 ships exactly one). A wall grid carved from
 * room + corridor rectangles: entrance room → three Husk rooms → boss room, west
 * to east. Everything not carved is wall (blocks movement); the host builds
 * collision from `isDelveWall`. Regenerated identically everywhere — pure data.
 */
export const DELVE_W = 68;
export const DELVE_H = 22;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Floor rectangles (inclusive origin, w/h in tiles) — the walkable rooms. Room A
 * is a deliberately SAFE antechamber: the first Husks live in room B, 13+ tiles
 * away down a long corridor — beyond their aggro range — so a party is never
 * swarmed at the spawn and can pick its moment to advance.
 */
export const DELVE_ROOMS: Rect[] = [
  { x: 2, y: 8, w: 8, h: 6 }, // A — safe entrance      x2..9   y8..13
  { x: 18, y: 3, w: 11, h: 16 }, // B — Husk room 1     x18..28 y3..18
  { x: 33, y: 6, w: 10, h: 10 }, // C — Husk room 2     x33..42 y6..15
  { x: 47, y: 4, w: 11, h: 14 }, // D — Husk room 3     x47..57 y4..17
  { x: 60, y: 3, w: 6, h: 16 }, // E — boss room        x60..65 y3..18
];

/** 2-tile-tall corridors joining consecutive rooms along y10..11 */
export const DELVE_CORRIDORS: Rect[] = [
  { x: 10, y: 10, w: 8, h: 2 }, // A↔B — the long safe-entrance buffer
  { x: 29, y: 10, w: 4, h: 2 }, // B↔C
  { x: 43, y: 10, w: 4, h: 2 }, // C↔D
  { x: 58, y: 10, w: 2, h: 2 }, // D↔E
];

/** where the party lands on entry (the entrance room), and the tile you leave from */
export const DELVE_ENTRY = { tx: 5, ty: 10 };

/** carve the wall grid once: 1 = wall (blocks), 0 = floor */
function buildWalls(): Uint8Array {
  const g = new Uint8Array(DELVE_W * DELVE_H).fill(1);
  const carve = (r: Rect) => {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (x >= 0 && y >= 0 && x < DELVE_W && y < DELVE_H) g[y * DELVE_W + x] = 0;
      }
    }
  };
  for (const r of DELVE_ROOMS) carve(r);
  for (const r of DELVE_CORRIDORS) carve(r);
  return g;
}

const WALLS = buildWalls();

/** is Delve tile (tx, ty) a wall? Out-of-bounds counts as wall. */
export function isDelveWall(tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= DELVE_W || ty >= DELVE_H) return true;
  return WALLS[ty * DELVE_W + tx] === 1;
}

// ------------------------------------------------------------- props & lighting
/**
 * The dressing that turns the Delve's empty rooms into a mine-shaft-into-ruins
 * (authored placements, ADR-0007 §10). Blocking props (beams, pillars, braziers)
 * are real COVER: they join the collision set the mobs + projectiles test
 * (isDelveBlocked), so a Spit Husk's line of fire actually breaks behind a
 * pillar. Floor decor (rubble, rails, bones, crystal veins, glyph-stones) is
 * non-blocking. Everything east of RUINS_FROM_X wears the cooler "ruins" look.
 */
export type PropKind =
  | 'support_beam'
  | 'obsidian_pillar'
  | 'brazier'
  | 'brazier_violet'
  | 'crystal_amber'
  | 'crystal_teal'
  | 'rubble_pile'
  | 'mine_rail'
  | 'bone_pile'
  | 'glyph_stone'
  // the Deep (Stage 2, ADR-0011) — molten dressing: basalt pillars (cover),
  // ember braziers (light), lava-crack floor veins + slag piles (floor decor)
  | 'basalt_pillar'
  | 'ember_brazier'
  | 'lava_vein'
  | 'slag_pile';

export interface DelveProp {
  kind: PropKind;
  tx: number;
  ty: number;
}

/** the mine→ruins biome hinge: rooms/corridors with x ≥ this use the ruins ramp */
export const RUINS_FROM_X = 45;

/** which prop kinds block movement (true cover); the rest are floor decor */
export const PROP_BLOCKS: Record<PropKind, boolean> = {
  support_beam: true,
  obsidian_pillar: true,
  brazier: true,
  brazier_violet: true,
  crystal_amber: false,
  crystal_teal: false,
  rubble_pile: false,
  mine_rail: false,
  bone_pile: false,
  glyph_stone: false,
  basalt_pillar: true, // cover for Ember Husk volleys (not for the eruption)
  ember_brazier: true,
  lava_vein: false,
  slag_pile: false,
};

/** glow pool a prop kind casts (tint, glow-image scale, alpha, flicker), if any */
export const PROP_LIGHT: Partial<Record<PropKind, { color: number; scale: number; alpha: number; flicker: boolean }>> = {
  brazier: { color: 0xe08a2c, scale: 2.6, alpha: 0.34, flicker: true },
  brazier_violet: { color: 0x7d6bd8, scale: 2.6, alpha: 0.26, flicker: true },
  crystal_amber: { color: 0xf0b45a, scale: 1.9, alpha: 0.3, flicker: false },
  crystal_teal: { color: 0x2fb4a6, scale: 1.9, alpha: 0.3, flicker: false },
  glyph_stone: { color: 0x7d6bd8, scale: 1.5, alpha: 0.24, flicker: false },
  // the Deep's molten glow
  ember_brazier: { color: 0xff7a2a, scale: 2.9, alpha: 0.4, flicker: true },
  lava_vein: { color: 0xff5a1e, scale: 1.7, alpha: 0.3, flicker: false },
  basalt_pillar: { color: 0xff5a1e, scale: 1.5, alpha: 0.16, flicker: false },
};

/** standalone light pools not tied to a prop (the boss's own violet ambient) */
export const DELVE_LIGHTS: { tx: number; ty: number; color: number; scale: number; alpha: number }[] = [
  { tx: 62, ty: 10, color: 0xb478ff, scale: 4.2, alpha: 0.3 }, // Deep Guardian chamber
];

function buildProps(): DelveProp[] {
  const p: DelveProp[] = [];
  const add = (kind: PropKind, tx: number, ty: number) => p.push({ kind, tx, ty });
  // Room A — mine entry (SAFE, kept clear); beams frame the east mouth
  add('brazier', 3, 9);
  add('support_beam', 9, 9);
  add('support_beam', 9, 12);
  add('rubble_pile', 2, 13);
  add('rubble_pile', 8, 8);
  add('brazier', 14, 11); // A↔B corridor breadcrumb
  // mine rail down the A↔B corridor and into room B (a leading line)
  for (let x = 9; x <= 22; x++) {
    add('mine_rail', x, 10);
    add('mine_rail', x, 11);
  }
  // Room B — mid mine: cover beams off the y10-11 spine, flanked by braziers
  add('support_beam', 22, 7);
  add('support_beam', 24, 14);
  add('brazier', 21, 6);
  add('brazier', 25, 15);
  add('crystal_teal', 28, 10);
  add('rubble_pile', 19, 4);
  add('rubble_pile', 27, 17);
  add('rubble_pile', 18, 8);
  // Room C — deep mine, the transition (first obsidian + a hinting glyph)
  add('support_beam', 36, 8);
  add('obsidian_pillar', 39, 13);
  add('brazier', 35, 9);
  add('crystal_amber', 42, 11);
  add('brazier', 31, 11); // B↔C breadcrumb
  add('rubble_pile', 34, 7);
  add('rubble_pile', 41, 15);
  add('glyph_stone', 41, 8);
  // Room D — ancient ruins: a staggered obsidian colonnade breaks Spit sightlines
  add('obsidian_pillar', 50, 7);
  add('obsidian_pillar', 53, 11);
  add('obsidian_pillar', 51, 15);
  add('brazier_violet', 49, 8);
  add('brazier_violet', 54, 12);
  add('glyph_stone', 57, 7);
  add('glyph_stone', 57, 13);
  add('bone_pile', 50, 9);
  add('bone_pile', 53, 15);
  add('rubble_pile', 48, 5);
  add('rubble_pile', 56, 16);
  add('brazier_violet', 45, 11); // C↔D breadcrumb
  // Room E — the Deep Guardian's chamber: only rim framing, boss glow dominates
  add('obsidian_pillar', 61, 7);
  add('obsidian_pillar', 64, 7);
  add('brazier_violet', 60, 4);
  add('brazier_violet', 65, 4);
  add('glyph_stone', 60, 17);
  add('glyph_stone', 65, 17);
  add('bone_pile', 61, 15);
  add('bone_pile', 64, 15);
  return p;
}

export const DELVE_PROPS: DelveProp[] = buildProps();

/** tile indices occupied by a blocking prop — cover the mobs + projectiles respect */
const BLOCKED_PROP_TILES = new Set<number>(
  DELVE_PROPS.filter((p) => PROP_BLOCKS[p.kind]).map((p) => p.ty * DELVE_W + p.tx),
);

/**
 * Walls OR a blocking cover prop. Mob AI and projectiles test THIS (not bare
 * isDelveWall) so pillars/beams are genuine cover — a Spit Husk's shot dies on a
 * pillar and a Grasp Husk has to come around it. The player collides with the
 * same tiles via physics bodies built in the scene.
 */
export function isDelveBlocked(tx: number, ty: number): boolean {
  if (isDelveWall(tx, ty)) return true;
  return BLOCKED_PROP_TILES.has(ty * DELVE_W + tx);
}

// ------------------------------------------------------------- mobs & scaling
// Stage 1 (the Delve) Husks: grasp (melee) + spit (ranged). The Deep (Stage 2,
// ADR-0011) adds cinder (melee) + ember (ranged) — the SAME state machine,
// molten-reskinned and tuned slightly harder. Bosses: the Deep Guardian ('boss',
// Stage 1) and the Forgeborn ('forgeborn', Stage 2, + its signature eruption).
export type HuskKind = 'grasp' | 'spit' | 'cinder' | 'ember';
export type MobKind = HuskKind | 'boss' | 'forgeborn';

/** which kinds are the ranged kiters (start in 'kite', run stepRanged) */
const RANGED_KINDS = new Set<MobKind>(['spit', 'ember']);
/** which kinds are the scaled reactive bosses (per-head HP, run stepBoss) */
const BOSS_KINDS = new Set<MobKind>(['boss', 'forgeborn']);
export function isBossKind(kind: MobKind): boolean {
  return BOSS_KINDS.has(kind);
}

/** static per-kind combat/AI profile (tile units; ms; tiles/second) */
export interface MobProfile {
  hp: number;
  /** collision + hit radius in tiles (boss is chunky) */
  radius: number;
  /** wander/chase speed */
  speed: number;
  /** aggro pickup range (boss aggros the whole room) */
  aggro: number;
  /** melee reach at which it commits a telegraphed strike */
  reach: number;
  /** telegraph (wind-up) before a strike/shot lands */
  telegraphMs: number;
  /** how long a melee strike's danger zone is live */
  strikeMs: number;
  /** speed of the lunge dash during a melee strike */
  lungeSpeed: number;
  /** knockdown radius of a melee strike (tiles) */
  strikeR: number;
  /** post-attack cooldown */
  cooldownMs: number;
  /** ranged kiter/boss: keep at least this far; fire up to `fireRange` */
  kiteMin: number;
  fireRange: number;
  projSpeed: number;
  /** knockdown radius of a projectile (tiles) */
  projR: number;
  // --- the Forgeborn's signature "eruption" (ADR-0011): an oversized,
  // long-telegraphed, RADIUS-based strike centred on the boss, escaped by
  // sprinting to the room's edges. Reuses the windup→strike machine (not a new
  // engine, not line-of-sight). Undefined on every other kind → no eruption.
  /** eruption knockdown radius (tiles) — big, so only the room's edges are safe */
  eruptR?: number;
  /** eruption wind-up (long, clearly telegraphed) */
  eruptTelegraphMs?: number;
  /** how long the eruption zone stays live */
  eruptStrikeMs?: number;
  /** base cooldown between eruptions (shortened by fury); first fires after it too */
  eruptEveryMs?: number;
}

/**
 * The two Husk kinds and the boss. Per-mob danger (telegraph → knockdown) is held
 * ~constant across group sizes on purpose (ADR-0007 §6); only count and boss HP
 * scale. The Deep Guardian is a scaled-up reactive Husk — NOT a second engine.
 */
export const MOB_PROFILES: Record<MobKind, MobProfile> = {
  // Grasp Husk — melee chaser: steers at the nearest player, telegraphs a lunge.
  // Tuned gentle: a long wind-up + a long recovery give a lone player plenty of
  // time to read the lunge and step out of the small strike zone (players have no
  // HP — the only currency is the ~5s knockdown, and 3 of those end your run).
  grasp: {
    hp: 8,
    radius: 0.45,
    speed: 2.6,
    aggro: 6,
    reach: 1.5,
    telegraphMs: 1100,
    strikeMs: 180,
    lungeSpeed: 6,
    strikeR: 0.75,
    cooldownMs: 2000,
    kiteMin: 0,
    fireRange: 0,
    projSpeed: 0,
    projR: 0,
  },
  // Spit Husk — ranged kiter: keeps its distance, fires telegraphed projectiles
  // you can side-step. Cooldown kept short enough to pressure (a lone dawdler eats
  // a shot roughly every ~2.7s) but the wind-up stays long enough to read + dodge.
  spit: {
    hp: 6,
    radius: 0.42,
    speed: 2.2,
    aggro: 8,
    reach: 0,
    telegraphMs: 1000,
    strikeMs: 0,
    lungeSpeed: 0,
    strikeR: 0,
    cooldownMs: 1700,
    kiteMin: 4.5,
    fireRange: 7,
    projSpeed: 4.5,
    projR: 0.5,
  },
  // the Deep Guardian — a bigger reactive Husk that both lunges and volleys,
  // ramping cadence over its phases; HP scales per head (bossHp). Aggro is FINITE
  // so it guards its room instead of beelining to the entrance the instant you
  // enter — you clear the Husk rooms first, then face it.
  boss: {
    hp: 70, // per head — see bossHp()
    radius: 1.3,
    speed: 2.3,
    aggro: 13,
    reach: 2.0,
    telegraphMs: 1150,
    strikeMs: 220,
    lungeSpeed: 5.5,
    strikeR: 1.15,
    cooldownMs: 2100,
    kiteMin: 0,
    fireRange: 9,
    projSpeed: 4.5,
    projR: 0.7,
  },
  // ---- the Deep (Stage 2, ADR-0011): reskin + slightly-harder retune of the
  // exact same state machines. Per-mob danger stays readable (knockdown-only);
  // only count + boss HP scale (see planDeepSpawns / DEEP.bossHpPerHead).
  // Cinder Husk — molten melee chaser: a touch faster + tankier than the Grasp
  // Husk, with a marginally tighter wind-up. Still a long, readable telegraph.
  cinder: {
    hp: 10,
    radius: 0.46,
    speed: 2.8,
    aggro: 6.5,
    reach: 1.5,
    telegraphMs: 1000,
    strikeMs: 190,
    lungeSpeed: 6.4,
    strikeR: 0.8,
    cooldownMs: 1800,
    kiteMin: 0,
    fireRange: 0,
    projSpeed: 0,
    projR: 0,
  },
  // Ember Husk — molten ranged kiter: faster shot, shorter cooldown + longer reach
  // than the Spit Husk (~a shot every ~2.35s), but still side-steppable and clearly
  // telegraphed. The Deep's shooters lean on you harder than the Delve's.
  ember: {
    hp: 7,
    radius: 0.44,
    speed: 2.4,
    aggro: 8.5,
    reach: 0,
    telegraphMs: 950,
    strikeMs: 0,
    lungeSpeed: 0,
    strikeR: 0,
    cooldownMs: 1400,
    kiteMin: 4.5,
    fireRange: 7.5,
    projSpeed: 5.0,
    projR: 0.5,
  },
  // the Forgeborn — the Deep's boss: a harder Deep-Guardian profile (more HP/head
  // via DEEP.bossHpPerHead, tighter fury, aggressive ranged-leaning rhythm) PLUS
  // its signature eruption (erupt* fields). Reuses stepBoss — no new engine.
  forgeborn: {
    hp: 90, // per head — see DEEP.bossHpPerHead
    radius: 1.45,
    speed: 2.45,
    aggro: 15,
    reach: 2.1,
    telegraphMs: 1050,
    strikeMs: 240,
    lungeSpeed: 5.9,
    strikeR: 1.25,
    cooldownMs: 1900,
    kiteMin: 0,
    fireRange: 9.5,
    projSpeed: 5.0,
    projR: 0.75,
    // the eruption: a ~6-tile radius blast with a long 2.2s wind-up. In the Deep's
    // big boss room (edges ≥9 tiles from centre) sprinting to a wall is always safe.
    eruptR: 6.0,
    eruptTelegraphMs: 2200,
    eruptStrikeMs: 520,
    eruptEveryMs: 8000,
  },
};

/** base husk-per-head coefficients — count scales, per-mob danger stays flat */
const GRASP_PER_HEAD = 1.6;
const SPIT_PER_HEAD = 0.9;
const BOSS_HP_PER_HEAD = 70;

export function delveHeads(heads: number): number {
  return Math.max(1, Math.floor(heads));
}

/** boss HP for a roster — the HP_PER_HEAD philosophy: total ∝ heads (ADR-0007 §6) */
export function bossHp(heads: number): number {
  return BOSS_HP_PER_HEAD * delveHeads(heads);
}

/**
 * The Husk anchors, ordered so the first few spread ACROSS rooms B→C→D (a lone
 * player meets one in EVERY husk room, not a pile at the door). All sit ≥13
 * tiles from the entrance — beyond aggro — so room A stays a safe antechamber.
 */
const GRASP_ANCHORS = [
  { x: 25, y: 6 }, // B
  { x: 38, y: 10 }, // C
  { x: 52, y: 6 }, // D
  { x: 26, y: 15 }, // B
  { x: 53, y: 15 }, // D
  { x: 50, y: 9 }, // D
  { x: 36, y: 13 }, // C
];
const SPIT_ANCHORS = [
  { x: 24, y: 10 }, // B
  { x: 51, y: 10 }, // D
  { x: 39, y: 12 }, // C
  { x: 27, y: 7 }, // B
];
export const BOSS_SPAWN = { x: 62, y: 10 };

export interface MobSpawn {
  kind: MobKind;
  x: number;
  y: number;
}

/**
 * The full spawn plan for a roster: Husk count scales with headcount (per-mob HP
 * held constant, so total Husk HP ∝ heads — the same HP_PER_HEAD flatness as the
 * boss), distributed across the room anchors with a deterministic ±1 jitter from
 * the injected rng. One boss. No late join: the host computes this once at entry.
 */
export function planDelveSpawns(heads: number, rng: () => number): MobSpawn[] {
  const n = delveHeads(heads);
  const out: MobSpawn[] = [];
  const place = (kind: HuskKind, count: number, anchors: { x: number; y: number }[]) => {
    for (let i = 0; i < count; i++) {
      const a = anchors[i % anchors.length];
      // deterministic ±1 jitter, snapped back to floor if it lands in a wall
      let x = a.x + Math.round(rng() * 2 - 1);
      let y = a.y + Math.round(rng() * 2 - 1);
      if (isDelveBlocked(Math.floor(x), Math.floor(y))) {
        x = a.x;
        y = a.y;
      }
      out.push({ kind, x: x + 0.5, y: y + 0.5 });
    }
  };
  // floors of 3 grasp / 2 spit so even a lone player meets a mob in every husk
  // room (B,C,D); scales up to the caps with headcount (per-mob danger stays flat)
  place('grasp', Math.min(12, Math.max(3, Math.round(GRASP_PER_HEAD * n))), GRASP_ANCHORS);
  place('spit', Math.min(6, Math.max(2, Math.round(SPIT_PER_HEAD * n))), SPIT_ANCHORS);
  out.push({ kind: 'boss', x: BOSS_SPAWN.x + 0.5, y: BOSS_SPAWN.y + 0.5 });
  return out;
}

// ------------------------------------------------------------- mob simulation
/** the host's live, in-memory state for one mob (never persisted — ADR-0007 §2) */
export interface MobState {
  id: string;
  kind: MobKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** the reactive state machine's current node */
  st: 'chase' | 'windup' | 'strike' | 'recover' | 'kite' | 'aim' | 'dead';
  /** ms elapsed in the current state */
  t: number;
  /** facing angle (radians) — for render + lunge direction */
  face: number;
  /** locked aim/lunge point while winding up or striking */
  ax: number;
  ay: number;
  /** boss fury phase 0..2 (0 for Husks) */
  phase: number;
  /** Forgeborn only: an eruption wind-up/strike is in progress (drives the big zone) */
  erupt?: boolean;
  /** Forgeborn only: ms until the next eruption may fire (counts down while chasing) */
  eruptCd?: number;
}

export function createMob(id: string, spawn: MobSpawn, heads: number, bossHpPerHead = BOSS_HP_PER_HEAD): MobState {
  const P = MOB_PROFILES[spawn.kind];
  const maxHp = isBossKind(spawn.kind) ? bossHpPerHead * delveHeads(heads) : P.hp;
  return {
    id,
    kind: spawn.kind,
    x: spawn.x,
    y: spawn.y,
    hp: maxHp,
    maxHp,
    st: RANGED_KINDS.has(spawn.kind) ? 'kite' : 'chase',
    t: 0,
    face: 0,
    ax: spawn.x,
    ay: spawn.y,
    phase: 0,
    // the Forgeborn's FIRST eruption comes early (teaches the mechanic); later ones
    // respect the full eruptEveryMs cooldown (shortened by fury)
    eruptCd: P.eruptEveryMs ? Math.round(P.eruptEveryMs * 0.5) : 0,
  };
}

/** boss fury phase from its HP fraction (Dungeons may key on HP — no schedule) */
export function bossPhaseForHp(frac: number): number {
  if (frac <= 0.34) return 2;
  if (frac <= 0.67) return 1;
  return 0;
}

export interface MobCtx {
  /** alive player positions in tile units */
  targets: { x: number; y: number }[];
  isWall: (tx: number, ty: number) => boolean;
  /** frame time in ms */
  dt: number;
  rng: () => number;
}

/** what a mob's step produced this frame for the host to render/adjudicate */
export interface MobEvent {
  /** a live melee danger zone (players inside are knocked down) */
  strike?: { x: number; y: number; r: number };
  /** a projectile to spawn (velocity in tiles/second) */
  projectile?: { x: number; y: number; vx: number; vy: number; r: number };
  sfx?: 'lunge' | 'spit' | 'roar';
}

function nearest(m: MobState, targets: { x: number; y: number }[]): { x: number; y: number; d: number } | null {
  let best: { x: number; y: number; d: number } | null = null;
  for (const p of targets) {
    const d = Math.hypot(p.x - m.x, p.y - m.y);
    if (!best || d < best.d) best = { x: p.x, y: p.y, d };
  }
  return best;
}

/** axis-separated tile-collision move — the "basic wall avoidance" of ADR-0007 §4 */
function moveToward(m: MobState, tx: number, ty: number, speed: number, ctx: MobCtx, away = false): void {
  let dx = tx - m.x;
  let dy = ty - m.y;
  const d = Math.hypot(dx, dy) || 1;
  const s = (speed * ctx.dt) / 1000;
  const sign = away ? -1 : 1;
  let nx = m.x + (sign * dx * s) / d;
  let ny = m.y + (sign * dy * s) / d;
  const r = MOB_PROFILES[m.kind].radius;
  if (ctx.isWall(Math.floor(nx + Math.sign(nx - m.x) * r), Math.floor(m.y))) nx = m.x;
  if (ctx.isWall(Math.floor(m.x), Math.floor(ny + Math.sign(ny - m.y) * r))) ny = m.y;
  m.x = nx;
  m.y = ny;
}

/**
 * Advance one mob by ctx.dt and return anything the host must act on. Pure w.r.t.
 * the injected ctx (positions/walls/rng) — no globals, no rendering. Grasp Husks
 * chase→windup→strike→recover; Spit Husks kite→aim→fire→recover; the boss does
 * both, faster each fury phase. The host owns HP and applies player hits
 * separately (applyMobHit); death is set by the host, not here.
 */
export function stepMob(m: MobState, ctx: MobCtx): MobEvent {
  if (m.st === 'dead') return {};
  m.t += ctx.dt;
  const P = MOB_PROFILES[m.kind];
  // AGGRO GATE: a mob only "sees" a player within its aggro range, so it stays
  // inert until you actually approach (the safe-antechamber pacing — otherwise a
  // single always-present player is a target at ANY distance and every mob wakes
  // the instant the run starts). A little hysteresis while it's mid-attack keeps
  // it from flickering off at the exact edge. Beyond range → null → it idles.
  const nearest0 = nearest(m, ctx.targets);
  const engaged = m.st !== 'chase' && m.st !== 'kite';
  const range = engaged ? P.aggro * 1.5 : P.aggro;
  const near = nearest0 && nearest0.d <= range ? nearest0 : null;

  const isBoss = isBossKind(m.kind);
  if (isBoss) m.phase = bossPhaseForHp(m.hp / m.maxHp);
  // fury ramp: telegraph/cooldown shorten and volleys widen with the phase.
  // Kept gentle (0.85/0.72, not 0.8/0.62) so the boss's phase 3 stays frantic
  // but still readable/dodgeable for a lone fighter.
  const fury = isBoss ? [1, 0.85, 0.72][m.phase] : 1;

  if (!near && (m.st === 'chase' || m.st === 'kite')) return {}; // inert until a player nears

  if (RANGED_KINDS.has(m.kind)) return stepRanged(m, ctx, P, near, fury);
  if (isBoss) return stepBoss(m, ctx, P, near, fury);
  return stepMelee(m, ctx, P, near, 1);
}

/** Grasp Husk + boss melee: chase, telegraph a lunge, dash, recover */
function stepMelee(
  m: MobState,
  ctx: MobCtx,
  P: MobProfile,
  near: { x: number; y: number; d: number } | null,
  fury: number,
): MobEvent {
  switch (m.st) {
    case 'chase': {
      if (!near) return {};
      m.face = Math.atan2(near.y - m.y, near.x - m.x);
      if (near.d <= P.reach) {
        // lock the lunge point NEAR the target, not past it — a small +0.6-tile
        // overshoot so the strike zone lands where you are, not where you were
        // (the single biggest 'unfair' fix: a big overshoot swept onto your dodge)
        m.ax = m.x + Math.cos(m.face) * (near.d + 0.6);
        m.ay = m.y + Math.sin(m.face) * (near.d + 0.6);
        m.st = 'windup';
        m.t = 0;
        return { sfx: 'lunge' };
      }
      moveToward(m, near.x, near.y, P.speed, ctx);
      return {};
    }
    case 'windup': {
      // the Forgeborn's eruption uses a much longer, fury-independent wind-up (it
      // reads as an authored, room-wide "get to the wall" threat, not a quick lunge)
      const tele = m.erupt ? P.eruptTelegraphMs ?? P.telegraphMs : P.telegraphMs * fury;
      if (m.t >= tele) {
        m.st = 'strike';
        m.t = 0;
      }
      return {}; // the host renders the telegraph from st==='windup' + (ax,ay)
    }
    case 'strike':
      if (m.erupt) {
        // eruption: the boss does NOT lunge — it blasts a big radius centred where
        // it stood at the wind-up (m.ax,m.ay). Escaped by reaching the room's edges.
        if (m.t >= (P.eruptStrikeMs ?? P.strikeMs)) {
          m.st = 'recover';
          m.t = 0;
          m.erupt = false;
        }
        return { strike: { x: m.ax, y: m.ay, r: P.eruptR ?? P.strikeR } };
      }
      moveToward(m, m.ax, m.ay, P.lungeSpeed, ctx);
      if (m.t >= P.strikeMs) {
        m.st = 'recover';
        m.t = 0;
      }
      return { strike: { x: m.x, y: m.y, r: P.strikeR } };
    case 'recover':
      if (m.t >= P.cooldownMs * fury) {
        m.st = 'chase';
        m.t = 0;
      }
      return {};
    default:
      m.st = 'chase';
      return {};
  }
}

/** Spit Husk: keep distance, telegraph, loose a knockdown projectile */
function stepRanged(
  m: MobState,
  ctx: MobCtx,
  P: MobProfile,
  near: { x: number; y: number; d: number } | null,
  fury: number,
): MobEvent {
  switch (m.st) {
    case 'kite': {
      if (!near) return {};
      m.face = Math.atan2(near.y - m.y, near.x - m.x);
      if (near.d < P.kiteMin) {
        moveToward(m, near.x, near.y, P.speed, ctx, true); // back away — player closed in
      } else if (near.d > P.fireRange) {
        moveToward(m, near.x, near.y, P.speed, ctx); // edge closer to get a shot
      } else {
        // in the pocket — lock the target and aim
        m.ax = near.x;
        m.ay = near.y;
        m.st = 'aim';
        m.t = 0;
      }
      return {};
    }
    case 'aim':
      if (m.t >= P.telegraphMs * fury) {
        m.st = 'recover';
        m.t = 0;
        const a = Math.atan2(m.ay - m.y, m.ax - m.x);
        return {
          sfx: 'spit',
          projectile: { x: m.x, y: m.y, vx: Math.cos(a) * P.projSpeed, vy: Math.sin(a) * P.projSpeed, r: P.projR },
        };
      }
      return {};
    case 'recover':
      if (m.t >= P.cooldownMs * fury) {
        m.st = 'kite';
        m.t = 0;
      }
      return {};
    default:
      m.st = 'kite';
      return {};
  }
}

/**
 * Deep Guardian: a reactive scaled Husk that alternates a big lunge with a
 * spread volley, both faster and wider each fury phase — reusing the Husk state
 * machine, not a new engine. Lunge waves flow through the melee path; on entering
 * an attack it may instead aim a volley of (1 + phase) projectiles.
 */
function stepBoss(
  m: MobState,
  ctx: MobCtx,
  P: MobProfile,
  near: { x: number; y: number; d: number } | null,
  fury: number,
): MobEvent {
  if (m.st === 'chase' && near) {
    m.face = Math.atan2(near.y - m.y, near.x - m.x);
    // ERUPTION (the Forgeborn's signature move, ADR-0011): its cooldown ticks down
    // while it's engaged; when ready it plants where it stands and blasts a big
    // radius around itself (a long, room-wide wind-up handled in stepMelee), coming
    // sooner each fury phase. Takes priority over a lunge/volley this frame.
    if (P.eruptEveryMs) {
      m.eruptCd = (m.eruptCd ?? 0) - ctx.dt;
      if (m.eruptCd <= 0) {
        m.ax = m.x;
        m.ay = m.y;
        m.erupt = true;
        m.st = 'windup';
        m.t = 0;
        m.eruptCd = P.eruptEveryMs * fury; // fury<1 → more frequent later
        return { sfx: 'roar' };
      }
    }
    // ranged when the player is far or on a coin-flip each approach; else lunge
    if (near.d > P.reach && (near.d > P.fireRange * 0.6 || ctx.rng() < 0.5)) {
      m.ax = near.x;
      m.ay = near.y;
      m.st = 'aim';
      m.t = 0;
      return { sfx: 'roar' };
    }
    if (near.d <= P.reach) {
      m.ax = m.x + Math.cos(m.face) * (near.d + 0.6); // land the slam on you, not past you
      m.ay = m.y + Math.sin(m.face) * (near.d + 0.6);
      m.st = 'windup';
      m.t = 0;
      return { sfx: 'roar' };
    }
    moveToward(m, near.x, near.y, P.speed, ctx);
    return {};
  }
  if (m.st === 'aim') {
    if (m.t >= P.telegraphMs * fury) {
      m.st = 'recover';
      m.t = 0;
      // a spread volley: 1 shot in phase 0, widening to 3 in fury
      const shots = 1 + m.phase;
      const base = Math.atan2(m.ay - m.y, m.ax - m.x);
      // the host reads a single projectile per MobEvent, so fan them via rng
      // spread encoded on one representative shot; extra shots handled below
      const spread = 0.32;
      const k = shots === 1 ? 0 : Math.round(ctx.rng() * (shots - 1)) - (shots - 1) / 2;
      const a = base + k * spread;
      return {
        sfx: 'spit',
        projectile: { x: m.x, y: m.y, vx: Math.cos(a) * P.projSpeed, vy: Math.sin(a) * P.projSpeed, r: P.projR },
      };
    }
    return {};
  }
  // windup / strike / recover reuse the melee machine
  return stepMelee(m, ctx, P, near, fury);
}

/**
 * Apply one host-adjudicated player hit to a mob and return the roll. Reuses the
 * ADR-0006 weapon table + rollGuardianDamage so a Sword/axe/etc. deals the same
 * band it would to the Guardian. The host has already validated range + tool
 * ownership (trusted-friends loose validation, ADR-0005). Mutates hp; sets 'dead'
 * at 0. The rng is injected (host passes Math.random) to keep this node-pure.
 */
export function applyMobHit(m: MobState, tool: ToolId | undefined, rng: () => number): { damage: number; crit: boolean; dead: boolean } {
  if (m.st === 'dead') return { damage: 0, crit: false, dead: true };
  const { damage, crit } = rollGuardianDamage(tool, rng);
  m.hp = Math.max(0, m.hp - damage);
  const dead = m.hp <= 0;
  if (dead) m.st = 'dead';
  return { damage, crit, dead };
}

// =========================================================== the Deep (Stage 2)
/**
 * The Deep — the Delve's second Stage (ADR-0011): a molten forge-depth entered by
 * pressing interact at the boss-door that opens when the Deep Guardian falls. It
 * is an ordinary ADR-0007 instance like Stage 1 — one fixed authored interior,
 * scaled Husks, one boss — only reskinned cinder-and-basalt and tuned slightly
 * harder, ending at the Forgeborn. All of this is pure, node-importable data:
 * positions in TILE units, no browser globals, no ../config (exactly like Stage 1).
 */
export const DEEP_W = 84;
export const DEEP_H = 24;

/**
 * The Deep's rooms (west→east), mirroring Stage 1's flow: a SAFE entry chamber →
 * three Husk rooms → the Forgeborn's boss room (E). Room E is deliberately huge
 * (22×20) so its edges sit ≥9 tiles from the boss's centre — always a safe wall to
 * sprint to when the eruption (radius ~6) charges (ADR-0011 §6).
 */
export const DEEP_ROOMS: Rect[] = [
  { x: 2, y: 9, w: 8, h: 7 }, //  A — safe entry        x2..9   y9..15
  { x: 15, y: 4, w: 11, h: 16 }, // B — Cinder/Ember 1  x15..25 y4..19
  { x: 31, y: 7, w: 10, h: 10 }, // C — Cinder/Ember 2  x31..40 y7..16
  { x: 45, y: 4, w: 11, h: 15 }, // D — Cinder/Ember 3  x45..55 y4..18
  { x: 60, y: 2, w: 22, h: 20 }, // E — Forgeborn room   x60..81 y2..21
];

/** 2-tile-tall corridors joining consecutive rooms along the y11..12 spine */
export const DEEP_CORRIDORS: Rect[] = [
  { x: 10, y: 11, w: 5, h: 2 }, // A↔B (the long safe-entry buffer)
  { x: 26, y: 11, w: 5, h: 2 }, // B↔C
  { x: 41, y: 11, w: 4, h: 2 }, // C↔D
  { x: 56, y: 11, w: 4, h: 2 }, // D↔E
];

/** where the descending party lands (Deep entry room A); its own EXIT is this tile */
export const DEEP_ENTRY = { tx: 5, ty: 12 };
/** the Forgeborn's spawn — centre of the big boss room E (safe edges all around) */
export const DEEP_BOSS_SPAWN = { x: 70, y: 11 };

/** carve any wall grid from room+corridor rectangles (shared shape with Stage 1) */
function carveGrid(w: number, h: number, rects: Rect[]): Uint8Array {
  const g = new Uint8Array(w * h).fill(1);
  for (const r of rects) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (x >= 0 && y >= 0 && x < w && y < h) g[y * w + x] = 0;
      }
    }
  }
  return g;
}

const DEEP_WALLS = carveGrid(DEEP_W, DEEP_H, [...DEEP_ROOMS, ...DEEP_CORRIDORS]);

export function isDeepWall(tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= DEEP_W || ty >= DEEP_H) return true;
  return DEEP_WALLS[ty * DEEP_W + tx] === 1;
}

/** the Deep's authored molten dressing (basalt pillars = cover, ember braziers =
 *  light, lava veins + slag piles = floor decor). Room E kept open with only edge
 *  pillars so escape lanes to the walls stay clear for the eruption. */
function buildDeepProps(): DelveProp[] {
  const p: DelveProp[] = [];
  const add = (kind: PropKind, tx: number, ty: number) => p.push({ kind, tx, ty });
  // Room A — safe entry, kept clear; a brazier frames the mouth
  add('ember_brazier', 3, 10);
  add('slag_pile', 2, 14);
  add('slag_pile', 8, 9);
  add('lava_vein', 12, 11); // A↔B breadcrumb
  add('lava_vein', 13, 12);
  // Room B — first Husk room: cover pillars off the spine, braziers flanking
  add('basalt_pillar', 20, 8);
  add('basalt_pillar', 22, 15);
  add('ember_brazier', 18, 6);
  add('ember_brazier', 24, 17);
  add('lava_vein', 21, 11);
  add('slag_pile', 16, 5);
  add('slag_pile', 25, 18);
  // Room C — deeper: a colonnade breaks Ember sightlines
  add('basalt_pillar', 35, 9);
  add('basalt_pillar', 37, 14);
  add('ember_brazier', 33, 8);
  add('lava_vein', 39, 12);
  add('slag_pile', 32, 15);
  add('lava_vein', 29, 11); // B↔C breadcrumb
  // Room D — last Husk room before the boss: staggered pillars
  add('basalt_pillar', 48, 7);
  add('basalt_pillar', 52, 11);
  add('basalt_pillar', 49, 15);
  add('ember_brazier', 47, 6);
  add('ember_brazier', 54, 16);
  add('slag_pile', 46, 5);
  add('lava_vein', 43, 11); // C↔D breadcrumb
  // Room E — the Forgeborn's arena: only EDGE pillars + rim braziers; the wide
  // centre stays open so players can always sprint out of an eruption
  add('basalt_pillar', 62, 4);
  add('basalt_pillar', 79, 4);
  add('basalt_pillar', 62, 19);
  add('basalt_pillar', 79, 19);
  add('ember_brazier', 61, 3);
  add('ember_brazier', 80, 3);
  add('ember_brazier', 61, 20);
  add('ember_brazier', 80, 20);
  add('lava_vein', 66, 6);
  add('lava_vein', 74, 17);
  add('slag_pile', 64, 21);
  add('slag_pile', 77, 2);
  return p;
}

export const DEEP_PROPS: DelveProp[] = buildDeepProps();

const BLOCKED_DEEP_TILES = new Set<number>(
  DEEP_PROPS.filter((p) => PROP_BLOCKS[p.kind]).map((p) => p.ty * DEEP_W + p.tx),
);

export function isDeepBlocked(tx: number, ty: number): boolean {
  if (isDeepWall(tx, ty)) return true;
  return BLOCKED_DEEP_TILES.has(ty * DEEP_W + tx);
}

/** the Deep's molten ambient light pools (the Forgeborn's arena glows hottest) */
export const DEEP_LIGHTS: { tx: number; ty: number; color: number; scale: number; alpha: number }[] = [
  { tx: 70, ty: 11, color: 0xff7a2a, scale: 5.4, alpha: 0.32 }, // Forgeborn arena
  { tx: 20, ty: 11, color: 0xff5a1e, scale: 3.2, alpha: 0.2 },
  { tx: 50, ty: 11, color: 0xff5a1e, scale: 3.2, alpha: 0.2 },
];

/**
 * The Deep's scaling — the SAME per-head philosophy as Stage 1, tuned slightly
 * harder (ADR-0011 §4): a touch more Husks per descender and a heavier boss. Count
 * scales; per-mob danger stays flat (knockdown-only).
 */
const CINDER_PER_HEAD = 1.8;
const EMBER_PER_HEAD = 1.1;
const FORGEBORN_HP_PER_HEAD = 90;

const CINDER_ANCHORS = [
  { x: 20, y: 7 }, // B
  { x: 36, y: 10 }, // C
  { x: 50, y: 7 }, // D
  { x: 22, y: 16 }, // B
  { x: 52, y: 15 }, // D
  { x: 49, y: 11 }, // D
  { x: 34, y: 13 }, // C
];
const EMBER_ANCHORS = [
  { x: 19, y: 11 }, // B
  { x: 53, y: 10 }, // D
  { x: 38, y: 12 }, // C
  { x: 47, y: 7 }, // D
];

/**
 * The Deep's spawn plan — mirrors planDelveSpawns but with Cinder/Ember Husks, the
 * Deep's anchors, its slightly-harder coefficients, and the Forgeborn. Scaled to
 * the DESCENDING headcount by the host at descent (never simulated during Stage 1).
 */
export function planDeepSpawns(heads: number, rng: () => number): MobSpawn[] {
  const n = delveHeads(heads);
  const out: MobSpawn[] = [];
  const place = (kind: HuskKind, count: number, anchors: { x: number; y: number }[]) => {
    for (let i = 0; i < count; i++) {
      const a = anchors[i % anchors.length];
      let x = a.x + Math.round(rng() * 2 - 1);
      let y = a.y + Math.round(rng() * 2 - 1);
      if (isDeepBlocked(Math.floor(x), Math.floor(y))) {
        x = a.x;
        y = a.y;
      }
      out.push({ kind, x: x + 0.5, y: y + 0.5 });
    }
  };
  place('cinder', Math.min(14, Math.max(3, Math.round(CINDER_PER_HEAD * n))), CINDER_ANCHORS);
  place('ember', Math.min(7, Math.max(2, Math.round(EMBER_PER_HEAD * n))), EMBER_ANCHORS);
  out.push({ kind: 'forgeborn', x: DEEP_BOSS_SPAWN.x + 0.5, y: DEEP_BOSS_SPAWN.y + 0.5 });
  return out;
}

// =========================================================== Stage bundles
/**
 * Everything the host/scene needs to build and run ONE Stage as an ADR-0007
 * instance, so both Stages flow through a single code path (ADR-0011): the fixed
 * interior (walls/props/lights/entry), the scaled spawn plan, per-head boss HP,
 * its loot ids, the zone name, and (Stage 1 only) the interior tile where the
 * boss-death door opens. Pure data — the scene multiplies TILE at the render edge.
 */
export interface StageDef {
  stage: 1 | 2;
  w: number;
  h: number;
  rooms: Rect[];
  corridors: Rect[];
  entry: { tx: number; ty: number };
  props: DelveProp[];
  lights: { tx: number; ty: number; color: number; scale: number; alpha: number }[];
  /** floor look: the mine→ruins ramp (Stage 1) or a uniform magma palette (the Deep) */
  palette: 'mine' | 'magma';
  /** Stage 1 only: rooms/corridors at x ≥ this wear the cooler "ruins" floor */
  ruinsFromX: number;
  isWall(tx: number, ty: number): boolean;
  isBlocked(tx: number, ty: number): boolean;
  planSpawns(heads: number, rng: () => number): MobSpawn[];
  bossHpPerHead: number;
  /** the zone banner shown on entry/descent (English id; i18n translates it) */
  zone: string;
  /** the run's participation loot: common (per Husk felled) + rare (on the boss) */
  loot: { common: ResourceId; rare: ResourceId };
  /** Stage 1 only: interior tile where the hidden boss-door opens (leads to the Deep) */
  door?: { tx: number; ty: number };
}

const STAGE_1: StageDef = {
  stage: 1,
  w: DELVE_W,
  h: DELVE_H,
  rooms: DELVE_ROOMS,
  corridors: DELVE_CORRIDORS,
  entry: DELVE_ENTRY,
  props: DELVE_PROPS,
  lights: DELVE_LIGHTS,
  palette: 'mine',
  ruinsFromX: RUINS_FROM_X,
  isWall: isDelveWall,
  isBlocked: isDelveBlocked,
  planSpawns: planDelveSpawns,
  bossHpPerHead: BOSS_HP_PER_HEAD,
  zone: 'The Delve',
  loot: { common: HUSK_SHARD, rare: DEEP_CORE },
  door: { tx: 63, ty: 15 }, // in the Deep Guardian's room E, clear of the boss + props
};

const STAGE_2: StageDef = {
  stage: 2,
  w: DEEP_W,
  h: DEEP_H,
  rooms: DEEP_ROOMS,
  corridors: DEEP_CORRIDORS,
  entry: DEEP_ENTRY,
  props: DEEP_PROPS,
  lights: DEEP_LIGHTS,
  palette: 'magma',
  ruinsFromX: DEEP_W, // never — the whole Deep is molten (palette handles the look)
  isWall: isDeepWall,
  isBlocked: isDeepBlocked,
  planSpawns: planDeepSpawns,
  bossHpPerHead: FORGEBORN_HP_PER_HEAD,
  zone: 'The Deep',
  loot: { common: CINDER_SHARD, rare: FORGE_CORE },
};

export type Stage = 1 | 2;
export const STAGES: Record<Stage, StageDef> = { 1: STAGE_1, 2: STAGE_2 };
