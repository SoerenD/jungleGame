/**
 * The Journey: the per-Player onboarding checklist (CONTEXT.md). Sequential
 * objectives from first wood to the first Seal Offering, shown in a small HUD
 * tracker until complete. Steps auto-complete from what a Player has already
 * done; contextual key hints retire after a few uses.
 */
import { pick } from '../i18n';
import type { Inventory, JourneyState, JourneyStepId, QuestState, SealState, WardenWorldState } from '../backend/types';
import { gearOwns, type EquippedGear } from './armor';
import type { VillageRecord } from './village';

/**
 * Is `item` in the bag OR anywhere on the body (armor slots + weapon slots)?
 * Every gear-proven step must use this: equipping MOVES the piece out of the
 * bag, so a bag-only check would UN-TICK the step the moment the reward is
 * worn — and the chained tracker would pin on a rung the player already beat.
 */
function ownsAnywhere(p: { inventory: Inventory; equipped?: EquippedGear | null }, item: string): boolean {
  if ((p.inventory[item as keyof Inventory] ?? 0) > 0) return true;
  return Object.values(p.equipped ?? {}).includes(item as never);
}

export const JOURNEY_STEPS: { id: JourneyStepId; label: string }[] = [
  { id: 'gather_wood', label: pick('Gather wood', 'Holz sammeln') },
  { id: 'craft_axe', label: pick('Craft an axe', 'Eine Axt herstellen') },
  { id: 'harvest_stone', label: pick('Harvest stone', 'Stein abbauen') },
  { id: 'place_campfire', label: pick('Place a campfire', 'Ein Lagerfeuer platzieren') },
  { id: 'read_tablet', label: pick('Read an ancient tablet', 'Eine uralte Steintafel lesen') },
  { id: 'visit_seal', label: pick('Visit the Seal at the Ruins', 'Das Siegel bei den Ruinen besuchen') },
  { id: 'first_offering', label: pick('Lay your first Offering upon the Seal', 'Deine erste Opfergabe auf das Siegel legen') },
];

/** contextual key hints; each retires after HINT_RETIRE_USES successful uses */
export type HintId = 'gather' | 'read' | 'place';
export const HINT_RETIRE_USES = 3;

export function journeyComplete(j: JourneyState): boolean {
  return JOURNEY_STEPS.every((s) => j.steps[s.id]);
}

/**
 * The Delve quest ("Into the Delve"): the post-onboarding arc that takes over the
 * HUD tracker once The Journey is done, guiding a Player all the way to and into
 * the first Dungeon (ADR-0007). Every step auto-ticks from state the HUD already
 * has (the Seal, the inventory, the quest flags) — no new persistence: Guardian
 * Scales prove the Guardian was bested, the Ancient Pickaxe is the shaft key, and
 * a Husk Shard / Deep Core in the pack proves you actually delved.
 */
export interface DelveProgress {
  seal: SealState | null;
  inventory: Inventory;
  quest: QuestState | null;
  /** does at least one Sawmill stand in the World? (a world-flag proxy, like the Seal) */
  sawmillBuilt: boolean;
  /** the communal Village record — `hall !== null` means it has been founded */
  village: VillageRecord | null;
  /** the worn gear — a slotted Ancient Pickaxe leaves the bag, so the forge
   *  step must also accept it in a weapon slot */
  equipped?: EquippedGear | null;
}

export const DELVE_QUEST_STEPS: { id: string; label: string; done: (p: DelveProgress) => boolean }[] = [
  // the two groundwork steps first: a Sawmill (planks for tier-2 gear) and a
  // founded Village (your anchor — where Exhaustion in the Delve wakes you).
  { id: 'build_sawmill', label: pick('Build a Sawmill', 'Ein Sägewerk bauen'), done: (p) => p.sawmillBuilt },
  { id: 'found_village', label: pick('Found a Village — raise the Hall', 'Ein Dorf gründen — die Halle errichten'), done: (p) => !!p.village?.hall },
  { id: 'break_seal', label: pick('Break the Seal at the Ruins', 'Das Siegel bei den Ruinen brechen'), done: (p) => !!p.seal?.broken },
  // scales get CONSUMED by the tier-2 forges — the forged gear itself stays proof
  { id: 'best_guardian', label: pick('Defeat the Guardian — earn Guardian Scales', 'Den Wächter bezwingen — Wächterschuppen verdienen'), done: (p) => (p.inventory.guardian_scale ?? 0) > 0 || ownsAnywhere(p, 'ancient_axe') || ownsAnywhere(p, 'ancient_pickaxe') || (p.inventory.fishing_rod ?? 0) > 0 },
  { id: 'forge_pickaxe', label: pick('Forge an Ancient Pickaxe', 'Eine Uralte Spitzhacke schmieden'), done: (p) => gearOwns(p.inventory, p.equipped, 'ancient_pickaxe') },
  { id: 'open_shaft', label: pick('Clear the sealed mine shaft at The Cavern Mouth', 'Den versiegelten Minenschacht am Höhlenschlund freilegen'), done: (p) => !!p.quest?.delveOpen },
  // shards/cores get CONSUMED forging the Sword/Forgebrand — the blade stays proof
  { id: 'descend', label: pick('Descend into the Delve and claim its spoils', 'In den Schacht hinabsteigen und seine Beute holen'), done: (p) => (p.inventory.husk_shard ?? 0) > 0 || (p.inventory.deep_core ?? 0) > 0 || (p.inventory.cinder_shard ?? 0) > 0 || (p.inventory.forge_core ?? 0) > 0 || ownsAnywhere(p, 'sword') || ownsAnywhere(p, 'forgebrand') },
];

export function delveQuestComplete(p: DelveProgress): boolean {
  return DELVE_QUEST_STEPS.every((s) => s.done(p));
}

/**
 * The Mire quest ("The Sunken Mire", ADR-0017 rung 1): the arc from the Mangrove
 * Coast altar to the first piece of Warden Armor. Like the Delve quest every step
 * auto-ticks from state the HUD already has (the Warden altar/gate flags + the
 * inventory) — no new persistence: the Mire Key proves the Warden was bested, a
 * tideglass in the pack proves the Brine Kiln ran, the Boots prove the chain closed.
 */
export interface MireProgress {
  inventory: Inventory;
  /** the per-Warden altar/gate progress (backend `wardens` snapshot) */
  wardens: Record<string, WardenWorldState> | null;
  /** the worn gear — the crafted Boots are WORN by moving them out of the bag */
  equipped?: EquippedGear | null;
}

export const MIRE_QUEST_STEPS: { id: string; label: string; done: (p: MireProgress) => boolean }[] = [
  { id: 'mire_offering', label: pick('Complete the Offering at the Mangrove Coast altar', 'Die Opfergabe am Altar der Mangrovenküste vollenden'), done: (p) => !!p.wardens?.mire?.altar.broken },
  { id: 'best_mire', label: pick('Defeat the Mire Warden — earn the Mirefang & Mire Key', 'Den Moorwächter bezwingen — Moorzahn & Moor-Schlüssel verdienen'), done: (p) => (p.inventory.mire_key ?? 0) > 0 },
  { id: 'open_mire_gate', label: pick('Open the gate to the Sunken Mire', 'Das Tor zum Versunkenen Moor öffnen'), done: (p) => !!p.wardens?.mire?.gateOpen },
  // tideglass gets CONSUMED by the boots/totems — the crafted Boots stay proof
  { id: 'refine_tideglass', label: pick('Temper salt-reed into tideglass at a Brine Kiln', 'Salzried im Sole-Ofen zu Gezeitenglas härten'), done: (p) => (p.inventory.tideglass ?? 0) > 0 || ownsAnywhere(p, 'tideglass_boots') },
  { id: 'craft_boots', label: pick('Craft the Tideglass Boots', 'Die Gezeitenglas-Stiefel herstellen'), done: (p) => ownsAnywhere(p, 'tideglass_boots') },
];

export function mireQuestComplete(p: MireProgress): boolean {
  return MIRE_QUEST_STEPS.every((s) => s.done(p));
}

/**
 * The Hushdark quest ("The Hushdark", ADR-0017 rung 2): the arc from the Cavern
 * Mouth altar to the Hushsteel Helm. Same shape as the Mire quest — every step
 * auto-ticks from the Warden altar/gate flags + the inventory (no new persistence):
 * the Hushdark Key proves the Warden was bested, a hushsteel proves the Chime Kiln
 * ran, the Helm proves the chain closed.
 */
export interface HushdarkProgress {
  inventory: Inventory;
  /** the per-Warden altar/gate progress (backend `wardens` snapshot) */
  wardens: Record<string, WardenWorldState> | null;
  /** the worn gear — the crafted Helm is WORN by moving it out of the bag */
  equipped?: EquippedGear | null;
}

/** the plain Helm anywhere, or its epic Reverberant transfiguration on the head */
function helmProven(p: HushdarkProgress): boolean {
  return ownsAnywhere(p, 'hushsteel_helm') || ownsAnywhere(p, 'hushsteel_helm_epic');
}

export const HUSHDARK_QUEST_STEPS: { id: string; label: string; done: (p: HushdarkProgress) => boolean }[] = [
  { id: 'echo_offering', label: pick('Complete the Offering at the Cavern Mouth altar', 'Die Opfergabe am Altar des Höhlenschlunds vollenden'), done: (p) => !!p.wardens?.echo?.altar.broken },
  { id: 'best_echo', label: pick('Defeat the Echo Warden — earn the Hushdark Key', 'Den Echowächter bezwingen — Schlüssel zur Grabesstille verdienen'), done: (p) => (p.inventory.hushdark_key ?? 0) > 0 },
  { id: 'open_hushdark_gate', label: pick('Open the gate to the Hushdark', 'Das Tor zur Grabesstille öffnen'), done: (p) => !!p.wardens?.echo?.gateOpen },
  // hushsteel gets CONSUMED by the helm/charms/totems — the crafted Helm stays proof
  { id: 'refine_hushsteel', label: pick('Ring echo crystal into hushsteel at a Chime Kiln', 'Echokristall im Klang-Ofen zu Klangstahl läutern'), done: (p) => (p.inventory.hushsteel ?? 0) > 0 || helmProven(p) },
  { id: 'craft_helm', label: pick('Craft the Hushsteel Helm', 'Den Klangstahl-Helm herstellen'), done: (p) => helmProven(p) },
];

export function hushdarkQuestComplete(p: HushdarkProgress): boolean {
  return HUSHDARK_QUEST_STEPS.every((s) => s.done(p));
}

/**
 * The Terrace quest ("The Green Terraces", ADR-0017 rung 3, the final rung): the
 * arc from the terraced-hillside altar to the Verdant-woven Cuirass. Same shape as
 * the Mire and Hushdark quests — every step auto-ticks from the Warden altar/gate
 * flags + the inventory (no new persistence): the Key to the Green Terraces proves
 * the Warden was bested, a verdant fibre proves the Verdant Loom ran, the Cuirass
 * proves the chain closed.
 */
export interface TerraceProgress {
  inventory: Inventory;
  /** the per-Warden altar/gate progress (backend `wardens` snapshot) */
  wardens: Record<string, WardenWorldState> | null;
  /** the worn gear — the crafted Cuirass is WORN by moving it out of the bag */
  equipped?: EquippedGear | null;
}

export const TERRACE_QUEST_STEPS: { id: string; label: string; done: (p: TerraceProgress) => boolean }[] = [
  { id: 'verdant_offering', label: pick('Complete the Offering at the terraced-hillside altar', 'Die Opfergabe am Altar am terrassierten Hang vollenden'), done: (p) => !!p.wardens?.verdant?.altar.broken },
  { id: 'best_verdant', label: pick('Defeat the Verdant Warden — earn the Key to the Green Terraces', 'Den Grünwächter bezwingen — Schlüssel zu den Grünen Terrassen verdienen'), done: (p) => (p.inventory.terrace_key ?? 0) > 0 },
  { id: 'open_terrace_gate', label: pick('Open the gate to the Green Terraces', 'Das Tor zu den Grünen Terrassen öffnen'), done: (p) => !!p.wardens?.verdant?.gateOpen },
  // verdant fibre gets CONSUMED by the cuirass/rations — the Cuirass stays proof
  { id: 'refine_verdant_fibre', label: pick('Ret wildgrain into verdant fibre at a Verdant Loom', 'Wildkorn am Grünwebstuhl zu Grünfaser rösten'), done: (p) => (p.inventory.verdant_fibre ?? 0) > 0 || ownsAnywhere(p, 'verdant_cuirass') },
  { id: 'craft_cuirass', label: pick('Craft the Verdant-woven Cuirass', 'Den Grüngewebten Brustpanzer herstellen'), done: (p) => ownsAnywhere(p, 'verdant_cuirass') },
];

export function terraceQuestComplete(p: TerraceProgress): boolean {
  return TERRACE_QUEST_STEPS.every((s) => s.done(p));
}

/**
 * The Legacy quest ("Das Vermächtnis"): the capstone arc after the Warden ladder,
 * covering what the rung quests miss — Village growth, the Deep's boss, and the
 * Reverberant. Same stateless idiom as every arc: each step auto-ticks from state
 * the HUD already holds (the Village record + the inventory), no new persistence.
 * Item-proven steps un-tick if the item is pooled/crated — the accepted
 * best_guardian idiom (a held proof, not a ledger).
 */
export interface LegacyProgress {
  inventory: Inventory;
  village: VillageRecord | null;
  /** the worn gear record — the epic helm is WORN by moving it out of the bag,
   *  so the Reverberant step must also accept it on the head */
  equipped?: EquippedGear | null;
}

export const LEGACY_QUEST_STEPS: { id: string; label: string; done: (p: LegacyProgress) => boolean }[] = [
  { id: 'hamlet', label: pick('Grow the Village to a Hamlet', 'Das Dorf zum Weiler ausbauen'), done: (p) => (p.village?.tier ?? 0) >= 2 },
  { id: 'market', label: pick('Reach Village rank — open the Market Square', 'Den Dorf-Rang erreichen — der Marktplatz öffnet'), done: (p) => (p.village?.tier ?? 0) >= 3 },
  // deep_core is the streamed proof of a Stage-2+ boss (per-player depth bests are
  // fetch-only); it gets CONSUMED forging the Sword — the blade stays proof
  { id: 'deep_core', label: pick('Fell a Deep boss — bring home a Deep Core', 'Einen Boss der Tiefe fällen — einen Tiefenkern heimbringen'), done: (p) => (p.inventory.deep_core ?? 0) > 0 || ownsAnywhere(p, 'sword') || ownsAnywhere(p, 'forgebrand') },
  { id: 'best_reverb', label: pick('Solve the pedestal Echoes and fell the Reverberant', 'Das Sockel-Echo-Rätsel lösen und den Nachhall fällen'), done: (p) => (p.inventory.hushsteel_helm_epic ?? 0) > 0 || Object.values(p.equipped ?? {}).includes('hushsteel_helm_epic') || (p.inventory.echo_sigil ?? 0) > 0 },
  { id: 'town', label: pick('Raise the Stone Keep — become a Town', 'Die Steinfeste errichten — zur Stadt werden'), done: (p) => (p.village?.tier ?? 0) >= 4 },
];

export function legacyQuestComplete(p: LegacyProgress): boolean {
  return LEGACY_QUEST_STEPS.every((s) => s.done(p));
}

export function hintRetired(j: JourneyState, hint: HintId): boolean {
  return (j.hintUses[hint] ?? 0) >= HINT_RETIRE_USES;
}
