import { describe, it, expect } from 'vitest';
import {
  TOOL_UPGRADES,
  holdsBonusTool,
  toolSatisfies,
  NODE_TYPES,
  type NodeTypeId,
} from '../../src/content/nodeTypes';
import { ITEMS, type ItemId } from '../../src/content/items';

describe('nodeTypes — tool matching', () => {
  it('toolSatisfies accepts the exact tool or its tier-2 upgrade', () => {
    expect(toolSatisfies('axe', 'axe')).toBe(true);
    expect(toolSatisfies('ancient_axe', 'axe')).toBe(true); // upgrade satisfies the base requirement
    expect(toolSatisfies('pickaxe', 'axe')).toBe(false); // wrong tool
    expect(toolSatisfies(undefined, 'axe')).toBe(false);
    expect(toolSatisfies('axe', undefined)).toBe(false);
  });

  it('holdsBonusTool checks the bag for the tool or its upgrade', () => {
    expect(holdsBonusTool({ axe: 1 }, 'axe')).toBe(true);
    expect(holdsBonusTool({ ancient_axe: 1 }, 'axe')).toBe(true);
    expect(holdsBonusTool({ pickaxe: 1 }, 'axe')).toBe(false);
    expect(holdsBonusTool({}, 'axe')).toBe(false);
    expect(holdsBonusTool({ axe: 1 }, undefined)).toBe(false);
  });

  it('TOOL_UPGRADES maps the base tools to their ancients', () => {
    expect(TOOL_UPGRADES.axe).toBe('ancient_axe');
    expect(TOOL_UPGRADES.pickaxe).toBe('ancient_pickaxe');
  });
});

describe('nodeTypes — the node table', () => {
  it('each node type is self-consistent and yields real resources', () => {
    for (const [key, def] of Object.entries(NODE_TYPES)) {
      expect(def.id, key).toBe(key as NodeTypeId);
      expect(def.name, key).toBeTruthy();
      expect(def.maxHp, key).toBeGreaterThan(0);
      const yielded = Object.entries(def.yield);
      expect(yielded.length, `${key} yield`).toBeGreaterThan(0);
      for (const [res, qty] of yielded) {
        expect(ITEMS[res as ItemId], `${key} → ${res}`).toBeDefined();
        expect(qty as number, `${key} → ${res}`).toBeGreaterThan(0);
      }
    }
  });

  it('the basic nodes carry the expected bonus tools', () => {
    expect(NODE_TYPES.tree.bonusTool).toBe('axe');
    expect(NODE_TYPES.rock.bonusTool).toBe('pickaxe');
  });
});
