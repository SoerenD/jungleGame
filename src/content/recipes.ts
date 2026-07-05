import type { ItemId, ResourceId, ToolId } from './items';

export interface Recipe {
  id: string;
  output: ItemId;
  count: number;
  cost: Partial<Record<ResourceId, number>>;
  /** tool that must be in the inventory to craft (not consumed) */
  requiresTool?: ToolId;
  kind: 'tool' | 'structure' | 'consumable';
  /**
   * A3 (ADR-0010): the minimum Village tier at which this recipe unlocks. Absent
   * or 0 → always craftable. The craft UI hides a recipe until the Village
   * reaches its tier; this gates only the Village's own decor/QoL Buildings and
   * never the Guardian/Delve/frontier.
   */
  villageMin?: number;
}

export const RECIPES: Recipe[] = [
  { id: 'axe', output: 'axe', count: 1, cost: { wood: 3, stone: 2 }, kind: 'tool' },
  { id: 'pickaxe', output: 'pickaxe', count: 1, cost: { wood: 2, stone: 3 }, kind: 'tool' },
  { id: 'machete', output: 'machete', count: 1, cost: { wood: 1, stone: 2 }, kind: 'tool' },
  { id: 'hammer', output: 'hammer', count: 1, cost: { wood: 2, stone: 2 }, kind: 'tool' },

  // v4 tier-1 Tools — basic Resources only, no Guardian drops, so a group can
  // craft them before the first fight
  { id: 'bow', output: 'bow', count: 1, cost: { wood: 2, fiber: 3, stone: 1 }, kind: 'tool' },
  { id: 'hand_torch', output: 'hand_torch', count: 1, cost: { wood: 1, fiber: 1 }, kind: 'tool' },

  // v2 tier-2 tools — every recipe demands Guardian Scales (fight at least
  // once) AND planks: tier 2 builds on refined wood (Sawmill required)
  { id: 'ancient_axe', output: 'ancient_axe', count: 1, cost: { guardian_scale: 3, plank: 3, stone: 2 }, kind: 'tool' },
  { id: 'ancient_pickaxe', output: 'ancient_pickaxe', count: 1, cost: { guardian_scale: 3, plank: 2, stone: 3 }, kind: 'tool' },
  { id: 'fishing_rod', output: 'fishing_rod', count: 1, cost: { guardian_scale: 2, plank: 2, fiber: 2 }, kind: 'tool' },

  // Dungeons v1 (ADR-0007) — the Sword: the game's first pure-combat Tool,
  // forged from Delve loot (rare Deep Core + common Husk Shards) plus planks.
  { id: 'sword', output: 'sword', count: 1, cost: { deep_core: 1, husk_shard: 6, plank: 3, stone: 2 }, kind: 'tool' },
  // ADR-0011 — the Forgebrand: the Deep's pure-combat sidegrade, forged from Deep
  // loot (rare Forge Core + common Cinder Shards) plus planks + stone. An
  // INDEPENDENT craft — it does NOT consume the Sword (they coexist as feel-choices).
  { id: 'forgebrand', output: 'forgebrand', count: 1, cost: { forge_core: 1, cinder_shard: 6, plank: 3, stone: 2 }, kind: 'tool' },

  // v2 — cheap, repeatable summon Offering (tier-1 resources only)
  { id: 'summon_totem', output: 'summon_totem', count: 1, cost: { wood: 5, fiber: 3, fruit: 2 }, kind: 'consumable' },

  // ADR-0012 — the cooked-meat campfire recipe: a NEW ingredient (Wildlife meat)
  // feeding the EXISTING move-speed buff (cooked_meat eats identically to a cooked
  // fish — no new buff). Surfaced at the campfire like fish cooking; also here so
  // it lists under Consumables. Uses the generic jw_craft path (no new RPC).
  { id: 'cooked_meat', output: 'cooked_meat', count: 1, cost: { meat: 2 }, kind: 'consumable' },

  { id: 'campfire', output: 'campfire', count: 1, cost: { wood: 3, stone: 2 }, kind: 'structure' },
  { id: 'torch', output: 'torch', count: 1, cost: { wood: 1, fiber: 1 }, kind: 'structure' },
  { id: 'bridge', output: 'bridge', count: 1, cost: { wood: 3, fiber: 2 }, requiresTool: 'hammer', kind: 'structure' },
  { id: 'crate', output: 'crate', count: 1, cost: { wood: 4, stone: 1 }, kind: 'structure' },
  { id: 'tiki_statue', output: 'tiki_statue', count: 1, cost: { stone: 4, fiber: 1 }, kind: 'structure' },
  { id: 'fruit_basket', output: 'fruit_basket', count: 1, cost: { fiber: 2, fruit: 3 }, kind: 'structure' },

  // v3 — the Sawmill is tier-1 (the gateway to refined wood)...
  { id: 'sawmill', output: 'sawmill', count: 1, cost: { wood: 6, stone: 4 }, requiresTool: 'hammer', kind: 'structure' },
  // ...and the new functional Structures + decor consume its planks
  { id: 'hammock', output: 'hammock', count: 1, cost: { plank: 2, fiber: 3 }, kind: 'structure' },
  { id: 'signpost', output: 'signpost', count: 1, cost: { plank: 1, fiber: 1 }, kind: 'structure' },
  { id: 'table', output: 'table', count: 1, cost: { plank: 3 }, kind: 'structure' },

  // v2 tier-2 structures ("tier 2 builds on refined wood": planks replace raw wood)
  { id: 'obsidian_statue', output: 'obsidian_statue', count: 1, cost: { obsidian: 4 }, kind: 'structure' },
  { id: 'hardwood_arch', output: 'hardwood_arch', count: 1, cost: { hardwood: 4, plank: 2 }, requiresTool: 'hammer', kind: 'structure' },
  { id: 'guardian_trophy', output: 'guardian_trophy', count: 1, cost: { guardian_scale: 5, obsidian: 2 }, kind: 'structure' },
  { id: 'obsidian_path', output: 'obsidian_path', count: 1, cost: { obsidian: 2 }, kind: 'structure' },
  { id: 'brazier', output: 'brazier', count: 1, cost: { obsidian: 2, plank: 2 }, kind: 'structure' },

  // ADR-0012 — decor forged from Wildlife loot (no power; cozy expression only)
  { id: 'trophy_mount', output: 'trophy_mount', count: 1, cost: { trophy: 1, plank: 2 }, kind: 'structure' },
  { id: 'hide_rug', output: 'hide_rug', count: 1, cost: { hide: 3 }, kind: 'structure' },

  // A3 (ADR-0010): the Village. The Hall founds the Village (always craftable);
  // the four later milestone Buildings + per-tier decor unlock as the Village
  // grows (villageMin). Costs/gating are playtest tuning — the numbers matter
  // less than the always-there-but-optional shape.
  { id: 'village_hall', output: 'village_hall', count: 1, cost: { plank: 8, stone: 6, fiber: 4 }, requiresTool: 'hammer', kind: 'structure' },
  { id: 'village_well', output: 'village_well', count: 1, cost: { plank: 6, stone: 8 }, requiresTool: 'hammer', kind: 'structure', villageMin: 1 },
  { id: 'village_banner', output: 'village_banner', count: 1, cost: { plank: 1, fiber: 2 }, kind: 'structure', villageMin: 1 },
  { id: 'market_square', output: 'market_square', count: 1, cost: { plank: 10, fiber: 6, fruit: 4 }, requiresTool: 'hammer', kind: 'structure', villageMin: 2 },
  { id: 'lamp_post', output: 'lamp_post', count: 1, cost: { plank: 1, stone: 2 }, kind: 'structure', villageMin: 2 },
  { id: 'stone_keep', output: 'stone_keep', count: 1, cost: { plank: 8, stone: 16, hardwood: 2 }, requiresTool: 'hammer', kind: 'structure', villageMin: 3 },
  { id: 'fountain', output: 'fountain', count: 1, cost: { plank: 4, stone: 8 }, requiresTool: 'hammer', kind: 'structure', villageMin: 3 },
  { id: 'grand_monument', output: 'grand_monument', count: 1, cost: { plank: 12, obsidian: 4, guardian_scale: 2 }, requiresTool: 'hammer', kind: 'structure', villageMin: 4 },
  { id: 'flower_bed', output: 'flower_bed', count: 1, cost: { fiber: 2, fruit: 2 }, kind: 'structure', villageMin: 4 },
  { id: 'victory_arch', output: 'victory_arch', count: 1, cost: { plank: 6, obsidian: 2 }, requiresTool: 'hammer', kind: 'structure', villageMin: 5 },
];
