// The Village: the communal, group-founded meta-loop (ADR-0010 / A3).
//
// One collective Village per World, raised together and never finished. This
// module is the tuning surface the ADR defers to playtest: the tier ladder, the
// "what counts" contribution table, and the pool thresholds. It is PURE DATA +
// PURE FUNCTIONS — no browser globals, no backend imports — so both backends,
// the HUD icons, and the scene can all share one source of truth.
//
// Progress is tile-INDEPENDENT: `tier` and `pool` live in the per-world Village
// record and only ever grow (collective-only, no decay, no individual tracking).
// A tier advances when the pool crosses its threshold AND that tier's signature
// milestone Building has been raised inside the village zone.

import type { StructureId } from './items';

/** 0 = unfounded (no Hall). Camp → Hamlet → Village → Town → Capital. */
export type VillageTier = 0 | 1 | 2 | 3 | 4 | 5;

/** the highest tier the Village can reach; endless decoration beyond it */
export const VILLAGE_MAX_TIER = 5;

/** the village zone is a radius (in tiles) around the Hall — only in-zone builds advance the tier */
export const VILLAGE_ZONE_RADIUS = 12;

export interface VillageTierDef {
  tier: VillageTier;
  /** the settlement name shown as the Village's grandeur badge */
  name: string;
  /** the prestige title the group earns at this tier */
  title: string;
  /**
   * cumulative pool needed to REACH this tier (tier 1 founds for free at 0).
   * Early-fast, late-grand: the gaps widen sharply toward Capital.
   */
  threshold: number;
  /**
   * the signature Building whose raising (in-zone) is this tier's milestone.
   * tier 1's milestone is the Hall itself (founding); null only for tier 0.
   */
  milestone: StructureId | null;
  /** building types that become craftable upon REACHING this tier (decor + the next milestone) */
  unlocks: StructureId[];
}

/**
 * The ladder. `unlocks[T]` are the build types a group earns at tier T: the
 * NEXT tier's milestone plus that tier's decor, so there is always something new
 * to build. Numbers are playtest tuning (DPS-style — tune once it is playable).
 */
export const VILLAGE_TIERS: VillageTierDef[] = [
  { tier: 0, name: 'Wildland', title: 'Wanderers', threshold: 0, milestone: null, unlocks: ['village_hall'] },
  { tier: 1, name: 'Camp', title: 'Settlers', threshold: 0, milestone: 'village_hall', unlocks: ['village_well', 'village_banner'] },
  { tier: 2, name: 'Hamlet', title: 'Homesteaders', threshold: 300, milestone: 'village_well', unlocks: ['market_square', 'lamp_post'] },
  { tier: 3, name: 'Village', title: 'Villagers', threshold: 1_200, milestone: 'market_square', unlocks: ['stone_keep', 'fountain'] },
  { tier: 4, name: 'Town', title: 'Townsfolk', threshold: 4_000, milestone: 'stone_keep', unlocks: ['grand_monument', 'flower_bed'] },
  { tier: 5, name: 'Capital', title: 'Citizens of the Capital', threshold: 12_000, milestone: 'grand_monument', unlocks: ['victory_arch'] },
];

// ---------------------------------------------------------------- tier combat buffs
// ADR-0013: the Village retires the one-buff rule and becomes a shared COMBAT
// ladder. Each tier grants a small, COLLECTIVE buff to every Player in the World
// — shared, not competitive (no per-player power gap). Numbers are playtest
// tuning (the ladder is the surface to tune, like the tier thresholds).
export interface VillageBuff {
  /** fractional move-speed bonus (0.20 = +20%); stacks with the cooked-food buff */
  moveSpeed: number;
  /** fractional combat attack-speed bonus (a faster swing cadence) */
  attackSpeed: number;
  /** additive crit-chance bonus, applied only to weapons that can already crit */
  critChance: number;
}

/**
 * The buff AT each tier (cumulative — each row is that tier's full bonus). One
 * NEW thing per stage, kept deliberately small: Camp grants a non-combat utility
 * (handled outside this combat table), then +4% to a SINGLE combat attribute per
 * stage, and +2% to everything at Capital.
 */
export const VILLAGE_BUFFS: VillageBuff[] = [
  { moveSpeed: 0, attackSpeed: 0, critChance: 0 }, // 0 Wildland — unfounded
  { moveSpeed: 0, attackSpeed: 0, critChance: 0 }, // 1 Camp — perk is a non-combat utility
  { moveSpeed: 0.04, attackSpeed: 0, critChance: 0 }, // 2 Hamlet — +4% move speed
  { moveSpeed: 0.04, attackSpeed: 0.04, critChance: 0 }, // 3 Village — +4% attack speed
  { moveSpeed: 0.04, attackSpeed: 0.04, critChance: 0.04 }, // 4 Town — +4% crit
  { moveSpeed: 0.06, attackSpeed: 0.06, critChance: 0.06 }, // 5 Capital — +2% to everything
];

/** the combat buff a Village at `tier` grants every Player (clamped, safe) */
export function villageBuff(tier: number): VillageBuff {
  return VILLAGE_BUFFS[Math.max(0, Math.min(VILLAGE_MAX_TIER, tier))] ?? VILLAGE_BUFFS[0];
}

// ---------------------------------------------------------------- pack capacity
// ADR-0013: the pack is a slot grid capped by distinct item KINDS (the inventory
// is a kind→count map, so a "slot" is one kind; stacks are unlimited). Founding
// the Village (Camp, the tier-1 perk) adds one row. Enforced client-side on
// harvest (ADR-0005): a full pack leaves the resource in the world, so no HELD
// item is ever lost — the no-loss contract holds.
export const INVENTORY_BASE_SLOTS = 18; // 6 columns × 3 rows
export const INVENTORY_ROW_SLOTS = 6;

/** the pack's slot capacity at a Village tier — Camp (tier ≥ 1) adds one row */
export function inventoryCapacity(tier: number): number {
  return INVENTORY_BASE_SLOTS + (tier >= 1 ? INVENTORY_ROW_SLOTS : 0);
}

/** distinct item kinds currently held (each is one slot) */
export function invKindCount(inv: Partial<Record<string, number>>): number {
  let n = 0;
  for (const k in inv) if ((inv[k] ?? 0) > 0) n++;
  return n;
}

/** can the pack take `item`? always if a kind is already held (its stack just grows), else it needs a free slot */
export function canAcceptItem(inv: Partial<Record<string, number>>, item: string, capacity: number): boolean {
  if ((inv[item] ?? 0) > 0) return true;
  return invKindCount(inv) < capacity;
}

// ---------------------------------------------------------------- Trade Post
// ADR-0013: market_square (unlocked at Village, tier 3) is a resource EXCHANGE —
// swap a surplus raw for one you're short on at value parity (VILLAGE_CONTRIB)
// minus a tax that EVAPORATES (a sink, never a gain) and SHRINKS as the Village
// grows. Only the common gatherables trade, so rare loot can't be laundered.
export const TRADEABLE: readonly string[] = ['wood', 'stone', 'fiber', 'fruit', 'fish'];

/** the market's cut at a Village tier (market opens at Village=3; a grander town trades better) */
export function tradeTaxForTier(tier: number): number {
  if (tier >= 5) return 0.15;
  if (tier >= 4) return 0.25;
  return 0.35;
}

/** whole units of `getItem` received for `giveCount` of `giveItem` at `tier` (0 if the trade is invalid) */
export function tradeYield(giveItem: string, giveCount: number, getItem: string, tier: number): number {
  if (giveItem === getItem || giveCount <= 0) return 0;
  if (!TRADEABLE.includes(giveItem) || !TRADEABLE.includes(getItem)) return 0;
  const vGive = VILLAGE_CONTRIB[giveItem] ?? 0;
  const vGet = VILLAGE_CONTRIB[getItem] ?? 0;
  if (vGive <= 0 || vGet <= 0) return 0;
  return Math.floor((giveCount * vGive * (1 - tradeTaxForTier(tier))) / vGet);
}

/** the fewest `giveItem` that buys 1 whole `getItem` at `tier` (0 if the trade is invalid) */
export function tradeUnitCost(giveItem: string, getItem: string, tier: number): number {
  if (giveItem === getItem) return 0;
  if (!TRADEABLE.includes(giveItem) || !TRADEABLE.includes(getItem)) return 0;
  const vGive = VILLAGE_CONTRIB[giveItem] ?? 0;
  const vGet = VILLAGE_CONTRIB[getItem] ?? 0;
  if (vGive <= 0 || vGet <= 0) return 0;
  return Math.ceil(vGet / (vGive * (1 - tradeTaxForTier(tier))));
}

/** the Village record: collective tier + additive pool + Hall location (tile-independent) */
export interface VillageRecord {
  tier: VillageTier;
  /** additive, permanent, collective — never decays (ADR-0010 §5) */
  pool: number;
  /** the founded Hall's tile (the footprint anchor); null before founding or after the Hall is dismantled */
  hall: { tx: number; ty: number } | null;
  /**
   * high-water mark of milestone Buildings raised in-zone (monotonic, permanent
   * — dismantling a milestone never drops it: no decay). `milestonesBuilt >= T`
   * means tier T's milestone has been completed. Founding sets it to ≥1.
   */
  milestonesBuilt: VillageTier;
  /** ADR-0013: the group's chosen settlement name (Banner); falls back to the tier name */
  name?: string;
  /** ADR-0013: crest hue index (Banner) */
  crest?: number;
  /** ADR-0013: the Well's chronicle — short auto-seeded + player-written lines */
  chronicle?: string[];
  /** ADR-0013 (Wishing Well): fruit pooled toward the next Dorffest, shared/additive */
  wishes?: number;
  /** ADR-0013 (Wishing Well): epoch-ms the current Dorffest runs until (0/undef = none) */
  festivalUntil?: number;
}

/** the fresh, unfounded record for a brand-new World */
export function emptyVillage(): VillageRecord {
  return { tier: 0, pool: 0, hall: null, milestonesBuilt: 0 };
}

// ---------------------------------------------------------------- Wishing Well
// ADR-0013: the fountain is a communal WISHING WELL — Players toss fruit toward a
// shared meter; when it fills, a village-wide Dorffest runs for a fixed span,
// granting everyone a move-speed boost. A pure timestamp mechanic (ADR-0001/0002):
// the festival is a function of `festivalUntil`, computed lazily, no server tick.
export const FOUNTAIN_WISH_ITEM = 'fruit';
export const FOUNTAIN_WISH_THRESHOLD = 30; // fruit pooled to trigger a Dorffest
export const FESTIVAL_MS = 5 * 60_000; // a Dorffest runs 5 real minutes
export const FESTIVAL_SPEED_FACTOR = 1.1; // +10% move speed for everyone while it runs

/** is a Dorffest running at `now`? */
export function festivalActive(v: VillageRecord, now: number): boolean {
  return (v.festivalUntil ?? 0) > now;
}

export function tierDef(tier: VillageTier): VillageTierDef {
  return VILLAGE_TIERS[tier] ?? VILLAGE_TIERS[0];
}

/** the pool needed to reach `tier` (0 for tiers already at/below the floor) */
export function tierThreshold(tier: number): number {
  return VILLAGE_TIERS[Math.max(0, Math.min(VILLAGE_MAX_TIER, tier))]?.threshold ?? 0;
}

/** the StructureId that is tier `tier`'s milestone (tier 1 = the Hall) */
export function milestoneForTier(tier: number): StructureId | null {
  return VILLAGE_TIERS[tier]?.milestone ?? null;
}

/** the tier `item` is the milestone Building for (1 = Hall … 5); 0 if it is decor/none */
export function milestoneTierOf(item: StructureId): number {
  for (const def of VILLAGE_TIERS) if (def.milestone === item) return def.tier;
  return 0;
}

/** the cumulative pool thresholds, indexed by tier — passed to the backend RPCs */
export const VILLAGE_THRESHOLDS: number[] = VILLAGE_TIERS.map((d) => d.threshold);

/** the minimum tier at which `item` is craftable (0 = always, e.g. the Hall) */
export function structureVillageMin(item: StructureId): number {
  for (const def of VILLAGE_TIERS) {
    if (def.tier === 0) continue; // tier 0's "unlock" is the Hall, gated at 0 below
    if (def.unlocks.includes(item)) return def.tier;
  }
  return 0;
}

/** is `item` one of the Village's own Buildings (Hall, milestones, decor)? */
export function isVillageStructure(item: StructureId): boolean {
  return VILLAGE_TIERS.some((d) => d.unlocks.includes(item)) || item === 'village_hall';
}

/**
 * The "what counts" contribution table (ADR-0010 §2): points per unit for the
 * broad set the Hall accepts — raw resources, planks, Guardian scales, Delve
 * cores/shards, frontier finds (map pieces), fish. Anything absent here is not
 * accepted into the pool. Weights are playtest tuning.
 */
export const VILLAGE_CONTRIB: Partial<Record<string, number>> = {
  wood: 1,
  stone: 1,
  fiber: 1,
  fruit: 1,
  fish: 2,
  plank: 4,
  hardwood: 5,
  obsidian: 6,
  // ADR-0017 Warden realms — each realm's raw crop carries pool value ~obsidian,
  // its refiner-output a step above (~map_piece), uniformly across all three rungs.
  saltreed: 6, // rung 1 (Sunken Mire) — raw reed
  tideglass: 8, // rung 1 — Brine-Kiln refined
  echo_crystal: 6, // rung 2 (Hushdark) — raw crystal
  hushsteel: 8, // rung 2 — Chime-Kiln refined
  wildgrain: 6, // rung 3 (Green Terraces) — raw crop
  verdant_fibre: 8, // rung 3 — Loom-retted fibre
  map_piece: 8,
  husk_shard: 3,
  guardian_scale: 15,
  deep_core: 40,
  // ADR-0015 — the Depth Sigil's only sink for now: a LARGE pool value (its other
  // sink, trophy decor, is a later pass). Prestige stays prestige — no crafting.
  depth_sigil: 60,
  // ADR-0012 — Wildlife loot: the "frontier finds" the pool anticipated. Modest
  // per unit; the rare trophy is worth the most.
  hide: 2,
  meat: 2,
  trophy: 12,
};

/**
 * Advance a Village record as far as its pool + milestones allow, in place-safe
 * fashion (returns a new record). Tier only ever climbs: to reach tier T+1 the
 * pool must meet threshold(T+1) AND milestone T+1 must already be built in-zone.
 * Called after every contribution and every in-zone milestone raising.
 */
export function recomputeTier(v: VillageRecord): VillageRecord {
  let tier = v.tier;
  while (
    tier < VILLAGE_MAX_TIER &&
    v.milestonesBuilt > tier && // the next tier's milestone Building stands in-zone
    v.pool >= tierThreshold(tier + 1)
  ) {
    tier++;
  }
  return tier === v.tier ? v : { ...v, tier: tier as VillageTier };
}

/** the pool points one unit of `item` is worth (0 if the pool doesn't accept it) */
export function contributionValueOf(item: string): number {
  return VILLAGE_CONTRIB[item] ?? 0;
}

/**
 * The points `inventory` would add to the pool, and exactly what is taken.
 * `amounts` optionally caps how much of each item to give (the per-resource
 * slider choice, ADR-0010) — each is clamped to what is actually held and to
 * whole units. Omitting `amounts` gives everything qualifying (the old
 * one-tap "pour it all in" behaviour).
 */
export function villageContribution(
  inventory: Partial<Record<string, number>>,
  amounts?: Partial<Record<string, number>>,
): { taken: Record<string, number>; points: number } {
  const taken: Record<string, number> = {};
  let points = 0;
  for (const [item, per] of Object.entries(VILLAGE_CONTRIB)) {
    if (!per) continue;
    const have = inventory[item] ?? 0;
    if (have <= 0) continue;
    const want = amounts ? Math.max(0, Math.floor(amounts[item] ?? 0)) : have;
    const give = Math.min(have, want);
    if (give > 0) {
      taken[item] = give;
      points += give * per;
    }
  }
  return { taken, points };
}

/** is (tx,ty) within the village zone around the Hall? false when unfounded */
export function inVillageZone(v: Pick<VillageRecord, 'hall'>, tx: number, ty: number): boolean {
  if (!v.hall) return false;
  return Math.hypot(tx - v.hall.tx, ty - v.hall.ty) <= VILLAGE_ZONE_RADIUS;
}

// ---------------------------------------------------------------- placeholder art
// Village Buildings ship without downloaded PNGs — their sprites and inventory
// icons are generated from these compact specs (a body/roof/trim palette + a
// footprint). The scene bakes them into `st_<id>` textures at load; icons.ts
// draws the same spec into a 12×12 slot icon. This keeps A3 self-contained
// (no new asset files) while every Building still reads as a distinct object.

export interface StructureArt {
  /** wall / body colour */
  body: string;
  /** roof / crown colour */
  roof: string;
  /** accent (door, flag, water) colour */
  trim: string;
  /** footprint (must match ITEMS w/h) */
  w: number;
  h: number;
  /** silhouette: a walled building, a tall monument, or low decor */
  shape: 'building' | 'monument' | 'decor';
  /** lit at night (adds a warm glow, like torches) */
  glow?: boolean;
  /**
   * which hand-drawn sprite the renderer uses (see drawStructureArt). Each id has
   * its own recognizable silhouette — a well is a WELL, the hall a bell-towered hall.
   */
  kind:
    | 'hall' | 'well' | 'market' | 'keep' | 'monument' | 'fountain' | 'archJungle'
    | 'banner' | 'lamp' | 'flowers' | 'trophy' | 'rug' | 'forge' | 'kiln' | 'chime' | 'loom';
  /**
   * tiles the sprite rises ABOVE its footprint (defaults from shape: monument 2,
   * else 1). The bell-towered hall rises 3 so it out-scales the houses.
   */
  rise?: number;
}

export const VILLAGE_ART: Partial<Record<StructureId, StructureArt>> = {
  // "Rustic Timber" set (with the Overgrown-Jungle vine arch). Each id has a
  // distinct hand-drawn silhouette; body/roof/trim document the dominant hues.
  village_hall: { kind: 'hall', body: '#96714a', roof: '#96543c', trim: '#e0b268', w: 2, h: 2, shape: 'building', glow: true, rise: 3 },
  village_well: { kind: 'well', body: '#847e6d', roof: '#96543c', trim: '#537f8d', w: 2, h: 2, shape: 'building' },
  market_square: { kind: 'market', body: '#96714a', roof: '#a65445', trim: '#cfc0a0', w: 2, h: 2, shape: 'building' },
  stone_keep: { kind: 'keep', body: '#847e6d', roof: '#635e4f', trim: '#e0b268', w: 2, h: 2, shape: 'monument' },
  grand_monument: { kind: 'monument', body: '#847e6d', roof: '#9e9782', trim: '#e0b268', w: 2, h: 2, shape: 'monument', glow: true },
  village_banner: { kind: 'banner', body: '#4c3826', roof: '#a65445', trim: '#cfc0a0', w: 1, h: 1, shape: 'decor' },
  lamp_post: { kind: 'lamp', body: '#4c3826', roof: '#2b2118', trim: '#e0b268', w: 1, h: 1, shape: 'decor', glow: true },
  fountain: { kind: 'fountain', body: '#847e6d', roof: '#9e9782', trim: '#537f8d', w: 2, h: 2, shape: 'monument' },
  flower_bed: { kind: 'flowers', body: '#4c3826', roof: '#5d7440', trim: '#a65445', w: 1, h: 1, shape: 'decor' },
  victory_arch: { kind: 'archJungle', body: '#78806e', roof: '#5d6455', trim: '#4d6b3c', w: 2, h: 1, shape: 'monument' },
};

/**
 * Code-drawn art for non-Village functional Buildings that ship without a PNG.
 * Shares the same StructureArt pipeline as VILLAGE_ART (baked in-scene, drawn as a
 * slot icon) but is NOT a Village Building — it never touches the tier ladder.
 */
export const FORGE_ART: Partial<Record<StructureId, StructureArt>> = {
  forge: { kind: 'forge', body: '#635e4f', roof: '#3a2c22', trim: '#e0763c', w: 2, h: 2, shape: 'building', glow: true },
};

/**
 * Code-drawn art for the Sunken Mire's Brine Kiln (ADR-0017 rung 1) — same
 * StructureArt pipeline as FORGE_ART, but a squat brick kiln glowing the Mire's
 * signal teal (#63e0b8 / #2f8f74) at its brine mouth instead of the Forge's ember.
 */
export const KILN_ART: Partial<Record<StructureId, StructureArt>> = {
  brine_kiln: { kind: 'kiln', body: '#5a6b6a', roof: '#33403f', trim: '#63e0b8', w: 2, h: 2, shape: 'building', glow: true },
};

/**
 * Code-drawn art for the Hushdark's Chime Kiln (ADR-0017 rung 2) — same
 * StructureArt pipeline as KILN_ART, but a cold blued-steel kiln ringing its
 * hushsteel signal (#5a6b85 / #93a8c9) at its mouth instead of the Mire's teal.
 */
export const CHIME_KILN_ART: Partial<Record<StructureId, StructureArt>> = {
  chime_kiln: { kind: 'chime', body: '#5a6b85', roof: '#2b3346', trim: '#93a8c9', w: 2, h: 2, shape: 'building', glow: true },
};

/**
 * Code-drawn art for the Green Terraces' Verdant Loom (ADR-0017 rung 3) — same
 * StructureArt pipeline as CHIME_KILN_ART, but an upright timber weaving frame
 * strung with living verdant warp threads (its retting glow is the Terraces'
 * signal green #7cc96f / #4a9e52) instead of the kiln's cold hushsteel blue.
 */
export const VERDANT_LOOM_ART: Partial<Record<StructureId, StructureArt>> = {
  verdant_loom: { kind: 'loom', body: '#6b5a34', roof: '#3a4a26', trim: '#7cc96f', w: 2, h: 2, shape: 'building', glow: true },
};

/**
 * The Echo Reliquary (ADR-0017 rung 2): the one-time prestige trophy for solving
 * your first Hushdark vault. Reuses the code-drawn 'monument' silhouette (like the
 * Grand Monument) re-hued to cold hushsteel blue — a ringing obelisk. Not a Village
 * Building; shares the StructureArt pipeline only.
 */
export const RELIQUARY_ART: Partial<Record<StructureId, StructureArt>> = {
  hushdark_reliquary: { kind: 'monument', body: '#4a5568', roof: '#5a6b85', trim: '#93a8c9', w: 1, h: 1, shape: 'monument', glow: true },
};
