import type { ItemId, ResourceId, ToolId } from './items';

export interface Recipe {
  id: string;
  output: ItemId;
  count: number;
  cost: Partial<Record<ResourceId, number>>;
  /** tool that must be in the inventory to craft (not consumed) */
  requiresTool?: ToolId;
  /**
   * the heavy forged gear can only be crafted while standing next to a Forge
   * Structure — not from the pack anywhere. Enforced client-side by proximity
   * (like cooking at a campfire); the generic jw_craft RPC is unchanged.
   */
  requiresForge?: boolean;
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
  // once) AND planks: tier 2 builds on refined wood (Sawmill required). The heavy
  // metal gear is FORGED: craftable only beside a Forge (requiresForge), not the pack.
  { id: 'ancient_axe', output: 'ancient_axe', count: 1, cost: { guardian_scale: 3, plank: 3, stone: 2 }, requiresForge: true, kind: 'tool' },
  { id: 'ancient_pickaxe', output: 'ancient_pickaxe', count: 1, cost: { guardian_scale: 3, plank: 2, stone: 3 }, requiresForge: true, kind: 'tool' },
  { id: 'fishing_rod', output: 'fishing_rod', count: 1, cost: { guardian_scale: 2, plank: 2, fiber: 2 }, kind: 'tool' },

  // Dungeons v1 (ADR-0007) — the Sword: the game's first pure-combat Tool,
  // forged from Delve loot (rare Deep Core + common Husk Shards) plus planks.
  { id: 'sword', output: 'sword', count: 1, cost: { deep_core: 1, husk_shard: 6, plank: 3, stone: 2 }, requiresForge: true, kind: 'tool' },
  // ADR-0011 — the Forgebrand: the Deep's pure-combat sidegrade, forged from Deep
  // loot (rare Forge Core + common Cinder Shards) plus planks + stone. An
  // INDEPENDENT craft — it does NOT consume the Sword (they coexist as feel-choices).
  { id: 'forgebrand', output: 'forgebrand', count: 1, cost: { forge_core: 1, cinder_shard: 6, plank: 3, stone: 2 }, requiresForge: true, kind: 'tool' },

  // v2 — cheap, repeatable summon Offering (tier-1 resources only)
  { id: 'summon_totem', output: 'summon_totem', count: 1, cost: { wood: 5, fiber: 3, fruit: 2 }, kind: 'consumable' },
  // ADR-0017 — the Warden Totems: each rung's summon Offering is FORGED from the
  // previous tier's goods (rung 1 = tier-2 economy), repeatable like the Guardian's
  { id: 'mire_totem', output: 'mire_totem', count: 1, cost: { hardwood: 2, obsidian: 2, fiber: 3 }, requiresForge: true, kind: 'consumable' },
  // ADR-0017 rung 2 — the Echo Warden Totem: forged from the previous (Mire) tier's
  // goods, repeatable like every totem.
  { id: 'echo_totem', output: 'echo_totem', count: 1, cost: { saltreed: 2, tideglass: 2, fiber: 3 }, requiresForge: true, kind: 'consumable' },
  // ADR-0017 rung 3 — the Verdant Warden Totem: forged from the previous (Hushdark)
  // tier's goods (echo-crystal + refined hushsteel), repeatable like every totem —
  // it sinks the rung-2 economy exactly as echo_totem sinks the Mire's tideglass.
  { id: 'verdant_totem', output: 'verdant_totem', count: 1, cost: { echo_crystal: 2, hushsteel: 2, fiber: 3 }, requiresForge: true, kind: 'consumable' },
  // ADR-0017 rung 1 — the Tideglass Boots: the Sunken Mire's Armor, assembled from
  // Brine-Kiln tideglass. kind:'tool' so it lands in the Tools & Weapons tab (no
  // armor tab yet); it auto-equips once in inventory (the HUD keys off armorDef).
  { id: 'tideglass_boots', output: 'tideglass_boots', count: 1, cost: { tideglass: 6, plank: 2, fiber: 2 }, kind: 'tool' },
  // ADR-0017 rung 2 — the Hushsteel Helm: the Hushdark's Armor, rung out of
  // Chime-Kiln hushsteel. Item + ARMOR_BUFFS already exist (T3) — only the recipe.
  { id: 'hushsteel_helm', output: 'hushsteel_helm', count: 1, cost: { hushsteel: 6, plank: 2, fiber: 2 }, kind: 'tool' },
  // ADR-0017 rung 3 — the Verdant-woven Cuirass: the Green Terraces' Armor, woven
  // from Loom-retted verdant fibre. kind:'tool' so it lands in the Tools & Weapons
  // tab and auto-equips (the HUD keys off armorDef), mirroring the boots/helm.
  { id: 'verdant_cuirass', output: 'verdant_cuirass', count: 1, cost: { verdant_fibre: 6, plank: 2, fiber: 2 }, kind: 'tool' },
  // ADR-0017 rung 2 §7 — the Chime Charm: the renewable hushsteel sink. Spent at a
  // Hushdark pedestal to arm an echo recording (repeatable demand, never a one-shot).
  { id: 'chime_charm', output: 'chime_charm', count: 1, cost: { hushsteel: 1, fiber: 2 }, kind: 'consumable' },

  // ADR-0012 — the cooked-meat campfire recipe: a NEW ingredient (Wildlife meat)
  // feeding the EXISTING move-speed buff (cooked_meat eats identically to a cooked
  // fish — no new buff). Surfaced at the campfire like fish cooking; also here so
  // it lists under Consumables. Uses the generic jw_craft path (no new RPC).
  { id: 'cooked_meat', output: 'cooked_meat', count: 1, cost: { meat: 2 }, kind: 'consumable' },
  // ADR-0017 rung 3 §7 — the Grasweave Ration: the repeatable verdant-fibre sink.
  // Pressed from wildgrain + verdant fibre; it eats identically to a cooked fish
  // (the item is kind:'food', reusing the EXISTING +20% move-speed buff — no new buff).
  { id: 'grasweave_ration', output: 'grasweave_ration', count: 1, cost: { wildgrain: 2, verdant_fibre: 1 }, kind: 'consumable' },

  { id: 'campfire', output: 'campfire', count: 1, cost: { wood: 3, stone: 2 }, kind: 'structure' },
  { id: 'torch', output: 'torch', count: 1, cost: { wood: 1, fiber: 1 }, kind: 'structure' },
  { id: 'bridge', output: 'bridge', count: 1, cost: { wood: 3, fiber: 2 }, requiresTool: 'hammer', kind: 'structure' },
  { id: 'crate', output: 'crate', count: 1, cost: { wood: 4, stone: 1 }, kind: 'structure' },
  { id: 'fruit_basket', output: 'fruit_basket', count: 1, cost: { fiber: 2, fruit: 3 }, kind: 'structure' },

  // v3 — the Sawmill is tier-1 (the gateway to refined wood)...
  { id: 'sawmill', output: 'sawmill', count: 1, cost: { wood: 6, stone: 4 }, requiresTool: 'hammer', kind: 'structure' },
  // ...and the Forge is the tier-2 workshop: build it (planks + stone, hammer) to
  // unlock forging the heavy metal gear beside it.
  { id: 'forge', output: 'forge', count: 1, cost: { plank: 4, stone: 8 }, requiresTool: 'hammer', kind: 'structure' },
  // ADR-0017 rung 1 — the Brine Kiln: the Sunken Mire's Refiner (salt-reed →
  // tideglass on the generic kernel). A 2×2 Building, raised beside the reeds.
  { id: 'brine_kiln', output: 'brine_kiln', count: 1, cost: { plank: 4, stone: 6, obsidian: 2 }, requiresTool: 'hammer', kind: 'structure' },
  // ADR-0017 rung 2 — the Chime Kiln: the Hushdark's Refiner (echo-crystal →
  // hushsteel on the generic kernel). A 2×2 Building; its cost ties to the Mire tier.
  { id: 'chime_kiln', output: 'chime_kiln', count: 1, cost: { plank: 4, stone: 6, tideglass: 2 }, requiresTool: 'hammer', kind: 'structure' },
  // ADR-0017 rung 3 — the Verdant Loom: the Green Terraces' Refiner (wildgrain →
  // verdant fibre on the generic kernel). A 2×2 Building; its cost ties to the
  // Hushdark tier (hushsteel), as the Chime Kiln's ties to the Mire's tideglass.
  { id: 'verdant_loom', output: 'verdant_loom', count: 1, cost: { plank: 4, stone: 6, hushsteel: 2 }, requiresTool: 'hammer', kind: 'structure' },
  // ...and the new functional Structures consume its planks (the hammock and
  // table were retired in the 2026-07 playtest batch — the fence/hut_wall pattern)
  { id: 'signpost', output: 'signpost', count: 1, cost: { plank: 1, fiber: 1 }, kind: 'structure' },

  // v2 tier-2 structures ("tier 2 builds on refined wood": planks replace raw wood)
  { id: 'obsidian_statue', output: 'obsidian_statue', count: 1, cost: { obsidian: 4 }, kind: 'structure' },
  { id: 'guardian_trophy', output: 'guardian_trophy', count: 1, cost: { guardian_scale: 5, obsidian: 2 }, kind: 'structure' },
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
