import { describe, it, expect } from 'vitest';
import { footprint, isBuilding, ITEMS, type ItemId, type StructureId } from '../../src/content/items';

describe('items — the master item table', () => {
  it('every item has a name, a valid kind, and a description', () => {
    const kinds = new Set(['resource', 'tool', 'structure', 'consumable', 'food', 'armor']);
    for (const [id, def] of Object.entries(ITEMS)) {
      expect(def.name, id).toBeTruthy();
      expect(def.desc, id).toBeTruthy();
      expect(kinds.has(def.kind), `${id} kind=${def.kind}`).toBe(true);
    }
  });

  it('footprint is at least 1×1 for every structure', () => {
    const structures = (Object.keys(ITEMS) as ItemId[]).filter((id) => ITEMS[id].kind === 'structure') as StructureId[];
    expect(structures.length).toBeGreaterThan(0);
    for (const id of structures) {
      const { w, h } = footprint(id);
      expect(w, id).toBeGreaterThanOrEqual(1);
      expect(h, id).toBeGreaterThanOrEqual(1);
    }
  });

  it('isBuilding matches a footprint larger than a single tile', () => {
    const structures = (Object.keys(ITEMS) as ItemId[]).filter((id) => ITEMS[id].kind === 'structure') as StructureId[];
    for (const id of structures) {
      const { w, h } = footprint(id);
      expect(isBuilding(id)).toBe(w > 1 || h > 1);
    }
    // at least one Building (≥2×2) and one Prop (1×1) exist in the game
    expect(structures.some((id) => isBuilding(id))).toBe(true);
    expect(structures.some((id) => !isBuilding(id))).toBe(true);
  });

  it('the core resources and tools are present and correctly kinded', () => {
    expect(ITEMS.wood.kind).toBe('resource');
    expect(ITEMS.axe.kind).toBe('tool');
    expect(ITEMS.summon_totem.kind).toBe('consumable');
  });
});
