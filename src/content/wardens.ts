// The Warden ladder (ADR-0017 §1): every post-Guardian rung is a WardenDef —
// woken at its altar by a pooled Offering of the previous tier's goods (the
// Seal pattern, re-instanced per rung) plus a crafted Warden Totem, fought on
// the guardian.ts authored engine with its OWN kit, and paid out by the
// participation rule. Defeat pays every participant the Realm's gate key;
// the first to turn the dormant gate opens it for everyone forever and spends
// their key (2026-07 playtest — the key is no longer a permanent trophy).
//
// PURE DATA + PURE FUNCTIONS, node-importable like guardian.ts — no browser
// globals, no ../config (dev scaling for the altar quotas lives in config.ts).

import {
  ARENA_H,
  ARENA_W,
  GUARDIAN_KIT,
  LUNGE_ZONE,
  makeEchoWaveTiles,
  makeMireWaveTiles,
  makeVerdantWaveTiles,
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
 * The Mire Warden's fight kit (ADR-0017 rung 1) — its OWN authored schedule on
 * the drowned court's rising-water bands + geyser columns (makeMireWaveTiles),
 * a hair faster and denser than the Guardian so it reads as a distinct dance.
 * Same arena dimensions as the Guardian's court (ARENA_W×ARENA_H); its visual
 * identity (teal tints + the mire-warden sheet) lives scene-side in KIT_ART.
 * PURE DATA + PURE FUNCTIONS — node-importable, no browser globals, no ../config.
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
  waveTiles: makeMireWaveTiles(ARENA_W, ARENA_H, 0x1d872c3f),
  lungeSeed: 0x77aa11bb,
  lungeZone: LUNGE_ZONE,
  meleeRingMin: MELEE_RING_MIN,
  meleeRingMax: MELEE_RING_MAX,
  meleeRingHotFrom: MELEE_RING_HOT_FROM,
  lungeWindupFrac: 0.35,
  engageHoldMs: 220,
  engageReturnMs: 560,
};

/**
 * The Echo Warden's fight kit (ADR-0017 rung 2) — its OWN authored schedule on
 * the Hushdark's expanding sound-rings + delayed echo-repeat (makeEchoWaveTiles),
 * a touch faster and denser than the Mire so rung 2 reads as the harder dance.
 * Same arena dimensions as the Guardian's court; its visual identity (cold
 * blue-steel tints + the echo-warden sheet) lives scene-side in KIT_ART.
 * PURE DATA + PURE FUNCTIONS — node-importable, no browser globals, no ../config.
 */
const ECHO_PHASES: FuryPhase[] = [
  { index: 0, name: 'calm', wavePeriodMs: 4_400, telegraphMs: 1_500, slamMs: 800, eyeMs: 2_100, density: 1.15, lungeEvery: 4 },
  { index: 1, name: 'restless', wavePeriodMs: 3_700, telegraphMs: 1_300, slamMs: 800, eyeMs: 1_700, density: 1.5, lungeEvery: 3 },
  { index: 2, name: 'fury', wavePeriodMs: 3_000, telegraphMs: 1_000, slamMs: 800, eyeMs: 1_250, density: 1.9, lungeEvery: 3 },
];

export const ECHO_KIT: WardenKit = {
  id: 'echo',
  arenaW: ARENA_W,
  arenaH: ARENA_H,
  phases: ECHO_PHASES,
  furyThresholds: [0.4, 0.75],
  waveTiles: makeEchoWaveTiles(ARENA_W, ARENA_H, 0x3ec9a41f),
  lungeSeed: 0x2b7e1516,
  lungeZone: LUNGE_ZONE,
  meleeRingMin: MELEE_RING_MIN,
  meleeRingMax: MELEE_RING_MAX,
  meleeRingHotFrom: MELEE_RING_HOT_FROM,
  lungeWindupFrac: 0.35,
  engageHoldMs: 220,
  engageReturnMs: 560,
};

/**
 * The Reverberant (ADR-0017 rung 2, the Hushdark's hidden foe) — NOT a realm-opener
 * like the Wardens, but a boss SUMMONED by solving the 3-pedestal Echoes puzzle. It
 * rises in the pedestal court and fights the same authored engine, harder and faster
 * than the Echo Warden (denser waves, tighter Eye Windows). Reuses the echo-warden
 * sheet re-tinted scene-side (KIT_ART.reverb). Its reward flows through a guarded
 * claim (epic-helm once-ever + weekly prestige), so `drops` is empty.
 * PURE DATA + PURE FUNCTIONS — node-importable, no browser globals, no ../config.
 */
const REVERB_PHASES: FuryPhase[] = [
  { index: 0, name: 'calm', wavePeriodMs: 3_900, telegraphMs: 1_300, slamMs: 800, eyeMs: 1_800, density: 1.3, lungeEvery: 3 },
  { index: 1, name: 'restless', wavePeriodMs: 3_300, telegraphMs: 1_100, slamMs: 800, eyeMs: 1_450, density: 1.7, lungeEvery: 3 },
  { index: 2, name: 'fury', wavePeriodMs: 2_700, telegraphMs: 900, slamMs: 800, eyeMs: 1_100, density: 2.1, lungeEvery: 2 },
];

export const REVERB_KIT: WardenKit = {
  id: 'reverb',
  arenaW: ARENA_W,
  arenaH: ARENA_H,
  phases: REVERB_PHASES,
  furyThresholds: [0.4, 0.75],
  waveTiles: makeEchoWaveTiles(ARENA_W, ARENA_H, 0x5f3759df),
  lungeSeed: 0x9e3779b1,
  lungeZone: LUNGE_ZONE,
  meleeRingMin: MELEE_RING_MIN,
  meleeRingMax: MELEE_RING_MAX,
  meleeRingHotFrom: MELEE_RING_HOT_FROM,
  lungeWindupFrac: 0.32,
  engageHoldMs: 220,
  engageReturnMs: 560,
};

/**
 * The Verdant Warden's fight kit (ADR-0017 rung 3, the final rung) — its OWN
 * authored schedule on the Green Terraces' CULTIVATION geometry (creeping vine
 * fronts + diagonal terraced furrows + a radial petal blossom, makeVerdantWaveTiles),
 * a shade faster and denser than the Echo so rung 3 reads as the hardest realm-
 * opener dance (still gentler than the Reverberant side-boss). Same arena
 * dimensions as the Guardian's court; its visual identity (verdant green tints +
 * the verdant-warden sheet) lives scene-side in KIT_ART.
 * PURE DATA + PURE FUNCTIONS — node-importable, no browser globals, no ../config.
 */
const VERDANT_PHASES: FuryPhase[] = [
  { index: 0, name: 'calm', wavePeriodMs: 4_200, telegraphMs: 1_450, slamMs: 800, eyeMs: 2_000, density: 1.2, lungeEvery: 4 },
  { index: 1, name: 'restless', wavePeriodMs: 3_500, telegraphMs: 1_250, slamMs: 800, eyeMs: 1_600, density: 1.55, lungeEvery: 3 },
  { index: 2, name: 'fury', wavePeriodMs: 2_900, telegraphMs: 950, slamMs: 800, eyeMs: 1_200, density: 2.0, lungeEvery: 3 },
];

export const VERDANT_KIT: WardenKit = {
  id: 'verdant',
  arenaW: ARENA_W,
  arenaH: ARENA_H,
  phases: VERDANT_PHASES,
  furyThresholds: [0.4, 0.75],
  waveTiles: makeVerdantWaveTiles(ARENA_W, ARENA_H, 0x6a09e667),
  lungeSeed: 0xbb67ae85,
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
    // participation rule (≥1 hit → full set): the gate key AND the Mirefang, the
    // Mire Warden's pure-combat weapon with the tide-wade-slow-ignore passive
    drops: { mire_key: 1, mirefang: 1 },
  },
  echo: {
    id: 'echo',
    kit: ECHO_KIT,
    totem: 'echo_totem',
    gateKey: 'hushdark_key',
    realm: 'the_hushdark',
    // participation rule (≥1 hit → full set): the gate key ALONE — the Echo Warden
    // drops no weapon (its Realm reward is the Echoes mechanic, not a blade)
    drops: { hushdark_key: 1 },
  },
  reverb: {
    id: 'reverb',
    kit: REVERB_KIT,
    // totem/gateKey are VESTIGIAL — the Reverberant is summoned by solving the
    // pedestal puzzle (no altar/totem) and opens no realm (realm '' so
    // wardenForRealm never maps a district to it). Reward is the guarded claim.
    totem: 'echo_totem',
    gateKey: 'hushdark_key',
    realm: '',
    drops: {},
  },
  verdant: {
    id: 'verdant',
    kit: VERDANT_KIT,
    totem: 'verdant_totem',
    gateKey: 'terrace_key',
    realm: 'green_terraces',
    // participation rule (≥1 hit → full set): the gate key ALONE — like the Echo
    // Warden, the Verdant Warden drops no weapon (its Realm reward is the
    // Cultivation mechanic + the verdant_cuirass crafted from wildgrain, not a blade)
    drops: { terrace_key: 1 },
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
