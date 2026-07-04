import { getLang } from '../i18n';

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
  | 'plank'
  // Dungeons v1 (ADR-0007) — Delve drops that craft the Sword
  | 'husk_shard'
  | 'deep_core';
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
  // Dungeons v1 (ADR-0007) — the first pure-combat Tool: no harvest use
  | 'sword';
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

const BASE_ITEMS: Record<ItemId, ItemDef> = {
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
  husk_shard: { name: 'Husk Shard', kind: 'resource', desc: 'Stone-and-clay shrapnel from a felled Husk in the Delve. Common — the farm of a Dungeon run.' },
  deep_core: { name: 'Deep Core', kind: 'resource', desc: 'The molten heart of the Deep Guardian, granted to everyone who fought it. Rare — forges the Sword.' },

  axe: { name: 'Axe', kind: 'tool', desc: 'Chops trees twice as fast.' },
  pickaxe: { name: 'Pickaxe', kind: 'tool', desc: 'Breaks rocks twice as fast.' },
  machete: { name: 'Machete', kind: 'tool', desc: 'Required to cut fiber vines.' },
  hammer: { name: 'Hammer', kind: 'tool', desc: 'Required to build walls and bridges.' },
  ancient_axe: { name: 'Ancient Axe', kind: 'tool', desc: 'Harvests ancient hardwood; in hand it chops trees twice as fast and strikes the Guardian with a heavy, wide, high-crit damage band.' },
  ancient_pickaxe: { name: 'Ancient Pickaxe', kind: 'tool', desc: 'Harvests obsidian; in hand it breaks rocks twice as fast and strikes the Guardian fast and steady.' },
  fishing_rod: { name: 'Fishing Rod', kind: 'tool', desc: 'Cast at a fishing spot and wait for the bite. Works only while in hand.' },
  bow: { name: 'Bow', kind: 'tool', desc: 'Looses arrows at the Guardian from range in an Eye Window — safe but lower DPS than melee, no ammo. Craftable before the first fight.' },
  hand_torch: { name: 'Hand Torch', kind: 'tool', desc: 'Hold it to light your way with a warm orange glow at night. Distinct from the placed Torch.' },
  sword: { name: 'Sword', kind: 'tool', desc: 'The Delve’s reward: a pure-combat blade — it grants no gathering bonus and unlocks no Node, but strikes Husks, the Deep Guardian, and the Guardian with the game’s heaviest melee band.' },

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

/** German name + description overlay; kind/blocks/onWater stay from BASE_ITEMS */
const ITEMS_DE: Record<ItemId, { name: string; desc: string }> = {
  wood: { name: 'Holz', desc: 'Von Dschungelbäumen geschlagen.' },
  stone: { name: 'Stein', desc: 'Aus Felsen herausgebrochen.' },
  fiber: { name: 'Fasern', desc: 'Von Ranken geschnitten — braucht eine Machete.' },
  fruit: { name: 'Frucht', desc: 'Von Obststräuchern gepflückt.' },
  map_piece: { name: 'Zerrissener Kartenfetzen', desc: 'Ein Fetzen einer alten Schatzkarte. Sammle 3 und ein ✕ erscheint auf deiner Minikarte — grabe dort!' },
  guardian_scale: { name: 'Wächterschuppe', desc: 'Eine steinharte Schuppe, abgeworfen vom Wächter der Ruinen. Jeder Spieler, der in einem siegreichen Kampf einen Treffer landet, verdient sie.' },
  hardwood: { name: 'Uraltes Hartholz', desc: 'Holz der ältesten Bäume — nur eine Uralte Axt kann es schlagen.' },
  obsidian: { name: 'Obsidian', desc: 'Schwarzes Glasgestein — nur eine Uralte Spitzhacke kann es brechen.' },
  fish: { name: 'Fisch', desc: 'Frisch von einer Angelstelle. Brate ihn an einem Lagerfeuer.' },
  plank: { name: 'Brett', desc: 'Holz, im Sägewerk veredelt. Stufe-2-Bauten brauchen veredeltes Holz.' },
  husk_shard: { name: 'Hüllensplitter', desc: 'Stein-und-Ton-Splitter einer gefallenen Hülle im Schacht. Häufig — die Ausbeute eines Schacht-Zugs.' },
  deep_core: { name: 'Tiefenkern', desc: 'Das glühende Herz des Tiefenwächters, verliehen an alle, die gegen ihn kämpften. Selten — schmiedet das Schwert.' },

  axe: { name: 'Axt', desc: 'Fällt Bäume doppelt so schnell.' },
  pickaxe: { name: 'Spitzhacke', desc: 'Bricht Felsen doppelt so schnell.' },
  machete: { name: 'Machete', desc: 'Nötig, um Faserranken zu schneiden.' },
  hammer: { name: 'Hammer', desc: 'Nötig, um Wände und Brücken zu bauen.' },
  ancient_axe: { name: 'Uralte Axt', desc: 'Erntet uraltes Hartholz; in der Hand fällt sie Bäume doppelt so schnell und trifft den Wächter mit einem schweren, breiten Schadensband voller Krits.' },
  ancient_pickaxe: { name: 'Uralte Spitzhacke', desc: 'Erntet Obsidian; in der Hand bricht sie Felsen doppelt so schnell und trifft den Wächter schnell und stetig.' },
  fishing_rod: { name: 'Angelrute', desc: 'An einer Angelstelle auswerfen und auf den Biss warten. Wirkt nur in der Hand.' },
  bow: { name: 'Bogen', desc: 'Verschießt Pfeile aus der Ferne auf den Wächter in einem Augenfenster — sicher, aber geringere DPS als Nahkampf, keine Munition. Vor dem ersten Kampf herstellbar.' },
  hand_torch: { name: 'Handfackel', desc: 'Halte sie, um deinen Weg nachts mit warmem orangem Schein zu erleuchten. Nicht zu verwechseln mit der platzierten Fackel.' },
  sword: { name: 'Schwert', desc: 'Der Lohn des Schachts: eine reine Kampfklinge — sie gibt keinen Ernte-Bonus und schaltet keinen Knotenpunkt frei, trifft aber Hüllen, den Tiefenwächter und den Wächter mit dem schwersten Nahkampfband des Spiels.' },

  summon_totem: { name: 'Beschwörungstotem', desc: 'Eine Opfergabe für den Arena-Altar — weckt den Wächter. Beim Beschwören verbraucht.' },
  cooked_fish: { name: 'Gebratener Fisch', desc: 'Warm und herzhaft. Ihn zu essen beschleunigt deinen Schritt für eine Weile.' },

  campfire: { name: 'Lagerfeuer', desc: 'Ein gemütliches Feuer. Brät auch Fisch.' },
  torch: { name: 'Fackel', desc: 'Erleuchtet den Weg.' },
  hut_wall: { name: 'Hüttenwand', desc: 'Ein stabiles Wandsegment.' },
  bridge: { name: 'Brücke', desc: 'Über Wasser gehen.' },
  crate: { name: 'Vorratskiste', desc: 'Geteilter Speicher — E zum Ein- und Auslagern. Keine Schlösser unter Freunden.' },
  tiki_statue: { name: 'Tiki-Statue', desc: 'Wacht über den Dschungel.' },
  fruit_basket: { name: 'Obstkorb', desc: 'Ein einladender Snack-Haufen.' },
  golden_idol: { name: 'Goldenes Götzenbild', desc: 'Eine glänzende Trophäe, aus einem vergrabenen Schatz gegraben. Nicht herstellbar.' },
  obsidian_statue: { name: 'Obsidianstatue', desc: 'Ein glänzender schwarzer Wächter.' },
  hardwood_arch: { name: 'Hartholzbogen', desc: 'Ein prächtiges Tor aus uraltem Holz.' },
  guardian_trophy: { name: 'Wächtertrophäe', desc: 'Beweis, dass der Wächter gestellt — und bezwungen — wurde.' },
  obsidian_path: { name: 'Obsidianpfad', desc: 'Eine polierte schwarze Pflasterkachel.' },
  brazier: { name: 'Kohlenbecken', desc: 'Eine Feuerschale aus Obsidian — glüht weit in die Nacht.' },
  hammock: { name: 'Hängematte', desc: 'Dein persönlicher Erwachungspunkt: Erschöpfung und Anmeldung setzen dich hierher. Eine aktive Hängematte pro Spieler.' },
  signpost: { name: 'Wegweiser', desc: 'Trägt eine kurze Zeile deiner Schrift, für alle lesbar.' },
  sawmill: { name: 'Sägewerk', desc: 'Holz einlegen; Bretter holen, nachdem das Werk seine langsame Arbeit getan hat.' },
  table: { name: 'Tisch', desc: 'Ein stabiler Brettertisch fürs Lager.' },
};

/** ITEMS in the session's language: German overlays name/desc onto the English base */
export const ITEMS: Record<ItemId, ItemDef> =
  getLang() === 'de'
    ? (Object.fromEntries(
        (Object.entries(BASE_ITEMS) as [ItemId, ItemDef][]).map(([id, def]) => [id, { ...def, ...ITEMS_DE[id] }]),
      ) as Record<ItemId, ItemDef>)
    : BASE_ITEMS;
