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
// i18n is explicitly node-safe (every browser access is guarded) — the generated
// Depths compose their Husk/boss/zone names from its localized word lists
// (ADR-0015: composed, never baked English strings).
import { t } from '../i18n';
// type-only (erased at compile — NO runtime import, so no circular dependency):
// the open-world Wildlife (ADR-0012) reskins this one engine. Its kinds widen
// MobKind so MobState/mob sprites accept them; their profiles register at runtime
// via registerMobProfile below. dungeon.ts never imports wildlife.ts at runtime.
import type { WildKind } from './wildlife';

// ------------------------------------------------------------- loot
/** Stage-1 loot: the common Husk drop (the farm loop) and the rare boss drop */
export const HUSK_SHARD: ResourceId = 'husk_shard';
export const DEEP_CORE: ResourceId = 'deep_core';
/** the Deep's loot (ADR-0011): common Cinder/Ember Husk drop + rare Forgeborn drop */
export const CINDER_SHARD: ResourceId = 'cinder_shard';
export const FORGE_CORE: ResourceId = 'forge_core';
/** the generated Depths' ONLY loot (ADR-0015): one Sigil per Stage boss, prestige-only */
export const DEPTH_SIGIL: ResourceId = 'depth_sigil';
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
export const DELVE_W = 60;
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
 * swarmed at the spawn and can pick its moment to advance. The run climbs at the
 * end: the boss room E is stacked directly ABOVE the last Husk room D (reached by
 * a vertical corridor), not out on the eastern edge.
 */
export const DELVE_ROOMS: Rect[] = [
  { x: 2, y: 8, w: 8, h: 6 }, // A — safe entrance      x2..9   y8..13
  { x: 18, y: 3, w: 11, h: 16 }, // B — Husk room 1     x18..28 y3..18
  { x: 33, y: 6, w: 10, h: 10 }, // C — Husk room 2     x33..42 y6..15
  { x: 45, y: 12, w: 13, h: 8 }, // D — Husk room 3     x45..57 y12..19 (lower band)
  { x: 45, y: 2, w: 13, h: 8 }, // E — boss room        x45..57 y2..9  (stacked above D)
];

/** corridors joining consecutive rooms — the A→B→C spine runs y10..11, then the
 *  run drops onto D's lower band and climbs a vertical shaft up into boss room E */
export const DELVE_CORRIDORS: Rect[] = [
  { x: 10, y: 10, w: 8, h: 2 }, // A↔B — the long safe-entrance buffer
  { x: 29, y: 10, w: 4, h: 2 }, // B↔C
  { x: 43, y: 13, w: 4, h: 2 }, // C↔D — drops onto D's lower band
  { x: 50, y: 9, w: 2, h: 4 }, // D↔E — vertical shaft up into the boss room
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
  { tx: 51, ty: 5, color: 0xb478ff, scale: 4.2, alpha: 0.3 }, // Deep Guardian chamber (above D)
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
  // Room D — ancient ruins (lower band): a staggered obsidian colonnade breaks
  // Spit sightlines; the entry mouths (C↔D at x45-46 y13-14, the climb to E at
  // x50-51 y12) are kept clear
  add('obsidian_pillar', 48, 15);
  add('obsidian_pillar', 54, 15);
  add('obsidian_pillar', 52, 18);
  add('brazier_violet', 46, 17);
  add('brazier_violet', 56, 17);
  add('glyph_stone', 45, 19);
  add('glyph_stone', 57, 13);
  add('bone_pile', 49, 16);
  add('bone_pile', 53, 17);
  add('rubble_pile', 47, 13);
  add('rubble_pile', 55, 19);
  // Room E — the Deep Guardian's chamber, stacked ABOVE D: only rim framing, the
  // boss glow dominates; the centre (boss spawn) and the door are left clear
  add('obsidian_pillar', 47, 4);
  add('obsidian_pillar', 55, 6);
  add('brazier_violet', 46, 3);
  add('brazier_violet', 56, 3);
  add('glyph_stone', 45, 8);
  add('glyph_stone', 57, 8);
  add('bone_pile', 48, 7);
  add('bone_pile', 54, 7);
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
/**
 * The Depth boss kits (ADR-0016): the two authored bosses plus five variant
 * kits with their own attack patterns + silhouettes. themeFor(depth) picks one
 * seeded per Depth — the same Depth always rolls the same boss, no seed on the
 * wire. All seven run the ONE shared state machine with per-kit branches.
 */
export type DepthBossKind = 'boss' | 'forgeborn' | 'ram' | 'warden' | 'whirl' | 'bulwark' | 'brood';
/** the kinds native to the Dungeons (the closed MOB_PROFILES table below) */
export type DungeonMobKind = HuskKind | DepthBossKind;
/** every kind the shared engine simulates: Dungeon Husks/bosses + open-world Wildlife */
export type MobKind = DungeonMobKind | WildKind;

/** which Dungeon kinds are the ranged kiters (start in 'kite', run stepRanged) */
const RANGED_KINDS = new Set<DungeonMobKind>(['spit', 'ember']);
/** which Dungeon kinds are the scaled reactive bosses (per-head HP, run stepBoss) */
const BOSS_KINDS = new Set<DungeonMobKind>(['boss', 'forgeborn', 'ram', 'warden', 'whirl', 'bulwark', 'brood']);
export function isBossKind(kind: MobKind): boolean {
  return BOSS_KINDS.has(kind as DungeonMobKind);
}

/** static per-kind combat/AI profile (tile units; ms; tiles/second) */
export interface MobProfile {
  /**
   * which reused stepper this kind runs. Omitted → derived from the Dungeon
   * RANGED_KINDS/BOSS_KINDS sets (the Husks/bosses keep their exact behaviour).
   * Registered Wildlife sets it explicitly: a predator is 'melee' (chase → strike,
   * huntable), a peaceful creature is 'ranged' with fireRange 0 (kite = flee, never
   * fires — a skittish "moving Node"). No new brain — the SAME stepMelee/stepRanged.
   */
  ai?: 'melee' | 'ranged' | 'boss';
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
  // --- the Depth boss kits (ADR-0016). `kit` picks a per-kit branch in stepBoss;
  // undefined = the two authored bosses' classic lunge+volley behaviour. Each kit
  // REUSES the same state nodes + MobEvent vocabulary — no second engine:
  //   ram     — locks a charge lane through you (windup → long dash strike), plus
  //             the eruption fields as its point-blank slam ring.
  //   warden  — hover-kites and fires telegraphed fans; eruptEveryMs paces its
  //             signature wide slow "wall" volley (a curtain you slip through).
  //   whirl   — tucks (windup), then SPINS: a long moving strike zone centred on
  //             itself (strikeMs = spin duration, lungeSpeed = spin drift speed).
  //   bulwark — guards (hits bounce, applyMobHit) while walking you down;
  //             eruptEveryMs paces the guard DROP → counter-slam → long exposed
  //             recover (the punish window).
  //   brood   — rooted; eruptEveryMs paces a BIRTH (small shockwave + a summon
  //             MobEvent the host turns into Husk adds), claws if you hug it.
  kit?: 'ram' | 'warden' | 'whirl' | 'bulwark' | 'brood';
  /** warden: shots per fan volley (phase 2 adds one) */
  burstShots?: number;
  /** warden: ms between the shots of one volley */
  burstGapMs?: number;
}

/**
 * The two Husk kinds and the boss. Per-mob danger (telegraph → knockdown) is held
 * ~constant across group sizes on purpose (ADR-0007 §6); only count and boss HP
 * scale. The Deep Guardian is a scaled-up reactive Husk — NOT a second engine.
 */
export const MOB_PROFILES: Record<DungeonMobKind, MobProfile> = {
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
  // ---- the Depth boss kits (ADR-0016): five variant bosses the generated Depths
  // roll seeded. HP is per-head via the ONE monotone bossHpPerHead curve (the
  // profile hp is documentation); per-mob danger stays knockdown-only + readable.
  // the Ram — a charger: telegraphs a lane THROUGH you, then dashes it (7.2 t/s,
  // below Player speed — a right-angle sidestep always escapes). Crowd it and it
  // answers with a point-blank slam ring (the erupt fields).
  ram: {
    kit: 'ram',
    hp: 90,
    radius: 1.35,
    speed: 2.6,
    aggro: 14,
    reach: 2.2,
    telegraphMs: 1400,
    strikeMs: 900, // the dash — ~6.5 tiles of committed lane
    lungeSpeed: 7.2,
    strikeR: 1.05,
    cooldownMs: 2400,
    kiteMin: 0,
    fireRange: 9, // repurposed: the range at which it commits a charge
    projSpeed: 0,
    projR: 0,
    eruptR: 3.4,
    eruptTelegraphMs: 1500,
    eruptStrikeMs: 420,
    eruptEveryMs: 9000,
  },
  // the Warden — a hovering caster: kites a firing pocket and looses telegraphed
  // 3-shot fans; every eruptEveryMs it conjures its signature WALL — seven slow
  // shots fanned wide, a curtain with gaps you slip through. Never melees.
  warden: {
    kit: 'warden',
    hp: 90,
    radius: 1.15,
    speed: 2.7,
    aggro: 15,
    reach: 0,
    telegraphMs: 950,
    strikeMs: 0,
    lungeSpeed: 0,
    strikeR: 0,
    cooldownMs: 2100,
    kiteMin: 4.5,
    fireRange: 9.5,
    projSpeed: 5.2,
    projR: 0.6,
    burstShots: 3,
    burstGapMs: 170,
    eruptEveryMs: 9500, // paces the wall volley (no erupt zone — projectiles only)
  },
  // the Whirlwind — area denial: tucks its blades (long windup), then SPINS for
  // 2.6s — a moving knockdown zone drifting after you SLOWER than you run (3.3
  // t/s), then a long dizzy recover: the punish window.
  whirl: {
    kit: 'whirl',
    hp: 90,
    radius: 1.25,
    speed: 2.9,
    aggro: 13,
    reach: 3.2, // commits the tuck when you're this close
    telegraphMs: 1500,
    strikeMs: 2600, // the spin duration
    lungeSpeed: 3.3, // spin drift speed — always outrunnable
    strikeR: 1.7,
    cooldownMs: 3000, // dizzy — the punish window
    kiteMin: 0,
    fireRange: 0,
    projSpeed: 0,
    projR: 0,
  },
  // the Bulwark — a walking wall: guards behind its rune slab (hits BOUNCE —
  // applyMobHit deals 0) while pressing toward you; the guard drops on a cycle
  // into a counter-slam ring, then a LONG exposed recover — hit it then.
  bulwark: {
    kit: 'bulwark',
    hp: 90,
    radius: 1.4,
    speed: 2.0,
    aggro: 13,
    reach: 2.2,
    telegraphMs: 1150,
    strikeMs: 220,
    lungeSpeed: 0,
    strikeR: 1.2,
    cooldownMs: 3500, // the exposed window after the slam
    kiteMin: 0,
    fireRange: 0,
    projSpeed: 0,
    projR: 0,
    eruptR: 3.0,
    eruptTelegraphMs: 1400,
    eruptStrikeMs: 420,
    eruptEveryMs: 5200, // how long the guard holds each cycle
  },
  // the Broodmother — rooted: never moves; on a cycle her cage BURSTS (a small
  // shockwave + two Husk adds crawl out — the host caps the room at
  // DEPTH_MOB_CAP), and she claws anyone hugging her. Cut the brood down first.
  brood: {
    kit: 'brood',
    hp: 90,
    radius: 1.3,
    speed: 0, // rooted
    aggro: 14,
    reach: 2.2,
    telegraphMs: 1100,
    strikeMs: 200,
    lungeSpeed: 0,
    strikeR: 1.15,
    cooldownMs: 2200,
    kiteMin: 0,
    fireRange: 0,
    projSpeed: 0,
    projR: 0,
    eruptR: 1.8, // the birth shockwave — step off her skirt
    eruptTelegraphMs: 1900,
    eruptStrikeMs: 380,
    eruptEveryMs: 7200,
  },
};

/**
 * Profiles registered by other pure content modules (open-world Wildlife,
 * ADR-0012) so the ONE engine simulates their reskins without a new brain. Their
 * MobProfiles live in their own module and register here at import; stepMob /
 * createMob / applyMobHit look kinds up through profileOf, Dungeon table first.
 */
const EXTRA_PROFILES = new Map<string, MobProfile>();
export function registerMobProfile(kind: string, profile: MobProfile): void {
  EXTRA_PROFILES.set(kind, profile);
}
/** the static profile for any engine kind — a Dungeon Husk/boss or a registered creature */
export function profileOf(kind: MobKind): MobProfile {
  return (MOB_PROFILES as Record<string, MobProfile>)[kind] ?? EXTRA_PROFILES.get(kind)!;
}
/** which reused stepper a kind runs: explicit MobProfile.ai, else derived from the Dungeon sets */
function aiOf(kind: MobKind, P: MobProfile): 'melee' | 'ranged' | 'boss' {
  if (P.ai) return P.ai;
  if (BOSS_KINDS.has(kind as DungeonMobKind)) return 'boss';
  if (RANGED_KINDS.has(kind as DungeonMobKind)) return 'ranged';
  return 'melee';
}

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
  { x: 48, y: 14 }, // D (lower band)
  { x: 26, y: 15 }, // B
  { x: 55, y: 15 }, // D
  { x: 50, y: 16 }, // D
  { x: 36, y: 13 }, // C
];
const SPIT_ANCHORS = [
  { x: 24, y: 10 }, // B
  { x: 51, y: 17 }, // D (lower band)
  { x: 39, y: 12 }, // C
  { x: 27, y: 7 }, // B
];
export const BOSS_SPAWN = { x: 51, y: 5 };

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
  /** the Bulwark's guard is up (ADR-0016): hits bounce (applyMobHit deals 0) — on the wire */
  guard?: boolean;
  /** the Warden's live volley mode (host-only): 0 = fan, 1 = the wide slow wall */
  mode?: number;
}

export function createMob(id: string, spawn: MobSpawn, heads: number, bossHpPerHead = BOSS_HP_PER_HEAD, hpMul = 1): MobState {
  const P = profileOf(spawn.kind);
  // hpMul is the per-Depth Husk hardening (ADR-0015, 1 on the authored Stages);
  // boss HP passes in pre-compounded per-head values, so only heads scale it here
  const maxHp = isBossKind(spawn.kind) ? Math.round(bossHpPerHead * delveHeads(heads)) : Math.round(P.hp * hpMul);
  return {
    id,
    kind: spawn.kind,
    x: spawn.x,
    y: spawn.y,
    hp: maxHp,
    maxHp,
    st: aiOf(spawn.kind, P) === 'ranged' ? 'kite' : 'chase',
    t: 0,
    face: 0,
    ax: spawn.x,
    ay: spawn.y,
    phase: 0,
    // the Forgeborn's FIRST eruption comes early (teaches the mechanic); later ones
    // respect the full eruptEveryMs cooldown (shortened by fury)
    eruptCd: P.eruptEveryMs ? Math.round(P.eruptEveryMs * 0.5) : 0,
    // the Bulwark opens with its guard up — the fight starts by teaching the bounce
    guard: P.kit === 'bulwark' ? true : undefined,
  };
}

/** boss fury phase from its HP fraction (Dungeons may key on HP — no schedule) */
export function bossPhaseForHp(frac: number): number {
  if (frac <= 0.34) return 2;
  if (frac <= 0.67) return 1;
  return 0;
}

// ---------------------------------------------------- per-Depth tuning (ADR-0015)
// The generated Depths harden the SAME two archetypes + recycled boss kits by
// multiplying the static profiles at sim time — no new state machine, no new
// engine. All named constants are playtest-tunable; the three HARD caps keep
// deep runs readable forever: mob speed stays below Player speed (escape/kiting
// always possible), telegraphs never dive under a humanly reactable floor, and
// the mob count never exceeds what the host's single batched broadcast carries.
// Past those caps, difficulty keeps compounding via HP and cadence alone.

/** Player speed in TILE units — mirrors config's PLAYER_SPEED (130 px/s) / TILE (16)
 *  (this module must stay node-importable and may not import ../config) */
export const PLAYER_SPEED_TILES = 130 / 16; // 8.125
/** Husk & boss HP multiplier per Depth past 2 (compounds without end) */
export const DEPTH_HP_MUL = 1.15;
/** move-speed multiplier per Depth past 2 (creeps up toward the hard cap) */
export const DEPTH_SPEED_MUL = 1.04;
/** HARD cap: no Depth-tuned mob ever moves as fast as a Player (tiles/second) */
export const DEPTH_MOB_SPEED_CAP = 7.4;
/** telegraph & cooldown multiplier per Depth past 2 (cadence quickens, compounding) */
export const DEPTH_CADENCE_MUL = 0.96;
/** HARD floor: a wind-up never shrinks below this — attacks stay reactable */
export const DEPTH_TELEGRAPH_FLOOR_MS = 600;
/** floor under the quickening recovery so a mob never attacks back-to-back */
export const DEPTH_COOLDOWN_FLOOR_MS = 700;
/** ranged-kiter projectile-speed multiplier per Depth past 2 */
export const DEPTH_PROJ_SPEED_MUL = 1.05;
/** projectiles too stay side-steppable: capped below Player speed like the mobs */
export const DEPTH_PROJ_SPEED_CAP = 7.4;
/** extra Husks per Depth past 2, stepping toward the count cap */
export const DEPTH_COUNT_STEP = 1;
/** HARD cap: total mobs per Depth (the host's ONE batched broadcast per tick is
 *  the bandwidth ceiling — ADR-0012's cap discipline applied to the Delve) */
export const DEPTH_MOB_CAP = 24;

/** the compounding multipliers themeFor(depth) hands the sim (identity when absent) */
export interface MobTune {
  /** multiplies chase/kite speed; the result is clamped at DEPTH_MOB_SPEED_CAP */
  speedMul: number;
  /** multiplies telegraph wind-ups; floored at DEPTH_TELEGRAPH_FLOOR_MS (after fury) */
  telegraphMul: number;
  /** multiplies attack recovery/cooldowns; floored at DEPTH_COOLDOWN_FLOOR_MS */
  cooldownMul: number;
  /** multiplies projectile speed; clamped at DEPTH_PROJ_SPEED_CAP */
  projSpeedMul: number;
}

const tunedSpeed = (P: MobProfile, tune?: MobTune): number =>
  tune ? Math.min(P.speed * tune.speedMul, DEPTH_MOB_SPEED_CAP) : P.speed;
const tunedTelegraph = (baseMs: number, tune?: MobTune): number =>
  tune ? Math.max(baseMs * tune.telegraphMul, DEPTH_TELEGRAPH_FLOOR_MS) : baseMs;
const tunedCooldown = (baseMs: number, tune?: MobTune): number =>
  tune ? Math.max(baseMs * tune.cooldownMul, DEPTH_COOLDOWN_FLOOR_MS) : baseMs;
const tunedProjSpeed = (base: number, tune?: MobTune): number =>
  tune ? Math.min(base * tune.projSpeedMul, DEPTH_PROJ_SPEED_CAP) : base;

export interface MobCtx {
  /** alive player positions in tile units */
  targets: { x: number; y: number }[];
  isWall: (tx: number, ty: number) => boolean;
  /** frame time in ms */
  dt: number;
  rng: () => number;
  /** ADR-0015: the live Stage's per-Depth hardening (undefined on Stages 1–2 + Wildlife) */
  tune?: MobTune;
}

/** what a mob's step produced this frame for the host to render/adjudicate */
export interface MobEvent {
  /** a live melee danger zone (players inside are knocked down) */
  strike?: { x: number; y: number; r: number };
  /** a projectile to spawn (velocity in tiles/second) */
  projectile?: { x: number; y: number; vx: number; vy: number; r: number };
  /** the Broodmother's birth (ADR-0016): positions where the host spawns Husk
   *  adds (the host picks the Stage's chaser kind + enforces DEPTH_MOB_CAP) */
  summon?: { x: number; y: number }[];
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
  const r = profileOf(m.kind).radius;
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
  const P = profileOf(m.kind);
  const ai = aiOf(m.kind, P);
  // AGGRO GATE: a mob only "sees" a player within its aggro range, so it stays
  // inert until you actually approach (the safe-antechamber pacing — otherwise a
  // single always-present player is a target at ANY distance and every mob wakes
  // the instant the run starts). A little hysteresis while it's mid-attack keeps
  // it from flickering off at the exact edge. Beyond range → null → it idles.
  const nearest0 = nearest(m, ctx.targets);
  const engaged = m.st !== 'chase' && m.st !== 'kite';
  const range = engaged ? P.aggro * 1.5 : P.aggro;
  const near = nearest0 && nearest0.d <= range ? nearest0 : null;

  const isBoss = ai === 'boss';
  if (isBoss) m.phase = bossPhaseForHp(m.hp / m.maxHp);
  // fury ramp: telegraph/cooldown shorten and volleys widen with the phase.
  // Kept gentle (0.85/0.72, not 0.8/0.62) so the boss's phase 3 stays frantic
  // but still readable/dodgeable for a lone fighter.
  const fury = isBoss ? [1, 0.85, 0.72][m.phase] : 1;

  if (!near && (m.st === 'chase' || m.st === 'kite')) return {}; // inert until a player nears

  if (ai === 'ranged') return stepRanged(m, ctx, P, near, fury);
  if (ai === 'boss') return stepBoss(m, ctx, P, near, fury);
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
      moveToward(m, near.x, near.y, tunedSpeed(P, ctx.tune), ctx);
      return {};
    }
    case 'windup': {
      // the Forgeborn's eruption uses a much longer, fury-independent wind-up (it
      // reads as an authored, room-wide "get to the wall" threat, not a quick lunge)
      const tele = tunedTelegraph(m.erupt ? P.eruptTelegraphMs ?? P.telegraphMs : P.telegraphMs * fury, ctx.tune);
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
      if (m.t >= tunedCooldown(P.cooldownMs * fury, ctx.tune)) {
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
        moveToward(m, near.x, near.y, tunedSpeed(P, ctx.tune), ctx, true); // back away — player closed in
      } else if (near.d > P.fireRange) {
        moveToward(m, near.x, near.y, tunedSpeed(P, ctx.tune), ctx); // edge closer to get a shot
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
      if (m.t >= tunedTelegraph(P.telegraphMs * fury, ctx.tune)) {
        m.st = 'recover';
        m.t = 0;
        const a = Math.atan2(m.ay - m.y, m.ax - m.x);
        const ps = tunedProjSpeed(P.projSpeed, ctx.tune);
        return {
          sfx: 'spit',
          projectile: { x: m.x, y: m.y, vx: Math.cos(a) * ps, vy: Math.sin(a) * ps, r: P.projR },
        };
      }
      return {};
    case 'recover':
      if (m.t >= tunedCooldown(P.cooldownMs * fury, ctx.tune)) {
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
  // the Depth boss kits (ADR-0016) branch here; undefined = the classic kit below
  if (P.kit === 'ram') return stepRam(m, ctx, P, near, fury);
  if (P.kit === 'warden') return stepWarden(m, ctx, P, near, fury);
  if (P.kit === 'whirl') return stepWhirl(m, ctx, P, near, fury);
  if (P.kit === 'bulwark') return stepBulwark(m, ctx, P, near, fury);
  if (P.kit === 'brood') return stepBrood(m, ctx, P, near, fury);
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
        m.eruptCd = tunedCooldown(P.eruptEveryMs * fury, ctx.tune); // fury<1 → more frequent later
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
    moveToward(m, near.x, near.y, tunedSpeed(P, ctx.tune), ctx);
    return {};
  }
  if (m.st === 'aim') {
    if (m.t >= tunedTelegraph(P.telegraphMs * fury, ctx.tune)) {
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
      const ps = tunedProjSpeed(P.projSpeed, ctx.tune);
      return {
        sfx: 'spit',
        projectile: { x: m.x, y: m.y, vx: Math.cos(a) * ps, vy: Math.sin(a) * ps, r: P.projR },
      };
    }
    return {};
  }
  // windup / strike / recover reuse the melee machine
  return stepMelee(m, ctx, P, near, fury);
}

// ------------------------------------------------- the Depth boss kits (ADR-0016)
// Five variant bosses, each a small branch over the SAME state nodes + MobEvent
// vocabulary (strike zones, projectiles, the erupt radius machine) — never a
// second engine. themeFor(depth) rolls one per Depth, seeded; per-mob danger
// stays knockdown-only and telegraph-first, exactly like everything since
// ADR-0007. Every wind-up honours the tuned telegraph floor.

/** the Ram: locks a charge lane through you, dashes it; slams point-blank crowding */
function stepRam(
  m: MobState,
  ctx: MobCtx,
  P: MobProfile,
  near: { x: number; y: number; d: number } | null,
  fury: number,
): MobEvent {
  // the slam's cadence ticks EVERY engaged frame (chase lasts ~one frame when a
  // target is in charge range, so a chase-only tick would starve the slam)
  if (P.eruptEveryMs && m.st !== 'windup' && m.st !== 'strike') m.eruptCd = (m.eruptCd ?? 0) - ctx.dt;
  if (m.st === 'chase' && near) {
    m.face = Math.atan2(near.y - m.y, near.x - m.x);
    // the slam ring answers players who hug it instead of dodging the charges
    if (P.eruptEveryMs) {
      if (m.eruptCd !== undefined && m.eruptCd <= 0 && near.d <= P.reach * 1.6) {
        m.ax = m.x;
        m.ay = m.y;
        m.erupt = true;
        m.st = 'windup';
        m.t = 0;
        m.eruptCd = tunedCooldown(P.eruptEveryMs * fury, ctx.tune);
        return { sfx: 'roar' };
      }
    }
    if (near.d <= P.fireRange) {
      // the CHARGE: the lane is locked THROUGH you (+4 tiles of overshoot) — a
      // sidestep clears it; standing in the lane does not
      m.ax = m.x + Math.cos(m.face) * (near.d + 4.0);
      m.ay = m.y + Math.sin(m.face) * (near.d + 4.0);
      m.st = 'windup';
      m.t = 0;
      return { sfx: 'roar' };
    }
    moveToward(m, near.x, near.y, tunedSpeed(P, ctx.tune), ctx);
    return {};
  }
  // windup → dash-strike (the long strikeMs lane) → recover: the melee machine
  return stepMelee(m, ctx, P, near, fury);
}

/** the Warden: hover-kites a firing pocket; telegraphed fans + a paced wall volley */
function stepWarden(
  m: MobState,
  ctx: MobCtx,
  P: MobProfile,
  near: { x: number; y: number; d: number } | null,
  fury: number,
): MobEvent {
  // the wall's cadence ticks EVERY engaged frame (in the pocket, chase lasts a
  // single frame before it aims — a chase-only tick would starve the wall)
  m.eruptCd = (m.eruptCd ?? 0) - ctx.dt;
  switch (m.st) {
    case 'chase': {
      if (!near) return {};
      m.face = Math.atan2(near.y - m.y, near.x - m.x);
      if (near.d < P.kiteMin) {
        moveToward(m, near.x, near.y, tunedSpeed(P, ctx.tune), ctx, true);
        return {};
      }
      if (near.d > P.fireRange) {
        moveToward(m, near.x, near.y, tunedSpeed(P, ctx.tune), ctx);
        return {};
      }
      // in the pocket — lock the target and conjure: the wall when paced, else a fan
      m.ax = near.x;
      m.ay = near.y;
      m.st = 'aim';
      m.t = 0;
      if (m.eruptCd <= 0) {
        m.mode = 1;
        m.eruptCd = tunedCooldown((P.eruptEveryMs ?? 9000) * fury, ctx.tune);
        return { sfx: 'roar' };
      }
      m.mode = 0;
      return {};
    }
    case 'aim':
      if (m.t >= tunedTelegraph(P.telegraphMs * fury, ctx.tune)) {
        m.st = 'strike'; // repurposed as the VOLLEY: shots stream out over its duration
        m.t = 0;
      }
      return {};
    case 'strike': {
      const wall = m.mode === 1;
      // the wall: seven slow wide shots (a curtain with gaps); the fan: three
      // aimed shots, four in deep fury — one projectile per gap crossing
      const shots = wall ? 7 : (P.burstShots ?? 3) + (m.phase >= 2 ? 1 : 0);
      const gap = P.burstGapMs ?? 170;
      let ev: MobEvent = {};
      const idx = Math.min(shots - 1, Math.floor(m.t / gap));
      const prev = Math.floor(Math.max(0, m.t - ctx.dt) / gap);
      if (m.t <= ctx.dt || idx > prev) {
        const base = Math.atan2(m.ay - m.y, m.ax - m.x);
        const spread = wall ? 0.9 : 0.3;
        const a = base + (shots === 1 ? 0 : ((idx / (shots - 1)) * 2 - 1) * spread);
        const ps = tunedProjSpeed(P.projSpeed, ctx.tune) * (wall ? 0.55 : 1);
        ev = {
          sfx: 'spit',
          projectile: { x: m.x, y: m.y, vx: Math.cos(a) * ps, vy: Math.sin(a) * ps, r: P.projR },
        };
      }
      if (m.t >= shots * gap) {
        m.st = 'recover';
        m.t = 0;
      }
      return ev;
    }
    case 'recover':
      if (m.t >= tunedCooldown(P.cooldownMs * fury, ctx.tune)) {
        m.st = 'chase';
        m.t = 0;
      }
      return {};
    default:
      m.st = 'chase';
      return {};
  }
}

/** the Whirlwind: tucks, then SPINS — a long moving strike zone, then a dizzy recover */
function stepWhirl(
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
        m.ax = m.x; // the tuck telegraphs on the spot — the zone will be itself
        m.ay = m.y;
        m.st = 'windup';
        m.t = 0;
        return { sfx: 'roar' };
      }
      moveToward(m, near.x, near.y, tunedSpeed(P, ctx.tune), ctx);
      return {};
    }
    case 'windup':
      if (m.t >= tunedTelegraph(P.telegraphMs * fury, ctx.tune)) {
        m.st = 'strike'; // the SPIN
        m.t = 0;
        return { sfx: 'lunge' };
      }
      return {};
    case 'strike': {
      // the spin drifts after the nearest player SLOWER than they run — hold
      // distance and it never catches you; the zone rides the boss itself
      if (near) {
        m.face = Math.atan2(near.y - m.y, near.x - m.x);
        moveToward(m, near.x, near.y, P.lungeSpeed, ctx);
      }
      if (m.t >= P.strikeMs) {
        m.st = 'recover'; // dizzy — the punish window
        m.t = 0;
      }
      return { strike: { x: m.x, y: m.y, r: P.strikeR } };
    }
    case 'recover':
      if (m.t >= tunedCooldown(P.cooldownMs * fury, ctx.tune)) {
        m.st = 'chase';
        m.t = 0;
      }
      return {};
    default:
      m.st = 'chase';
      return {};
  }
}

/** the Bulwark: guards (hits bounce) while walking you down; drops it into a counter-slam */
function stepBulwark(
  m: MobState,
  ctx: MobCtx,
  P: MobProfile,
  near: { x: number; y: number; d: number } | null,
  fury: number,
): MobEvent {
  if (m.st === 'chase' && near) {
    m.face = Math.atan2(near.y - m.y, near.x - m.x);
    m.guard = true; // back behind the slab the moment it re-engages
    m.eruptCd = (m.eruptCd ?? 0) - ctx.dt;
    if (m.eruptCd <= 0) {
      // the guard DROPS: counter-slam wind-up → ring → the long exposed recover.
      // guard stays false through the whole sequence — that's the damage window.
      m.guard = false;
      m.erupt = true;
      m.ax = m.x;
      m.ay = m.y;
      m.st = 'windup';
      m.t = 0;
      m.eruptCd = tunedCooldown((P.eruptEveryMs ?? 5200) * fury, ctx.tune);
      return { sfx: 'roar' };
    }
    moveToward(m, near.x, near.y, tunedSpeed(P, ctx.tune), ctx); // the walking wall
    return {};
  }
  return stepMelee(m, ctx, P, near, fury);
}

/** the Broodmother: rooted; her cage bursts on a cycle (shockwave + Husk adds), claws huggers */
function stepBrood(
  m: MobState,
  ctx: MobCtx,
  P: MobProfile,
  near: { x: number; y: number; d: number } | null,
  fury: number,
): MobEvent {
  // the birth's cadence ticks EVERY engaged frame except mid-birth (a hugging
  // player keeps her clawing — a chase-only tick would starve the brood)
  if (m.st !== 'windup' && m.st !== 'strike') m.eruptCd = (m.eruptCd ?? 0) - ctx.dt;
  if (m.st === 'chase') {
    if (!near) return {};
    m.face = Math.atan2(near.y - m.y, near.x - m.x);
    if ((m.eruptCd ?? 0) <= 0) {
      // the BIRTH: a long-telegraphed cage-burst — a small shockwave off her
      // skirt, and the summon rides the wind-up→strike transition below
      m.ax = m.x;
      m.ay = m.y;
      m.erupt = true;
      m.st = 'windup';
      m.t = 0;
      m.eruptCd = tunedCooldown((P.eruptEveryMs ?? 7200) * fury, ctx.tune);
      return { sfx: 'roar' };
    }
    if (near.d <= P.reach) {
      // the claw — she defends her skirt but NEVER walks (rooted)
      m.ax = m.x + Math.cos(m.face) * (near.d + 0.6);
      m.ay = m.y + Math.sin(m.face) * (near.d + 0.6);
      m.st = 'windup';
      m.t = 0;
      return { sfx: 'lunge' };
    }
    return {};
  }
  const birthing = m.st === 'windup' && !!m.erupt;
  const ev = stepMelee(m, ctx, P, near, fury);
  if (birthing && m.st === 'strike' && m.erupt) {
    // the cage bursts THIS frame: the host turns these into Husk adds (its
    // chaser kind, capped at DEPTH_MOB_CAP) — the sim itself never adds mobs
    ev.summon = [
      { x: m.x - 1.8, y: m.y + 0.4 },
      { x: m.x + 1.8, y: m.y + 0.4 },
    ];
    ev.sfx = 'roar';
  }
  return ev;
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
  // the Bulwark's guard (ADR-0016): while the rune slab is up, every hit bounces —
  // damage flows only in the counter-slam + exposed-recover window of its cycle
  if (m.guard) return { damage: 0, crit: false, dead: false };
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
  /** the Depth number this Stage sits at (ADR-0015: the chain is endless) */
  stage: number;
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
  /** the zone banner shown on entry/descent (English id; i18n translates it —
   *  generated Depths carry an already-localized composed name here) */
  zone: string;
  /** the run's participation loot: common (per Husk felled) + rare (on the boss).
   *  Depths 3+ pay ONE Sigil per boss and nothing else (both ids = the Sigil). */
  loot: { common: ResourceId; rare: ResourceId };
  /** interior tile where the boss-death door opens — every Stage has one now
   *  (ADR-0015 retires "the Forgeborn ends the descent"; the chain never stops) */
  door?: { tx: number; ty: number };
  /** which spat-shot art the Stage's kiters/boss fire */
  shot: 'acid' | 'ember';
  /** Husk (non-boss) HP multiplier — compounds per Depth (1 on the authored Stages) */
  hpMul: number;
  /** ADR-0015 generated Depths: per-depth floor ramp (overrides the palette ramps) */
  floor?: DepthFloor;
  /** ADR-0015 generated Depths: multiply-tints re-dressing the recycled sprites/props */
  tint?: { chaser: number; kiter: number; boss: number; prop: number };
  /** ADR-0015 generated Depths: the compounding cadence/speed tuning stepMob applies */
  tune?: MobTune;
  /** ADR-0015 generated Depths: localized composed display names (i18n word lists) */
  names?: { zone: string; huskFamily: string; boss: string };
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
  door: { tx: 55, ty: 3 }, // top-east of the boss room E (above D), clear of the boss + props
  shot: 'acid',
  hpMul: 1,
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
  // ADR-0015: the Forgeborn no longer ends the descent — its fall opens the door
  // to the first generated Depth. East edge of room E, clear of the boss + props.
  door: { tx: 80, ty: 11 },
  shot: 'ember',
  hpMul: 1,
};

/** a Stage's number IS its Depth (ADR-0015): 1–2 authored, 3+ generated, endless */
export type Stage = number;
export const STAGES: Record<number, StageDef> = { 1: STAGE_1, 2: STAGE_2 };

/**
 * The one lookup every caller uses (ADR-0015): authored defs for Depths 1–2, a
 * deterministically generated def for any Depth ≥ 3 — a pure, memoized function
 * of the Depth number (guests rebuild the identical Stage from the number the
 * descent `start` message carries; no seed on the wire).
 */
const GENERATED_STAGES = new Map<number, StageDef>();
export function stageDefFor(depth: number): StageDef {
  const d = Math.max(1, Math.floor(depth));
  if (STAGES[d]) return STAGES[d];
  let def = GENERATED_STAGES.get(d);
  if (!def) {
    def = buildDepthStage(d);
    GENERATED_STAGES.set(d, def);
  }
  return def;
}

// =========================================================== endless Depths (ADR-0015)
// Everything below derives a Depth's ENTIRE content — palette, re-dressed Husk
// family (names composed from the i18n word lists), recycled boss kit, floor
// plan, and compounding tuning — as a pure function of the Depth number. No
// Date.now, no Math.random, no seed on the wire: Depth 7 looks identical in
// every run and every World, forever. Layouts come from a CONSTRAINED generator
// that only emits the authored grammar (safe entry chamber → 3–5 rooms
// west-to-east → boss room) through the same carve function as Stages 1–2.

/** the per-room floor ramp a generated Depth paints (mirrors the authored ramps) */
export interface DepthFloor {
  base: string;
  toneA: string;
  toneB: string;
  toneC: string;
  stain: string;
  scuff: string;
  speckle: string;
  edge: string;
}

/** everything themeFor(depth) derives — the whole identity of one Depth */
export interface DepthTheme {
  depth: number;
  /** which authored dressing family re-dresses this Depth (props + shot art) */
  family: 'stone' | 'molten';
  /** the Depth's boss kit (ADR-0016): one of the seven, rolled seeded per Depth */
  bossKind: DepthBossKind;
  /** the two re-dressed archetypes (melee chaser + ranged kiter — never a new AI) */
  chaser: HuskKind;
  kiter: HuskKind;
  /** localized composed names (i18n word lists — never baked English strings) */
  zoneName: string;
  huskFamily: string;
  bossName: string;
  floor: DepthFloor;
  lightColor: number;
  tint: { chaser: number; kiter: number; boss: number; prop: number };
  tune: MobTune;
  hpMul: number;
  bossHpPerHead: number;
  layout: DepthLayout;
}

export interface DepthLayout {
  w: number;
  h: number;
  rooms: Rect[];
  corridors: Rect[];
  entry: { tx: number; ty: number };
  bossSpawn: { x: number; y: number };
  door: { tx: number; ty: number };
  props: DelveProp[];
  lights: { tx: number; ty: number; color: number; scale: number; alpha: number }[];
  chaserAnchors: { x: number; y: number }[];
  kiterAnchors: { x: number; y: number }[];
}

/** tiny deterministic PRNG — seeded from the Depth number alone (never wall-clock) */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hslChannel(p: number, q: number, h: number): number {
  let x = h;
  if (x < 0) x += 1;
  if (x > 1) x -= 1;
  if (x < 1 / 6) return p + (q - p) * 6 * x;
  if (x < 1 / 2) return q;
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
  return p;
}

/** hsl (h 0–360, s/l 0–100) → 0xRRGGBB — the palette math behind every Depth hue */
function hslNum(h: number, s: number, l: number): number {
  const hh = ((h % 360) + 360) % 360 / 360;
  const ss = s / 100;
  const ll = l / 100;
  if (ss === 0) {
    const g = Math.round(ll * 255);
    return (g << 16) | (g << 8) | g;
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const r = Math.round(hslChannel(p, q, hh + 1 / 3) * 255);
  const g = Math.round(hslChannel(p, q, hh) * 255);
  const b = Math.round(hslChannel(p, q, hh - 1 / 3) * 255);
  return (r << 16) | (g << 8) | b;
}

function hslHex(h: number, s: number, l: number): string {
  return `#${hslNum(h, s, l).toString(16).padStart(6, '0')}`;
}

/** golden-angle hue walk — consecutive Depths land far apart on the color wheel */
const DEPTH_HUE_STEP = 137.508;

/**
 * The constrained layout generator: only the authored grammar comes out — a safe
 * entry chamber (the first Husk anchors sit beyond aggro range, exactly like
 * Stage 1's antechamber), 3–5 Husk rooms marching west-to-east on a 2-tile
 * corridor spine, then a boss room big enough that the eruption kit's edges are
 * always reachable. Deterministic per Depth; carved by the same carveGrid.
 */
function genDepthLayout(depth: number, family: 'stone' | 'molten', lightColor: number): DepthLayout {
  const rng = mulberry32((Math.imul(depth, 2654435761) ^ 0x9e3779b9) >>> 0);
  const H = 24;
  const SPINE = 11; // corridors occupy rows SPINE..SPINE+1
  const rooms: Rect[] = [];
  const corridors: Rect[] = [];
  const entry: Rect = { x: 2, y: 8, w: 8, h: 7 }; // safe antechamber, spans the spine
  rooms.push(entry);
  const mids: Rect[] = [];
  const midCount = 3 + Math.floor(rng() * 3); // 3–5 Husk rooms
  let cursor = entry.x + entry.w;
  let corW = 6 + Math.floor(rng() * 3); // the long safe-entry buffer (≥6 tiles)
  for (let i = 0; i < midCount; i++) {
    corridors.push({ x: cursor, y: SPINE, w: corW, h: 2 });
    cursor += corW;
    const w = 9 + Math.floor(rng() * 5); // 9–13
    const h = 9 + Math.floor(rng() * 8); // 9–16
    // the room must span the spine rows and stay inside the border walls
    const yMin = Math.max(1, SPINE + 2 - h);
    const yMax = Math.min(SPINE, H - 1 - h);
    const y = yMin + Math.floor(rng() * Math.max(1, yMax - yMin + 1));
    const r: Rect = { x: cursor, y, w, h };
    rooms.push(r);
    mids.push(r);
    cursor += w;
    corW = 3 + Math.floor(rng() * 3); // 3–5 between Husk rooms
  }
  corridors.push({ x: cursor, y: SPINE, w: corW, h: 2 });
  cursor += corW;
  // the boss room mirrors the Deep's arena: edges ≥9 tiles from the spawn, so
  // sprinting out of the recycled eruption kit's radius is always possible
  const boss: Rect = { x: cursor, y: 2, w: 22, h: 20 };
  rooms.push(boss);
  const w = boss.x + boss.w + 2;
  const bossSpawn = { x: boss.x + 11, y: boss.y + 10 };
  const door = { tx: boss.x + boss.w - 2, ty: boss.y + 1 }; // top-east, like Stage 1's

  // ---- deterministic dressing from the family's authored prop kinds
  const coverKinds: PropKind[] = family === 'stone' ? ['support_beam', 'obsidian_pillar'] : ['basalt_pillar'];
  const lightKinds: PropKind[] = family === 'stone' ? ['brazier', 'brazier_violet'] : ['ember_brazier'];
  const decorKinds: PropKind[] =
    family === 'stone' ? ['rubble_pile', 'bone_pile', 'glyph_stone', 'crystal_teal', 'crystal_amber'] : ['lava_vein', 'slag_pile'];
  const props: DelveProp[] = [];
  const used = new Set<number>();
  used.add(door.ty * w + door.tx); // the door tile stays clear
  used.add((door.ty + 1) * w + door.tx);
  const tryAdd = (kind: PropKind, tx: number, ty: number, blockOk: boolean): boolean => {
    const k = ty * w + tx;
    if (used.has(k)) return false;
    // blocking cover never sits on the corridor spine rows, so no mouth ever seals
    if (!blockOk && (ty === SPINE || ty === SPINE + 1)) return false;
    // keep the boss's arena centre + the eruption escape lanes clear
    if (Math.hypot(tx - bossSpawn.x, ty - bossSpawn.y) < 4) return false;
    props.push({ kind, tx, ty });
    used.add(k);
    return true;
  };
  const scatter = (r: Rect, kinds: PropKind[], count: number, blockOk: boolean, margin: number): void => {
    let attempts = count * 6;
    let placed = 0;
    while (placed < count && attempts-- > 0) {
      const tx = r.x + margin + Math.floor(rng() * Math.max(1, r.w - margin * 2));
      const ty = r.y + margin + Math.floor(rng() * Math.max(1, r.h - margin * 2));
      if (tryAdd(kinds[Math.floor(rng() * kinds.length)], tx, ty, blockOk)) placed++;
    }
  };
  // entry: kept safe and readable — one light, a little rubble, no cover
  tryAdd(lightKinds[0], entry.x + 1, entry.y + 1, false);
  scatter(entry, decorKinds, 2, false, 1);
  for (const r of mids) {
    scatter(r, coverKinds, 2, false, 1); // real cover — Spit sightlines break on it
    scatter(r, lightKinds, 2, false, 1);
    scatter(r, decorKinds, 3, false, 1);
  }
  // boss room: rim dressing only, centre + door left clear (escape lanes stay open)
  tryAdd(coverKinds[0], boss.x + 2, boss.y + 2, true);
  tryAdd(coverKinds[coverKinds.length - 1], boss.x + boss.w - 3, boss.y + 2, true);
  tryAdd(coverKinds[0], boss.x + 2, boss.y + boss.h - 3, true);
  tryAdd(coverKinds[coverKinds.length - 1], boss.x + boss.w - 3, boss.y + boss.h - 3, true);
  tryAdd(lightKinds[0], boss.x + 1, boss.y + 1, true);
  tryAdd(lightKinds[0], boss.x + boss.w - 2, boss.y + boss.h - 2, true);
  scatter(boss, decorKinds, 3, false, 3);

  // ambient light pools: the boss arena glows in the Depth's hue, breadcrumbs on the spine
  const lights: DepthLayout['lights'] = [{ tx: bossSpawn.x, ty: bossSpawn.y, color: lightColor, scale: 5.0, alpha: 0.3 }];
  for (const r of mids) lights.push({ tx: r.x + Math.floor(r.w / 2), ty: SPINE, color: lightColor, scale: 3.0, alpha: 0.18 });

  // Husk anchors: spread across the Husk rooms (one per room first, Stage-1 style);
  // every anchor sits ≥13 tiles east of the entry tile — beyond aggro, so the
  // antechamber stays safe. Kept off walls by a 2-tile margin, and off blocking
  // cover props (with a ±1 jitter buffer) so a spawn never lands inside a pillar.
  const entryTile = { tx: 5, ty: SPINE + 1 };
  const blocked = new Set<number>(props.filter((p) => PROP_BLOCKS[p.kind]).map((p) => p.ty * w + p.tx));
  const nearBlocked = (x: number, y: number): boolean => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (blocked.has((y + dy) * w + x + dx)) return true;
    return false;
  };
  const chaserAnchors: { x: number; y: number }[] = [];
  const kiterAnchors: { x: number; y: number }[] = [];
  const anchorIn = (r: Rect): { x: number; y: number } => {
    let x = 0;
    let y = 0;
    for (let attempts = 0; attempts < 12; attempts++) {
      x = Math.max(r.x + 2, entryTile.tx + 13) + Math.floor(rng() * Math.max(1, r.w - 4));
      y = r.y + 2 + Math.floor(rng() * Math.max(1, r.h - 4));
      if (!nearBlocked(x, y)) break;
    }
    return { x, y };
  };
  for (let round = 0; round < 3; round++) for (const r of mids) chaserAnchors.push(anchorIn(r));
  for (let round = 0; round < 2; round++) for (const r of mids) kiterAnchors.push(anchorIn(r));

  return { w, h: H, rooms, corridors, entry: entryTile, bossSpawn, door, props, lights, chaserAnchors, kiterAnchors };
}

const DEPTH_THEMES = new Map<number, DepthTheme>();

/**
 * A Depth's whole identity from its number alone (ADR-0015 §2) — memoized, pure.
 * Defined for Depth ≥ 3 (the authored Stages 1–2 keep their hand-made content).
 */
export function themeFor(depth: number): DepthTheme {
  const d = Math.max(3, Math.floor(depth));
  const cached = DEPTH_THEMES.get(d);
  if (cached) return cached;
  const past = d - 2; // Depths past the two authored Stages — the compounding exponent
  const family: 'stone' | 'molten' = d % 2 === 1 ? 'stone' : 'molten';
  // the boss kit (ADR-0016): one seeded roll from the seven-kit pool — mixed in
  // at "random", but a pure function of the Depth number, so Depth 7's boss is
  // the same kit for every client, every run, every World, forever
  const KITS: DepthBossKind[] = ['boss', 'forgeborn', 'ram', 'warden', 'whirl', 'bulwark', 'brood'];
  const bossKind = KITS[Math.floor(mulberry32((Math.imul(d, 1103515245) ^ 0x2545f491) >>> 0)() * KITS.length)];
  const chaser: HuskKind = family === 'stone' ? 'grasp' : 'cinder';
  const kiter: HuskKind = family === 'stone' ? 'spit' : 'ember';
  // names composed from the localized word lists — indexed by the Depth number,
  // so every client (and every World) in a language composes the same name
  const adj = t.depth.adjectives[d % t.depth.adjectives.length];
  const noun = t.depth.nouns[(d * 5 + 1) % t.depth.nouns.length];
  const zoneName = t.depth.zone(d, adj, noun);
  const huskFamily = t.depth.huskFamily(adj);
  const bossNameFns: Record<DepthBossKind, (adj: string) => string> = {
    boss: t.depth.bossColossus,
    forgeborn: t.depth.bossForgeborn,
    ram: t.depth.bossRam,
    warden: t.depth.bossWarden,
    whirl: t.depth.bossWhirl,
    bulwark: t.depth.bossBulwark,
    brood: t.depth.bossBrood,
  };
  const bossName = bossNameFns[bossKind](adj);
  const hue = (d * DEPTH_HUE_STEP) % 360;
  const floor: DepthFloor = {
    toneA: hslHex(hue, 24, 11),
    base: hslHex(hue, 24, 13),
    toneB: hslHex(hue, 26, 15),
    toneC: hslHex(hue, 22, 9),
    stain: hslHex(hue, 30, 6),
    scuff: hslHex(hue, 20, 18),
    speckle: hslHex(hue, 85, 55),
    edge: hslHex(hue, 28, 5),
  };
  const lightColor = hslNum(hue, 70, 60);
  const tint = {
    chaser: hslNum(hue, 55, 78),
    kiter: hslNum((hue + 24) % 360, 55, 78),
    boss: hslNum(hue, 65, 72),
    prop: hslNum(hue, 35, 82),
  };
  const tune: MobTune = {
    speedMul: Math.pow(DEPTH_SPEED_MUL, past),
    telegraphMul: Math.pow(DEPTH_CADENCE_MUL, past),
    cooldownMul: Math.pow(DEPTH_CADENCE_MUL, past),
    projSpeedMul: Math.pow(DEPTH_PROJ_SPEED_MUL, past),
  };
  const hpMul = Math.pow(DEPTH_HP_MUL, past);
  // one monotone HP curve for every Depth boss regardless of which kit it
  // recycles — the kit only changes moves/appearance, so a deeper boss is never
  // softer than a shallower one (the wall only ever grows)
  const bossHpPerHead = FORGEBORN_HP_PER_HEAD * hpMul;
  const theme: DepthTheme = {
    depth: d,
    family,
    bossKind,
    chaser,
    kiter,
    zoneName,
    huskFamily,
    bossName,
    floor,
    lightColor,
    tint,
    tune,
    hpMul,
    bossHpPerHead,
    layout: genDepthLayout(d, family, lightColor),
  };
  DEPTH_THEMES.set(d, theme);
  return theme;
}

/** per-head Husk coefficients of the generated Depths (the Deep's, the harder pair) */
const DEPTH_CHASER_PER_HEAD = 1.8;
const DEPTH_KITER_PER_HEAD = 1.1;
/** per-kind ceilings that keep chaser + kiter + boss ≤ DEPTH_MOB_CAP */
const DEPTH_CHASER_MAX = 15;
const DEPTH_KITER_MAX = 8;

/** wrap a DepthTheme into the same StageDef bundle the authored Stages use */
function buildDepthStage(d: number): StageDef {
  const th = themeFor(d);
  const L = th.layout;
  const walls = carveGrid(L.w, L.h, [...L.rooms, ...L.corridors]);
  const isWall = (tx: number, ty: number): boolean => {
    if (tx < 0 || ty < 0 || tx >= L.w || ty >= L.h) return true;
    return walls[ty * L.w + tx] === 1;
  };
  const blockedTiles = new Set<number>(L.props.filter((p) => PROP_BLOCKS[p.kind]).map((p) => p.ty * L.w + p.tx));
  const isBlocked = (tx: number, ty: number): boolean => isWall(tx, ty) || blockedTiles.has(ty * L.w + tx);
  // count scales with heads AND steps up per Depth — but never past the hard
  // broadcast cap; past it (and the speed/windup caps) only HP + cadence compound
  const planSpawns = (heads: number, rng: () => number): MobSpawn[] => {
    const n = delveHeads(heads);
    const bonus = (d - 2) * DEPTH_COUNT_STEP;
    const chasers = Math.min(DEPTH_CHASER_MAX, Math.max(3, Math.round(DEPTH_CHASER_PER_HEAD * n) + bonus));
    const kiters = Math.min(DEPTH_KITER_MAX, Math.max(2, Math.round(DEPTH_KITER_PER_HEAD * n) + Math.floor(bonus / 2)));
    const out: MobSpawn[] = [];
    const place = (kind: HuskKind, count: number, anchors: { x: number; y: number }[]): void => {
      for (let i = 0; i < count; i++) {
        const a = anchors[i % anchors.length];
        let x = a.x + Math.round(rng() * 2 - 1);
        let y = a.y + Math.round(rng() * 2 - 1);
        if (isBlocked(Math.floor(x), Math.floor(y))) {
          x = a.x;
          y = a.y;
        }
        out.push({ kind, x: x + 0.5, y: y + 0.5 });
      }
    };
    place(th.chaser, chasers, L.chaserAnchors);
    place(th.kiter, kiters, L.kiterAnchors);
    out.push({ kind: th.bossKind, x: L.bossSpawn.x + 0.5, y: L.bossSpawn.y + 0.5 });
    return out;
  };
  return {
    stage: d,
    w: L.w,
    h: L.h,
    rooms: L.rooms,
    corridors: L.corridors,
    entry: L.entry,
    props: L.props,
    lights: L.lights,
    palette: th.family === 'molten' ? 'magma' : 'mine',
    ruinsFromX: L.w, // never — the per-Depth floor ramp paints the whole interior
    isWall,
    isBlocked,
    planSpawns,
    bossHpPerHead: th.bossHpPerHead,
    zone: th.zoneName,
    loot: { common: DEPTH_SIGIL, rare: DEPTH_SIGIL }, // one Sigil per boss, nothing else
    door: L.door,
    shot: th.family === 'stone' ? 'acid' : 'ember',
    hpMul: th.hpMul,
    floor: th.floor,
    tint: th.tint,
    tune: th.tune,
    names: { zone: th.zoneName, huskFamily: th.huskFamily, boss: th.bossName },
  };
}
