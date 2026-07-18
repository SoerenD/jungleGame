import { describe, it, expect } from 'vitest';
import {
  JOURNEY_STEPS,
  HINT_RETIRE_USES,
  journeyComplete,
  hintRetired,
  DELVE_QUEST_STEPS,
  delveQuestComplete,
  mireQuestComplete,
  hushdarkQuestComplete,
  terraceQuestComplete,
  legacyQuestComplete,
} from '../../src/content/journey';
import type { JourneyState } from '../../src/backend/types';

const allSteps = (): JourneyState => ({
  steps: Object.fromEntries(JOURNEY_STEPS.map((s) => [s.id, true])) as JourneyState['steps'],
  hintUses: {},
});

describe('journey — the onboarding checklist', () => {
  it('journeyComplete needs every step ticked', () => {
    expect(journeyComplete(allSteps())).toBe(true);
    const missingOne = allSteps();
    delete missingOne.steps.first_offering;
    expect(journeyComplete(missingOne)).toBe(false);
    expect(journeyComplete({ steps: {}, hintUses: {} })).toBe(false);
  });

  it('hintRetired trips only once a hint has been used enough', () => {
    expect(hintRetired({ steps: {}, hintUses: { gather: HINT_RETIRE_USES - 1 } }, 'gather')).toBe(false);
    expect(hintRetired({ steps: {}, hintUses: { gather: HINT_RETIRE_USES } }, 'gather')).toBe(true);
    expect(hintRetired({ steps: {}, hintUses: {} }, 'place')).toBe(false);
  });
});

describe('journey — the Delve quest chain', () => {
  const complete = {
    seal: { broken: true, contributed: {}, quotas: {} } as never,
    inventory: { guardian_scale: 3, husk_shard: 2, ancient_pickaxe: 1 },
    quest: { delveOpen: true } as never,
    sawmillBuilt: true,
    village: { hall: { tx: 1, ty: 1 } } as never,
    equipped: {},
  };

  it('every groundwork + progress step ticks from held state', () => {
    expect(delveQuestComplete(complete)).toBe(true);
  });

  it('a forged pickaxe counts whether in the bag or a weapon slot', () => {
    const slotted = { ...complete, inventory: { guardian_scale: 3, husk_shard: 2 }, equipped: { weapon1: 'ancient_pickaxe' } };
    expect(DELVE_QUEST_STEPS.find((s) => s.id === 'forge_pickaxe')!.done(slotted as never)).toBe(true);
  });

  it('missing any single step fails the chain', () => {
    expect(delveQuestComplete({ ...complete, sawmillBuilt: false })).toBe(false);
    expect(delveQuestComplete({ ...complete, quest: { delveOpen: false } as never })).toBe(false);
    expect(delveQuestComplete({ ...complete, village: null })).toBe(false);
  });
});

describe('journey — the Warden rung quests', () => {
  const wardens = (id: string) => ({ [id]: { altar: { broken: true }, gateOpen: true } }) as never;

  it('the Mire quest closes on the crafted Boots', () => {
    const p = { inventory: { mire_key: 1, tideglass: 1 }, wardens: wardens('mire'), equipped: { boots: 'tideglass_boots' } };
    expect(mireQuestComplete(p as never)).toBe(true);
    // without the boots the final craft step is unproven
    expect(mireQuestComplete({ ...p, equipped: {}, inventory: { mire_key: 1, tideglass: 1 } } as never)).toBe(false);
  });

  it('the Hushdark quest accepts the plain OR the epic helm as proof', () => {
    const base = { inventory: { hushdark_key: 1 }, wardens: wardens('echo') };
    expect(hushdarkQuestComplete({ ...base, equipped: { helm: 'hushsteel_helm' } } as never)).toBe(true);
    expect(hushdarkQuestComplete({ ...base, equipped: { helm: 'hushsteel_helm_epic' } } as never)).toBe(true);
    expect(hushdarkQuestComplete({ ...base, equipped: {} } as never)).toBe(false);
  });

  it('the Terrace quest closes on the woven Cuirass', () => {
    const p = { inventory: { terrace_key: 1 }, wardens: wardens('verdant'), equipped: { chest: 'verdant_cuirass' } };
    expect(terraceQuestComplete(p as never)).toBe(true);
  });
});

describe('journey — the Legacy capstone', () => {
  it('needs Town-tier growth, a Deep Core proof, and the Reverberant felled', () => {
    const p = {
      village: { tier: 4, hall: { tx: 0, ty: 0 } },
      inventory: { deep_core: 1, echo_sigil: 1 },
      equipped: {},
    };
    expect(legacyQuestComplete(p as never)).toBe(true);
    // drop below Town → the town step fails
    expect(legacyQuestComplete({ ...p, village: { tier: 3, hall: { tx: 0, ty: 0 } } } as never)).toBe(false);
  });
});
