import type { RefinerConfig } from './backend/types';

export const TILE = 16;
// Frontier expansion (ADR-0009): the World grew 200 → 300 by FAR-EDGE growth
// (east + south). The original 200×200 is pinned in place — spawn, every build,
// and every node id stay put (no save migration); the new space is an L-shaped
// frontier appended by tools/generate-map.ts.
// Realm expansion (ADR-0017 §2): the grid then grew 300 → 384 — once, in both
// axes — to hold the Warden Realms as sealed far-edge districts. The pre-Realm
// 300×300 World is pinned byte-for-byte; the space beyond is void cliff plus
// district rects entered by gate teleport only. Camera and minimap keep
// clamping to WORLD_VIEW_* while the Player is not inside a district.
// NOTE fog: explored-chunk indices encode the stride ceil(MAP_W / FOG_CHUNK);
// growing MAP_W re-strides them exactly like the 200 → 300 growth did — old
// indices decode to shifted chunks, a cosmetic scramble of the revealed map
// that is accepted per the ADR-0009 growth discipline (no version marker, no
// migration — see GameScene.initFog).
export const MAP_W = 384;
export const MAP_H = 384;
/** the pinned pre-Realm World rect — camera + minimap clamp to it in the World */
export const WORLD_VIEW_W = 300;
export const WORLD_VIEW_H = 300;
export const PLAYER_SPEED = 130;
export const INTERACT_RANGE = 30;
// Whole-number zoom only: the tileset is packed edge-to-edge, so nearest-
// neighbour sampling bleeds thin dark seams between tiles at any fractional
// zoom. Integer zoom maps each texel to exactly N pixels — no seams. (Wheel
// zoom in GameScene steps in whole levels for the same reason.)
export const ZOOM = 3;
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

// ---------------------------------------------------------------- Refiners (ADR-0017 §6)
// The generic Refiner kernel: each Refiner family is ONE RefinerConfig the
// client passes on every call — Mock/SQL are the generic executors. The live
// Sawmill predates the kernel and stays on its own table/RPCs.
// ?refinertest = dev-only test Refiner: E on a Sawmill opens the generic
// refiner panel with TEST_REFINER instead of the Sawmill panel, so the kernel
// is exercisable before any player-facing Refiner Structure ships.
export const DEV_REFINER_TEST = params.has('refinertest');
export const TEST_REFINER: RefinerConfig = {
  inputItem: 'stone',
  outputItem: 'plank',
  msPerUnit: FAST_REGROW ? 5_000 : 120_000,
  cap: 10,
};

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
// multiplier. `master` scales the other three. The looping beds carry an
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
/** inherent loudness of the looping beds, before their channel + master scale */
export const AMBIENT_BASE_VOLUME = 0.7;
export const FIGHT_MUSIC_BASE_VOLUME = 0.45;
/** waterfall proximity bed: peak loudness (at the pool) + fade radii, in px.
 *  full volume within NEAR, silent past FAR, smooth in between. */
export const WATERFALL_BASE_VOLUME = 0.8;
export const WATERFALL_NEAR_RADIUS = 48;
export const WATERFALL_FAR_RADIUS = 260;

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

// ---------------------------------------------------------------- UI text size
// One multiplier scales every HUD font-size (see the `--ui-scale` CSS var in
// styles.css), letting each Player enlarge or shrink all interface text to
// taste. Persisted per browser like the audio mix; 1.0 leaves the design sizes
// untouched. Applied by writing the var onto <html> (applyUiScale).
export const UI_SCALE_KEY = 'jungle-world:uiscale';
export const DEFAULT_UI_SCALE = 1;
export const UI_SCALE_MIN = 0.8;
export const UI_SCALE_MAX = 1.6;
/** slider granularity (10% steps) */
export const UI_SCALE_STEP = 0.1;

const clampUiScale = (v: number) => Math.max(UI_SCALE_MIN, Math.min(UI_SCALE_MAX, v));

/** read the saved text-size multiplier, clamped to range (corrupt/missing → default) */
export function loadUiScale(): number {
  try {
    const raw = Number(localStorage.getItem(UI_SCALE_KEY));
    if (isFinite(raw) && raw > 0) return clampUiScale(raw);
  } catch {
    /* no storage (node/tests) — use default */
  }
  return DEFAULT_UI_SCALE;
}

/** persist the chosen multiplier (clamped) */
export function saveUiScale(v: number): void {
  try {
    localStorage.setItem(UI_SCALE_KEY, String(clampUiScale(v)));
  } catch {
    /* storage unavailable — the runtime apply below still takes effect */
  }
}

/** push the multiplier into the `--ui-scale` var every HUD font-size reads */
export function applyUiScale(v: number): void {
  try {
    document.documentElement.style.setProperty('--ui-scale', String(clampUiScale(v)));
  } catch {
    /* not a browser — nothing to style */
  }
}

// ---------------------------------------------------------------- world labels
// A separate multiplier for the in-WORLD name tags drawn inside the Phaser
// canvas — Resource-Node hover tooltips ("Jungle Tree") and the name over each
// Player's head. These live on the game canvas, not the HTML HUD, so --ui-scale
// can't reach them; GameScene reads this and re-scales the labels live. 1.0
// leaves the design size (the WORLD_LABEL_BASE_SCALE in GameScene) untouched.
export const WORLD_LABEL_SCALE_KEY = 'jungle-world:worldlabelscale';
export const DEFAULT_WORLD_LABEL_SCALE = 1.2;
export const WORLD_LABEL_SCALE_MIN = 0.8;
export const WORLD_LABEL_SCALE_MAX = 3;
/** slider granularity (10% steps) */
export const WORLD_LABEL_SCALE_STEP = 0.1;

const clampWorldLabelScale = (v: number) =>
  Math.max(WORLD_LABEL_SCALE_MIN, Math.min(WORLD_LABEL_SCALE_MAX, v));

/** read the saved world-label multiplier, clamped to range (corrupt/missing → default) */
export function loadWorldLabelScale(): number {
  try {
    const raw = Number(localStorage.getItem(WORLD_LABEL_SCALE_KEY));
    if (isFinite(raw) && raw > 0) return clampWorldLabelScale(raw);
  } catch {
    /* no storage (node/tests) — use default */
  }
  return DEFAULT_WORLD_LABEL_SCALE;
}

/** persist the chosen world-label multiplier (clamped) */
export function saveWorldLabelScale(v: number): void {
  try {
    localStorage.setItem(WORLD_LABEL_SCALE_KEY, String(clampWorldLabelScale(v)));
  } catch {
    /* storage unavailable — GameScene still applies the live value */
  }
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
// ?wild = drop the lone MockBackend Player straight into a danger-flagged frontier
// Zone (ADR-0012) with Wildlife already roaming, for solo verification. The lone
// Player IS the creature host, so everything host-side runs locally.
export const DEV_WILD = params.has('wild');
// ?village = seed a founded Capital-tier Village (MockBackend only) with a Hall
// at spawn and the five ADR-0013 building-function structures — Trade Post,
// Banner, Well, Fountain, Flower Bed — laid out in a plaza just south of the wake
// point, plus a stock of tradeables. Lets the resource-exchange / Name & Crest /
// Chronicle / Trophy panels be reached on foot for solo UI verification.
export const DEV_VILLAGE = params.has('village');
// ?realmtest = T2 stub: every Realm gate stands OPEN without its Warden's
// defeat, so districts are enterable for testing. Without the flag the gates
// are dormant and inert — the real gate-key gating arrives with T4/T5.
export const DEV_REALM_TEST = params.has('realmtest');
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
// ADR-0012: lowered 5 000 → 3 000 GLOBALLY (a deliberate change that also makes
// the Guardian/Delve marginally more forgiving — accepted, playtest-tunable via a
// compensating HP/window nudge if the Guardian feels too soft, NOT by reverting).
// The open-world wilds and every other knockdown source share this one stun.
export const KNOCKDOWN_STUN_MS = 3_000;
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
/**
 * The Fabled weapon set (fabled_sword/axe/bow) is a rare BOSS-ONLY world-drop:
 * each participating Player independently rolls this ONE category chance per
 * boss kill (Guardian + both Delve bosses); a win then picks one of the three
 * weapons uniformly. Rolled client-side so each fighter's luck is their own —
 * see rollFabledDrops in GameScene.
 */
export const FABLED_DROP_CHANCE = 0.01;
/** the Fabled weapon ids eligible to drop (kept here so the roll has no import cycle) */
export const FABLED_WEAPONS = ['fabled_sword', 'fabled_axe', 'fabled_bow'] as const;

// ---------------------------------------------------------------- v2: cooking
export const SPEED_BUFF_FACTOR = 1.2;
export const SPEED_BUFF_MS = 180_000;

// ---------------------------------------------------------------- ADR-0012: open-world Wildlife
// Client-host orchestration constants for the ephemeral creature pool. The per-
// creature speeds/aggro live in content/wildlife.ts (node-pure, tiles/second);
// these are the host-loop tuning knobs. Numbers are playtest work.
/** creatures the host keeps roaming around EACH online Player (peaceful + predators) */
export const CREATURE_DENSITY = 6;
/** spawn ring radius around a Player, in tiles — just past view, so life fades in */
export const CREATURE_SPAWN_MIN_TILES = 12;
export const CREATURE_SPAWN_MAX_TILES = 20;
/** a creature farther than this (tiles) from EVERY online Player is discarded */
export const CREATURE_DESPAWN_TILES = 30;
/** base chance a spawn on a danger tile is a predator (peaceful otherwise) */
export const CREATURE_PREDATOR_CHANCE = 0.5;
/** night multiplies both predator odds and the danger-Zone pool (core stays safe) */
export const CREATURE_NIGHT_MULT = 1.6;
/** night begins when nightness() exceeds this (the wilds grow teeth after dark) */
export const CREATURE_NIGHT_THRESHOLD = 0.55;
/** rolling window for open-world knockdowns → Exhaustion (distinct from the Guardian's per-fight count) */
export const WILD_EXHAUST_WINDOW_MS = 45_000;
/** open-world knockdowns within the window before Exhaustion (wake at Hammock/spawn) */
export const WILD_EXHAUSTION_KNOCKDOWNS = 3;
/** the host's ONE batched `creatures` broadcast cadence (ms) — matches the position stream budget */
export const WILD_BROADCAST_MS = 200;
/** how often the host tops up / culls its pool (ms) — cheap, so not every frame */
export const WILD_SPAWN_TICK_MS = 900;
