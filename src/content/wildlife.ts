/**
 * Open-world Wildlife — the roaming creatures that fill the space *between*
 * destinations (ADR-0012). Like guardian.ts / dungeon.ts this module is PURE and
 * node-importable: no browser globals, no ../config. Positions are in TILE units,
 * speeds in tiles/second; a client multiplies by TILE only at the render edge.
 *
 * Wildlife REUSES dungeon.ts's one reactive engine (stepMob / MobProfile /
 * createMob / applyMobHit) — a reskin, never a new brain (the ADR-0011 discipline
 * applied to the World). Two dispositions are just AI flags on that engine:
 *   - PEACEFUL  — skittish, forageable. Modelled as a `ranged` kiter with
 *     fireRange 0: it flees when a Player nears (kite backs away) and never fires.
 *     A "moving Node" you approach and catch. Roams the whole map.
 *   - PREDATORY — aggressive, huntable with the Husk melee brain (chase → telegraph
 *     → lunge → knockdown), or fled. Spawns ONLY in danger-flagged wilds.
 *
 * Creature→Player harm is knockdown-only (no player HP, ever). Player→creature
 * damage reuses the ADR-0006 weapon roll via applyMobHit. HP lives only in host
 * memory — never persisted (no DB row, no migration), exactly like a Dungeon run.
 *
 * SPEED INVARIANT (ADR-0012 §11, the flee-always contract): every creature speed
 * here is strictly below the Player's. PLAYER_SPEED is 130 px/s = 8.125 tiles/s;
 * even the cooked-fish +20% buff (9.75 tiles/s) can't be outrun by anything below,
 * so an UNBUFFED Player (8.125) always opens distance. See PLAYER_TILES_PER_SEC.
 */
import { MOB_PROFILES, registerMobProfile, type MobProfile } from './dungeon';
import type { StructureArt } from './village';
import type { ResourceId } from './items';

/** PLAYER_SPEED (130 px/s) ÷ TILE (16) — the hard ceiling every creature stays below */
export const PLAYER_TILES_PER_SEC = 130 / 16; // 8.125

/** the open-world creature kinds — two peaceful (forageable), two predatory (huntable) */
export type WildKind = 'capybara' | 'deer' | 'boar' | 'jaguar';

export const PEACEFUL_KINDS: WildKind[] = ['capybara', 'deer'];
export const PREDATOR_KINDS: WildKind[] = ['boar', 'jaguar'];
export const WILD_KINDS: WildKind[] = [...PEACEFUL_KINDS, ...PREDATOR_KINDS];

export function isPredator(kind: WildKind): boolean {
  return PREDATOR_KINDS.includes(kind);
}
export function isWildKind(kind: string): kind is WildKind {
  return (WILD_KINDS as string[]).includes(kind);
}

/**
 * The creature profiles (tile units; ms; tiles/second). Every `speed` and
 * `lungeSpeed` is below PLAYER_TILES_PER_SEC so fleeing always works (§11).
 * Peaceful kinds are `ranged` with fireRange 0 → they kite (flee) and never fire;
 * their kiteMin sits past their aggro so they always back away, never close in.
 * Predators are `melee` — the Grasp-Husk brain, tuned a touch faster + snappier.
 */
export const WILD_PROFILES: Record<WildKind, MobProfile> = {
  // Capybara — a placid river rodent; the World's ambient life. Wanders, and
  // bolts a short way when you crowd it. Foraged for meat + hide.
  capybara: {
    ai: 'ranged',
    hp: 4,
    radius: 0.42,
    speed: 3.0, // < 8.125 → always catchable
    aggro: 4.0, // skittish trigger range
    reach: 0,
    telegraphMs: 0,
    strikeMs: 0,
    lungeSpeed: 0,
    strikeR: 0,
    cooldownMs: 0,
    kiteMin: 6.0, // > aggro → within notice range it only ever backs away
    fireRange: 0, // never enters the aim state → never fires (it is peaceful)
    projSpeed: 0,
    projR: 0,
  },
  // Deer — leaner and quicker than the capybara, a touch more alert; a nicer
  // forage (2 meat) and a chance at a trophy rack.
  deer: {
    ai: 'ranged',
    hp: 4,
    radius: 0.46,
    speed: 3.8, // still well under player speed
    aggro: 5.0,
    reach: 0,
    telegraphMs: 0,
    strikeMs: 0,
    lungeSpeed: 0,
    strikeR: 0,
    cooldownMs: 0,
    kiteMin: 7.0,
    fireRange: 0,
    projSpeed: 0,
    projR: 0,
  },
  // Boar — a stocky tusked charger: tankier, slower chase, a heavy telegraphed
  // gore. The Grasp-Husk melee brain, reskinned. Predator → danger wilds only.
  boar: {
    ai: 'melee',
    hp: 12,
    radius: 0.5,
    speed: 3.0,
    aggro: 6.0,
    reach: 1.4,
    telegraphMs: 950,
    strikeMs: 180,
    lungeSpeed: 6.0, // brief dash, still < 8.125
    strikeR: 0.8,
    cooldownMs: 1800,
    kiteMin: 0,
    fireRange: 0,
    projSpeed: 0,
    projR: 0,
  },
  // Jaguar — a lean fast stalker: less HP, quicker chase + snappier pounce, the
  // best trophy odds. Reads as the wilds' apex — but still outrun-able (3.6<8.1).
  jaguar: {
    ai: 'melee',
    hp: 9,
    radius: 0.45,
    speed: 3.6,
    aggro: 7.0,
    reach: 1.5,
    telegraphMs: 800,
    strikeMs: 170,
    lungeSpeed: 6.4,
    strikeR: 0.75,
    cooldownMs: 1500,
    kiteMin: 0,
    fireRange: 0,
    projSpeed: 0,
    projR: 0,
  },
};

// register each creature into the ONE engine so stepMob/createMob/applyMobHit
// simulate them exactly like a Husk (reskin, no new brain — ADR-0012). Runs at
// import; dungeon.ts is fully evaluated first (this module imports it).
for (const kind of WILD_KINDS) registerMobProfile(kind, WILD_PROFILES[kind]);

// a build-time guard: no registered creature may match/exceed a real MOB_PROFILE
// kind, and every creature must obey the flee-always speed ceiling.
void MOB_PROFILES; // referenced so the import can't be tree-shaken before registration

/**
 * The hide / meat / trophy drop family (ADR-0012 §15). `drop` is granted on every
 * successful forage (peaceful) or kill (predatory); `trophyChance` is an extra
 * roll for the rare `trophy` on top. Flows ONLY into existing loops — Village pool,
 * a cooked-meat campfire recipe (the existing move buff), and decor Structures.
 * No armour, no weapon stats, no new buff, no new tool tier.
 */
export interface WildLoot {
  drop: Partial<Record<ResourceId, number>>;
  /** chance (0..1) this catch/kill also yields 1 trophy */
  trophyChance: number;
}

export const WILD_LOOT: Record<WildKind, WildLoot> = {
  capybara: { drop: { meat: 1, hide: 1 }, trophyChance: 0 },
  deer: { drop: { meat: 2, hide: 1 }, trophyChance: 0.15 },
  boar: { drop: { meat: 2, hide: 2 }, trophyChance: 0.2 },
  jaguar: { drop: { meat: 1, hide: 2 }, trophyChance: 0.35 },
};

/** roll a catch/kill's loot into an inventory-style bag (rng injected — node-pure) */
export function rollWildLoot(kind: WildKind, rng: () => number): Partial<Record<ResourceId, number>> {
  const spec = WILD_LOOT[kind];
  const out: Partial<Record<ResourceId, number>> = { ...spec.drop };
  if (spec.trophyChance > 0 && rng() < spec.trophyChance) out.trophy = (out.trophy ?? 0) + 1;
  return out;
}

// ------------------------------------------------------------- spawn planner
/** a planned open-world spawn (tile-centred position) */
export interface WildSpawn {
  kind: WildKind;
  x: number;
  y: number;
}

export interface WildSpawnCtx {
  rng: () => number;
  /** spawn-ring radius around the anchor, in tiles (min..max) */
  minR: number;
  maxR: number;
  /** is a tile open ground a creature may stand on? (host passes the World blocked grid) */
  isWalkable: (tx: number, ty: number) => boolean;
  /** is a tile inside a danger-flagged Zone (predator-eligible, never the safe core)? */
  dangerAt: (tx: number, ty: number) => boolean;
  /** probability a danger-tile spawn is a predator (host raises this at night) */
  predatorChance: number;
}

/**
 * Pick ONE spawn on a ring around a Player anchor (host calls this to top up its
 * ephemeral pool). Predators only ever land on a danger tile; peaceful Wildlife
 * anywhere walkable. Returns null if no valid tile was found in a few tries (the
 * host simply tries again next tick — no guarantees, spawns are opportunistic).
 */
export function planWildSpawn(anchor: { tx: number; ty: number }, ctx: WildSpawnCtx): WildSpawn | null {
  for (let tries = 0; tries < 10; tries++) {
    const ang = ctx.rng() * Math.PI * 2;
    const r = ctx.minR + ctx.rng() * Math.max(0, ctx.maxR - ctx.minR);
    const tx = Math.round(anchor.tx + Math.cos(ang) * r);
    const ty = Math.round(anchor.ty + Math.sin(ang) * r);
    if (!ctx.isWalkable(tx, ty)) continue;
    const danger = ctx.dangerAt(tx, ty);
    const wantPredator = danger && ctx.rng() < ctx.predatorChance;
    const pool = wantPredator ? PREDATOR_KINDS : PEACEFUL_KINDS;
    const kind = pool[Math.floor(ctx.rng() * pool.length)];
    return { kind, x: tx + 0.5, y: ty + 0.5 };
  }
  return null;
}

// ------------------------------------------------------------- trophy / decor art
/**
 * Placeable Structures forged from Wildlife loot (ADR-0012 §15 — cozy expression
 * + Village grandeur). No PNGs: they bake from the same compact StructureArt spec
 * the Village Buildings use (drawStructureArt), so the scene and the HUD icons
 * share one source of truth. A trophy to hang, a hide rug for the floor.
 */
export const WILDLIFE_ART: Partial<Record<'trophy_mount' | 'hide_rug', StructureArt>> = {
  trophy_mount: { body: '#6b4a2a', roof: '#e8dcc0', trim: '#b0472e', w: 1, h: 1, shape: 'monument' },
  hide_rug: { body: '#b0895a', roof: '#8a5a2b', trim: '#3a2a18', w: 1, h: 1, shape: 'decor' },
};
