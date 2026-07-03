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
/**
 * The Bow looses on a slower cadence than melee (500 vs 300 ms), so axe-melee
 * (3 dmg / 300 ms) out-DPSes the Bow (2 dmg / 500 ms) by a wide margin — the
 * risky-fast vs. safe-slow ladder. Do not tighten toward 300 (see ADR-0003).
 */
export const BOW_CADENCE_MS = 500;

// Mock backend tuning
export const LATENCY_MIN = 50;
export const LATENCY_MAX = 150;

// In dev every node regrows fast so regrowth is testable; add ?slowregrow to use real times.
const params = new URLSearchParams(window.location.search);
export const FAST_REGROW = import.meta.env.DEV && !params.has('slowregrow');
export const FAST_REGROW_MS = 20_000;

// ---------------------------------------------------------------- v3: the Sawmill
// One plank per deposited wood, milled sequentially in real time (lazy
// timestamps, no tick loop — ADR-0001). Dev-shortened like node regrowth.
export const SAWMILL_PLANK_MS = FAST_REGROW ? 5_000 : 120_000;
/** a Sawmill holds at most this much unmilled wood */
export const SAWMILL_WOOD_CAP = 10;

// ---------------------------------------------------------------- fog of war
/** exploration is tracked in chunks of this many tiles per side */
export const FOG_CHUNK = 4;
/** chunks within this radius of the Player reveal permanently */
export const FOG_REVEAL_RADIUS = 2;

export const STORAGE_KEY = 'jungle-world:v1';
export const SESSION_KEY = 'jungle-world:session';
export const MUTE_KEY = 'jungle-world:muted';

// ---------------------------------------------------------------- audio mix
// The settings menu exposes four independent volume channels; each is a 0..1
// multiplier. `master` scales the other three. The two looping beds carry an
// inherent base loudness (below) that their channel then scales; SFX pass their
// own per-call level. All channels default to 1.0 so the mix is unchanged until
// the Player touches a slider.
export const VOLUME_KEY = 'jungle-world:volumes';
export type AudioChannel = 'master' | 'ambience' | 'music' | 'sfx';
export const AUDIO_CHANNELS: AudioChannel[] = ['master', 'ambience', 'music', 'sfx'];
export const DEFAULT_VOLUMES: Record<AudioChannel, number> = {
  master: 1,
  ambience: 1,
  music: 1,
  sfx: 1,
};
/** inherent loudness of the two looping beds, before their channel + master scale */
export const AMBIENT_BASE_VOLUME = 0.7;
export const FIGHT_MUSIC_BASE_VOLUME = 0.45;

/** read the saved mix, clamped and merged over the defaults (corrupt → defaults) */
export function loadVolumes(): Record<AudioChannel, number> {
  const out = { ...DEFAULT_VOLUMES };
  try {
    const saved = JSON.parse(localStorage.getItem(VOLUME_KEY) ?? '{}') as Partial<Record<AudioChannel, number>>;
    for (const ch of AUDIO_CHANNELS) {
      const v = saved[ch];
      if (typeof v === 'number' && isFinite(v)) out[ch] = Math.max(0, Math.min(1, v));
    }
  } catch {
    /* corrupt entry — use defaults */
  }
  return out;
}

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
 * v5: Guardian HP scales per head, fixed at the FIRST STRIKE to
 * `HP_PER_HEAD × roster size` (the party sealed inside the Ward). 750 is the
 * old flat 2250 ÷ the party of 3 it was validated against, so a 3-party plays
 * exactly as before, an 8-party faces the same per-person tension (6000), and a
 * lone summoner faces 750 — a brutal-but-possible hardcore feat (ADR-0004).
 * There is deliberately NO minimum-roster floor. ?fight (DEV_FIGHT) keeps a
 * trivial fixed pool via DEV_FIGHT_HP, independent of roster size.
 */
export const HP_PER_HEAD = 750;
/** ?fight: a tiny fixed Guardian pool so a summon can be won or lost solo, fast */
export const DEV_FIGHT_HP = 30;
/** awake window: how long the Guardian stays dangerous AFTER the first strike (engagedAt) */
export const GUARDIAN_AWAKE_MS = DEV_FIGHT ? 90_000 : 300_000;
/**
 * Dormant grace: a summoned-but-unstruck Guardian roams harmlessly for this
 * long so the party can gather; strike within it or it re-slumbers, totem spent
 * (no refund). Shortened in dev so the timeout path is testable.
 */
export const DORMANT_TIMEOUT_MS = import.meta.env.DEV ? 30_000 : 90_000;
export const KNOCKDOWN_STUN_MS = 5_000;
/** knockdowns within one fight before Exhaustion (wake at spawn) */
export const EXHAUSTION_KNOCKDOWNS = 3;
/** every participant with ≥1 hit receives this many Guardian Scales */
export const GUARDIAN_SCALE_DROP = 3;

// ---------------------------------------------------------------- v2: cooking
export const SPEED_BUFF_FACTOR = 1.2;
export const SPEED_BUFF_MS = 180_000;
