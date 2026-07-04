/**
 * The Journey: the per-Player onboarding checklist (CONTEXT.md). Sequential
 * objectives from first wood to the first Seal Offering, shown in a small HUD
 * tracker until complete. Steps auto-complete from what a Player has already
 * done; contextual key hints retire after a few uses.
 */
import { pick } from '../i18n';
import type { Inventory, JourneyState, JourneyStepId, QuestState, SealState } from '../backend/types';

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
}

export const DELVE_QUEST_STEPS: { id: string; label: string; done: (p: DelveProgress) => boolean }[] = [
  { id: 'break_seal', label: pick('Break the Seal at the Ruins', 'Das Siegel bei den Ruinen brechen'), done: (p) => !!p.seal?.broken },
  { id: 'best_guardian', label: pick('Defeat the Guardian — earn Guardian Scales', 'Den Wächter bezwingen — Wächterschuppen verdienen'), done: (p) => (p.inventory.guardian_scale ?? 0) > 0 },
  { id: 'forge_pickaxe', label: pick('Forge an Ancient Pickaxe', 'Eine Uralte Spitzhacke schmieden'), done: (p) => (p.inventory.ancient_pickaxe ?? 0) > 0 },
  { id: 'open_shaft', label: pick('Clear the sealed mine shaft in the South Quarry', 'Den versiegelten Minenschacht im Südlichen Steinbruch freilegen'), done: (p) => !!p.quest?.delveOpen },
  { id: 'descend', label: pick('Descend into the Delve and claim its spoils', 'In den Schacht hinabsteigen und seine Beute holen'), done: (p) => (p.inventory.husk_shard ?? 0) > 0 || (p.inventory.deep_core ?? 0) > 0 },
];

export function delveQuestComplete(p: DelveProgress): boolean {
  return DELVE_QUEST_STEPS.every((s) => s.done(p));
}

export function hintRetired(j: JourneyState, hint: HintId): boolean {
  return (j.hintUses[hint] ?? 0) >= HINT_RETIRE_USES;
}
