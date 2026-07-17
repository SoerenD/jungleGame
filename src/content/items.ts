import { getLang } from '../i18n';

export type ResourceId =
  | 'wood'
  | 'stone'
  | 'fiber'
  | 'fruit'
  // the Sunken Mire's raw Resource (ADR-0017 rung 1: salt-reed → tideglass)
  | 'saltreed'
  // refined from saltreed at a Brine Kiln (ADR-0017 §6) — crafts the Tideglass Boots
  | 'tideglass'
  // the Hushdark's raw Resource (ADR-0017 rung 2: echo-crystal seam → hushsteel)
  | 'echo_crystal'
  // refined from echo_crystal at a Chime Kiln (ADR-0017 §6) — crafts the Hushsteel Helm
  | 'hushsteel'
  // the Green Terraces' raw crop (ADR-0017 rung 3: wildgrain → verdant fibre)
  | 'wildgrain'
  // refined from wildgrain at a Verdant Loom (ADR-0017 §6) — crafts the Verdant-woven Cuirass
  | 'verdant_fibre'
  // ADR-0017 rung 2 — the Reverberant's weekly prestige token (the depth_sigil
  // shape: pure prestige, crafts nothing, pooled to the Village)
  | 'echo_sigil'
  | 'map_piece'
  // v2 — Guardian drops and tier-2 Resources
  | 'guardian_scale'
  | 'hardwood'
  | 'obsidian'
  | 'fish'
  // v3 — refined at the Sawmill; lives in the Inventory like any Resource
  | 'plank'
  // Dungeons v1 (ADR-0007) — Stage-1 Delve drops that craft the Sword
  | 'husk_shard'
  | 'deep_core'
  // ADR-0011 — the Deep (Stage 2) drops that forge the Forgebrand
  | 'cinder_shard'
  | 'forge_core'
  // ADR-0015 — the generated Depths' only loot: pure prestige, crafts nothing
  | 'depth_sigil'
  // ADR-0017 — the Mire Warden's participation drop: the Sunken Mire's gate
  // key. Never consumed — any Player opens the gate once with it in hand
  // (the Delve-shaft pattern), then it stays a trophy.
  | 'mire_key'
  // ADR-0017 rung 2 — the Echo Warden's participation drop: the Hushdark's gate
  // key. Never consumed — any Player opens the gate once with it in hand, then
  // it stays a trophy (the mire_key pattern).
  | 'hushdark_key'
  // ADR-0017 rung 3 — the Verdant Warden's participation drop: the Green
  // Terraces' gate key. Never consumed — any Player opens the gate once with it
  // in hand, then it stays a trophy (the mire_key pattern).
  | 'terrace_key'
  // ADR-0012 — open-world Wildlife drops (hide/meat/trophy family). Feed EXISTING
  // loops only: the Village pool, a cooked-meat campfire recipe, decor Structures.
  | 'hide'
  | 'meat'
  | 'trophy';
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
  | 'hand_torch'
  // ADR-0017 rung 1 — the Mire Warden's participation weapon drop: a pure-combat
  // blade that also ignores the Sunken Mire's tide wade-slow (realm-synergy passive)
  | 'mirefang'
  // Dungeons v1 (ADR-0007) — the first pure-combat Tool: no harvest use
  | 'sword'
  // ADR-0011 — the Deep's reward: a pure-combat molten two-hander (sidegrade)
  | 'forgebrand'
  // Fabled set — rare (1%) BOSS-ONLY world-drops, one tier above every crafted
  // weapon. Pure combat, no harvest use; land in the Spoils window on a lucky kill.
  | 'fabled_sword'
  | 'fabled_axe'
  | 'fabled_bow';
export type StructureId =
  | 'campfire'
  | 'torch'
  | 'bridge'
  | 'crate'
  | 'fruit_basket'
  | 'golden_idol'
  // v2 — tier-2 Structures (obsidian_path, tiki_statue + hardwood_arch retired
  // 2026-07 — pure decor with no function; legacy placed instances render as
  // reserved-but-invisible, the fence/hut_wall pattern)
  | 'obsidian_statue'
  | 'guardian_trophy'
  | 'brazier'
  // v3 — functional Structures (hammock + table retired 2026-07; the Village
  // Hall is the wake point now)
  | 'signpost'
  | 'sawmill'
  // the Forge: a crafting station where the heavy forged tools/weapons are made
  | 'forge'
  // ADR-0017 rung 1 — the Sunken Mire's Refiner: tempers salt-reed into tideglass
  // over real time (the generic refiner kernel, §6). A 2×2 code-art Building.
  | 'brine_kiln'
  // ADR-0017 rung 2 — the Hushdark's Refiner: rings echo-crystal into hushsteel
  // over real time (the generic refiner kernel, §6). A 2×2 code-art Building.
  | 'chime_kiln'
  // ADR-0017 rung 3 — the Green Terraces' Refiner: rets wildgrain into verdant
  // fibre over real time (the generic refiner kernel, §6). A 2×2 code-art Building.
  | 'verdant_loom'
  // ADR-0017 rung 2 — the ONE-TIME prestige trophy for solving your first Hushdark
  // vault: a placeable Echo Reliquary. Not craftable (the golden_idol pattern) —
  // it is only ever granted by that first vault open.
  | 'hushdark_reliquary'
  // A3 (ADR-0010) — the Village: the Hall (founding + communal spawn), the four
  // later milestone Buildings, and per-tier decor unlocks. Progress lives in the
  // per-world Village record, not these tiles (re-founding never resets it).
  | 'village_hall'
  | 'village_well'
  | 'market_square'
  | 'stone_keep'
  | 'grand_monument'
  | 'village_banner'
  | 'lamp_post'
  | 'fountain'
  | 'flower_bed'
  | 'victory_arch'
  // ADR-0012 — decor Structures forged from Wildlife loot (no new power)
  | 'trophy_mount'
  | 'hide_rug';
/** carried consumables that are neither Resources nor Tools */
export type ConsumableId = 'summon_totem' | 'cooked_fish' | 'cooked_meat'
  // ADR-0017 — the Warden Totems: one crafted Offering per rung, consumed on summon
  | 'mire_totem'
  | 'echo_totem'
  // ADR-0017 rung 3 — the Verdant Warden Totem: crafted Offering, consumed on summon
  | 'verdant_totem'
  // ADR-0017 rung 2 §7 — the Hushdark's renewable consumable sink for hushsteel:
  // a charm you spend to arm an Echo recording (renewable demand, never a one-shot)
  | 'chime_charm'
  // ADR-0017 rung 3 §7 — the Green Terraces' renewable fibre sink: a cooked-food
  // ration (kind:'food') that rides the +20% move-speed food buff (cooked_fish parity)
  | 'grasweave_ration';
// ADR-0017 §3/§4 — the Warden ladder's visible Armor: one piece per Realm,
// worn (players.equipped), drawn on the Avatar, each granting ONE attribute
// (tuning in content/armor.ts).
export type ArmorId = 'tideglass_boots' | 'verdant_cuirass' | 'hushsteel_helm'
  // ADR-0017 rung 2 — the EPIC transfiguration of the Hushsteel Helm, the
  // once-ever reward for defeating the Reverberant. SAME slot + SAME band (+2/+3)
  // as the plain helm — a pure cosmetic upgrade (a crested, glowing silhouette).
  | 'hushsteel_helm_epic';
export type ItemId = ResourceId | ToolId | StructureId | ConsumableId | ArmorId;

export interface ItemDef {
  name: string;
  kind: 'resource' | 'tool' | 'structure' | 'consumable' | 'food' | 'armor';
  desc: string;
  /** structures only: does the placed structure block movement? */
  blocks?: boolean;
  /** structures only: may be placed on water (bridge) */
  onWater?: boolean;
  /**
   * structures only: footprint in tiles (ADR-0008). Omitted → 1×1 (a Prop).
   * ≥2×2 marks a Building. Placement claims — and collision spans — every tile
   * of the footprint, anchored at the (tx,ty) tile toward +x/+y.
   */
  w?: number;
  h?: number;
}

/** a Structure's footprint in tiles; Props (and everything else) are 1×1 */
export function footprint(id: StructureId): { w: number; h: number } {
  const def = BASE_ITEMS[id];
  return { w: Math.max(1, def?.w ?? 1), h: Math.max(1, def?.h ?? 1) };
}

/** a Building is any Structure with a footprint larger than a single tile */
export function isBuilding(id: StructureId): boolean {
  const { w, h } = footprint(id);
  return w > 1 || h > 1;
}

const BASE_ITEMS: Record<ItemId, ItemDef> = {
  wood: { name: 'Wood', kind: 'resource', desc: 'Chopped from jungle trees.' },
  stone: { name: 'Stone', kind: 'resource', desc: 'Broken out of rocks.' },
  fiber: { name: 'Fiber', kind: 'resource', desc: 'Cut from vines — needs a machete.' },
  fruit: { name: 'Fruit', kind: 'resource', desc: 'Picked from fruit bushes.' },
  saltreed: { name: 'Salt-Reed', kind: 'resource', desc: 'Pale brine-crusted reeds cut from the banks of the Sunken Mire. A Brine Kiln tempers them into tideglass.' },
  tideglass: { name: 'Tideglass', kind: 'resource', desc: 'Sea-green glass tempered from salt-reed in a Brine Kiln. Fused into boots, it carries the tide’s pull in every stride.' },
  echo_crystal: { name: 'Echo Crystal', kind: 'resource', desc: 'A cold, ringing crystal cut from a seam in the Hushdark. A Chime Kiln rings it out into hushsteel.' },
  hushsteel: { name: 'Hushsteel', kind: 'resource', desc: 'Cold blued steel rung out of echo crystal in a Chime Kiln. Forged into a helm, every blow it backs lands with the Hushdark’s weight.' },
  wildgrain: { name: 'Wildgrain', kind: 'resource', desc: 'Golden grain reaped from the ripe beds of the Green Terraces. A Verdant Loom rets it into supple verdant fibre.' },
  verdant_fibre: { name: 'Verdant Fibre', kind: 'resource', desc: 'Supple green fibre retted from wildgrain at a Verdant Loom. Woven into a cuirass, every strike it backs flows like wind through grass.' },
  echo_sigil: { name: 'Echo Sigil', kind: 'resource', desc: 'A ringing sigil struck from the Reverberant, one each week it is felled. Pure prestige — it crafts nothing; give it to the Village pool and let the deed speak.' },
  map_piece: { name: 'Torn Map Piece', kind: 'resource', desc: 'A scrap of an old treasure map. Collect 3 and an X appears on your minimap — dig there!' },
  guardian_scale: { name: 'Guardian Scale', kind: 'resource', desc: 'A stone-hard scale shed by the Guardian of the Ruins. Every Player who lands a hit in a victorious fight earns them.' },
  hardwood: { name: 'Ancient Hardwood', kind: 'resource', desc: 'Timber from the oldest trees — only an Ancient Axe can cut it.' },
  obsidian: { name: 'Obsidian', kind: 'resource', desc: 'Black glass-rock — only an Ancient Pickaxe can break it.' },
  fish: { name: 'Fish', kind: 'resource', desc: 'Fresh from a fishing spot. Cook it at a campfire.' },
  plank: { name: 'Plank', kind: 'resource', desc: 'Wood refined at a Sawmill. Tier 2 builds on refined wood.' },
  husk_shard: { name: 'Husk Shard', kind: 'resource', desc: 'Stone-and-clay shrapnel from a felled Husk in the Delve. Common — the farm of a Dungeon run.' },
  deep_core: { name: 'Deep Core', kind: 'resource', desc: 'The molten heart of the Deep Guardian, granted to everyone who fought it. Rare — forges the Sword.' },
  cinder_shard: { name: 'Cinder Shard', kind: 'resource', desc: 'Molten shrapnel from a felled Cinder or Ember Husk in the Deep. Common — the farm of a Deep run.' },
  forge_core: { name: 'Forge Core', kind: 'resource', desc: 'The white-hot heart of the Forgeborn, granted to everyone who descended and fought it. Rare — forges the Forgebrand.' },
  depth_sigil: { name: 'Depth Sigil', kind: 'resource', desc: 'Proof of a boss felled in the generated Depths (3+), one per Stage. Pure prestige — it crafts nothing; give it to the Village pool, and let the Depth Record speak.' },
  mire_key: { name: 'Key to the Sunken Mire', kind: 'resource', desc: 'A brine-crusted key of fused tideglass, pried from the fallen Mire Warden. Carry it to the megalith arch on the Mangrove Coast — one turn opens the Sunken Mire for everyone, forever.' },
  hushdark_key: { name: 'Key to the Hushdark', kind: 'resource', desc: 'A cold key of hushsteel that hums with a swallowed note, pried from the fallen Echo Warden. Carry it to the maw at the Cavern Mouth — one turn opens the Hushdark for everyone, forever.' },
  terrace_key: { name: 'Key to the Green Terraces', kind: 'resource', desc: 'A key woven of living verdant fibre, won from the fallen Verdant Warden. Carry it to the terrace gate on the hillside — one turn opens the Green Terraces for everyone, forever.' },
  hide: { name: 'Hide', kind: 'resource', desc: 'Tough hide from foraged or hunted Wildlife. Give it to the Village, or lay it as a rug.' },
  meat: { name: 'Raw Meat', kind: 'resource', desc: 'Fresh meat from Wildlife. Cook it at a campfire for a hearty meal that quickens your step.' },
  trophy: { name: 'Wild Trophy', kind: 'resource', desc: 'A prize rack or fang from the wilds — rare. Mount it, or grace the Village pool with it.' },

  axe: { name: 'Axe', kind: 'tool', desc: 'Chops trees twice as fast.' },
  pickaxe: { name: 'Pickaxe', kind: 'tool', desc: 'Breaks rocks twice as fast.' },
  machete: { name: 'Machete', kind: 'tool', desc: 'Required to cut fiber vines.' },
  hammer: { name: 'Hammer', kind: 'tool', desc: 'Required to build walls and bridges.' },
  ancient_axe: { name: 'Ancient Axe', kind: 'tool', desc: 'Harvests ancient hardwood; in hand it chops trees twice as fast and strikes the Guardian with a heavy, wide, high-crit damage band.' },
  ancient_pickaxe: { name: 'Ancient Pickaxe', kind: 'tool', desc: 'Harvests obsidian; in hand it breaks rocks twice as fast and strikes the Guardian fast and steady.' },
  fishing_rod: { name: 'Fishing Rod', kind: 'tool', desc: 'Cast at a fishing spot and wait for the bite. Works only while in hand.' },
  bow: { name: 'Bow', kind: 'tool', desc: 'Looses arrows at the Guardian from range in an Eye Window — safe but lower DPS than melee, no ammo. Craftable before the first fight.' },
  hand_torch: { name: 'Hand Torch', kind: 'tool', desc: 'Hold it to light your way with a warm orange glow at night. Distinct from the placed Torch.' },
  mirefang: { name: 'Mirefang', kind: 'tool', desc: 'A brine-forged blade pried from the fallen Mire Warden — the participation prize for everyone who struck it. A pure-combat weapon that strikes Warden, Husks and Guardian alike; carried, its bearer wades the Sunken Mire’s tide unslowed.' },
  sword: { name: 'Sword', kind: 'tool', desc: 'The Delve’s reward: a pure-combat blade — it grants no gathering bonus and unlocks no Node, but strikes Husks, the Deep Guardian, and the Guardian a clear step harder than the Ancient Axe.' },
  forgebrand: { name: 'Forgebrand', kind: 'tool', desc: 'The Deep’s reward: a pure-combat molten two-hander — no gathering bonus, no Node. It swings slower than the Sword but lands the heaviest crafted band in the game — the strongest forged weapon there is — and strikes Husks, both bosses, and the Guardian alike.' },
  // Fabled set — the rarest reward in the game: a ~1% drop from ANY boss, one tier
  // above every crafted weapon. Pure combat, no gathering use; each strikes Husks,
  // both Delve bosses, and the Guardian.
  fabled_sword: { name: 'Fabled Sword', kind: 'tool', desc: 'A legendary blade, whole and unblemished among the ruins — a rare prize taken only from a fallen boss (~1%). The keenest melee weapon there is: a fast, high-crit band a clear step above the crafted Sword.' },
  fabled_axe: { name: 'Fabled Axe', kind: 'tool', desc: 'A legendary war-axe, wrenched from a fallen boss on the rarest of days (~1%). Heavy, wide and brutal — the biggest per-swing crits in the game, one tier above the Ancient Axe.' },
  fabled_bow: { name: 'Fabled Bow', kind: 'tool', desc: 'A legendary longbow dropped by a fallen boss (~1%). Looses arrows from range like the plain Bow, but hits far harder and faster — the safe way to out-damage a crafted melee weapon.' },

  summon_totem: { name: 'Summoning Totem', kind: 'consumable', desc: 'An Offering for the arena altar — wakes the Guardian. Consumed on summon.' },
  mire_totem: { name: 'Mire Warden Totem', kind: 'consumable', desc: 'A totem of hardwood and obsidian, forged for the altar on the Mangrove Coast. Once the altar’s Offering is complete, it wakes the Mire Warden. Consumed on summon.' },
  echo_totem: { name: 'Echo Warden Totem', kind: 'consumable', desc: 'A totem of salt-reed and tideglass, forged for the altar at the Cavern Mouth. Once the altar’s Offering is complete, it wakes the Echo Warden. Consumed on summon.' },
  verdant_totem: { name: 'Verdant Warden Totem', kind: 'consumable', desc: 'A totem of echo crystal and hushsteel, forged for the altar on the terraced hillside. Once the altar’s Offering is complete, it wakes the Verdant Warden. Consumed on summon.' },
  chime_charm: { name: 'Chime Charm', kind: 'consumable', desc: 'A little bell of hushsteel. Spend it at a pedestal in the Hushdark to arm an echo recording — a shade of you that walks its loop forever.' },
  cooked_fish: { name: 'Cooked Fish', kind: 'food', desc: 'Warm and hearty. Eating it quickens your step for a while.' },
  cooked_meat: { name: 'Cooked Meat', kind: 'food', desc: 'Roasted at a campfire. Eating it quickens your step for a while — the same warmth a cooked fish gives.' },
  grasweave_ration: { name: 'Grasweave Ration', kind: 'food', desc: 'A pressed ration of wildgrain bound with verdant fibre. Eating it quickens your step for a while — the same warmth a cooked fish gives.' },

  // ADR-0017 — the Warden ladder's Armor: worn, visible to every Player, one
  // small attribute each. Power, never protection — there is no HP to protect.
  tideglass_boots: { name: 'Tideglass Boots', kind: 'armor', desc: 'Boots shod in sea-green tideglass, tempered from salt-reed in a Brine Kiln. Worn, they carry the tide’s pull in every stride (+8% move speed) — and everyone sees them on you.' },
  verdant_cuirass: { name: 'Verdant-woven Cuirass', kind: 'armor', desc: 'A plated cuirass woven from living verdant fibre, retted from the wildgrain of the Green Terraces — light as leaf, yet it wraps the whole torso. Worn, every strike flows like wind through grass (+8% attack speed) — and it visibly re-armours you to every friend.' },
  hushsteel_helm: { name: 'Hushsteel Helm', kind: 'armor', desc: 'A helm of cold hushsteel rung out of echo crystal in a Chime Kiln. Worn, every blow lands with the Hushdark’s weight (a heavier damage band) — visible to every friend.' },
  hushsteel_helm_epic: { name: 'Reverberant Helm', kind: 'armor', desc: 'The Hushsteel Helm transfigured by the fall of the Reverberant — a crested, cold-glowing crown ringed with echo-light. Exactly the same weight in a blow (+2/+3 band); pure, earned style. Only ever taken from that boss.' },

  campfire: { name: 'Campfire', kind: 'structure', desc: 'A cozy fire. Cooks fish, too.', blocks: true },
  torch: { name: 'Torch', kind: 'structure', desc: 'Lights the path.', blocks: false },
  bridge: { name: 'Bridge', kind: 'structure', desc: 'Walk over water.', blocks: false, onWater: true },
  crate: { name: 'Supply Crate', kind: 'structure', desc: 'Shared storage — E to deposit and withdraw. No locks between friends.', blocks: true },
  fruit_basket: { name: 'Fruit Basket', kind: 'structure', desc: 'A welcoming snack pile.', blocks: false },
  golden_idol: { name: 'Golden Idol', kind: 'structure', desc: 'A gleaming trophy dug from a buried treasure. Cannot be crafted.', blocks: true },
  hushdark_reliquary: { name: 'Echo Reliquary', kind: 'structure', desc: 'A cold hushsteel shrine that hums with a swallowed note — the mark of the first Hushdark vault you ever opened. Not craftable; raise it where all can see the puzzle was solved.', blocks: true },
  obsidian_statue: { name: 'Obsidian Statue', kind: 'structure', desc: 'A gleaming black sentinel.', blocks: true },
  guardian_trophy: { name: 'Guardian Trophy', kind: 'structure', desc: 'Proof the Guardian was faced — and bested.', blocks: true },
  brazier: { name: 'Brazier', kind: 'structure', desc: 'An obsidian fire bowl — glows far into the night.', blocks: true },
  signpost: { name: 'Signpost', kind: 'structure', desc: 'Holds a short line of your writing, readable by everyone.', blocks: false },
  // A1 (ADR-0008): the Sawmill is the first real Building — a 2×2 workshop.
  // Any Player may dismantle any Structure for its full refund (no ownership).
  sawmill: { name: 'Sawmill', kind: 'structure', desc: 'A 2×2 timber mill: deposit wood, collect planks after its slow work. The first real Building.', blocks: true, w: 2, h: 2 },
  // A 2×2 workshop with a stone furnace and anvil. Stand beside it to forge the
  // heavy metal gear (Ancient Axe/Pickaxe, Sword, Forgebrand) — they can no longer
  // be made from the pack alone.
  forge: { name: 'Forge', kind: 'structure', desc: 'A 2×2 furnace-and-anvil workshop. Stand close to forge the heavy metal Tools and weapons — the Ancient Axe, Ancient Pickaxe, Sword and Forgebrand can only be made here.', blocks: true, w: 2, h: 2 },
  brine_kiln: { name: 'Brine Kiln', kind: 'structure', desc: 'A 2×2 kiln for the Sunken Mire: deposit salt-reed and collect tideglass after its slow, salt-hot work. The tideglass then crafts the Tideglass Boots.', blocks: true, w: 2, h: 2 },
  chime_kiln: { name: 'Chime Kiln', kind: 'structure', desc: 'A 2×2 kiln for the Hushdark: deposit echo crystal and collect hushsteel after its slow, ringing work. The hushsteel then crafts the Hushsteel Helm.', blocks: true, w: 2, h: 2 },
  verdant_loom: { name: 'Verdant Loom', kind: 'structure', desc: 'A 2×2 loom for the Green Terraces: feed in wildgrain and collect verdant fibre after its slow, patient work. The verdant fibre then crafts the Verdant-woven Cuirass.', blocks: true, w: 2, h: 2 },
  // A3 (ADR-0010): the Village. The Hall founds the Village wherever it is raised
  // and becomes the communal wake point; the four later Buildings are each a
  // tier's milestone; the rest are per-tier decor. Contributions feed one shared,
  // permanent pool — these tiles carry no progress of their own.
  village_hall: { name: 'Village Hall', kind: 'structure', desc: 'Raise it anywhere to found the Village and make it home: everyone wakes here. Stand close and press E to give resources and loot to the communal pool. Re-founding it never resets the Village.', blocks: true, w: 2, h: 2 },
  village_well: { name: 'Village Well', kind: 'structure', desc: 'The Hamlet milestone: raise it in the village zone, with a full pool, to grow the Village from Camp to Hamlet.', blocks: true, w: 2, h: 2 },
  market_square: { name: 'Market Square', kind: 'structure', desc: 'The Village milestone: a bustling stall that carries a Hamlet up to a full Village.', blocks: true, w: 2, h: 2 },
  stone_keep: { name: 'Stone Keep', kind: 'structure', desc: 'The Town milestone: a stout keep that raises a Village into a Town.', blocks: true, w: 2, h: 2 },
  grand_monument: { name: 'Grand Monument', kind: 'structure', desc: 'The Capital milestone: a soaring monument that crowns a Town as a Capital.', blocks: true, w: 2, h: 2 },
  village_banner: { name: 'Village Banner', kind: 'structure', desc: 'A proud banner — the first flourish of a founded Camp.', blocks: false },
  lamp_post: { name: 'Lamp Post', kind: 'structure', desc: 'A wrought lamp that glows warm through a Hamlet night.', blocks: true },
  fountain: { name: 'Fountain', kind: 'structure', desc: 'A tiled fountain, the pride of a proper Village.', blocks: true, w: 2, h: 2 },
  flower_bed: { name: 'Flower Bed', kind: 'structure', desc: 'A bed of blooms brightening a Town square.', blocks: false },
  victory_arch: { name: 'Victory Arch', kind: 'structure', desc: 'A triumphal arch — decor fit for a Capital.', blocks: false, w: 2, h: 1 },
  // ADR-0012 — Wildlife-loot decor. No power, pure cozy expression.
  trophy_mount: { name: 'Trophy Mount', kind: 'structure', desc: 'A mounted trophy from the wilds — proof of the hunt.', blocks: true },
  hide_rug: { name: 'Hide Rug', kind: 'structure', desc: 'A soft hide laid out on the floor.', blocks: false },
};

/** German name + description overlay; kind/blocks/onWater stay from BASE_ITEMS */
const ITEMS_DE: Record<ItemId, { name: string; desc: string }> = {
  wood: { name: 'Holz', desc: 'Von Dschungelbäumen geschlagen.' },
  stone: { name: 'Stein', desc: 'Aus Felsen herausgebrochen.' },
  fiber: { name: 'Fasern', desc: 'Von Ranken geschnitten — braucht eine Machete.' },
  fruit: { name: 'Frucht', desc: 'Von Obststräuchern gepflückt.' },
  saltreed: { name: 'Salzried', desc: 'Blasse, salzverkrustete Riede von den Ufern des Versunkenen Moors. Ein Sole-Ofen härtet sie zu Gezeitenglas.' },
  tideglass: { name: 'Gezeitenglas', desc: 'Seegrünes Glas, im Sole-Ofen aus Salzried gehärtet. Zu Stiefeln verschmolzen trägt es den Sog der Gezeiten in jedem Schritt.' },
  echo_crystal: { name: 'Echokristall', desc: 'Ein kalter, klingender Kristall, aus einer Ader in der Grabesstille geschnitten. Ein Klang-Ofen läutert ihn zu Klangstahl.' },
  hushsteel: { name: 'Klangstahl', desc: 'Kalter, gebläuter Stahl, im Klang-Ofen aus Echokristall geläutert. Zu einem Helm geschmiedet trifft jeder Schlag mit dem Gewicht der Grabesstille.' },
  wildgrain: { name: 'Wildkorn', desc: 'Goldenes Korn, von den reifen Bänken der Grünen Terrassen geerntet. Ein Grünwebstuhl röstet es zu geschmeidiger Grünfaser.' },
  verdant_fibre: { name: 'Grünfaser', desc: 'Geschmeidige grüne Faser, am Grünwebstuhl aus Wildkorn geröstet. Zu einem Kürass verwoben fließt jeder Schlag wie Wind durch Gras.' },
  echo_sigil: { name: 'Echo-Siegel', desc: 'Ein klingendes Siegel, dem Nachhall abgeschlagen — eines pro Woche, in der er fällt. Reines Prestige — es stellt nichts her; gib es dem Dorfvorrat und lass die Tat sprechen.' },
  map_piece: { name: 'Zerrissener Kartenfetzen', desc: 'Ein Fetzen einer alten Schatzkarte. Sammle 3 und ein ✕ erscheint auf deiner Minikarte — grabe dort!' },
  guardian_scale: { name: 'Wächterschuppe', desc: 'Eine steinharte Schuppe, abgeworfen vom Wächter der Ruinen. Jeder Spieler, der in einem siegreichen Kampf einen Treffer landet, verdient sie.' },
  hardwood: { name: 'Uraltes Hartholz', desc: 'Holz der ältesten Bäume — nur eine Uralte Axt kann es schlagen.' },
  obsidian: { name: 'Obsidian', desc: 'Schwarzes Glasgestein — nur eine Uralte Spitzhacke kann es brechen.' },
  fish: { name: 'Fisch', desc: 'Frisch von einer Angelstelle. Brate ihn an einem Lagerfeuer.' },
  plank: { name: 'Brett', desc: 'Holz, im Sägewerk veredelt. Stufe-2-Bauten brauchen veredeltes Holz.' },
  husk_shard: { name: 'Hüllensplitter', desc: 'Stein-und-Ton-Splitter einer gefallenen Hülle im Schacht. Häufig — die Ausbeute eines Schacht-Zugs.' },
  deep_core: { name: 'Tiefenkern', desc: 'Das glühende Herz des Tiefenwächters, verliehen an alle, die gegen ihn kämpften. Selten — schmiedet das Schwert.' },
  cinder_shard: { name: 'Glutsplitter', desc: 'Glühender Splitter einer gefallenen Glut- oder Aschehülle in der Tiefe. Häufig — die Ausbeute eines Tiefen-Zugs.' },
  forge_core: { name: 'Schmiedekern', desc: 'Das weißglühende Herz des Schmiedegeborenen, verliehen an alle, die hinabstiegen und gegen ihn kämpften. Selten — schmiedet den Schmiedebrand.' },
  depth_sigil: { name: 'Tiefensiegel', desc: 'Beweis eines gefällten Bosses in den erzeugten Tiefen (3+), eines pro Stufe. Reines Prestige — es stellt nichts her; gib es dem Dorfvorrat, und lass den Tiefenrekord sprechen.' },
  mire_key: { name: 'Schlüssel zum Versunkenen Moor', desc: 'Ein salzverkrusteter Schlüssel aus verschmolzenem Gezeitenglas, dem gefallenen Moorwächter abgerungen. Trag ihn zum Megalith-Bogen an der Mangrovenküste — eine Drehung öffnet das Versunkene Moor für alle, für immer.' },
  hushdark_key: { name: 'Schlüssel zur Grabesstille', desc: 'Ein kalter Schlüssel aus Klangstahl, der mit einem verschluckten Ton summt, dem gefallenen Echowächter abgerungen. Trag ihn zum Höhlenschlund — eine Drehung öffnet die Grabesstille für alle, für immer.' },
  terrace_key: { name: 'Schlüssel zu den Grünen Terrassen', desc: 'Ein Schlüssel aus lebendiger Grünfaser, dem gefallenen Grünwächter abgerungen. Trag ihn zum Terrassen-Tor am Hang — eine Drehung öffnet die Grünen Terrassen für alle, für immer.' },
  hide: { name: 'Fell', desc: 'Zähes Fell von erjagtem oder gesammeltem Wild. Gib es dem Dorf oder leg es als Teppich aus.' },
  meat: { name: 'Rohes Fleisch', desc: 'Frisches Fleisch von Wild. Brate es am Lagerfeuer für eine herzhafte Mahlzeit, die deinen Schritt beschleunigt.' },
  trophy: { name: 'Wildtrophäe', desc: 'Ein prächtiges Geweih oder Fangzahn aus der Wildnis — selten. Häng sie auf oder zier den Dorfvorrat damit.' },

  axe: { name: 'Axt', desc: 'Fällt Bäume doppelt so schnell.' },
  pickaxe: { name: 'Spitzhacke', desc: 'Bricht Felsen doppelt so schnell.' },
  machete: { name: 'Machete', desc: 'Nötig, um Faserranken zu schneiden.' },
  hammer: { name: 'Hammer', desc: 'Nötig, um Wände und Brücken zu bauen.' },
  ancient_axe: { name: 'Uralte Axt', desc: 'Erntet uraltes Hartholz; in der Hand fällt sie Bäume doppelt so schnell und trifft den Wächter mit einem schweren, breiten Schadensband voller Krits.' },
  ancient_pickaxe: { name: 'Uralte Spitzhacke', desc: 'Erntet Obsidian; in der Hand bricht sie Felsen doppelt so schnell und trifft den Wächter schnell und stetig.' },
  fishing_rod: { name: 'Angelrute', desc: 'An einer Angelstelle auswerfen und auf den Biss warten. Wirkt nur in der Hand.' },
  bow: { name: 'Bogen', desc: 'Verschießt Pfeile aus der Ferne auf den Wächter in einem Augenfenster — sicher, aber geringere DPS als Nahkampf, keine Munition. Vor dem ersten Kampf herstellbar.' },
  hand_torch: { name: 'Handfackel', desc: 'Halte sie, um deinen Weg nachts mit warmem orangem Schein zu erleuchten. Nicht zu verwechseln mit der platzierten Fackel.' },
  mirefang: { name: 'Moorzahn', desc: 'Eine soleschmiedete Klinge, dem gefallenen Moorwächter abgerungen — die Beute für alle, die ihn trafen. Eine reine Kampfwaffe, die Wächter, Hüllen und den Wächter der Ruinen gleichermaßen trifft; getragen watet ihr Träger ungebremst durch die Gezeiten des Versunkenen Moors.' },
  sword: { name: 'Schwert', desc: 'Der Lohn des Schachts: eine reine Kampfklinge — sie gibt keinen Ernte-Bonus und schaltet keinen Knotenpunkt frei, trifft aber Hüllen, den Tiefenwächter und den Wächter eine klare Stufe härter als die Uralte Axt.' },
  forgebrand: { name: 'Schmiedebrand', desc: 'Der Lohn der Tiefe: ein reiner Kampf-Zweihänder aus Magma — kein Ernte-Bonus, kein Knotenpunkt. Er schwingt langsamer als das Schwert, landet aber das schwerste geschmiedete Schadensband des Spiels — unterm Strich die stärkste geschmiedete Waffe — und trifft Hüllen, beide Bosse und den Wächter.' },
  fabled_sword: { name: 'Sagenhaftes Schwert', desc: 'Eine legendäre Klinge, makellos zwischen den Ruinen — eine seltene Beute, die nur ein gefallener Boss hergibt (~1%). Die schärfste Nahkampfwaffe überhaupt: ein schnelles, kritstarkes Band eine Stufe über dem geschmiedeten Schwert.' },
  fabled_axe: { name: 'Sagenhafte Axt', desc: 'Eine legendäre Streitaxt, einem gefallenen Boss an den seltensten Tagen entrissen (~1%). Schwer, breit und brutal — die größten Krits pro Schlag im Spiel, eine Stufe über der Uralten Axt.' },
  fabled_bow: { name: 'Sagenhafter Bogen', desc: 'Ein legendärer Langbogen, von einem gefallenen Boss fallen gelassen (~1%). Verschießt Pfeile aus der Ferne wie der einfache Bogen, trifft aber deutlich härter und schneller — der sichere Weg, eine geschmiedete Nahkampfwaffe zu übertreffen.' },

  summon_totem: { name: 'Beschwörungstotem', desc: 'Eine Opfergabe für den Arena-Altar — weckt den Wächter. Beim Beschwören verbraucht.' },
  mire_totem: { name: 'Totem des Moorwächters', desc: 'Ein Totem aus Hartholz und Obsidian, geschmiedet für den Altar an der Mangrovenküste. Ist die Opfergabe des Altars vollbracht, weckt es den Moorwächter. Beim Beschwören verbraucht.' },
  echo_totem: { name: 'Totem des Echowächters', desc: 'Ein Totem aus Salzried und Gezeitenglas, geschmiedet für den Altar am Höhlenschlund. Ist die Opfergabe des Altars vollbracht, weckt es den Echowächter. Beim Beschwören verbraucht.' },
  verdant_totem: { name: 'Totem des Grünwächters', desc: 'Ein Totem aus Echokristall und Klangstahl, geschmiedet für den Altar am terrassierten Hang. Ist die Opfergabe des Altars vollbracht, weckt es den Grünwächter. Beim Beschwören verbraucht.' },
  chime_charm: { name: 'Klang-Amulett', desc: 'Ein kleines Glöckchen aus Klangstahl. Gib es an einem Podest in der Grabesstille aus, um eine Echo-Aufnahme scharf zu stellen — ein Schatten deiner selbst, der seine Schleife für immer läuft.' },
  cooked_fish: { name: 'Gebratener Fisch', desc: 'Warm und herzhaft. Ihn zu essen beschleunigt deinen Schritt für eine Weile.' },
  cooked_meat: { name: 'Gebratenes Fleisch', desc: 'Am Lagerfeuer geröstet. Es zu essen beschleunigt deinen Schritt für eine Weile — dieselbe Wärme wie gebratener Fisch.' },
  grasweave_ration: { name: 'Grasgewebe-Ration', desc: 'Eine gepresste Ration aus Wildkorn, mit Grünfaser gebunden. Sie zu essen beschleunigt deinen Schritt für eine Weile — dieselbe Wärme wie gebratener Fisch.' },

  tideglass_boots: { name: 'Gezeitenglas-Stiefel', desc: 'Stiefel, beschlagen mit seegrünem Gezeitenglas, im Sole-Ofen aus Salzried gehärtet. Getragen liegt der Sog der Gezeiten in jedem Schritt (+8% Tempo) — und jeder sieht sie an dir.' },
  verdant_cuirass: { name: 'Grüngewebter Brustpanzer', desc: 'Ein geplatteter Kürass, gewebt aus lebendiger Grünfaser, aus dem Wildkorn der Grünen Terrassen geröstet — blattleicht und doch den ganzen Oberkörper umschließend. Getragen fließt jeder Schlag wie Wind durch Gras (+8% Angriffstempo) — und er panzert dich für alle Freunde sichtbar neu.' },
  hushsteel_helm: { name: 'Klangstahl-Helm', desc: 'Ein Helm aus kaltem Klangstahl, im Klang-Ofen aus Echokristall geläutert. Getragen trifft jeder Schlag mit dem Gewicht der Grabesstille (ein schwereres Schadensband) — für alle Freunde sichtbar.' },
  hushsteel_helm_epic: { name: 'Nachhall-Helm', desc: 'Der Klangstahl-Helm, verklärt durch den Fall des Nachhalls — eine gekrönte, kalt leuchtende Krone, umringt von Echo-Licht. Exakt dasselbe Gewicht im Schlag (+2/+3-Band); reine, verdiente Optik. Nur je von diesem Boss zu erbeuten.' },

  campfire: { name: 'Lagerfeuer', desc: 'Ein gemütliches Feuer. Brät auch Fisch.' },
  torch: { name: 'Fackel', desc: 'Erleuchtet den Weg.' },
  bridge: { name: 'Brücke', desc: 'Über Wasser gehen.' },
  crate: { name: 'Vorratskiste', desc: 'Geteilter Speicher — E zum Ein- und Auslagern. Keine Schlösser unter Freunden.' },
  fruit_basket: { name: 'Obstkorb', desc: 'Ein einladender Snack-Haufen.' },
  golden_idol: { name: 'Goldenes Götzenbild', desc: 'Eine glänzende Trophäe, aus einem vergrabenen Schatz gegraben. Nicht herstellbar.' },
  hushdark_reliquary: { name: 'Echo-Reliquie', desc: 'Ein kalter Schrein aus Klangstahl, der mit einem verschluckten Ton summt — das Zeichen des ersten Gewölbes der Grabesstille, das du je geöffnet hast. Nicht herstellbar; richte ihn auf, wo alle sehen, dass das Rätsel gelöst wurde.' },
  obsidian_statue: { name: 'Obsidianstatue', desc: 'Ein glänzender schwarzer Wächter.' },
  guardian_trophy: { name: 'Wächtertrophäe', desc: 'Beweis, dass der Wächter gestellt — und bezwungen — wurde.' },
  brazier: { name: 'Kohlenbecken', desc: 'Eine Feuerschale aus Obsidian — glüht weit in die Nacht.' },
  signpost: { name: 'Wegweiser', desc: 'Trägt eine kurze Zeile deiner Schrift, für alle lesbar.' },
  sawmill: { name: 'Sägewerk', desc: 'Eine 2×2-Holzmühle: Holz einlegen, Bretter holen, wenn ihre langsame Arbeit getan ist. Das erste echte Gebäude.' },
  forge: { name: 'Schmiede', desc: 'Eine 2×2-Werkstatt aus Ofen und Amboss. Stell dich nah heran, um die schweren Metallwerkzeuge und -waffen zu schmieden — Uralte Axt, Uralte Spitzhacke, Schwert und Schmiedebrand lassen sich nur hier fertigen.' },
  brine_kiln: { name: 'Sole-Ofen', desc: 'Ein 2×2-Ofen für das Versunkene Moor: Salzried einlegen und Gezeitenglas holen, wenn seine langsame, salzheiße Arbeit getan ist. Aus dem Gezeitenglas entstehen die Gezeitenglas-Stiefel.' },
  chime_kiln: { name: 'Klang-Ofen', desc: 'Ein 2×2-Ofen für die Grabesstille: Echokristall einlegen und Klangstahl holen, wenn seine langsame, klingende Arbeit getan ist. Aus dem Klangstahl entsteht der Klangstahl-Helm.' },
  verdant_loom: { name: 'Grünwebstuhl', desc: 'Ein 2×2-Webstuhl für die Grünen Terrassen: Wildkorn einlegen und Grünfaser holen, wenn seine langsame, geduldige Arbeit getan ist. Aus der Grünfaser entsteht der Grüngewebte Brustpanzer.' },
  village_hall: { name: 'Dorfhalle', desc: 'Errichte sie irgendwo, um das Dorf zu gründen und zur Heimat zu machen: Alle erwachen hier. Stell dich nah heran und drücke E, um Ressourcen und Beute in den gemeinsamen Vorrat zu geben. Ein Neugründen setzt das Dorf nie zurück.' },
  village_well: { name: 'Dorfbrunnen', desc: 'Der Weiler-Meilenstein: Errichte ihn in der Dorfzone bei vollem Vorrat, um aus dem Lager einen Weiler zu machen.' },
  market_square: { name: 'Marktplatz', desc: 'Der Dorf-Meilenstein: ein belebter Stand, der einen Weiler zum vollen Dorf erhebt.' },
  stone_keep: { name: 'Steinfeste', desc: 'Der Stadt-Meilenstein: eine wehrhafte Feste, die ein Dorf zur Stadt macht.' },
  grand_monument: { name: 'Großes Monument', desc: 'Der Hauptstadt-Meilenstein: ein ragendes Monument, das eine Stadt zur Hauptstadt krönt.' },
  village_banner: { name: 'Dorfbanner', desc: 'Ein stolzes Banner — der erste Schmuck eines gegründeten Lagers.' },
  lamp_post: { name: 'Laternenpfahl', desc: 'Eine schmiedeeiserne Laterne, die warm durch eine Weiler-Nacht leuchtet.' },
  fountain: { name: 'Springbrunnen', desc: 'Ein gekachelter Brunnen, der Stolz eines echten Dorfes.' },
  flower_bed: { name: 'Blumenbeet', desc: 'Ein Beet voller Blüten, das einen Stadtplatz erhellt.' },
  victory_arch: { name: 'Triumphbogen', desc: 'Ein Triumphbogen — Zierde einer Hauptstadt.' },
  trophy_mount: { name: 'Trophäenbrett', desc: 'Eine aufgehängte Trophäe aus der Wildnis — Beweis der Jagd.' },
  hide_rug: { name: 'Fellteppich', desc: 'Ein weiches Fell, auf dem Boden ausgelegt.' },
};

/** ITEMS in the session's language: German overlays name/desc onto the English base */
export const ITEMS: Record<ItemId, ItemDef> =
  getLang() === 'de'
    ? (Object.fromEntries(
        (Object.entries(BASE_ITEMS) as [ItemId, ItemDef][]).map(([id, def]) => [id, { ...def, ...ITEMS_DE[id] }]),
      ) as Record<ItemId, ItemDef>)
    : BASE_ITEMS;
