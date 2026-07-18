import { describe, it, expect } from 'vitest';
import {
  VILLAGE_MAX_TIER,
  VILLAGE_ZONE_RADIUS,
  villageBuff,
  INVENTORY_BASE_SLOTS,
  INVENTORY_ROW_SLOTS,
  inventoryCapacity,
  invKindCount,
  canAcceptItem,
  tradeTaxForTier,
  tradeYield,
  tradeUnitCost,
  festivalActive,
  tierDef,
  tierThreshold,
  milestoneForTier,
  villagePoolCap,
  milestoneTierOf,
  structureVillageMin,
  isVillageStructure,
  contributionValueOf,
  villageContribution,
  inVillageZone,
  emptyVillage,
  recomputeTier,
  type VillageRecord,
} from '../../src/content/village';

describe('village — buffs & tier ladder', () => {
  it('villageBuff clamps the tier to the ladder', () => {
    expect(villageBuff(-5)).toEqual(villageBuff(0));
    expect(villageBuff(99)).toEqual(villageBuff(VILLAGE_MAX_TIER));
    expect(villageBuff(0)).toEqual({ moveSpeed: 0, attackSpeed: 0, critChance: 0 });
    expect(villageBuff(5).moveSpeed).toBeGreaterThan(0);
  });

  it('tierDef / tierThreshold / milestoneForTier read the ladder', () => {
    expect(tierDef(0).name).toBe('Wildland');
    expect(tierDef(5).name).toBe('Capital');
    expect(tierThreshold(2)).toBe(300);
    expect(tierThreshold(3)).toBe(1_200);
    expect(milestoneForTier(1)).toBe('village_hall');
    expect(milestoneForTier(0)).toBeNull();
  });

  it('villagePoolCap stops the pool at the next threshold, unbounded at max', () => {
    expect(villagePoolCap(1)).toBe(tierThreshold(2));
    expect(villagePoolCap(VILLAGE_MAX_TIER)).toBe(Infinity);
  });

  it('milestoneTierOf / structureVillageMin / isVillageStructure classify buildings', () => {
    expect(milestoneTierOf('village_hall')).toBe(1);
    expect(milestoneTierOf('village_well')).toBe(2);
    expect(milestoneTierOf('campfire' as never)).toBe(0); // not a milestone
    expect(structureVillageMin('market_square')).toBe(2); // unlocked at Hamlet
    expect(isVillageStructure('village_hall')).toBe(true);
    expect(isVillageStructure('campfire' as never)).toBe(false);
  });
});

describe('village — pack capacity', () => {
  it('capacity grows by one row once the Camp is founded', () => {
    expect(inventoryCapacity(0)).toBe(INVENTORY_BASE_SLOTS);
    expect(inventoryCapacity(1)).toBe(INVENTORY_BASE_SLOTS + INVENTORY_ROW_SLOTS);
    expect(inventoryCapacity(3)).toBe(INVENTORY_BASE_SLOTS + INVENTORY_ROW_SLOTS);
  });

  it('invKindCount counts held kinds, honouring the exempt (quick-bar) set', () => {
    const inv = { wood: 10, stone: 3, axe: 0, bow: 1 };
    expect(invKindCount(inv)).toBe(3); // wood, stone, bow (axe is 0)
    expect(invKindCount(inv, new Set(['bow']))).toBe(2); // bow is quick-slotted
  });

  it('canAcceptItem always grows an existing stack, else needs a free slot', () => {
    const capacity = 2;
    const inv = { wood: 5, stone: 5 }; // full at capacity 2
    expect(canAcceptItem(inv, 'wood', capacity)).toBe(true); // grows the stack
    expect(canAcceptItem(inv, 'fiber', capacity)).toBe(false); // no free slot
    expect(canAcceptItem({ wood: 5 }, 'fiber', capacity)).toBe(true); // room for a new kind
  });
});

describe('village — the market', () => {
  it('the market tax shrinks as the settlement grows', () => {
    expect(tradeTaxForTier(3)).toBe(0.35);
    expect(tradeTaxForTier(4)).toBe(0.25);
    expect(tradeTaxForTier(5)).toBe(0.15);
  });

  it('tradeYield converts at value parity minus tax', () => {
    // wood(1) → stone(1) at tier 3 (tax 0.35): floor(10 × 1 × 0.65 / 1) = 6
    expect(tradeYield('wood', 10, 'stone', 3)).toBe(6);
    // fish(2) → wood(1) at tier 5 (tax 0.15): floor(10 × 2 × 0.85 / 1) = 17
    expect(tradeYield('fish', 10, 'wood', 5)).toBe(17);
  });

  it('tradeYield refuses invalid trades', () => {
    expect(tradeYield('wood', 10, 'wood', 3)).toBe(0); // same item
    expect(tradeYield('wood', 0, 'stone', 3)).toBe(0); // nothing given
    expect(tradeYield('wood', 10, 'guardian_scale', 3)).toBe(0); // rare loot can't be laundered
  });

  it('tradeUnitCost is the fewest give-units for one whole get-unit', () => {
    // stone costs ceil(1 / (1 × 0.65)) = 2 wood at tier 3
    expect(tradeUnitCost('wood', 'stone', 3)).toBe(2);
    expect(tradeUnitCost('wood', 'wood', 3)).toBe(0); // invalid
    expect(tradeUnitCost('wood', 'obsidian', 3)).toBe(0); // not tradeable
  });
});

describe('village — the pool & contributions', () => {
  it('contributionValueOf reflects the accept table', () => {
    expect(contributionValueOf('wood')).toBe(1);
    expect(contributionValueOf('guardian_scale')).toBe(15);
    expect(contributionValueOf('axe')).toBe(0); // not accepted
  });

  it('villageContribution takes everything qualifying by default', () => {
    const { taken, points } = villageContribution({ wood: 5, stone: 3, guardian_scale: 1, axe: 9 });
    expect(taken).toEqual({ wood: 5, stone: 3, guardian_scale: 1 });
    expect(points).toBe(5 + 3 + 15); // axe contributes nothing
  });

  it('villageContribution honours the per-item amount caps', () => {
    const { taken, points } = villageContribution({ wood: 10 }, { wood: 3 });
    expect(taken).toEqual({ wood: 3 });
    expect(points).toBe(3);
  });

  it('villageContribution never overfills past maxPoints (no-loss)', () => {
    // room for 20 points, guardian_scale is 15 each → only one whole unit fits
    const { taken, points } = villageContribution({ guardian_scale: 10 }, undefined, 20);
    expect(taken).toEqual({ guardian_scale: 1 });
    expect(points).toBe(15);
  });

  it('recomputeTier only climbs when BOTH pool and milestone allow', () => {
    const base = { ...emptyVillage(), tier: 1, hall: { tx: 0, ty: 0 } } as VillageRecord;
    // pool met but milestone not yet built → stays
    expect(recomputeTier({ ...base, pool: 300, milestonesBuilt: 1 }).tier).toBe(1);
    // both met → climbs to 2 (but no further: milestonesBuilt gates tier 3)
    expect(recomputeTier({ ...base, pool: 300, milestonesBuilt: 2 }).tier).toBe(2);
    // returns the same object when nothing changed
    const stable = { ...base, pool: 0, milestonesBuilt: 1 } as VillageRecord;
    expect(recomputeTier(stable)).toBe(stable);
  });
});

describe('village — zone, festival, empty record', () => {
  it('emptyVillage is the unfounded record', () => {
    expect(emptyVillage()).toEqual({ tier: 0, pool: 0, hall: null, milestonesBuilt: 0 });
  });

  it('inVillageZone is false before founding and a radius around the Hall after', () => {
    expect(inVillageZone({ hall: null }, 0, 0)).toBe(false);
    const hall = { hall: { tx: 50, ty: 50 } };
    expect(inVillageZone(hall, 50, 50)).toBe(true);
    expect(inVillageZone(hall, 50 + VILLAGE_ZONE_RADIUS, 50)).toBe(true); // on the edge
    expect(inVillageZone(hall, 50 + VILLAGE_ZONE_RADIUS + 1, 50)).toBe(false); // just beyond
  });

  it('festivalActive is a pure timestamp check', () => {
    expect(festivalActive({ festivalUntil: 5000 } as VillageRecord, 4000)).toBe(true);
    expect(festivalActive({ festivalUntil: 5000 } as VillageRecord, 6000)).toBe(false);
    expect(festivalActive(emptyVillage(), 1)).toBe(false); // no festival scheduled
  });
});
