// The Warden ladder (ADR-0017 §1): every post-Guardian rung is a WardenDef —
// woken at its altar by a pooled Offering of the previous tier's goods (the
// Seal pattern, re-instanced per rung) plus a crafted Warden Totem, fought on
// the guardian.ts authored engine with its OWN kit, and paid out by the
// participation rule. Defeat pays every participant the Realm's gate key;
// any Player opens the gate once with it in hand (the Delve-shaft pattern).
//
// PURE DATA + PURE FUNCTIONS, node-importable like guardian.ts — no browser
// globals, no ../config (dev scaling for the altar quotas lives in config.ts).

import {
  ARENA_H,
  ARENA_W,
  GUARDIAN_KIT,
  LUNGE_ZONE,
  makeSlamFamilyWaveTiles,
  MELEE_RING_HOT_FROM,
  MELEE_RING_MAX,
  MELEE_RING_MIN,
  type FuryPhase,
  type WardenKit,
} from './guardian';
import type { ItemId } from './items';

export interface WardenDef {
  /** the fight-state key (FightState.warden) — 'guardian' is rung 0 and NOT here */
  id: string;
  kit: WardenKit;
  /** the crafted Warden Totem its summon consumes (Forge recipe) */
  totem: ItemId;
  /** the Realm gate key paid to every participant on defeat */
  gateKey: ItemId;
  /** the district ID (world-data districts[].id) this Warden's defeat opens */
  realm: string;
  /** the participation drop set (client-side Spoils window, gate key included) */
  drops: Partial<Record<ItemId, number>>;
}

/**
 * The Mire Warden's fight kit — T4 ships it as a PLACEHOLDER on the shared
 * slam-family patterns (own seeds, tighter phases, denser fury) so the second
 * authored fight is provably kit-driven; T5 re-authors it into the rising-water
 * wave rows + geyser columns of the plan. Same arena dimensions as the
 * Guardian's court, where the ?wardenfight dev fight runs.
 */
const MIRE_PHASES: FuryPhase[] = [
  { index: 0, name: 'calm', wavePeriodMs: 4_600, telegraphMs: 1_600, slamMs: 800, eyeMs: 2_200, density: 1.1, lungeEvery: 4 },
  { index: 1, name: 'restless', wavePeriodMs: 3_900, telegraphMs: 1_400, slamMs: 800, eyeMs: 1_800, density: 1.45, lungeEvery: 4 },
  { index: 2, name: 'fury', wavePeriodMs: 3_200, telegraphMs: 1_100, slamMs: 800, eyeMs: 1_300, density: 1.8, lungeEvery: 3 },
];

export const MIRE_KIT: WardenKit = {
  id: 'mire',
  arenaW: ARENA_W,
  arenaH: ARENA_H,
  phases: MIRE_PHASES,
  furyThresholds: [0.4, 0.75],
  waveTiles: makeSlamFamilyWaveTiles(ARENA_W, ARENA_H, 0x1d872c3f),
  lungeSeed: 0x77aa11bb,
  lungeZone: LUNGE_ZONE,
  meleeRingMin: MELEE_RING_MIN,
  meleeRingMax: MELEE_RING_MAX,
  meleeRingHotFrom: MELEE_RING_HOT_FROM,
  lungeWindupFrac: 0.35,
  engageHoldMs: 220,
  engageReturnMs: 560,
};

/** the ladder's rungs above the Guardian — rungs 2/3 land with T6/T7 */
export const WARDENS: Record<string, WardenDef> = {
  mire: {
    id: 'mire',
    kit: MIRE_KIT,
    totem: 'mire_totem',
    gateKey: 'mire_key',
    realm: 'sunken_mire',
    // T5 adds the Mirefang (the participation weapon drop) to this set
    drops: { mire_key: 1 },
  },
};

export function wardenDef(id: string | null | undefined): WardenDef | undefined {
  return id ? WARDENS[id] : undefined;
}

/** the fight kit of a FightState.warden value — absent/null/unknown = the Guardian */
export function kitOf(wardenId: string | null | undefined): WardenKit {
  return wardenDef(wardenId)?.kit ?? GUARDIAN_KIT;
}

/** the Warden whose defeat opens district `realm`, if any */
export function wardenForRealm(realm: string): WardenDef | undefined {
  for (const d of Object.values(WARDENS)) if (d.realm === realm) return d;
  return undefined;
}
