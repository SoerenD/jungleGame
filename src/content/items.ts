import { getLang } from '../i18n';

export type ResourceId =
  | 'wood'
  | 'stone'
  | 'fiber'
  | 'fruit'
  // the Sunken Mire's raw Resource (ADR-0017 rung 1: salt-reed → tideglass)
  | 'saltreed'
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
  | 'table'
  // the Forge: a crafting station where the heavy forged tools/weapons are made
  | 'forge'
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
export type ConsumableId = 'summon_totem' | 'cooked_fish' | 'cooked_meat';
export type ItemId = ResourceId | ToolId | StructureId | ConsumableId;

export interface ItemDef {
  name: string;
  kind: 'resource' | 'tool' | 'structure' | 'consumable' | 'food';
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
  saltreed: { name: 'Salt-Reed', kind: 'resource', desc: 'Pale brine-crusted reeds cut from the banks of the Sunken Mire. One day a Brine Kiln will temper them into tideglass.' },
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
  sword: { name: 'Sword', kind: 'tool', desc: 'The Delve’s reward: a pure-combat blade — it grants no gathering bonus and unlocks no Node, but strikes Husks, the Deep Guardian, and the Guardian with the game’s heaviest melee band.' },
  forgebrand: { name: 'Forgebrand', kind: 'tool', desc: 'The Deep’s reward: a pure-combat molten two-hander — no gathering bonus, no Node. It swings slower than the Sword but lands a heavier per-hit band (net damage on par), and strikes Husks, both bosses, and the Guardian alike.' },
  // Fabled set — the rarest reward in the game: a ~1% drop from ANY boss, one tier
  // above every crafted weapon. Pure combat, no gathering use; each strikes Husks,
  // both Delve bosses, and the Guardian.
  fabled_sword: { name: 'Fabled Sword', kind: 'tool', desc: 'A legendary blade, whole and unblemished among the ruins — a rare prize taken only from a fallen boss (~1%). The keenest melee weapon there is: a fast, high-crit band a clear step above the crafted Sword.' },
  fabled_axe: { name: 'Fabled Axe', kind: 'tool', desc: 'A legendary war-axe, wrenched from a fallen boss on the rarest of days (~1%). Heavy, wide and brutal — the biggest per-swing crits in the game, one tier above the Ancient Axe.' },
  fabled_bow: { name: 'Fabled Bow', kind: 'tool', desc: 'A legendary longbow dropped by a fallen boss (~1%). Looses arrows from range like the plain Bow, but hits far harder and faster — the safe way to out-damage a crafted melee weapon.' },

  summon_totem: { name: 'Summoning Totem', kind: 'consumable', desc: 'An Offering for the arena altar — wakes the Guardian. Consumed on summon.' },
  cooked_fish: { name: 'Cooked Fish', kind: 'food', desc: 'Warm and hearty. Eating it quickens your step for a while.' },
  cooked_meat: { name: 'Cooked Meat', kind: 'food', desc: 'Roasted at a campfire. Eating it quickens your step for a while — the same warmth a cooked fish gives.' },

  campfire: { name: 'Campfire', kind: 'structure', desc: 'A cozy fire. Cooks fish, too.', blocks: true },
  torch: { name: 'Torch', kind: 'structure', desc: 'Lights the path.', blocks: false },
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
  // A1 (ADR-0008): the Sawmill is the first real Building — a 2×2 workshop.
  // Any Player may dismantle any Structure for its full refund (no ownership).
  sawmill: { name: 'Sawmill', kind: 'structure', desc: 'A 2×2 timber mill: deposit wood, collect planks after its slow work. The first real Building.', blocks: true, w: 2, h: 2 },
  table: { name: 'Table', kind: 'structure', desc: 'A sturdy plank table for the camp.', blocks: true },
  // A 2×2 workshop with a stone furnace and anvil. Stand beside it to forge the
  // heavy metal gear (Ancient Axe/Pickaxe, Sword, Forgebrand) — they can no longer
  // be made from the pack alone.
  forge: { name: 'Forge', kind: 'structure', desc: 'A 2×2 furnace-and-anvil workshop. Stand close to forge the heavy metal Tools and weapons — the Ancient Axe, Ancient Pickaxe, Sword and Forgebrand can only be made here.', blocks: true, w: 2, h: 2 },
  // A3 (ADR-0010): the Village. The Hall founds the Village wherever it is raised
  // and becomes the communal wake point; the four later Buildings are each a
  // tier's milestone; the rest are per-tier decor. Contributions feed one shared,
  // permanent pool — these tiles carry no progress of their own.
  village_hall: { name: 'Village Hall', kind: 'structure', desc: 'Raise it anywhere to found the Village and make it home: everyone without a Hammock wakes here. Stand close and press E to give resources and loot to the communal pool. Re-founding it never resets the Village.', blocks: true, w: 2, h: 2 },
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
  saltreed: { name: 'Salzried', desc: 'Blasse, salzverkrustete Riede von den Ufern des Versunkenen Moors. Eines Tages wird ein Sole-Ofen sie zu Gezeitenglas härten.' },
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
  sword: { name: 'Schwert', desc: 'Der Lohn des Schachts: eine reine Kampfklinge — sie gibt keinen Ernte-Bonus und schaltet keinen Knotenpunkt frei, trifft aber Hüllen, den Tiefenwächter und den Wächter mit dem schwersten Nahkampfband des Spiels.' },
  forgebrand: { name: 'Schmiedebrand', desc: 'Der Lohn der Tiefe: ein reiner Kampf-Zweihänder aus Magma — kein Ernte-Bonus, kein Knotenpunkt. Er schwingt langsamer als das Schwert, landet aber ein schwereres Schadensband (unterm Strich gleichauf), und trifft Hüllen, beide Bosse und den Wächter.' },
  fabled_sword: { name: 'Sagenhaftes Schwert', desc: 'Eine legendäre Klinge, makellos zwischen den Ruinen — eine seltene Beute, die nur ein gefallener Boss hergibt (~1%). Die schärfste Nahkampfwaffe überhaupt: ein schnelles, kritstarkes Band eine Stufe über dem geschmiedeten Schwert.' },
  fabled_axe: { name: 'Sagenhafte Axt', desc: 'Eine legendäre Streitaxt, einem gefallenen Boss an den seltensten Tagen entrissen (~1%). Schwer, breit und brutal — die größten Krits pro Schlag im Spiel, eine Stufe über der Uralten Axt.' },
  fabled_bow: { name: 'Sagenhafter Bogen', desc: 'Ein legendärer Langbogen, von einem gefallenen Boss fallen gelassen (~1%). Verschießt Pfeile aus der Ferne wie der einfache Bogen, trifft aber deutlich härter und schneller — der sichere Weg, eine geschmiedete Nahkampfwaffe zu übertreffen.' },

  summon_totem: { name: 'Beschwörungstotem', desc: 'Eine Opfergabe für den Arena-Altar — weckt den Wächter. Beim Beschwören verbraucht.' },
  cooked_fish: { name: 'Gebratener Fisch', desc: 'Warm und herzhaft. Ihn zu essen beschleunigt deinen Schritt für eine Weile.' },
  cooked_meat: { name: 'Gebratenes Fleisch', desc: 'Am Lagerfeuer geröstet. Es zu essen beschleunigt deinen Schritt für eine Weile — dieselbe Wärme wie gebratener Fisch.' },

  campfire: { name: 'Lagerfeuer', desc: 'Ein gemütliches Feuer. Brät auch Fisch.' },
  torch: { name: 'Fackel', desc: 'Erleuchtet den Weg.' },
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
  sawmill: { name: 'Sägewerk', desc: 'Eine 2×2-Holzmühle: Holz einlegen, Bretter holen, wenn ihre langsame Arbeit getan ist. Das erste echte Gebäude.' },
  table: { name: 'Tisch', desc: 'Ein stabiler Brettertisch fürs Lager.' },
  forge: { name: 'Schmiede', desc: 'Eine 2×2-Werkstatt aus Ofen und Amboss. Stell dich nah heran, um die schweren Metallwerkzeuge und -waffen zu schmieden — Uralte Axt, Uralte Spitzhacke, Schwert und Schmiedebrand lassen sich nur hier fertigen.' },
  village_hall: { name: 'Dorfhalle', desc: 'Errichte sie irgendwo, um das Dorf zu gründen und zur Heimat zu machen: Jeder ohne Hängematte erwacht hier. Stell dich nah heran und drücke E, um Ressourcen und Beute in den gemeinsamen Vorrat zu geben. Ein Neugründen setzt das Dorf nie zurück.' },
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
