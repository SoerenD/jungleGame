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
}

/** the fresh, unfounded record for a brand-new World */
export function emptyVillage(): VillageRecord {
  return { tier: 0, pool: 0, hall: null, milestonesBuilt: 0 };
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
  map_piece: 8,
  husk_shard: 3,
  guardian_scale: 15,
  deep_core: 40,
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

/** total points `inventory` would add to the pool if fully contributed */
export function villageContribution(inventory: Partial<Record<string, number>>): { taken: Record<string, number>; points: number } {
  const taken: Record<string, number> = {};
  let points = 0;
  for (const [item, per] of Object.entries(VILLAGE_CONTRIB)) {
    const have = inventory[item] ?? 0;
    if (have > 0 && per) {
      taken[item] = have;
      points += have * per;
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
}

export const VILLAGE_ART: Partial<Record<StructureId, StructureArt>> = {
  village_hall: { body: '#8a5a2b', roof: '#b0472e', trim: '#ffcf6b', w: 2, h: 2, shape: 'building', glow: true },
  village_well: { body: '#9aa0a8', roof: '#6b4a2a', trim: '#4a90d9', w: 2, h: 2, shape: 'building' },
  market_square: { body: '#c08a3e', roof: '#3f8f52', trim: '#ffd166', w: 2, h: 2, shape: 'building' },
  stone_keep: { body: '#8a9099', roof: '#5b616a', trim: '#c3c9cf', w: 2, h: 2, shape: 'monument' },
  grand_monument: { body: '#cdb6f2', roof: '#8a6cc9', trim: '#ffd166', w: 2, h: 2, shape: 'monument', glow: true },
  village_banner: { body: '#6b4a2a', roof: '#b0472e', trim: '#ffcf6b', w: 1, h: 1, shape: 'decor' },
  lamp_post: { body: '#4a4a52', roof: '#2f2f36', trim: '#ffab52', w: 1, h: 1, shape: 'decor', glow: true },
  fountain: { body: '#9aa0a8', roof: '#c3c9cf', trim: '#4a90d9', w: 2, h: 2, shape: 'monument' },
  flower_bed: { body: '#3f8f52', roof: '#7cc96f', trim: '#ff8a70', w: 1, h: 1, shape: 'decor' },
  victory_arch: { body: '#cdb6f2', roof: '#8a6cc9', trim: '#ffd166', w: 2, h: 1, shape: 'monument' },
};
