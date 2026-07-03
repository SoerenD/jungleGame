/**
 * The Journey: the per-Player onboarding checklist (CONTEXT.md). Sequential
 * objectives from first wood to the first Seal Offering, shown in a small HUD
 * tracker until complete. Steps auto-complete from what a Player has already
 * done; contextual key hints retire after a few uses.
 */
import type { JourneyState, JourneyStepId } from '../backend/types';

export const JOURNEY_STEPS: { id: JourneyStepId; label: string }[] = [
  { id: 'gather_wood', label: 'Gather wood' },
  { id: 'craft_axe', label: 'Craft an axe' },
  { id: 'harvest_stone', label: 'Harvest stone' },
  { id: 'place_campfire', label: 'Place a campfire' },
  { id: 'read_tablet', label: 'Read an ancient tablet' },
  { id: 'visit_seal', label: 'Visit the Seal at the Ruins' },
  { id: 'first_offering', label: 'Lay your first Offering upon the Seal' },
];

/** contextual key hints; each retires after HINT_RETIRE_USES successful uses */
export type HintId = 'gather' | 'read' | 'place';
export const HINT_RETIRE_USES = 3;

export function journeyComplete(j: JourneyState): boolean {
  return JOURNEY_STEPS.every((s) => j.steps[s.id]);
}

export function hintRetired(j: JourneyState, hint: HintId): boolean {
  return (j.hintUses[hint] ?? 0) >= HINT_RETIRE_USES;
}
