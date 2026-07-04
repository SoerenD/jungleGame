import { FAST_REGROW, FAST_REGROW_MS } from '../config';
import { getLang } from '../i18n';
import type { Inventory } from '../backend/types';
import type { ResourceId, ToolId } from './items';

export type NodeTypeId = 'tree' | 'rock' | 'fruit_bush' | 'fiber_vine' | 'hardwood_tree' | 'obsidian_rock' | 'fishing_spot';

export interface NodeType {
  id: NodeTypeId;
  name: string;
  maxHp: number;
  yield: Partial<Record<ResourceId, number>>;
  /** without this tool, harvesting is refused entirely */
  requiredTool?: ToolId;
  /** with this tool each hit does double damage */
  bonusTool?: ToolId;
  regrowMs: number;
  /** does a living node block movement? (trees/rocks do, bushes don't) */
  blocks: boolean;
}

const regrow = (productionMs: number) => (FAST_REGROW ? FAST_REGROW_MS : productionMs);

/** tier-2 Tools supersede their tier-1 versions everywhere a bonus applies */
export const TOOL_UPGRADES: Partial<Record<ToolId, ToolId>> = {
  axe: 'ancient_axe',
  pickaxe: 'ancient_pickaxe',
};

/** true when the inventory holds the tool or its tier-2 upgrade */
export function holdsBonusTool(inv: Inventory, tool: ToolId | undefined): boolean {
  if (!tool) return false;
  if ((inv[tool] ?? 0) > 0) return true;
  const upgrade = TOOL_UPGRADES[tool];
  return upgrade !== undefined && (inv[upgrade] ?? 0) > 0;
}

/**
 * v4 equip rule: does the currently in-hand Tool satisfy a Node's `requiredTool`
 * or `bonusTool`? The in-hand Tool counts if it IS that Tool or its tier-2
 * upgrade (an in-hand ancient axe still satisfies an `axe` bonus/requirement).
 * Ownership is validated separately by the server before this is consulted.
 */
export function toolSatisfies(withTool: ToolId | undefined, tool: ToolId | undefined): boolean {
  if (!tool || !withTool) return false;
  return withTool === tool || TOOL_UPGRADES[tool] === withTool;
}

const BASE_NODE_TYPES: Record<NodeTypeId, NodeType> = {
  tree: {
    id: 'tree',
    name: 'Jungle Tree',
    maxHp: 4,
    yield: { wood: 3 },
    bonusTool: 'axe',
    regrowMs: regrow(180_000),
    blocks: true,
  },
  rock: {
    id: 'rock',
    name: 'Rock',
    maxHp: 4,
    yield: { stone: 3 },
    bonusTool: 'pickaxe',
    regrowMs: regrow(240_000),
    blocks: true,
  },
  fruit_bush: {
    id: 'fruit_bush',
    name: 'Fruit Bush',
    maxHp: 2,
    yield: { fruit: 2 },
    regrowMs: regrow(120_000),
    blocks: false,
  },
  fiber_vine: {
    id: 'fiber_vine',
    name: 'Fiber Vine',
    maxHp: 2,
    yield: { fiber: 2 },
    requiredTool: 'machete',
    regrowMs: regrow(150_000),
    blocks: false,
  },
  // v2 — visible from day one, harvestable only with tier-2 Tools
  hardwood_tree: {
    id: 'hardwood_tree',
    name: 'Ancient Hardwood Tree',
    maxHp: 6,
    yield: { hardwood: 3 },
    requiredTool: 'ancient_axe',
    bonusTool: 'ancient_axe',
    regrowMs: regrow(300_000),
    blocks: true,
  },
  obsidian_rock: {
    id: 'obsidian_rock',
    name: 'Obsidian Rock',
    maxHp: 6,
    yield: { obsidian: 2 },
    requiredTool: 'ancient_pickaxe',
    bonusTool: 'ancient_pickaxe',
    regrowMs: regrow(360_000),
    blocks: true,
  },
  fishing_spot: {
    id: 'fishing_spot',
    name: 'Fishing Spot',
    maxHp: 1,
    yield: { fish: 1 },
    requiredTool: 'fishing_rod',
    regrowMs: regrow(90_000),
    blocks: false,
  },
};

/** German display names for the Resource Nodes (all other fields stay shared) */
const NODE_NAMES_DE: Record<NodeTypeId, string> = {
  tree: 'Dschungelbaum',
  rock: 'Fels',
  fruit_bush: 'Obststrauch',
  fiber_vine: 'Faserranke',
  hardwood_tree: 'Uralter Hartholzbaum',
  obsidian_rock: 'Obsidianfels',
  fishing_spot: 'Angelstelle',
};

export const NODE_TYPES: Record<NodeTypeId, NodeType> =
  getLang() === 'de'
    ? (Object.fromEntries(
        (Object.entries(BASE_NODE_TYPES) as [NodeTypeId, NodeType][]).map(([id, def]) => [id, { ...def, name: NODE_NAMES_DE[id] }]),
      ) as Record<NodeTypeId, NodeType>)
    : BASE_NODE_TYPES;
