export const TILE = 16;
// Frontier expansion (ADR-0009): the World grew 200 → 300 by FAR-EDGE growth
// (east + south). The original 200×200 is pinned in place — spawn, every build,
// and every node id stay put (no save migration); the new space is an L-shaped
// frontier appended by tools/generate-map.ts.
export const MAP_W = 300;
export const MAP_H = 300;
export const PLAYER_SPEED = 130;
export const INTERACT_RANGE = 30;
export const ZOOM = 2.5;
/**
 * Holding E swings at this fixed cadence (harvesting Resource Nodes, hitting
 * the Guardian). The cadence also caps tapped E — mashing is never faster.
 */
export const SWING_CADENCE_MS = 300;
// Combat attack speed is per-weapon and combat-only — it lives in the weapon
// table (WEAPON_COMBAT, src/content/guardian.ts, ADR-0006 §4) and never changes
// this harvest cadence. The Bow's slower combat cadence (500 ms vs melee) still
// keeps it below melee DPS (the risky-fast vs. safe-slow ladder, ADR-0003).

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
// In dev the Seal asks for tiny per-head quotas so the whole arc is testable
// solo; add ?slowseal to use the real numbers.
export const FAST_SEAL = import.meta.env.DEV && !params.has('slowseal');
// The Seal is PER-PERSON and scales live: the communal target is per-head ×
// the number of Players online right now (25/25/10/20 each). Each Backend
// computes the live head count and passes the result to jw_contribute_seal,
// which stays the sole source of truth for clamping + the one-time break — so
// ADR-0001 holds (no server game logic; the quota is just a parameter).
export const SEAL_QUOTA_PER_HEAD: Record<'wood' | 'stone' | 'fiber' | 'fruit', number> = FAST_SEAL
  ? { wood: 6, stone: 5, fiber: 3, fruit: 2 }
  : { wood: 25, stone: 25, fiber: 10, fruit: 20 };

/** the live communal target: per-head × current online heads (floored at 1) */
export function sealQuotas(heads: number): Record<'wood' | 'stone' | 'fiber' | 'fruit', number> {
  const n = Math.max(1, Math.floor(heads));
  return {
    wood: SEAL_QUOTA_PER_HEAD.wood * n,
    stone: SEAL_QUOTA_PER_HEAD.stone * n,
    fiber: SEAL_QUOTA_PER_HEAD.fiber * n,
    fruit: SEAL_QUOTA_PER_HEAD.fruit * n,
  };
}

// ---------------------------------------------------------------- v2: the Guardian
// ?fight = instant summon ready: the Seal starts broken, joining grants a
// Summoning Totem, and the Guardian is weak/brief enough to win or lose solo.
export const DEV_FIGHT = params.has('fight');
// ?dungeon = bypass the Delve gate and drop at the mine-shaft entrance for
// playtesting (ADR-0007); no Ancient Pickaxe required, the shaft reads as open.
export const DEV_DUNGEON = params.has('dungeon');
// ?deep = drop STRAIGHT into the Deep (Stage 2, ADR-0011) for playtesting — a
// fresh solo Deep run, skipping Stage 1 + the boss-door. Implies the shaft is
// open too, so leaving the Deep lands you at a usable World entrance. Use
// ?dungeon for Stage 1.
export const DEV_DEEP = params.has('deep');
/**
 * v5: Guardian HP scales per head, fixed at the FIRST STRIKE to
 * `HP_PER_HEAD × roster size` (the party sealed inside the Ward). v6 (ADR-0006
 * §5) cut this ~¼ (750 → 560); this pass trims a further 1/3 (560 → 373) so a
 * competent group finishes sooner and rarely grinds deep into the fury phase;
 * GUARDIAN_AWAKE_MS is unchanged. These are BASE (pre-display-scale) units —
 * on-screen HP and damage are multiplied by GUARDIAN_DISPLAY_SCALE alike, so the
 * cut lands directly at hits-to-kill. A 3-party faces 1119, an 8-party 2984, a
 * lone summoner 373 — per-person tension roughly constant, no minimum-roster
 * floor. ?fight (DEV_FIGHT) keeps a trivial fixed pool via DEV_FIGHT_HP,
 * independent of roster size.
 */
export const HP_PER_HEAD = 373;
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
/**
 * Empty-arena grace (ADR-0004 wipe): once the WHOLE roster is Exhausted no one
 * can damage the Guardian, so instead of grinding out the full awake window it
 * re-slumbers this soon after the arena empties — unbeaten, totem spent.
 */
export const ARENA_EMPTY_SLUMBER_MS = 5_000;
/** every participant with ≥1 hit receives this many Guardian Scales */
export const GUARDIAN_SCALE_DROP = 3;

// ---------------------------------------------------------------- v2: cooking
export const SPEED_BUFF_FACTOR = 1.2;
export const SPEED_BUFF_MS = 180_000;
