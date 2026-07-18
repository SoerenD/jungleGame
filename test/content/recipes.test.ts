import { describe, it, expect } from 'vitest';
import { RECIPES } from '../../src/content/recipes';
import { ITEMS, type ItemId } from '../../src/content/items';

describe('recipes — integrity of the crafting table', () => {
  it('has unique recipe ids', () => {
    const ids = RECIPES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every recipe outputs a real item in a whole quantity', () => {
    for (const r of RECIPES) {
      expect(ITEMS[r.output as ItemId], r.id).toBeDefined();
      expect(r.count, r.id).toBeGreaterThanOrEqual(1);
      expect(['tool', 'structure', 'consumable'].includes(r.kind), `${r.id} kind=${r.kind}`).toBe(true);
    }
  });

  it('every cost ingredient is a real resource item', () => {
    for (const r of RECIPES) {
      for (const [res, qty] of Object.entries(r.cost)) {
        expect(ITEMS[res as ItemId], `${r.id} → ${res}`).toBeDefined();
        expect(qty, `${r.id} → ${res}`).toBeGreaterThan(0);
      }
    }
  });

  it('requiresTool, when present, references a real tool', () => {
    for (const r of RECIPES) {
      if (r.requiresTool) {
        expect(ITEMS[r.requiresTool as ItemId], r.id).toBeDefined();
        expect(ITEMS[r.requiresTool as ItemId].kind, r.id).toBe('tool');
      }
      if (r.villageMin !== undefined) expect(r.villageMin, r.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('spot-checks the starter tools', () => {
    const axe = RECIPES.find((r) => r.id === 'axe')!;
    expect(axe.output).toBe('axe');
    expect(axe.cost).toEqual({ wood: 3, stone: 2 });
    // the summon totem is a repeatable tier-1 consumable
    const totem = RECIPES.find((r) => r.id === 'summon_totem')!;
    expect(totem.kind).toBe('consumable');
  });

  it('every forged recipe requires a Forge', () => {
    // the ancient tools & pure-combat blades are forge-gated
    for (const id of ['ancient_axe', 'ancient_pickaxe', 'sword', 'forgebrand']) {
      const r = RECIPES.find((x) => x.id === id);
      if (r) expect(r.requiresForge, id).toBe(true);
    }
  });
});
