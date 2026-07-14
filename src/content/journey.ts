/**
 * The Journey: the per-Player onboarding checklist (CONTEXT.md). Sequential
 * objectives from first wood to the first Seal Offering, shown in a small HUD
 * tracker until complete. Steps auto-complete from what a Player has already
 * done; contextual key hints retire after a few uses.
 */
import { pick } from '../i18n';
import type { Inventory, JourneyState, JourneyStepId, QuestState, SealState, WardenWorldState } from '../backend/types';
import type { VillageRecord } from './village';

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
}

export const DELVE_QUEST_STEPS: { id: string; label: string; done: (p: DelveProgress) => boolean }[] = [
  // the two groundwork steps first: a Sawmill (planks for tier-2 gear) and a
  // founded Village (your anchor — where Exhaustion in the Delve wakes you).
  { id: 'build_sawmill', label: pick('Build a Sawmill', 'Ein Sägewerk bauen'), done: (p) => p.sawmillBuilt },
  { id: 'found_village', label: pick('Found a Village — raise the Hall', 'Ein Dorf gründen — die Halle errichten'), done: (p) => !!p.village?.hall },
  { id: 'break_seal', label: pick('Break the Seal at the Ruins', 'Das Siegel bei den Ruinen brechen'), done: (p) => !!p.seal?.broken },
  { id: 'best_guardian', label: pick('Defeat the Guardian — earn Guardian Scales', 'Den Wächter bezwingen — Wächterschuppen verdienen'), done: (p) => (p.inventory.guardian_scale ?? 0) > 0 },
  { id: 'forge_pickaxe', label: pick('Forge an Ancient Pickaxe', 'Eine Uralte Spitzhacke schmieden'), done: (p) => (p.inventory.ancient_pickaxe ?? 0) > 0 },
  { id: 'open_shaft', label: pick('Clear the sealed mine shaft at The Cavern Mouth', 'Den versiegelten Minenschacht am Höhlenschlund freilegen'), done: (p) => !!p.quest?.delveOpen },
  { id: 'descend', label: pick('Descend into the Delve and claim its spoils', 'In den Schacht hinabsteigen und seine Beute holen'), done: (p) => (p.inventory.husk_shard ?? 0) > 0 || (p.inventory.deep_core ?? 0) > 0 },
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
}

export const MIRE_QUEST_STEPS: { id: string; label: string; done: (p: MireProgress) => boolean }[] = [
  { id: 'mire_offering', label: pick('Complete the Offering at the Mangrove Coast altar', 'Die Opfergabe am Altar der Mangrovenküste vollenden'), done: (p) => !!p.wardens?.mire?.altar.broken },
  { id: 'best_mire', label: pick('Defeat the Mire Warden — earn the Mirefang & Mire Key', 'Den Moorwächter bezwingen — Moorzahn & Moor-Schlüssel verdienen'), done: (p) => (p.inventory.mire_key ?? 0) > 0 },
  { id: 'open_mire_gate', label: pick('Open the gate to the Sunken Mire', 'Das Tor zum Versunkenen Moor öffnen'), done: (p) => !!p.wardens?.mire?.gateOpen },
  { id: 'refine_tideglass', label: pick('Temper salt-reed into tideglass at a Brine Kiln', 'Salzried im Sole-Ofen zu Gezeitenglas härten'), done: (p) => (p.inventory.tideglass ?? 0) > 0 },
  { id: 'craft_boots', label: pick('Craft the Tideglass Boots', 'Die Gezeitenglas-Stiefel herstellen'), done: (p) => (p.inventory.tideglass_boots ?? 0) > 0 },
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
}

export const HUSHDARK_QUEST_STEPS: { id: string; label: string; done: (p: HushdarkProgress) => boolean }[] = [
  { id: 'echo_offering', label: pick('Complete the Offering at the Cavern Mouth altar', 'Die Opfergabe am Altar des Höhlenschlunds vollenden'), done: (p) => !!p.wardens?.echo?.altar.broken },
  { id: 'best_echo', label: pick('Defeat the Echo Warden — earn the Hushdark Key', 'Den Echowächter bezwingen — Schlüssel zur Grabesstille verdienen'), done: (p) => (p.inventory.hushdark_key ?? 0) > 0 },
  { id: 'open_hushdark_gate', label: pick('Open the gate to the Hushdark', 'Das Tor zur Grabesstille öffnen'), done: (p) => !!p.wardens?.echo?.gateOpen },
  { id: 'refine_hushsteel', label: pick('Ring echo crystal into hushsteel at a Chime Kiln', 'Echokristall im Klang-Ofen zu Klangstahl läutern'), done: (p) => (p.inventory.hushsteel ?? 0) > 0 },
  { id: 'craft_helm', label: pick('Craft the Hushsteel Helm', 'Den Klangstahl-Helm herstellen'), done: (p) => (p.inventory.hushsteel_helm ?? 0) > 0 },
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
}

export const TERRACE_QUEST_STEPS: { id: string; label: string; done: (p: TerraceProgress) => boolean }[] = [
  { id: 'verdant_offering', label: pick('Complete the Offering at the terraced-hillside altar', 'Die Opfergabe am Altar am terrassierten Hang vollenden'), done: (p) => !!p.wardens?.verdant?.altar.broken },
  { id: 'best_verdant', label: pick('Defeat the Verdant Warden — earn the Key to the Green Terraces', 'Den Grünwächter bezwingen — Schlüssel zu den Grünen Terrassen verdienen'), done: (p) => (p.inventory.terrace_key ?? 0) > 0 },
  { id: 'open_terrace_gate', label: pick('Open the gate to the Green Terraces', 'Das Tor zu den Grünen Terrassen öffnen'), done: (p) => !!p.wardens?.verdant?.gateOpen },
  { id: 'refine_verdant_fibre', label: pick('Ret wildgrain into verdant fibre at a Verdant Loom', 'Wildkorn am Grünwebstuhl zu Grünfaser rösten'), done: (p) => (p.inventory.verdant_fibre ?? 0) > 0 },
  { id: 'craft_cuirass', label: pick('Craft the Verdant-woven Cuirass', 'Den Grüngewebten Brustpanzer herstellen'), done: (p) => (p.inventory.verdant_cuirass ?? 0) > 0 },
];

export function terraceQuestComplete(p: TerraceProgress): boolean {
  return TERRACE_QUEST_STEPS.every((s) => s.done(p));
}

export function hintRetired(j: JourneyState, hint: HintId): boolean {
  return (j.hintUses[hint] ?? 0) >= HINT_RETIRE_USES;
}
