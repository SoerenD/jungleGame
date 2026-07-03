export type ResourceId =
  | 'wood'
  | 'stone'
  | 'fiber'
  | 'fruit'
  | 'map_piece'
  // v2 — Guardian drops and tier-2 Resources
  | 'guardian_scale'
  | 'hardwood'
  | 'obsidian'
  | 'fish'
  // v3 — refined at the Sawmill; lives in the Inventory like any Resource
  | 'plank';
export type ToolId =
  | 'axe'
  | 'pickaxe'
  | 'machete'
  | 'hammer'
  | 'ancient_axe'
  | 'ancient_pickaxe'
  | 'fishing_rod'
  // v4 — tier-1 Tools, no Guardian drops
  | 'bow'
  | 'hand_torch';
export type StructureId =
  | 'campfire'
  | 'torch'
  | 'hut_wall'
  | 'bridge'
  | 'crate'
  | 'tiki_statue'
  | 'fruit_basket'
  | 'golden_idol'
  // v2 — tier-2 Structures
  | 'obsidian_statue'
  | 'hardwood_arch'
  | 'guardian_trophy'
  | 'obsidian_path'
  | 'brazier'
  // v3 — functional Structures and plank decor
  | 'hammock'
  | 'signpost'
  | 'sawmill'
  | 'table';
/** carried consumables that are neither Resources nor Tools */
export type ConsumableId = 'summon_totem' | 'cooked_fish';
export type ItemId = ResourceId | ToolId | StructureId | ConsumableId;

export interface ItemDef {
  name: string;
  kind: 'resource' | 'tool' | 'structure' | 'consumable' | 'food';
  desc: string;
  /** structures only: does the placed structure block movement? */
  blocks?: boolean;
  /** structures only: may be placed on water (bridge) */
  onWater?: boolean;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  wood: { name: 'Wood', kind: 'resource', desc: 'Chopped from jungle trees.' },
  stone: { name: 'Stone', kind: 'resource', desc: 'Broken out of rocks.' },
  fiber: { name: 'Fiber', kind: 'resource', desc: 'Cut from vines — needs a machete.' },
  fruit: { name: 'Fruit', kind: 'resource', desc: 'Picked from fruit bushes.' },
  map_piece: { name: 'Torn Map Piece', kind: 'resource', desc: 'A scrap of an old treasure map. Collect 3 and an X appears on your minimap — dig there!' },
  guardian_scale: { name: 'Guardian Scale', kind: 'resource', desc: 'A stone-hard scale shed by the Guardian of the Ruins. Every Player who lands a hit in a victorious fight earns them.' },
  hardwood: { name: 'Ancient Hardwood', kind: 'resource', desc: 'Timber from the oldest trees — only an Ancient Axe can cut it.' },
  obsidian: { name: 'Obsidian', kind: 'resource', desc: 'Black glass-rock — only an Ancient Pickaxe can break it.' },
  fish: { name: 'Fish', kind: 'resource', desc: 'Fresh from a fishing spot. Cook it at a campfire.' },
  plank: { name: 'Plank', kind: 'resource', desc: 'Wood refined at a Sawmill. Tier 2 builds on refined wood.' },

  axe: { name: 'Axe', kind: 'tool', desc: 'Chops trees twice as fast.' },
  pickaxe: { name: 'Pickaxe', kind: 'tool', desc: 'Breaks rocks twice as fast.' },
  machete: { name: 'Machete', kind: 'tool', desc: 'Required to cut fiber vines.' },
  hammer: { name: 'Hammer', kind: 'tool', desc: 'Required to build walls and bridges.' },
  ancient_axe: { name: 'Ancient Axe', kind: 'tool', desc: 'Harvests ancient hardwood; in hand it chops trees twice as fast and hits the Guardian for 3.' },
  ancient_pickaxe: { name: 'Ancient Pickaxe', kind: 'tool', desc: 'Harvests obsidian; in hand it breaks rocks twice as fast and hits the Guardian for 3.' },
  fishing_rod: { name: 'Fishing Rod', kind: 'tool', desc: 'Cast at a fishing spot and wait for the bite. Works only while in hand.' },
  bow: { name: 'Bow', kind: 'tool', desc: 'Looses arrows at the Guardian from range — 2 damage in an Eye Window, no ammo. Craftable before the first fight.' },
  hand_torch: { name: 'Hand Torch', kind: 'tool', desc: 'Hold it to light your way with a warm orange glow at night. Distinct from the placed Torch.' },

  summon_totem: { name: 'Summoning Totem', kind: 'consumable', desc: 'An Offering for the arena altar — wakes the Guardian. Consumed on summon.' },
  cooked_fish: { name: 'Cooked Fish', kind: 'food', desc: 'Warm and hearty. Eating it quickens your step for a while.' },

  campfire: { name: 'Campfire', kind: 'structure', desc: 'A cozy fire. Cooks fish, too.', blocks: true },
  torch: { name: 'Torch', kind: 'structure', desc: 'Lights the path.', blocks: false },
  hut_wall: { name: 'Hut Wall', kind: 'structure', desc: 'A sturdy wall segment.', blocks: true },
  bridge: { name: 'Bridge', kind: 'structure', desc: 'Walk over water.', blocks: false, onWater: true },
  crate: { name: 'Supply Crate', kind: 'structure', desc: 'Shared storage — E to deposit and withdraw. No locks between friends.', blocks: true },
  tiki_statue: { name: 'Tiki Statue', kind: 'structure', desc: 'Watches the jungle.', blocks: true },
  fruit_basket: { name: 'Fruit Basket', kind: 'structure', desc: 'A welcoming snack pile.', blocks: false },
  golden_idol: { name: 'Golden Idol', kind: 'structure', desc: 'A gleaming trophy dug from a buried treasure. Cannot be crafted.', blocks: true },
  obsidian_statue: { name: 'Obsidian Statue', kind: 'structure', desc: 'A gleaming black sentinel.', blocks: true },
  hardwood_arch: { name: 'Hardwood Arch', kind: 'structure', desc: 'A grand gateway of ancient timber.', blocks: false },
  guardian_trophy: { name: 'Guardian Trophy', kind: 'structure', desc: 'Proof the Guardian was faced — and bested.', blocks: true },
  obsidian_path: { name: 'Obsidian Path', kind: 'structure', desc: 'A polished black paving tile.', blocks: false },
  brazier: { name: 'Brazier', kind: 'structure', desc: 'An obsidian fire bowl — glows far into the night.', blocks: true },
  hammock: { name: 'Hammock', kind: 'structure', desc: 'Your personal wake point: Exhaustion and login place you here. One active Hammock per Player.', blocks: false },
  signpost: { name: 'Signpost', kind: 'structure', desc: 'Holds a short line of your writing, readable by everyone.', blocks: false },
  sawmill: { name: 'Sawmill', kind: 'structure', desc: 'Deposit wood; collect planks after the mill has done its slow work.', blocks: true },
  table: { name: 'Table', kind: 'structure', desc: 'A sturdy plank table for the camp.', blocks: true },
};
