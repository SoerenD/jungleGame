export const TILE = 16;
export const MAP_W = 200;
export const MAP_H = 200;
export const PLAYER_SPEED = 130;
export const INTERACT_RANGE = 30;
export const ZOOM = 2.5;
/**
 * Holding E swings at this fixed cadence (harvesting Resource Nodes, hitting
 * the Guardian). The cadence also caps tapped E — mashing is never faster.
 */
export const SWING_CADENCE_MS = 300;

// Mock backend tuning
export const LATENCY_MIN = 50;
export const LATENCY_MAX = 150;

// In dev every node regrows fast so regrowth is testable; add ?slowregrow to use real times.
const params = new URLSearchParams(window.location.search);
export const FAST_REGROW = import.meta.env.DEV && !params.has('slowregrow');
export const FAST_REGROW_MS = 20_000;

export const STORAGE_KEY = 'jungle-world:v1';
export const SESSION_KEY = 'jungle-world:session';
export const MUTE_KEY = 'jungle-world:muted';

// day/night cycle: short in dev so night is testable; ?night forces midnight
export const DAY_CYCLE_MS = import.meta.env.DEV ? 180_000 : 1_200_000;
export const FORCE_NIGHT = params.has('night');
export const MAP_PIECE_DROP_CHANCE = 0.12;

// ---------------------------------------------------------------- v2: the Seal
// In dev the Seal asks for tiny quotas so the whole arc is testable solo;
// add ?slowseal to use the real two-weeks-of-evenings numbers.
export const FAST_SEAL = import.meta.env.DEV && !params.has('slowseal');
export const SEAL_QUOTAS: Record<'wood' | 'stone' | 'fiber' | 'fruit', number> = FAST_SEAL
  ? { wood: 6, stone: 5, fiber: 3, fruit: 2 }
  : { wood: 600, stone: 500, fiber: 300, fruit: 150 };

// ---------------------------------------------------------------- v2: the Guardian
// ?fight = instant summon ready: the Seal starts broken, joining grants a
// Summoning Totem, and the Guardian is weak/brief enough to win or lose solo.
export const DEV_FIGHT = params.has('fight');
/**
 * Sized for WINDOWED uptime (hits land only in Eye Windows, ~45% of the
 * fight): a Player with a tier-1 tool deals 2 dmg per 300ms swing ≈ 3 dps
 * schedule-capped, ~1.8 dps with decent-but-imperfect play. Over the 5-min
 * window that is ~540 per Player — so 3–4 friends clear 1500 with room to
 * spare, while solo (~540) remains near impossible. ?fight stays trivial.
 */
export const GUARDIAN_MAX_HP = DEV_FIGHT ? 30 : 1500;
/** slumber timer: how long the Guardian stays awake after a summon */
export const GUARDIAN_AWAKE_MS = DEV_FIGHT ? 90_000 : 300_000;
export const KNOCKDOWN_STUN_MS = 5_000;
/** knockdowns within one fight before Exhaustion (wake at spawn) */
export const EXHAUSTION_KNOCKDOWNS = 3;
/** every participant with ≥1 hit receives this many Guardian Scales */
export const GUARDIAN_SCALE_DROP = 3;

// ---------------------------------------------------------------- v2: cooking
export const SPEED_BUFF_FACTOR = 1.2;
export const SPEED_BUFF_MS = 180_000;
