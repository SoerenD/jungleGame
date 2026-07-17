import Phaser from 'phaser';
import { OBJECTS, TILESET } from '../assetConfig';
import { AVATAR_H, AVATAR_IDLE, AVATAR_SWING, AVATAR_W, ensureAvatarTexture } from '../avatars';
import { armorBuff, armorDef, gearOwns, isWeapon, sanitizeEquipped, type EquippedArmor, type EquippedGear, type WeaponSlot } from '../content/armor';
import { kitOf, wardenDef, wardenForRealm, WARDENS } from '../content/wardens';
import {
  ghostPoseAt,
  ghostTravelTiles,
  poseOnPedestal,
  vaultWeek,
  type EchoSample,
  type Ghost,
  type Pose,
} from '../content/echoes';
import type {
  Backend,
  ChatMsg,
  CreatureMsg,
  Dir,
  DungeonMsg,
  FightState,
  Inventory,
  JoinResult,
  JourneyState,
  JourneyStepId,
  KnockdownResult,
  MobSnap,
  NodeState,
  PlayerPos,
  ProjSnap,
  QuestState,
  RefinerConfig,
  SawmillState,
  SealState,
  Structure,
  WardenAltarState,
  WardenWorldState,
} from '../backend/types';
import { hintRetired, journeyComplete, type HintId } from '../content/journey';
import { tideExposedWithin, tideFloods, tideHeight } from '../content/tide';
import { msToNextRipe, wildgrainRipeWithin, wildgrainStage, type WildgrainStage } from '../content/cultivation';
import {
  DAY_CYCLE_MS,
  DEV_DEEP,
  DEV_DUNGEON,
  DEV_REALM_TEST,
  DEV_REFINER_TEST,
  DEV_WILD,
  EXHAUSTION_KNOCKDOWNS,
  FOG_CHUNK,
  FOG_REVEAL_RADIUS,
  LEGACY_FOG_STRIDE,
  FORCE_NIGHT,
  GUARDIAN_AWAKE_MS,
  GUARDIAN_SCALE_DROP,
  FABLED_DROP_CHANCE,
  FABLED_WEAPONS,
  INTERACT_RANGE,
  KNOCKDOWN_STUN_MS,
  MAP_H,
  MAP_W,
  MUTE_KEY,
  VOLUME_KEY,
  AMBIENT_BASE_VOLUME,
  FIGHT_MUSIC_BASE_VOLUME,
  WATERFALL_BASE_VOLUME,
  WATERFALL_NEAR_RADIUS,
  WATERFALL_FAR_RADIUS,
  loadVolumes,
  type AudioChannel,
  PLAYER_SPEED,
  SAWMILL_PLANK_MS,
  SPEED_BUFF_FACTOR,
  SWING_CADENCE_MS,
  TEST_REFINER,
  BRINE_KILN,
  CHIME_KILN,
  TIDE_PERIOD_MS,
  WADE_SLOW_FACTOR,
  TIDE_EXPOSURE_SLACK_MS,
  VERDANT_LOOM,
  CULTIVATION_PERIOD_MS,
  CULTIVATION_SLACK_MS,
  ECHO_PERIOD_MS,
  ECHO_PEDESTAL_RADIUS,
  ECHO_MIN_MOVE_TILES,
  DEV_ECHO,
  TILE,
  ZOOM,
  CREATURE_DENSITY,
  CREATURE_SPAWN_MIN_TILES,
  CREATURE_SPAWN_MAX_TILES,
  CREATURE_DESPAWN_TILES,
  CREATURE_PREDATOR_CHANCE,
  CREATURE_NIGHT_MULT,
  CREATURE_NIGHT_THRESHOLD,
  WILD_EXHAUST_WINDOW_MS,
  WILD_EXHAUSTION_KNOCKDOWNS,
  WILD_BROADCAST_MS,
  WILD_SPAWN_TICK_MS,
  WORLD_VIEW_H,
  WORLD_VIEW_W,
  loadWorldLabelScale,
} from '../config';
import {
  ARENA_H,
  ARENA_W,
  eyeOpenAt,
  furyPhaseAt,
  guardianPoseAt,
  guardianSpotAt,
  GUARDIAN_DISPLAY_SCALE,
  inMeleeRing,
  LUNGE_ZONE,
  lungeTarget,
  MELEE_RING_MAX,
  meleeRingWindow,
  waveInfoAt,
  waveTiles,
  weaponCombat,
  type ArenaSpot,
  type WardenKit,
  type WaveInfo,
} from '../content/guardian';
import {
  applyMobHit,
  createMob,
  DEEP_CORE_DROP,
  DEPTH_MOB_CAP,
  DEPTH_SIGIL,
  FORGE_CORE,
  isBossKind,
  profileOf,
  PROP_BLOCKS,
  PROP_LIGHT,
  SHARD_PER_KILL,
  stageDefFor,
  stepMob,
  type MobEvent,
  type MobKind,
  type MobState,
  type Stage,
  type StageDef,
} from '../content/dungeon';
import { footprint, isBuilding, ITEMS, type ItemId, type ResourceId, type StructureId, type ToolId } from '../content/items';
import { TABLETS } from '../content/lore';
import { NODE_TYPES, type NodeTypeId } from '../content/nodeTypes';
import {
  canAcceptItem,
  emptyVillage,
  festivalActive,
  FESTIVAL_SPEED_FACTOR,
  FOUNTAIN_WISH_ITEM,
  FOUNTAIN_WISH_THRESHOLD,
  FORGE_ART,
  KILN_ART,
  CHIME_KILN_ART,
  VERDANT_LOOM_ART,
  RELIQUARY_ART,
  inventoryCapacity,
  inVillageZone,
  villageBuff,
  villageContribution,
  villagePoolCap,
  VILLAGE_ART,
  VILLAGE_MAX_TIER,
  VILLAGE_TIERS,
  VILLAGE_ZONE_RADIUS,
  type VillageRecord,
} from '../content/village';
import {
  isPredator,
  isWildKind,
  planWildSpawn,
  RAGE_PROFILES,
  rollWildLoot,
  WILD_RAGE_MS,
  WILDLIFE_ART,
  type WildKind,
} from '../content/wildlife';
import { MOB_FRAME, MOB_TEX, PROJ_GLOW, PROJ_TEX } from '../mobSprites';
import { RECIPES } from '../content/recipes';
import { PROP_FLAT, PROP_TEX } from '../delveProps';
import { bus } from '../ui/bus';
import type { GameContext } from '../systems/context';
import { AtmosphereSystem } from '../systems/AtmosphereSystem';
import { FishingSystem } from '../systems/FishingSystem';
import { FogSystem } from '../systems/FogSystem';
import { SealSystem } from '../systems/SealSystem';
import {
  addBlockerBody,
  addShadow,
  clearDeathFx,
  DEATH_PUFF_TINT_DELVE,
  DEATH_PUFF_TINT_WILD,
  floatText,
  HELD_HAND,
  objImage,
  playDeathBeat,
  positionHeld,
  setHeldTexture,
  setObjTexture,
  TORCH_TINT,
  type MobView,
} from '../systems/sceneFx';
import type { DistrictDef, EAction, GameSystem, Mode, NodeView, OkJoin, WorldData } from '../systems/types';
import { drawStructureArt } from '../ui/icons';
import { showIntro } from '../ui/intro';
import { t, zoneName } from '../i18n';

interface RemoteView {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  shadow: Phaser.GameObjects.Image;
  /** the item shown in this Player's hand; hidden when nothing is held */
  heldSprite: Phaser.GameObjects.Image;
  /** warm light this Player casts while holding a Hand Torch */
  torchGlow: Phaser.GameObjects.Image;
  held: ItemId | null;
  targetX: number;
  targetY: number;
  dir: Dir;
  moving: boolean;
  /** JSON of the composed Appearance — texture regenerates when it changes */
  look: string;
  /**
   * High-water mark of PlayerPos.swings seen from this peer; a packet above it
   * plays one swing echo. Undefined until the peer first sends the field
   * (bots/old clients never do — they render exactly as before).
   */
  swings?: number;
  /** the Armor this peer wears (part of `look` — a change recomposes the texture) */
  armor?: EquippedArmor;
}

/**
 * Cosmetic swing echo (playSwingFx): purely visual. Swings are adjudicated
 * solely by the cadence stamps in the two update() paths (SWING_CADENCE_MS /
 * the per-weapon combat cadences of ADR-0006 — both untouched); this merely
 * makes an already-counted swing visible on the body: the avatar flashes its
 * raised-arm frame while the in-hand Tool sweeps a quick arc.
 */
const SWING_POSE_MS = 100; // how long the raised-arm frame outranks walk/idle
const SWING_ARC_MS = 120; // the tool's rotation sweep
const SWING_ARC_FROM_DEG = -60; // cocked back over the shoulder…
const SWING_ARC_TO_DEG = 40; // …swept forward past vertical (mirrored when flipped)
/**
 * Pivot of the arc as a texture-space origin: the handle end of the 12x12
 * held-item art (every Tool grid draws its grip at the bottom-left corner).
 * flipX mirrors the texture inside its frame but NOT the origin point, so the
 * x is mirrored by hand for the left profile. Applied only for the arc's
 * ~120ms and restored to the (0.5, 0.5) rest origin right after — positionHeld
 * and everything else may keep assuming the centered default.
 */
const SWING_GRIP_X = 0.2;
const SWING_GRIP_Y = 0.85;
/** sprite-data keys for the per-entity swing state (data, not fields, so the
 *  same fx can later run on a REMOTE Player's sprite/heldSprite pair) */
const SWING_POSE_KEY = 'swingPoseUntil';
const SWING_TWEEN_KEY = 'swingTween';
/**
 * A peer's swings counter arriving THIS far below our stored high-water mark
 * means their session restarted (the counter is per-session and reboots at 0),
 * not that a stale presence meta interleaved — metas lag the broadcast stream
 * by at most a couple of swings, never by ~9s of continuous swinging.
 */
const REMOTE_SWING_RESET_GAP = 30;

/**
 * Design size for in-world name tags (Node hover tooltips + Player name plates):
 * world-space text is magnified by the camera ZOOM, so this scales it back down
 * to a small tag over the head. The Settings ▸ Name label size slider multiplies
 * this (see `worldLabelScale`), and `labelScale()` counter-scales by the live
 * zoom so a tag stays the SAME readable size on screen at every zoom level.
 */
const WORLD_LABEL_BASE_SCALE = 0.4;

/**
 * Per-Warden fight VISUALS (ADR-0017): the WardenKit carries no art (it must stay
 * node-importable), so the scene keeps each kit's palette + sprite/anim keys here,
 * keyed by the fight's warden id ('guardian' = rung 0). The Guardian entry holds
 * the exact former literals (a no-op); the Mire wears the drowned court's teal.
 */
interface KitArt {
  spriteKey: string;
  idle: string;
  eye: string;
  /** rune glow base tint (also the calm-phase fury tint) */
  glowBase: number;
  /** rune glow tint per fury phase: calm → restless → fury */
  fury: readonly [number, number, number];
  /** slam-tile telegraph fill / hot-slam fill / lunge landing fill / melee-ring fill */
  danger: number;
  slam: number;
  lunge: number;
  ring: number;
  /** the amber-eye blaze tint during an Eye Window */
  eyeTint: number;
  /** the raised Ward's cast (the per-fight barrier over the entrance) */
  ward: number;
}
const KIT_ART: Record<string, KitArt> = {
  guardian: { spriteKey: 'guardian', idle: 'guardian-idle', eye: 'guardian-eye', glowBase: 0xb478ff, fury: [0xb478ff, 0xff9a3d, 0xff4433], danger: 0xff3322, slam: 0xff2211, lunge: 0xffa02f, ring: 0xff5a2f, eyeTint: 0xffb437, ward: 0xffb9a0 },
  // the Mire Warden's rising-water court: teal telegraphs, a tideglass eye + Ward
  mire: { spriteKey: 'mire_warden', idle: 'mire-idle', eye: 'mire-eye', glowBase: 0x2f8f74, fury: [0x2f8f74, 0x39c39a, 0x63e0b8], danger: 0x1f9e7a, slam: 0x14c79a, lunge: 0x63e0b8, ring: 0x2fd6a6, eyeTint: 0x9ffbe4, ward: 0xa0ffe8 },
  // the Echo Warden's sound-ring court: cold blue-steel telegraphs, a hushsteel eye + Ward
  echo: { spriteKey: 'echo_warden', idle: 'echo-idle', eye: 'echo-eye', glowBase: 0x5a6b85, fury: [0x5a6b85, 0x7d8fb0, 0x93a8c9], danger: 0x4a6a9a, slam: 0x6f8fd0, lunge: 0x93a8c9, ring: 0x8fb0e0, eyeTint: 0xbcd0ee, ward: 0xb1c6ea },
  // the Reverberant (the puzzle-summoned deeper foe): the echo sheet, violet echo-light
  reverb: { spriteKey: 'echo_warden', idle: 'echo-idle', eye: 'echo-eye', glowBase: 0x9a7bd0, fury: [0x9a7bd0, 0xb6a0e8, 0xdcccff], danger: 0x7a5ad0, slam: 0x9f7fe0, lunge: 0xc9b0ff, ring: 0xb090f0, eyeTint: 0xecdcff, ward: 0xc9b8ff },
  // the Verdant Warden's terraced court (ADR-0017 rung 3): warm gold-green telegraphs,
  // a sunlit-gold eye + Ward — the Green Terraces' ripe-wildgrain signal color
  verdant: { spriteKey: 'verdant_warden', idle: 'verdant-idle', eye: 'verdant-eye', glowBase: 0x7cc96f, fury: [0x7cc96f, 0xb6d24a, 0xffd24a], danger: 0x6aa83e, slam: 0xd8a83e, lunge: 0xf0c95e, ring: 0x9dc85a, eyeTint: 0xffe89a, ward: 0xcfe8a0 },
};

/**
 * ADR-0017 rung 3: a wildgrain bed's clock-derived growth stage → a multiplicative
 * tint over the golden ripe sprite, so ripeness reads across the field at a glance.
 * The bed art is drawn RIPE-golden (tools/compose-wildgrain.ts), so `ripe` passes it
 * through untinted; the growing stages push it green then dim brown.
 */
const WILDGRAIN_STAGE_TINT: Record<WildgrainStage, number> = {
  bare: 0x6b5a3a, // dim, barely-sprouted soil brown
  sprout: 0x7f9a52, // young olive-green
  green: 0xa8c46a, // lush unripe green
  ripe: 0xffffff, // full sunlit gold as drawn — reads harvestable
};

/** deterministic per-id variance so the forest looks grown, not stamped */
function idHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * J3 harvest impact kit — the most-repeated verb in the game (hold-E on a
 * Resource Node) finally answers back: per-hit debris chips tinted by node
 * type, a ~40ms squash punch on the sprite, and quiet damage pips while a
 * node sits below max HP. Pure client presentation over the shared 'poof'
 * texture (BootScene) — no new textures, no emitters, and no standing
 * per-node display objects (there are 3,854 node sprites; everything here
 * exists only at the point of impact and is reaped by a TTL sweep or its own
 * fade). Adjudication, yields, cadence and the wire are untouched.
 */
const CHIP_COUNT_HIT = 5; // chips per landed swing
const CHIP_COUNT_FINISH = 9; // the finishing hit pays a slightly larger burst
/**
 * Debris tints per Node type — muted, matching the mature palette: bark brown
 * with a leaf fleck for wood, granite greys for stone, leaf green with a fruit
 * fleck for the bush, pale dry fiber, water droplets for a Fishing Spot, and
 * the tier-2 pair in dense heartwood dark / volcanic-glass violet.
 */
const CHIP_TINTS: Record<NodeTypeId, number[]> = {
  tree: [0x7a5a34, 0x5d4426, 0x4f7a3a],
  rock: [0x9aa0a6, 0x6e747a, 0xb9bec2],
  fruit_bush: [0x4f7a3a, 0x6f9c46, 0xc75b52],
  fiber_vine: [0xd9cf9e, 0xb5ab7c, 0x8ba75f],
  hardwood_tree: [0x4a3826, 0x6b5232, 0x8c7444],
  obsidian_rock: [0x2e2838, 0x554a6a, 0x8f84b8],
  fishing_spot: [0x66b8e0, 0x9ad4ee, 0x3f86b8],
  salt_reed_bed: [0xb3a76e, 0x8f855a, 0xd8dcd2],
  echo_crystal_seam: [0x93a8c9, 0x5a6b85, 0xd6e4f5],
  wildgrain_bed: [0xd8a83e, 0xb5882e, 0x86a048],
};
/** damage pips: 2px cells above a damaged node — shown only while it was hit
 *  recently, then faded out (the mob HP bar's idea, smaller and quieter) */
const NODE_PIP_SIZE = 2; // px — pixel-scale cells, no cartoon bar
const NODE_PIP_GAP = 1;
const NODE_PIP_HOLD_MS = 1500; // readable-at-a-glance window after the last hit
const NODE_PIP_FADE_MS = 250;
const NODE_PIP_FILL = 0xcfd6a8; // pale reed — far quieter than the mobs' bright green bar
const NODE_PIP_LOST = 0x4a4a40; // spent pips go dark, keeping max HP readable
const NODE_PUNCH_MS = 40; // squash punch per leg: rest → ~1.06 wide → rest (yoyo)
/** sprite-data key holding a node's in-flight punch tween (kill-restart, like SWING_TWEEN_KEY) */
const NODE_PUNCH_KEY = 'nodePunchTween';

/**
 * A node sprite's rest scale, re-derived instead of stored: trees plant at
 * 0.9 + (idHash % 40)/100, everything else at 1. The SINGLE source of truth —
 * addNode() plants with it, the regrow tween settles back to it, and the punch
 * tween kill-restarts against it, so the three can never drift apart.
 * Re-deriving (not storing) keeps the hot path free of any per-node
 * DataManager/field allocation across all 3,854 sprites.
 */
function nodeRestScale(state: NodeState): number {
  return state.type === 'tree' ? 0.9 + (idHash(state.id) % 40) / 100 : 1;
}
/** a host-simulated Husk/boss projectile (tile units; velocity tiles/second) */
interface DelveProjectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
}
/** a party-mate rendered inside the Delve from their interior position broadcasts */
interface DelvePeerView {
  marker: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  x: number;
  y: number;
}

/** Delve overlay draws above every persistent World object (max depth ≈ MAP_H·TILE)
 *  so the World is simply hidden behind it — no per-object visibility toggling. */
const DELVE_DEPTH_BG = 900_000;
const DELVE_DEPTH_FLOOR = 900_010;
const DELVE_DEPTH_ENTITY = 950_000; // + y (px) so player/mobs y-sort together
const DELVE_DEPTH_PROJ = 970_000;

/** an entity on a plateau adds this to its depth so it sorts above ANY base entity
 *  (bigger than the whole map's y-range, so overlaps at the cliff edge sort right) */
const ELEV_DEPTH_BONUS = MAP_H * TILE;

export class GameScene extends Phaser.Scene {
  private backend!: Backend;
  private me!: OkJoin;
  private world!: WorldData;
  groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private player!: Phaser.Physics.Arcade.Sprite;
  private nodes = new Map<string, NodeView>();
  private nodesByTile = new Map<string, string>();
  /**
   * J3: the damage-pip displays live ONLY here — created lazily on the first
   * damage shown for a node, destroyed by their own fade (or hideNodePips), so
   * steady state carries zero pip objects. Keyed by node id; at most a
   * screenful of entries exists even under heavy group harvesting.
   */
  private nodePips = new Map<string, { gfx: Phaser.GameObjects.Graphics; tween: Phaser.Tweens.Tween | null }>();
  /** reusable tooltip showing the name of the Resource Node under the cursor */
  nodeHoverLabel: Phaser.GameObjects.Text | null = null;
  private structuresByTile = new Map<string, Structure>();
  private structureIds = new Set<string>();
  /** per-structure display + collision objects, kept so a dismantle can tear them down */
  private structureViews = new Map<string, { objects: Phaser.GameObjects.GameObject[]; bodies: Phaser.GameObjects.Rectangle[]; glowImg: Phaser.GameObjects.Image | null }>();
  /** Sawmill blade sprites (v3): spun + puffing while the mill is working */
  private sawmillBlades = new Map<string, { blade: Phaser.GameObjects.Image; x: number; y: number; baseY: number; nextPuff: number }>();
  /** per-Sawmill "milling until" timestamp — derived from its last observed state */
  private sawmillMillingUntil = new Map<string, number>();
  blockersGroup!: Phaser.Physics.Arcade.StaticGroup;
  remotes = new Map<string, RemoteView>();
  private inventory: Inventory = {};
  /** the worn gear (ADR-0017 §4) — armor bakes into my sheet; the legacy weapon
   *  slots only ever DRAIN now (the HUD migration returns them to the bag) */
  private equipped: EquippedGear = {};
  /** un-sent equip intent (rapid toggles coalesce here) + the send serializer */
  private desiredEquip: EquippedGear | null = null;
  private equipChain: Promise<void> = Promise.resolve();
  private lastDir: Dir = 'down';
  private chatFocused = false;
  private placing: StructureId | null = null;
  private ghost: Phaser.GameObjects.Image | null = null;
  /** per-tile green/red footprint overlay while placing — shows WHICH tile blocks */
  private ghostCells: Phaser.GameObjects.Graphics | null = null;
  private lastPosSent = 0;
  private lastSwingAt = 0;
  // ---- ADR-0018 systems (referenced by other systems + transitional delegates)
  private fogSystem!: FogSystem;
  private atmosphere!: AtmosphereSystem;
  private fishingSystem!: FishingSystem;
  private sealSystem!: SealSystem;
  /**
   * Count of MY swings this session — incremented ONLY at the two lastSwingAt
   * stamp sites (never by remote-triggered playSwingFx replays) and shipped on
   * the position stream (PlayerPos.swings) so peers can echo my swings.
   */
  private swingCount = 0;
  private quest: QuestState | null = null;
  private tabletSpots: { id: string; x: number; y: number }[] = [];
  private altarPos = { x: 0, y: 0 };
  private gateParts: { sprite: Phaser.GameObjects.Image; body: Phaser.GameObjects.Rectangle }[] = [];
  private digMarker: Phaser.GameObjects.Text | null = null;
  // A3 (ADR-0010): the communal Village. `village` mirrors the backend record;
  // the aura/banner render its automatic grandeur around the founded Hall.
  village: VillageRecord = emptyVillage();
  private villageAura?: Phaser.GameObjects.Graphics;
  private villageBanner?: Phaser.GameObjects.Text;
  // ---- v2: the Guardian
  private fight: FightState | null = null;
  /** per-Warden altar/gate progress (ADR-0017) — mirrors the backend's view */
  private wardens: Record<string, WardenWorldState> = {};
  private guardianSprite!: Phaser.GameObjects.Sprite;
  private guardianShadow!: Phaser.GameObjects.Image;
  private guardianGlow!: Phaser.GameObjects.Image;
  private guardianEyeGlow!: Phaser.GameObjects.Image;
  private guardianHomeSpot: ArenaSpot = { ax: 0, ay: 0 };
  /** the Guardian's 3x3 collision bodies — during a fight they follow it as it lunges */
  private guardianBlockers: Phaser.GameObjects.Rectangle[] = [];
  private guardianAltarPos = { x: 0, y: 0 };
  private dangerRects: Phaser.GameObjects.Rectangle[] = [];
  /** the authored melee danger-ring's tiles, live only while it is hot (ADR-0006 §7) */
  private meleeRingRects: Phaser.GameObjects.Rectangle[] = [];
  private renderedWave = -1;
  private slammedWave = -1;
  private landedWave = -1;
  private furyIndex = -1;
  private eyeOpenShown = false;
  /** live first-strike: the Ward is deferred until wave 0's leap slams the gate */
  private wardPending = false;
  /** slain: left a broken wreck (angle/tint/dead glow) until summoned anew */
  private guardianBroken = false;
  private stunnedUntil = 0;
  private stunMarker: Phaser.GameObjects.Text | null = null;
  /** melee-ring shove cooldown: one push per contact so the tween can't restack (no stun) */
  private meleeRingShoveUntil = 0;
  fightMusic: Phaser.Sound.BaseSound | null = null;
  /** v5: the Ward — a fresh barrier slammed across the entrance for the fight */
  private wardParts: { sprite: Phaser.GameObjects.Image; body: Phaser.GameObjects.Rectangle }[] = [];
  /** arena-local center of the entrance (the sealGate) — the wave-0 Ward-slam spot */
  private entranceSpot: ArenaSpot = { ax: 0, ay: 0 };
  /** set once this Player is knocked out (3 knockdowns) — the Ward then bars re-entry */
  private exhaustedThisFight = false;
  // ---- ADR-0017 rung 1: the Mire Warden's parallel arena at the Mangrove Coast.
  // Each further Warden owns its OWN dormant+fight sprite (so both stay visibly
  // asleep in their courts, MP-correct); activeBoss() picks the set the running
  // fight drives, keyed by activeWarden (captured on summon, held through endFight).
  private mireSprite?: Phaser.GameObjects.Sprite;
  private mireShadow?: Phaser.GameObjects.Image;
  private mireGlow?: Phaser.GameObjects.Image;
  private mireEyeGlow?: Phaser.GameObjects.Image;
  private mireBlockers: Phaser.GameObjects.Rectangle[] = [];
  private mireHomeSpot: ArenaSpot = { ax: 0, ay: 0 };
  private mireEntranceSpot: ArenaSpot = { ax: 0, ay: 0 };
  private mireArenaRect: { x: number; y: number; w: number; h: number } | null = null;
  private mireSealGate: { tx: number; ty: number }[] = [];
  mireAltarPos = { x: 0, y: 0 };
  private mireMonumentPos = { x: 0, y: 0 };
  private mireBroken = false;
  // ---- ADR-0017 rung 2: the Echo Warden's parallel arena in The Cavern Mouth
  // (same second-dormant-sprite pattern as the Mire, MP-correct).
  private echoSprite?: Phaser.GameObjects.Sprite;
  private echoShadow?: Phaser.GameObjects.Image;
  private echoGlow?: Phaser.GameObjects.Image;
  private echoEyeGlow?: Phaser.GameObjects.Image;
  private echoBlockers: Phaser.GameObjects.Rectangle[] = [];
  private echoHomeSpot: ArenaSpot = { ax: 0, ay: 0 };
  private echoEntranceSpot: ArenaSpot = { ax: 0, ay: 0 };
  private echoArenaRect: { x: number; y: number; w: number; h: number } | null = null;
  private echoSealGate: { tx: number; ty: number }[] = [];
  echoAltarPos = { x: 0, y: 0 };
  private echoMonumentPos = { x: 0, y: 0 };
  private echoBroken = false;
  // ---- ADR-0017 rung 3: the Verdant Warden's parallel arena in the Green Terraces
  // (same dormant-sprite pattern as the Mire/Echo, MP-correct).
  private verdantSprite?: Phaser.GameObjects.Sprite;
  private verdantShadow?: Phaser.GameObjects.Image;
  private verdantGlow?: Phaser.GameObjects.Image;
  private verdantEyeGlow?: Phaser.GameObjects.Image;
  private verdantBlockers: Phaser.GameObjects.Rectangle[] = [];
  private verdantHomeSpot: ArenaSpot = { ax: 0, ay: 0 };
  private verdantEntranceSpot: ArenaSpot = { ax: 0, ay: 0 };
  private verdantArenaRect: { x: number; y: number; w: number; h: number } | null = null;
  private verdantSealGate: { tx: number; ty: number }[] = [];
  verdantAltarPos = { x: 0, y: 0 };
  private verdantMonumentPos = { x: 0, y: 0 };
  private verdantBroken = false;
  // ---- ADR-0017 rung 2: the Reverberant — a puzzle-SUMMONED boss (NOT dormant-
  // visible). Its sprite is pre-built hidden and revealed on summon; it rises in
  // the pedestal court (wardenArenas.reverb) when the 3-pedestal puzzle is solved.
  private reverbSprite?: Phaser.GameObjects.Sprite;
  private reverbShadow?: Phaser.GameObjects.Image;
  private reverbGlow?: Phaser.GameObjects.Image;
  private reverbEyeGlow?: Phaser.GameObjects.Image;
  private reverbBlockers: Phaser.GameObjects.Rectangle[] = [];
  private reverbHomeSpot: ArenaSpot = { ax: 0, ay: 0 };
  private reverbEntranceSpot: ArenaSpot = { ax: 0, ay: 0 };
  private reverbArenaRect: { x: number; y: number; w: number; h: number } | null = null;
  private reverbSealGate: { tx: number; ty: number }[] = [];
  private reverbBroken = false;
  /** the post-victory delayed hide (so the death-throes play): held so a fresh
   *  summon within the delay can CANCEL it — else the stale timer would hide the
   *  newly-risen boss mid-fight (invisible, walk-through) */
  private reverbHideTimer?: Phaser.Time.TimerEvent;
  /** guards the summon-on-solve from firing every frame while covered */
  private reverbSummonBusy = false;
  /** true once this Player has defeated the Reverberant this session (gates the memorial) */
  private reverbDefeated = false;
  // ---- ADR-0017 rung 2: the Echoes mechanic state (only active inside the Hushdark)
  /** the in-progress 20s recording (null when not recording); `greeting` = the
   *  permanent memorial mark rather than an ordinary vault-solving shade */
  private echoRecording: { ghostId: string; startedAt: number; lastSampleAt: number; samples: EchoSample[]; greeting?: boolean } | null = null;
  /** which ghost slot the next recording overwrites (a Player keeps ECHO_SLOTS shades) */
  private echoNextSlot = 0;
  /** the World's shades, refreshed from the backend (RPC read, never presence) */
  private echoGhosts: Ghost[] = [];
  private echoLastListAt = 0;
  /** per-ghost render sprites (greetings also carry a nameplate), reaped on district exit */
  private echoGhostViews = new Map<string, { sprite: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Image; label?: Phaser.GameObjects.Text }>();
  /** the pedestal + vault-door markers (rebuilt lazily for the active district) */
  private hushVaultGfx: Phaser.GameObjects.Graphics | null = null;
  /** vault ids the client currently derives as SOLVED (all pedestals covered) */
  private hushVaultOpen = new Set<string>();
  /** which Warden the active fight's VISUALS belong to (null = the Guardian, rung 0) */
  private activeWarden: string | null = null;
  // ---- Dungeons v1: the Delve (ADR-0007) — an ephemeral, host-simmed instance
  /** world-tile + pixel position of the sealed mine-shaft entrance */
  private delveEntrance = { x: 0, y: 0, tx: 0, ty: 0 };
  private delveEntranceSprite: Phaser.GameObjects.Container | null = null;
  /** ?dungeon / ?deep: treat the shaft as open regardless of the persisted flag */
  private delveForceOpen = DEV_DUNGEON || DEV_DEEP;
  /** ?deep: drop straight into the Deep on the first frame (dev playtest) */
  private pendingDeepEntry = DEV_DEEP;
  private rubbleHits = 0;
  /** captured World colliders, disabled while inside the Delve */
  private worldColliders: Phaser.Physics.Arcade.Collider[] = [];
  inDelve = false;
  private delveRunId: string | null = null;
  private isDelveHost = false;
  /** roster locked at entry (like the Ward) — no late join */
  private delveRoster: string[] = [];
  private delveHeadcount = 1;
  /** host: authoritative mob state (HP lives ONLY here — never the DB). Peers: last snapshot. */
  private mobs = new Map<string, MobState>();
  private mobViews = new Map<string, MobView>();
  /** J4: death-beat orphans mid-animation (views detached from mobViews so the
   *  render-sync sweep can't kill them) — reaped by teardownDelve so leaving
   *  the instance mid-tween never leaks a sprite or its puffs */
  private delveDeathFx = new Set<Phaser.GameObjects.GameObject[]>();
  /** host: live projectiles. Peers render them from snapshots. */
  private projectiles: DelveProjectile[] = [];
  private projViews = new Map<string, { sprite: Phaser.GameObjects.Sprite; glow: Phaser.GameObjects.Image }>();
  private delveObjects: Phaser.GameObjects.GameObject[] = [];
  /** per-room floor CanvasTexture keys — removed on teardown so a re-entry rebuilds */
  private delveFloorKeys: string[] = [];
  private delveBackdrop: Phaser.GameObjects.Rectangle | null = null;
  private delveWalls: Phaser.Physics.Arcade.StaticGroup | null = null;
  private delveWallCollider: Phaser.Physics.Arcade.Collider | null = null;
  /** my knockdowns this run; 3 → Exhaustion (out) */
  private delveKnockdowns = 0;
  private delveExhausted = false;
  /** did I land ≥1 hit this run? (participation-loot eligibility) */
  private delveHitLanded = false;
  /** boss Spoils not yet taken out of the read-only loot window (any boss) */
  private lootPending: Inventory = {};
  /** host-only: Husks felled (drives shard loot) + everyone who has landed a hit */
  private delveKills = 0;
  private delveParticipants = new Set<string>();
  private delvePeers = new Map<string, DelvePeerView>();
  /** the host's name — a peer boots itself if the host vanishes from presence (v1: no migration) */
  private delveHostName = '';
  /** the run I was Exhausted out of, kept so I still claim loot if my party wins */
  private delveExhaustedRun: string | null = null;
  private lastMobSnapAt = 0;
  private nextMobId = 1;
  private nextProjId = 1;
  /** which Stage of the Delve is live (ADR-0011/0015): 1 = the Delve, 2 = the
   *  Deep, 3+ = the generated Depths — the chain is endless */
  private delveStage: Stage = 1;
  /** the live Stage's boss fell and the in-Dungeon door to the next Depth is open */
  private deepDoorOpen = false;
  /** the Descent's id (ADR-0015): the Stage-1 runId, carried through the whole
   *  chain — the key every Stage clear's Depth Record write shares */
  private descentId = '';
  // ---- ADR-0012: open-world Wildlife — an ephemeral, host-simmed roaming pool
  /** host: authoritative creature state (HP lives ONLY here — never the DB). Guests: last snapshot. */
  private wildMobs = new Map<string, MobState>();
  private wildViews = new Map<string, MobView>();
  /** J4: death-beat orphans mid-animation (views detached from wildViews) —
   *  reaped by clearWildMobs so a creature-host change mid-beat never leaks */
  private wildDeathFx = new Set<Phaser.GameObjects.GameObject[]>();
  /** host-side gentle-roam state for idle peaceful creatures (orchestration, not engine AI) */
  private wildWander = new Map<string, { ang: number; until: number }>();
  /** host-side enrage ledger: a hit survivor charges the Player who shot it until
   *  the timer runs dry (refreshed per hit) — orchestration, not engine AI */
  private wildRage = new Map<string, { by: string; until: number }>();
  /** am I the elected creature host? (lowest-sorting online name — deterministic, zero negotiation) */
  private isWildHost = false;
  private wildHostName = '';
  private lastWildSpawnAt = 0;
  private lastWildSnapAt = 0;
  private nextWildId = 1;
  /** open-world knockdown timestamps — a rolling window (distinct from the Guardian's per-fight count) */
  private wildKnockdownTimes: number[] = [];
  // ---- v3: the Journey (onboarding tracker + contextual hints)
  private journey: JourneyState = { steps: {}, hintUses: {} };
  private hintText: Phaser.GameObjects.Text | null = null;
  // ---- v2: fishing, cooking, intro
  private buffUntil = 0;
  /** the standing Hall's sprite, re-textured to match the Village tier (ADR-0013) */
  private hallImg?: Phaser.GameObjects.Image;
  /** throttle for the "pack full" harvest toast (ADR-0013) */
  private packFullToastAt = 0;
  /** throttle for the tide-submerged reed refusal toast (ADR-0017 rung 1) */
  private tideToastAt = 0;
  /** throttle for the unripe-wildgrain harvest refusal toast (ADR-0017 rung 3) */
  private cultivationToastAt = 0;
  private welcomeStonePos = { x: 0, y: 0 };
  // ---- v4: Loadout — the single in-hand item, shown in the Player's hand + torch light
  private heldItem: ItemId | null = null;
  private heldSprite!: Phaser.GameObjects.Image;
  private torchGlow!: Phaser.GameObjects.Image;
  private playerShadow!: Phaser.GameObjects.Image;
  // ---- Realm districts (ADR-0017 §2): the "separate map" presentation state
  /** the district the Player stands in (camera clamp + minimap crop + dot filter); null = the World */
  activeDistrict: DistrictDef | null = null;
  /** both arches of every Realm gate, for the E-interaction scan */
  private realmGates: {
    d: DistrictDef;
    side: 'world' | 'district';
    x: number;
    y: number;
    /** everything this arch placed (container, blocker, shadow) — destroyable for a re-dress */
    objs: Phaser.GameObjects.GameObject[];
    glow?: Phaser.GameObjects.Image;
  }[] = [];
  private keys!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    e: Phaser.Input.Keyboard.Key;
    enter: Phaser.Input.Keyboard.Key;
    esc: Phaser.Input.Keyboard.Key;
    dismantle: Phaser.Input.Keyboard.Key;
  };
  /** id of a Building someone else placed, armed for a confirming second X-press */
  private dismantleArmed: { id: string; until: number } | null = null;
  /** whether the alt-fire mouse button (LMB) is currently held over the canvas (B1) */
  private lmbDown = false;
  // ---- ADR-0018: the humble-Scene decomposition seam
  /** the ONE shared-state object injected into every system (ADR-0018 §2) */
  private ctx!: GameContext;
  /**
   * The ordered system list — update() dispatches through it in the documented
   * §8 sequence. Filled one extraction at a time; empty is a no-op (scaffolding).
   */
  private systems: GameSystem[] = [];

  constructor() {
    super('GameScene');
  }

  /**
   * THE single inventory mutate+emit path (ADR-0018; exposed as
   * ctx.setInventory). Every former `this.inventory = X; bus.emit('inventory')`
   * pair funnels through here so pack state and the HUD can never diverge.
   */
  private setInv(inv: Inventory): void {
    this.setInv(inv);
  }

  /** build the shared GameContext (create(), right after the world JSON loads) */
  private buildContext(): void {
    const self = this;
    this.ctx = {
      scene: this,
      backend: this.backend,
      bus,
      world: this.world,
      me: this.me,
      get player(): Phaser.Physics.Arcade.Sprite {
        return self.player;
      },
      get mode(): Mode {
        return self.inDelve ? 'delve' : 'overworld';
      },
      held: {
        get item(): ItemId | null {
          return self.heldItem;
        },
        set item(v: ItemId | null) {
          self.heldItem = v;
        },
        get lastDir(): Dir {
          return self.lastDir;
        },
        set lastDir(v: Dir) {
          self.lastDir = v;
        },
      },
      get inventory(): Inventory {
        return self.inventory;
      },
      setInventory: (inv: Inventory) => this.setInv(inv),
      sfx: (key: string, volume: number) => this.sfx(key, volume),
      get journey(): JourneyState {
        return self.journey;
      },
    };
  }

  init(data: { backend: Backend; me: OkJoin }): void {
    this.backend = data.backend;
    this.me = data.me;
  }

  create(): void {
    this.world = this.cache.json.get('worldData') as WorldData;

    // ADR-0018: the shared context + the ordered system list, built up front so
    // world-dressing blocks below can already push into system-owned pools
    // (e.g. the atmosphere glow pool). On scene shutdown every system detaches
    // its bus listeners (destroy) — a world-switch restart must never
    // double-subscribe.
    this.buildContext();
    this.atmosphere = new AtmosphereSystem(this.ctx, this);
    this.systems.push(this.atmosphere);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const s of this.systems) s.destroy();
      this.systems = [];
    });

    const map = this.make.tilemap({ key: 'jungle-map' });
    const tileset = map.addTilesetImage(TILESET.name, TILESET.key)!;
    this.groundLayer = map.createLayer('ground', tileset, 0, 0)!;
    this.groundLayer.setDepth(-10);
    if (map.getLayer('decor')) {
      map.createLayer('decor', tileset, 0, 0)!.setDepth(-5);
    }
    this.groundLayer.setCollision(this.world.collide);

    this.physics.world.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    this.blockersGroup = this.physics.add.staticGroup();

    // decorative foliage (ruin pillars etc.) — solid, depth-sorted
    for (const f of this.world.foliage) {
      const x = (f.tx + 0.5) * TILE;
      const y = (f.ty + 1) * TILE;
      if (this.objImage(x, y, f.kind)) {
        this.addBlockerBody(f.tx, f.ty);
        this.addShadow(x, y - 1, 16);
      }
    }

    // parallax clouds drifting ABOVE the world, scrolling slightly faster
    // than the ground — fake-3D depth between layers. Deterministic spread
    // so every client sees the same sky.
    for (let i = 0; i < 18; i++) {
      const px = (i * 733 + 217) % (MAP_W * TILE);
      const py = (i * 1291 + 401) % (MAP_H * TILE);
      const c = this.add.image(px, py, `cloud${i % 3}`);
      c.setScale(1.5 + (i % 4) * 0.55);
      c.setAlpha(0.4 + (i % 3) * 0.06);
      c.setScrollFactor(1.22);
      c.setDepth(700_000);
      this.tweens.add({
        targets: c,
        x: px + 90 + (i % 5) * 35,
        duration: 26_000 + (i % 7) * 6_000,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inout',
      });
    }

    // lore tablets (E to read)
    for (const t of this.world.tablets) {
      const x = (t.tx + 0.5) * TILE;
      const y = (t.ty + 1) * TILE;
      this.objImage(x, y, 'tablet')?.setScale(0.55);
      this.tabletSpots.push({ id: t.id, x, y });
    }

    // grove altar (E with an offering)
    {
      const a = this.world.altar;
      const x = (a.tx + 1) * TILE;
      const y = (a.ty + 1) * TILE;
      this.objImage(x, y, 'altar');
      this.addBlockerBody(a.tx, a.ty);
      this.addBlockerBody(a.tx + 1, a.ty);
      this.altarPos = { x, y };
    }

    // ---- v2 landmarks
    // Seal monument outside the arena entrance — SealSystem.create (ADR-0018)
    this.sealSystem = new SealSystem(this.ctx, this);
    this.systems.push(this.sealSystem);
    this.sealSystem.create();
    // arena altar (E with a Summoning Totem)
    {
      const a = this.world.guardianAltar;
      const x = (a.tx + 1) * TILE;
      const y = (a.ty + 1) * TILE;
      this.objImage(x, y, 'guardian_altar');
      this.addBlockerBody(a.tx, a.ty);
      this.addBlockerBody(a.tx + 1, a.ty);
      this.addShadow(x, y - 1, 24);
      this.guardianAltarPos = { x, y };
    }
    // Welcome Stone beside the spawn (E to re-read the intro story)
    {
      const w = this.world.welcomeStone;
      const x = (w.tx + 0.5) * TILE;
      const y = (w.ty + 1) * TILE;
      this.objImage(x, y, 'welcome_stone')?.setScale(0.7);
      this.addBlockerBody(w.tx, w.ty);
      this.addShadow(x, y - 1, 18);
      this.welcomeStonePos = { x, y };
    }
    // the Guardian, colossal and slumbering on its 3x3 resting place
    {
      const g = this.world.guardianHome;
      const x = (g.tx + 1.5) * TILE;
      const y = (g.ty + 3) * TILE;
      // arena-local center tile of the resting place — the schedule's home spot
      this.guardianHomeSpot = { ax: g.tx + 1 - this.world.arena.x, ay: g.ty + 1 - this.world.arena.y };
      // arena-local center of the entrance (the sealGate the Ward re-seals). The
      // gate sits just below the arena, so ay is clamped in — wave 0's leap lands
      // in front of the doorway. Derived identically to the server's entranceSpot.
      {
        const a = this.world.arena;
        const gate = this.world.sealGate;
        const mid = gate[Math.floor(gate.length / 2)] ?? { tx: a.x + Math.floor(a.w / 2), ty: a.y + a.h - 1 };
        this.entranceSpot = {
          ax: Math.max(0, Math.min(a.w - 1, mid.tx - a.x)),
          ay: Math.max(0, Math.min(a.h - 1, mid.ty - a.y)),
        };
      }
      this.guardianSprite = this.add.sprite(x, y, 'guardian', 0);
      this.guardianSprite.setOrigin(0.5, 1);
      this.guardianSprite.setDepth(y);
      this.guardianShadow = this.addShadow(x, y - 2, 60);
      // the resting place blocks movement; during a fight the collision FOLLOWS
      // the Guardian as it lunges (and lifts while it is airborne) so Players can
      // walk into whatever tiles it has vacated — see positionGuardianBlockers()
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = 0; dx < 3; dx++) this.guardianBlockers.push(this.addBlockerBody(g.tx + dx, g.ty + dy));
      }
      // its cracked runes smolder at night, even asleep; during a fight the
      // tint tracks the fury phase (purple → orange → red)
      this.guardianGlow = this.add
        .image(x, y - 45, 'glow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xb478ff)
        .setScale(2.6)
        .setAlpha(0)
        .setDepth(890_001);
      this.atmosphere.glows.push({ img: this.guardianGlow, base: 0.5, x, y });
      // the amber eye's blaze while an Eye Window is open
      this.guardianEyeGlow = this.add
        .image(x, y - 61, 'glow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xffb437)
        .setScale(1.5)
        .setAlpha(0)
        .setDepth(890_002);
    }

    // ---- ADR-0017 rung 1: the Mire Warden's court on the Mangrove Coast — a
    // SECOND authored arena standing from day one (its own dormant sprite, altar
    // and offering monument), so both Wardens are visibly asleep in their courts.
    // Its fight runs here through activeBoss() (selected by fight.warden).
    const wa = this.world.wardenArenas?.mire;
    if (wa) {
      this.mireArenaRect = wa.arena;
      this.mireSealGate = wa.sealGate;
      // the summoning altar INSIDE the court, near the gate (E with a Mire Totem)
      {
        const a = wa.altar;
        const x = (a.tx + 1) * TILE;
        const y = (a.ty + 1) * TILE;
        this.objImage(x, y, 'guardian_altar');
        this.addBlockerBody(a.tx, a.ty);
        this.addBlockerBody(a.tx + 1, a.ty);
        this.addShadow(x, y - 1, 24);
        this.mireAltarPos = { x, y };
      }
      // the offering monument OUTSIDE the gate, on the approach (Seal-bars panel)
      {
        const m = wa.monument;
        const x = (m.tx + 1) * TILE;
        const y = (m.ty + 1) * TILE;
        this.objImage(x, y, 'seal_monument');
        this.addBlockerBody(m.tx, m.ty);
        this.addBlockerBody(m.tx + 1, m.ty);
        this.addShadow(x, y - 1, 22);
        this.mireMonumentPos = { x, y };
      }
      // the Mire Warden, colossal and slumbering on its 3x3 resting place
      {
        const g = wa.home;
        const arena = wa.arena;
        const art = KIT_ART.mire;
        const x = (g.tx + 1.5) * TILE;
        const y = (g.ty + 3) * TILE;
        this.mireHomeSpot = { ax: g.tx + 1 - arena.x, ay: g.ty + 1 - arena.y };
        const gate = wa.sealGate;
        const mid = gate[Math.floor(gate.length / 2)] ?? { tx: arena.x + Math.floor(arena.w / 2), ty: arena.y + arena.h - 1 };
        this.mireEntranceSpot = {
          ax: Math.max(0, Math.min(arena.w - 1, mid.tx - arena.x)),
          ay: Math.max(0, Math.min(arena.h - 1, mid.ty - arena.y)),
        };
        this.mireSprite = this.add.sprite(x, y, art.spriteKey, 0);
        this.mireSprite.setOrigin(0.5, 1);
        this.mireSprite.setDepth(y);
        this.mireShadow = this.addShadow(x, y - 2, 60);
        for (let dy = 0; dy < 3; dy++) {
          for (let dx = 0; dx < 3; dx++) this.mireBlockers.push(this.addBlockerBody(g.tx + dx, g.ty + dy));
        }
        this.mireGlow = this.add
          .image(x, y - 45, 'glow')
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(art.glowBase)
          .setScale(2.6)
          .setAlpha(0)
          .setDepth(890_001);
        this.atmosphere.glows.push({ img: this.mireGlow, base: 0.5, x, y });
        this.mireEyeGlow = this.add
          .image(x, y - 61, 'glow')
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(art.eyeTint)
          .setScale(1.5)
          .setAlpha(0)
          .setDepth(890_002);
      }
    }

    // ---- ADR-0017 rung 2: the Echo Warden's court in The Cavern Mouth — a THIRD
    // authored arena, its own dormant sprite/altar/monument (MP-correct), fought
    // through activeBoss() by fight.warden. Byte-for-byte the Mire block, echo* fields.
    const we = this.world.wardenArenas?.echo;
    if (we) {
      this.echoArenaRect = we.arena;
      this.echoSealGate = we.sealGate;
      {
        const a = we.altar;
        const x = (a.tx + 1) * TILE;
        const y = (a.ty + 1) * TILE;
        this.objImage(x, y, 'guardian_altar');
        this.addBlockerBody(a.tx, a.ty);
        this.addBlockerBody(a.tx + 1, a.ty);
        this.addShadow(x, y - 1, 24);
        this.echoAltarPos = { x, y };
      }
      {
        const m = we.monument;
        const x = (m.tx + 1) * TILE;
        const y = (m.ty + 1) * TILE;
        this.objImage(x, y, 'seal_monument');
        this.addBlockerBody(m.tx, m.ty);
        this.addBlockerBody(m.tx + 1, m.ty);
        this.addShadow(x, y - 1, 22);
        this.echoMonumentPos = { x, y };
      }
      {
        const g = we.home;
        const arena = we.arena;
        const art = KIT_ART.echo;
        const x = (g.tx + 1.5) * TILE;
        const y = (g.ty + 3) * TILE;
        this.echoHomeSpot = { ax: g.tx + 1 - arena.x, ay: g.ty + 1 - arena.y };
        const gate = we.sealGate;
        const mid = gate[Math.floor(gate.length / 2)] ?? { tx: arena.x + Math.floor(arena.w / 2), ty: arena.y + arena.h - 1 };
        this.echoEntranceSpot = {
          ax: Math.max(0, Math.min(arena.w - 1, mid.tx - arena.x)),
          ay: Math.max(0, Math.min(arena.h - 1, mid.ty - arena.y)),
        };
        this.echoSprite = this.add.sprite(x, y, art.spriteKey, 0);
        this.echoSprite.setOrigin(0.5, 1);
        this.echoSprite.setDepth(y);
        this.echoShadow = this.addShadow(x, y - 2, 60);
        for (let dy = 0; dy < 3; dy++) {
          for (let dx = 0; dx < 3; dx++) this.echoBlockers.push(this.addBlockerBody(g.tx + dx, g.ty + dy));
        }
        this.echoGlow = this.add
          .image(x, y - 45, 'glow')
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(art.glowBase)
          .setScale(2.6)
          .setAlpha(0)
          .setDepth(890_001);
        this.atmosphere.glows.push({ img: this.echoGlow, base: 0.5, x, y });
        this.echoEyeGlow = this.add
          .image(x, y - 61, 'glow')
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(art.eyeTint)
          .setScale(1.5)
          .setAlpha(0)
          .setDepth(890_002);
      }
    }

    // ---- ADR-0017 rung 3: the Verdant Warden's court in the Green Terraces — a
    // FOURTH authored arena, its own dormant sprite/altar/monument (MP-correct),
    // fought through activeBoss() by fight.warden. Byte-for-byte the Echo block, verdant* fields.
    const wv = this.world.wardenArenas?.verdant;
    if (wv) {
      this.verdantArenaRect = wv.arena;
      this.verdantSealGate = wv.sealGate;
      {
        const a = wv.altar;
        const x = (a.tx + 1) * TILE;
        const y = (a.ty + 1) * TILE;
        this.objImage(x, y, 'guardian_altar');
        this.addBlockerBody(a.tx, a.ty);
        this.addBlockerBody(a.tx + 1, a.ty);
        this.addShadow(x, y - 1, 24);
        this.verdantAltarPos = { x, y };
      }
      {
        const m = wv.monument;
        const x = (m.tx + 1) * TILE;
        const y = (m.ty + 1) * TILE;
        this.objImage(x, y, 'seal_monument');
        this.addBlockerBody(m.tx, m.ty);
        this.addBlockerBody(m.tx + 1, m.ty);
        this.addShadow(x, y - 1, 22);
        this.verdantMonumentPos = { x, y };
      }
      {
        const g = wv.home;
        const arena = wv.arena;
        const art = KIT_ART.verdant;
        const x = (g.tx + 1.5) * TILE;
        const y = (g.ty + 3) * TILE;
        this.verdantHomeSpot = { ax: g.tx + 1 - arena.x, ay: g.ty + 1 - arena.y };
        const gate = wv.sealGate;
        const mid = gate[Math.floor(gate.length / 2)] ?? { tx: arena.x + Math.floor(arena.w / 2), ty: arena.y + arena.h - 1 };
        this.verdantEntranceSpot = {
          ax: Math.max(0, Math.min(arena.w - 1, mid.tx - arena.x)),
          ay: Math.max(0, Math.min(arena.h - 1, mid.ty - arena.y)),
        };
        this.verdantSprite = this.add.sprite(x, y, art.spriteKey, 0);
        this.verdantSprite.setOrigin(0.5, 1);
        this.verdantSprite.setDepth(y);
        this.verdantShadow = this.addShadow(x, y - 2, 60);
        for (let dy = 0; dy < 3; dy++) {
          for (let dx = 0; dx < 3; dx++) this.verdantBlockers.push(this.addBlockerBody(g.tx + dx, g.ty + dy));
        }
        this.verdantGlow = this.add
          .image(x, y - 45, 'glow')
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(art.glowBase)
          .setScale(2.6)
          .setAlpha(0)
          .setDepth(890_001);
        this.atmosphere.glows.push({ img: this.verdantGlow, base: 0.5, x, y });
        this.verdantEyeGlow = this.add
          .image(x, y - 61, 'glow')
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(art.eyeTint)
          .setScale(1.5)
          .setAlpha(0)
          .setDepth(890_002);
      }
    }

    // ---- ADR-0017 rung 2: the Reverberant — pre-built HIDDEN (no altar/monument;
    // summoned by the puzzle). The sprite/glow/blockers exist so activeBoss('reverb')
    // routes correctly, but stay invisible + disabled until it RISES on summon
    // (startFight) and are hidden again on defeat (endFight). NOT in `this.atmosphere.glows`
    // (no dormant ambient pulse — the fight drives its glow).
    const wr = this.world.wardenArenas?.reverb;
    if (wr) {
      this.reverbArenaRect = wr.arena;
      this.reverbSealGate = wr.sealGate;
      const g = wr.home;
      const arena = wr.arena;
      const art = KIT_ART.reverb;
      const x = (g.tx + 1.5) * TILE;
      const y = (g.ty + 3) * TILE;
      this.reverbHomeSpot = { ax: g.tx + 1 - arena.x, ay: g.ty + 1 - arena.y };
      const gate = wr.sealGate;
      const mid = gate[Math.floor(gate.length / 2)] ?? { tx: arena.x + Math.floor(arena.w / 2), ty: arena.y + arena.h - 1 };
      this.reverbEntranceSpot = {
        ax: Math.max(0, Math.min(arena.w - 1, mid.tx - arena.x)),
        ay: Math.max(0, Math.min(arena.h - 1, mid.ty - arena.y)),
      };
      this.reverbSprite = this.add.sprite(x, y, art.spriteKey, 0).setOrigin(0.5, 1).setDepth(y).setTint(0xc9b0ff).setScale(1.15).setVisible(false);
      this.reverbShadow = this.addShadow(x, y - 2, 66).setVisible(false);
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = 0; dx < 3; dx++) {
          const b = this.addBlockerBody(g.tx + dx, g.ty + dy);
          (b.body as Phaser.Physics.Arcade.StaticBody).enable = false;
          this.reverbBlockers.push(b);
        }
      }
      this.reverbGlow = this.add.image(x, y - 45, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(art.glowBase).setScale(2.8).setAlpha(0).setDepth(890_001).setVisible(false);
      this.reverbEyeGlow = this.add.image(x, y - 61, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(art.eyeTint).setScale(1.6).setAlpha(0).setDepth(890_002).setVisible(false);
    }

    // player — the Avatar texture is composed from this Player's palette picks
    // (+ the worn Armor overlays, restored from the join and re-baked on equip).
    // Armor is worn by moving it out of the bag, so keep the worn set as-is (the
    // backend already normalized any legacy worn-AND-in-bag save on join).
    this.equipped = sanitizeEquipped(this.me.equipped);
    const myTexture = `avatar-${this.me.name}`;
    ensureAvatarTexture(this, myTexture, this.me.appearance, this.equipped);
    this.playerShadow = this.addShadow(this.me.x, this.me.y, 14);
    this.player = this.physics.add.sprite(this.me.x, this.me.y, myTexture, AVATAR_IDLE.down);
    this.player.setOrigin(0.5, 1);
    const bw = 10;
    const bh = 8;
    this.player.body!.setSize(bw, bh);
    this.player.body!.setOffset((AVATAR_W - bw) / 2, AVATAR_H - bh);
    this.player.setCollideWorldBounds(true);
    // kept so they can be disabled while inside the Delve (which swaps in its own
    // wall collider); the World is only hidden behind the overlay, not unloaded
    this.worldColliders = [
      this.physics.add.collider(this.player, this.groundLayer),
      this.physics.add.collider(this.player, this.blockersGroup),
    ];

    // v4: Loadout visuals — created before wireBus()/the first inventory emit so
    // the initial 'held' event can update them. Light now comes only from a held
    // Hand Torch (the automatic player glow is gone) — warm orange, bigger and
    // more saturated than the old glow; the in-hand icon floats over the head.
    this.torchGlow = this.add
      .image(this.player.x, this.player.y - 8, 'glow')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(TORCH_TINT)
      .setScale(1.6)
      .setAlpha(0)
      .setDepth(890_000);
    this.heldSprite = this.add
      .image(this.player.x, this.player.y, 'held-axe')
      .setOrigin(0.5, 0.5)
      .setScale(0.8)
      .setDepth(this.player.y + 1)
      .setVisible(false);

    const cam = this.cameras.main;
    // clamp to the region the Player stands in: a Realm district's rect, or the
    // pinned pre-Realm World (never the full grown grid — the void band and the
    // districts beyond must not scroll into view). Re-derived on the checkZone
    // tick, so every cross-region reposition (gates, Exhaustion wake, recall,
    // login inside a district) re-clamps without touching each call site.
    this.applyCameraRegion(true);
    cam.setZoom(ZOOM);
    cam.startFollow(this.player, true, 0.15, 0.15);
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      // Whole-number zoom only. The gutterless tileset bleeds thin dark seams
      // between tiles at every fractional zoom (nearest-neighbour sampling
      // straddles tile edges); integer zoom maps each texel to exactly N pixels
      // so edges never straddle. Step in whole levels rather than *1.15.
      cam.setZoom(Phaser.Math.Clamp(Math.round(cam.zoom) + (dy > 0 ? -1 : 1), 2, 5));
      // name tags are counter-scaled by zoom to stay readable — re-apply now
      this.applyWorldLabelScale();
    });
    // B1: the left mouse button is alternative fire for the held-E swing loop
    // (harvest + combat) — held-to-repeat at weapon cadence. These fire only for
    // pointers over the Phaser canvas, so a click on the DOM HUD/craft panel is
    // never a swing; the swing gate in update() further restricts it to
    // `swing: true` actions (one-shot interactions stay E-only).
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.leftButtonDown()) this.lmbDown = true;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!p.leftButtonDown()) this.lmbDown = false;
    });
    // releasing outside the canvas, or losing the pointer, must also drop the hold
    this.input.on('pointerupoutside', () => (this.lmbDown = false));
    this.input.on('gameout', () => (this.lmbDown = false));

    // animated water: repaint the water tile inside the shared canvas tileset
    const tilesTex = this.textures.get(TILESET.key);
    if (tilesTex instanceof Phaser.Textures.CanvasTexture && this.textures.exists('water-frames')) {
      const frames = this.textures.get('water-frames').getSourceImage() as HTMLImageElement;
      let waterFrame = 0;
      this.time.addEvent({
        delay: 550,
        loop: true,
        callback: () => {
          waterFrame = (waterFrame + 1) % 3;
          tilesTex.context.clearRect(16, 0, 16, 16);
          tilesTex.context.drawImage(frames, waterFrame * 16, 0, 16, 16, 16, 0, 16, 16);
          // the Mire's black water breathes on the same clock — the frame is
          // drowned under dark teal so it barely glints (tile id 14, x=224)
          const mx = 14 * 16;
          tilesTex.context.clearRect(mx, 0, 16, 16);
          tilesTex.context.drawImage(frames, waterFrame * 16, 0, 16, 16, mx, 0, 16, 16);
          tilesTex.context.save();
          tilesTex.context.globalCompositeOperation = 'source-atop';
          tilesTex.context.fillStyle = 'rgba(10, 30, 29, 0.82)';
          tilesTex.context.fillRect(mx, 0, 16, 16);
          tilesTex.context.restore();
          tilesTex.refresh();
        },
      });
    }

    const kb = this.input.keyboard!;
    this.keys = {
      up: kb.addKey('UP'),
      down: kb.addKey('DOWN'),
      left: kb.addKey('LEFT'),
      right: kb.addKey('RIGHT'),
      w: kb.addKey('W'),
      a: kb.addKey('A'),
      s: kb.addKey('S'),
      d: kb.addKey('D'),
      e: kb.addKey('E'),
      enter: kb.addKey('ENTER'),
      esc: kb.addKey('ESC'),
      dismantle: kb.addKey('X'),
    };

    this.inventory = { ...this.me.inventory };
    this.journey = { steps: { ...this.me.journey.steps }, hintUses: { ...this.me.journey.hintUses } };
    this.hintText = this.add
      .text(0, 0, '', { fontSize: '9px', color: '#ffd166', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setResolution(4)
      .setDepth(999_998)
      .setVisible(false);
    this.tweens.add({ targets: this.hintText, alpha: { from: 1, to: 0.55 }, duration: 700, yoyo: true, repeat: -1 });
    this.bakeVillageTextures(); // A3: generate the Village Buildings' sprites (no PNG assets)
    this.wireBackend();
    this.wireBus();
    this.recomputeWildHost(); // ADR-0012: elect the creature host now (re-run on every presence sync)
    bus.emit('journey', this.journey);

    void this.backend.loadWorld().then((snap) => {
      this.applyVillage(snap.village); // before structures so the Hall's grandeur is ready
      for (const n of snap.nodes) this.addNode(n);
      for (const s of snap.structures) this.addStructure(s);
      for (const p of snap.players) this.upsertRemote(p);
      bus.emit('chatlog', snap.chatLog);
      this.emitPresence();
      this.applyQuest(snap.quest);
      if (!snap.quest.gateOpen) this.buildGate();
      this.sealSystem.applySeal(snap.seal);
      if (!snap.seal.broken) this.sealSystem.buildSealBarrier();
      // ADR-0017: per-Warden altar/gate progress — re-dress gates already open
      this.wardens = snap.wardens ?? {};
      for (const [id, w] of Object.entries(this.wardens)) bus.emit('warden-altar', id, w.altar);
      bus.emit('wardens', this.wardens); // the Chapter-2 tracker phases tick off altar.broken/gateOpen
      this.rebuildRealmGates();
      // joining mid-fight: dormant or engaged, the state derives from the fight
      // row (engagedAt), not from having witnessed the summon/engage events
      if (snap.fight) this.startFight(snap.fight, false);
      // ADR-0015: seed the Hall panel's Depth Record teaser (records accrue from
      // the first Descent even while the Grand Monument is unbuilt)
      this.refreshDepthRecords();
      this.emitSawmillBuilt(); // Into-the-Delve step: a Sawmill stands in the World
    });
    // 'equipped' BEFORE 'inventory': the HUD's loadout reconcile persists on the
    // inventory event and checks ownership through the gear record too — the
    // reverse order let it wipe gear-held legacy weapons before gear arrived
    bus.emit('equipped', this.equipped);
    bus.emit('inventory', this.inventory);

    // lazy regrowth visuals — timestamp-derived, no game tick (the zone tick
    // now lives in FogSystem.create)
    this.time.addEvent({ delay: 600, loop: true, callback: () => { this.checkRegrowthVisuals(); this.refreshWildgrainStages(); } });

    // AtmosphereSystem.create() covers (in the original order): the ambient +
    // waterfall audio beds, day/night + veil overlays, mist puffs, fireflies,
    // leaves, and the elevation/waterfall world dressing (ADR-0009).
    this.atmosphere.create();
    this.fogSystem = new FogSystem(this.ctx, this, this.atmosphere);
    this.fogSystem.seal = this.sealSystem;
    this.systems.push(this.fogSystem);
    this.fogSystem.create();
    this.atmosphere.fog = this.fogSystem;
    this.fishingSystem = new FishingSystem(this.ctx, this);
    this.systems.push(this.fishingSystem);
    this.fishingSystem.create();
    this.wireDragPlace();
    this.buildDelveEntrance();
    this.buildRealmGates();

    if (DEV_WILD) {
      // ADR-0012 solo verify: drop into a danger-flagged frontier Zone (The Cavern
      // Mouth, walkable ground clear of the Delve shaft) so predators are eligible
      // right away. The lone MockBackend Player is the creature host — sim is local.
      this.player.setPosition((80 + 0.5) * TILE, (240 + 0.5) * TILE);
    }

    if (import.meta.env.DEV) {
      (window as any).__jw = {
        scene: this,
        state: () => ({
          player: { x: this.player.x, y: this.player.y, tx: Math.floor(this.player.x / TILE), ty: Math.floor(this.player.y / TILE) },
          zone: this.fogSystem.currentZone,
          inventory: { ...this.inventory },
          remotes: [...this.remotes.keys()],
          muted: this.atmosphere.muted,
        }),
        teleport: (tx: number, ty: number) => {
          this.player.setPosition((tx + 0.5) * TILE, (ty + 0.5) * TILE);
        },
        grant: (items: Inventory) => {
          const inv = (this.backend as any).debugGrant?.(items) as Inventory | null;
          if (inv) {
            this.setInv(inv);
          }
        },
        // ADR-0011 Deep playtest handles (dev only) — drive the chained Stages
        delve: {
          stage: () => this.delveStage,
          inDelve: () => this.inDelve,
          doorOpen: () => this.deepDoorOpen,
          mobs: () =>
            [...this.mobs.values()].map((m) => ({
              id: m.id, kind: m.kind, hp: m.hp, maxHp: m.maxHp, st: m.st, erupt: !!m.erupt, guard: !!m.guard,
              x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10,
            })),
          enterStage1: () => this.enterDelve(),
          enterDeep: () => this.enterDeepDirect(),
          descend: () => this.descendNextStage(),
          /** force the next signature move (eruption/slam/wall/birth) to charge now */
          erupt: () => {
            for (const m of this.mobs.values()) {
              if (m.st !== 'dead' && profileOf(m.kind).eruptEveryMs) { m.eruptCd = 0; return true; }
            }
            return false;
          },
          /** fell one mob by id as a lethal host-adjudicated hit (drives the real loot/door/complete path) */
          fell: (id: string) => {
            const m = this.mobs.get(id);
            if (!m || m.st === 'dead') return false;
            this.delveHitLanded = true;
            this.delveParticipants.add(this.me.name);
            m.hp = 0;
            m.st = 'dead';
            this.onMobFelled(m);
            return true;
          },
          /** fell every Husk (leaves the boss) — bank kills for shard loot */
          fellHusks: () => {
            let n = 0;
            for (const m of [...this.mobs.values()]) {
              if (isBossKind(m.kind) || m.st === 'dead') continue;
              this.delveHitLanded = true;
              this.delveParticipants.add(this.me.name);
              m.hp = 0;
              m.st = 'dead';
              this.onMobFelled(m);
              n++;
            }
            return n;
          },
          /** fell the current Stage boss (pays loot + Record, opens the next door — ADR-0015) */
          fellBoss: () => {
            for (const m of [...this.mobs.values()]) {
              if (!isBossKind(m.kind) || m.st === 'dead') continue;
              this.delveHitLanded = true;
              this.delveParticipants.add(this.me.name);
              m.hp = 0;
              m.st = 'dead';
              this.onMobFelled(m);
              return true;
            }
            return false;
          },
        },
        // ADR-0012 open-world Wildlife playtest handles (dev only)
        wild: {
          host: () => ({ isHost: this.isWildHost, hostName: this.wildHostName, roster: this.backend.creatureRoster() }),
          list: () =>
            [...this.wildMobs.values()].map((m) => ({
              id: m.id, kind: m.kind, st: m.st, hp: m.hp, maxHp: m.maxHp,
              predator: isWildKind(m.kind) && isPredator(m.kind as WildKind),
              x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10,
              danger: this.dangerAt(Math.floor(m.x), Math.floor(m.y)),
              rage: !!m.rage, rageBy: this.wildRage.get(m.id)?.by ?? null,
            })),
          danger: (tx?: number, ty?: number) =>
            this.dangerAt(tx ?? Math.floor(this.player.x / TILE), ty ?? Math.floor((this.player.y - 4) / TILE)),
          knockdowns: () => this.wildKnockdownTimes.length,
          /** force-spawn one creature near the Player (host only): kind or 'predator'/'peaceful' */
          spawn: (kind: string) => {
            if (!this.isWildHost) return null;
            const tx = Math.floor(this.player.x / TILE) + 2;
            const ty = Math.floor((this.player.y - 4) / TILE);
            let k = kind as WildKind;
            if (kind === 'predator') k = 'jaguar';
            else if (kind === 'peaceful') k = 'capybara';
            const id = `w${this.nextWildId++}`;
            this.wildMobs.set(id, createMob(id, { kind: k, x: tx + 0.5, y: ty + 0.5 }, 1));
            return id;
          },
          /** the speeds every creature obeys vs the Player's (AC4 flee-always proof) */
          speeds: () => ({
            playerTilesPerSec: PLAYER_SPEED / TILE,
            playerBuffed: (PLAYER_SPEED * SPEED_BUFF_FACTOR) / TILE,
            creatures: (['capybara', 'deer', 'boar', 'jaguar'] as WildKind[]).map((kk) => ({
              kind: kk, speed: profileOf(kk).speed, lunge: profileOf(kk).lungeSpeed,
            })),
          }),
        },
      };
    }
  }

  // ------------------------------------------------------------ wiring

  private wireBackend(): void {
    this.backend.on('chat', (msg: ChatMsg) => {
      bus.emit('chat', msg);
      if (msg.from !== this.me.name) this.sfx('blip', 0.04);
    });
    this.backend.on('nodeChanged', (n: NodeState) => this.updateNode(n));
    this.backend.on('structurePlaced', (s: Structure) => {
      this.addStructure(s);
      // guarded like addStructure: an old client can still place a retired type
      // (hammock/table/obsidian_path) during a rollout window
      if (s.placedBy !== this.me.name) bus.emit('toast', t.builtBy(s.placedBy, ITEMS[s.type]?.name ?? s.type), 'info');
      if (s.type === 'sawmill') this.emitSawmillBuilt();
    });
    this.backend.on('structureRemoved', (id: string) => {
      this.removeStructure(id);
      this.emitSawmillBuilt(); // the last Sawmill may have just come down
    });
    this.backend.on('crateChanged', (crateId: string, contents: Inventory) => {
      bus.emit('crate-changed', crateId, contents);
    });
    this.backend.on('position', (p: PlayerPos) => this.upsertRemote(p));
    this.backend.on('presence', (players: PlayerPos[]) => this.reconcilePresence(players));
    this.backend.on('quest', (q: QuestState) => this.applyQuest(q));
    this.backend.on('gateOpened', () => this.openGateVisual());
    this.backend.on('villageChanged', (v: VillageRecord) => this.applyVillage(v));
    this.backend.on('guardianSummoned', (f: FightState) => this.startFight(f, true));
    this.backend.on('guardianEngaged', (f: FightState) => this.engageFight(f));
    this.backend.on('guardianHit', (hp: number) => {
      if (this.fight) {
        this.fight = { ...this.fight, hp };
        bus.emit('fight-hp', hp);
        const hitSpr = this.activeBoss().sprite;
        hitSpr.setTintFill(0xffffff);
        this.time.delayedCall(60, () => hitSpr.clearTint());
      }
    });
    this.backend.on('guardianVictory', (participants: string[]) => {
      // capture the fallen colossus BEFORE endFight clears the slot (ADR-0017)
      const wardenId = this.fight?.warden ?? null;
      this.endFight('victory');
      // every fighter who landed a hit collects their drops from the Spoils window
      // (the grant is deferred to the take — see openLoot/claimLoot). Non-fighters
      // in the arena still get the death-throes spectacle, but no loot bag.
      if (participants.includes(this.me.name)) {
        // ADR-0017 rung 2: the Reverberant's reward flows through a SERVER-GUARDED
        // claim (epic helm + reliquary once-ever, Echo Sigil + resources weekly) —
        // not the free Spoils window, so it can't be farmed by re-summoning.
        if (wardenId === 'reverb') {
          void this.claimReverbReward();
        } else {
          const def = wardenDef(wardenId);
          if (def) this.openLoot({ ...def.drops, ...this.rollFabledDrops() }, t.loot.fromWarden(t.warden.name(def.id)));
          else this.openLoot({ guardian_scale: GUARDIAN_SCALE_DROP, ...this.rollFabledDrops() }, t.loot.fromGuardian);
        }
      }
    });
    this.backend.on('guardianSlumber', () => this.endFight('slumber'));
    // ADR-0017: a Warden altar's pooled Offering moved (or broke)
    this.backend.on('wardenAltarChanged', (id: string, altar: WardenAltarState) => {
      const w = (this.wardens[id] ??= { altar, gateOpen: false });
      w.altar = altar;
      bus.emit('warden-altar', id, altar);
      bus.emit('wardens', this.wardens);
      if (altar.broken) bus.emit('toast', t.toast.wardenAwaitsTotem(ITEMS[wardenDef(id)?.totem ?? 'summon_totem'].name), 'good');
    });
    // ADR-0017: a Realm gate opened — one-time, forever; re-dress its arches
    this.backend.on('realmOpened', (id: string) => {
      const w = (this.wardens[id] ??= { altar: { broken: false, contributed: {}, quotas: {} }, gateOpen: true });
      w.gateOpen = true;
      bus.emit('wardens', this.wardens);
      bus.emit('toast', t.toast.realmGateKeyTurn(t.warden.realmName(id)), 'good');
      this.sfx('seal_gong', 0.6);
      this.rebuildRealmGates();
    });
    this.backend.on('delveOpened', () => this.refreshDelveEntrance(true));
    this.backend.on('dungeon', (msg: DungeonMsg) => this.onDungeonMsg(msg));
    this.backend.on('creatures', (msg: CreatureMsg) => this.onCreatureMsg(msg));
  }

  // ------------------------------------------------------------ A3: the Village (ADR-0010)

  /** bake a sprite for every Village Building + Wildlife decor from its art spec — no PNGs */
  private bakeVillageTextures(): void {
    for (const [id, art] of Object.entries({ ...VILLAGE_ART, ...WILDLIFE_ART, ...FORGE_ART, ...KILN_ART, ...CHIME_KILN_ART, ...VERDANT_LOOM_ART, ...RELIQUARY_ART })) {
      if (!art) continue;
      const key = `st_${id}`;
      if (this.textures.exists(key)) continue;
      const { w, h } = footprint(id as StructureId);
      const W = w * TILE;
      // buildings/monuments stand a tile (or two) taller than their footprint so
      // the roof pokes up like every other object; decor stays low. `rise` overrides
      // (the bell-towered hall rises 3 tiles so it out-scales the houses).
      const extra = art.rise ?? (art.shape === 'monument' ? 2 : 1);
      const H = (h + extra) * TILE;
      const tex = this.textures.createCanvas(key, W, H);
      if (!tex) continue;
      drawStructureArt(tex.context, W, H, art);
      tex.refresh();
    }
    // ADR-0013: the Hall re-sprites per Village tier (hut → grand bell-tower).
    // Bake one texture per tier at the SAME size as st_village_hall so the
    // standing sprite can be swapped in refreshVillageVisuals without moving.
    const hallArt = VILLAGE_ART.village_hall;
    if (hallArt) {
      const { w, h } = footprint('village_hall');
      const W = w * TILE;
      const H = (h + (hallArt.rise ?? 1)) * TILE;
      for (let tier = 1; tier <= VILLAGE_MAX_TIER; tier++) {
        const key = `st_village_hall_${tier}`;
        if (this.textures.exists(key)) continue;
        const tex = this.textures.createCanvas(key, W, H);
        if (!tex) continue;
        drawStructureArt(tex.context, W, H, hallArt, tier);
        tex.refresh();
      }
    }
  }

  private applyVillage(v: VillageRecord): void {
    const wasFestival = festivalActive(this.village, Date.now());
    this.village = { ...v, hall: v.hall ? { ...v.hall } : null };
    const nowFestival = festivalActive(this.village, Date.now());
    // a Dorffest can start from anyone's wish — announce the transition + drive the HUD badge
    if (nowFestival && !wasFestival) bus.emit('toast', t.toast.festivalStarted, 'good');
    bus.emit('festival', nowFestival ? this.village.festivalUntil ?? 0 : 0);
    bus.emit('village', this.village);
    this.refreshVillageVisuals();
  }

  /**
   * The Village's automatic grandeur (ADR-0010 §3): a warm aura that grows and
   * brightens each tier around the founded Hall, the fainter ring marking the
   * village zone (where builds advance the tier), and a tier banner overhead.
   */
  private refreshVillageVisuals(): void {
    const hall = this.village.hall;
    if (!hall) {
      this.villageAura?.destroy();
      this.villageAura = undefined;
      this.villageBanner?.destroy();
      this.villageBanner = undefined;
      this.hallImg = undefined;
      return;
    }
    const { w, h } = footprint('village_hall');
    const cx = (hall.tx + w / 2) * TILE;
    const cy = (hall.ty + h / 2) * TILE;
    const tier = Math.max(1, this.village.tier);
    // ADR-0013: the standing Hall re-sprites to match the current tier
    if (this.hallImg?.active) this.hallImg.setTexture(`st_village_hall_${Math.min(VILLAGE_MAX_TIER, tier)}`);
    const warm = 0xffca7a;
    if (!this.villageAura) this.villageAura = this.add.graphics().setDepth(-3);
    const g = this.villageAura;
    g.clear();
    const radius = (5 + tier * 2.5) * TILE; // grows each tier — visible grandeur
    g.fillStyle(warm, 0.04 + tier * 0.012);
    g.fillCircle(cx, cy, radius);
    g.lineStyle(2, warm, 0.3 + tier * 0.04);
    g.strokeCircle(cx, cy, radius);
    g.lineStyle(1, 0xffe9c9, 0.18); // the village zone: only in-zone builds advance the tier
    g.strokeCircle(cx, cy, VILLAGE_ZONE_RADIUS * TILE);
    const label = `🏛 ${this.village.name?.trim() || t.village.tierName(tier)}`;
    const by = hall.ty * TILE - 6;
    if (!this.villageBanner) {
      this.villageBanner = this.add
        .text(cx, by, label, { fontSize: '9px', color: '#ffe9c9', stroke: '#3a2a18', strokeThickness: 3 })
        .setOrigin(0.5, 1)
        .setResolution(4)
        .setDepth(890_000);
    } else {
      this.villageBanner.setText(label).setPosition(cx, by);
    }
  }

  /**
   * E at the Hall opens the contribution panel (the HUD builds a slider per
   * qualifying Resource from the current inventory). If nothing carried qualifies
   * there is nothing to choose, so skip straight to the "nothing to give" toast.
   */
  private openVillageContribute(): void {
    // the pool stops at the next tier's threshold until the milestone stands —
    // a full pool refuses the panel outright so nothing can be taken
    if (villagePoolCap(this.village.tier) - this.village.pool <= 0) {
      bus.emit('toast', t.toast.villagePoolFull, 'bad');
      return;
    }
    if (villageContribution(this.inventory).points <= 0) {
      bus.emit('toast', t.toast.villageNothingToGive, 'bad');
      return;
    }
    bus.emit('village-give-open', { ...this.inventory });
  }

  /**
   * Pour the chosen amounts into the communal pool (the panel's Give button).
   * `amounts` caps each item; omitted means "give it all" (kept for safety).
   */
  private contributeVillage(amounts?: Inventory): void {
    // pre-clamp to the pool's remaining room so even the CURRENT live (cap-less)
    // server can never over-fill — the explicit clamped amounts are what we send
    const room = villagePoolCap(this.village.tier) - this.village.pool;
    const clamped = villageContribution(this.inventory, amounts, Math.max(0, room));
    if (clamped.points <= 0) {
      bus.emit('toast', room <= 0 ? t.toast.villagePoolFull : t.toast.villageNothingToGive, 'bad');
      bus.emit('village-give-close');
      return;
    }
    void this.backend.contributeVillage(clamped.taken).then((res) => {
      if (!res.ok) {
        if (res.reason === 'NOTHING_TO_GIVE') bus.emit('toast', t.toast.villageNothingToGive, 'bad');
        if (res.reason === 'POOL_FULL') bus.emit('toast', t.toast.villagePoolFull, 'bad');
        return;
      }
      this.setInv(res.inventory);
      const h = this.village.hall;
      if (h) this.floatText((h.tx + 1) * TILE, h.ty * TILE - 8, `+${res.gained}`, '#ffca7a');
      bus.emit('toast', t.toast.villageContributed(res.gained), 'good');
      this.sfx('place', 0.6);
      bus.emit('village-give-close');
    });
  }

  /** true if a Village Hall may be raised now — only one may stand at a time (re-found by dismantling) */
  private canFoundHall(): boolean {
    if (this.village.hall) {
      bus.emit('toast', t.toast.hallAlreadyStands, 'bad');
      return false;
    }
    return true;
  }

  // ------------------------------------------------------------ v2: the Guardian fight

  /**
   * A summon (or a mid-fight join). A DORMANT Guardian (`engagedAt === null`)
   * roams harmlessly — the arena open, no Ward, no danger schedule — until the
   * first strike engages it. An already-engaged fight (mid-join) goes straight
   * to the live schedule (Ward already up), derived from `engagedAt`.
   */
  /** the ACTIVE fight's kit (ADR-0017): fight.warden picks it; the Guardian by default */
  private fightKit(): WardenKit {
    return kitOf(this.fight?.warden);
  }

  /** the active fight's display name, or null for the Guardian (rung 0) */
  private fightWardenName(fight: FightState | null): string | null {
    return fight?.warden ? t.warden.name(fight.warden) : null;
  }

  /**
   * The render bundle (sprite + glow + arena anatomy + palette) of the Warden the
   * active fight belongs to — selected by `activeWarden` (set on summon, held
   * through endFight so the wreck/reset lands on the right boss). Defaults to the
   * Guardian. Every fight-render/adjudication site reads through this so a second
   * Warden fights in its OWN court with its OWN look, no per-site branching.
   */
  private activeBoss() {
    if (this.activeWarden === 'mire' && this.mireSprite && this.mireArenaRect) {
      return {
        sprite: this.mireSprite,
        shadow: this.mireShadow!,
        glow: this.mireGlow!,
        eyeGlow: this.mireEyeGlow!,
        blockers: this.mireBlockers,
        arena: this.mireArenaRect,
        homeSpot: this.mireHomeSpot,
        entranceSpot: this.mireEntranceSpot,
        sealGate: this.mireSealGate,
        art: KIT_ART.mire,
      };
    }
    if (this.activeWarden === 'echo' && this.echoSprite && this.echoArenaRect) {
      return {
        sprite: this.echoSprite,
        shadow: this.echoShadow!,
        glow: this.echoGlow!,
        eyeGlow: this.echoEyeGlow!,
        blockers: this.echoBlockers,
        arena: this.echoArenaRect,
        homeSpot: this.echoHomeSpot,
        entranceSpot: this.echoEntranceSpot,
        sealGate: this.echoSealGate,
        art: KIT_ART.echo,
      };
    }
    if (this.activeWarden === 'reverb' && this.reverbSprite && this.reverbArenaRect) {
      return {
        sprite: this.reverbSprite,
        shadow: this.reverbShadow!,
        glow: this.reverbGlow!,
        eyeGlow: this.reverbEyeGlow!,
        blockers: this.reverbBlockers,
        arena: this.reverbArenaRect,
        homeSpot: this.reverbHomeSpot,
        entranceSpot: this.reverbEntranceSpot,
        sealGate: this.reverbSealGate,
        art: KIT_ART.reverb,
      };
    }
    if (this.activeWarden === 'verdant' && this.verdantSprite && this.verdantArenaRect) {
      return {
        sprite: this.verdantSprite,
        shadow: this.verdantShadow!,
        glow: this.verdantGlow!,
        eyeGlow: this.verdantEyeGlow!,
        blockers: this.verdantBlockers,
        arena: this.verdantArenaRect,
        homeSpot: this.verdantHomeSpot,
        entranceSpot: this.verdantEntranceSpot,
        sealGate: this.verdantSealGate,
        art: KIT_ART.verdant,
      };
    }
    return {
      sprite: this.guardianSprite,
      shadow: this.guardianShadow,
      glow: this.guardianGlow,
      eyeGlow: this.guardianEyeGlow,
      blockers: this.guardianBlockers,
      arena: this.world.arena,
      homeSpot: this.guardianHomeSpot,
      entranceSpot: this.entranceSpot,
      sealGate: this.world.sealGate,
      art: KIT_ART.guardian,
    };
  }

  /** mark the active fight's boss slain/whole (its own wreck flag) */
  private setBossBroken(v: boolean): void {
    if (this.activeWarden === 'mire') this.mireBroken = v;
    else if (this.activeWarden === 'echo') this.echoBroken = v;
    else if (this.activeWarden === 'reverb') this.reverbBroken = v;
    else if (this.activeWarden === 'verdant') this.verdantBroken = v;
    else this.guardianBroken = v;
  }

  /** the Reverberant is summon-only: show/hide its pre-built sprite + blockers */
  private setReverbVisible(v: boolean): void {
    if (!this.reverbSprite) return;
    this.reverbSprite.setVisible(v);
    this.reverbShadow?.setVisible(v);
    this.reverbGlow?.setVisible(v);
    this.reverbEyeGlow?.setVisible(v);
    for (const b of this.reverbBlockers) (b.body as Phaser.Physics.Arcade.StaticBody).enable = v;
    if (v) {
      // rises from the court floor — a quick scale/alpha pop
      this.reverbSprite.setAlpha(0).setScale(0.8);
      this.tweens.add({ targets: this.reverbSprite, alpha: 1, scaleX: 1.15, scaleY: 1.15, duration: 520, ease: 'Back.Out' });
    }
  }

  private startFight(fight: FightState, fresh: boolean): void {
    this.exhaustedThisFight = false;
    this.activeWarden = fight.warden ?? null; // pick the boss BEFORE restore/place
    if (fight.warden === 'reverb') {
      // a re-summon may race a prior kill's post-victory hide — cancel it so the
      // newly-risen boss is never hidden/un-collided out from under an active fight
      this.reverbHideTimer?.remove();
      this.reverbHideTimer = undefined;
      this.setReverbVisible(true); // the Reverberant rises
    }
    this.restoreGuardianWhole(); // a summon rekindles the runes: rebuild any slain wreck
    if (fight.engagedAt === null) {
      this.fight = fight;
      this.renderedWave = -1;
      this.landedWave = -1;
      this.slammedWave = -1;
      this.eyeOpenShown = false;
      this.furyIndex = -1;
      const b = this.activeBoss();
      b.glow.setTint(b.art.glowBase);
      b.sprite.anims.play(b.art.idle);
      this.placeGuardian(b.homeSpot, 0);
      this.positionGuardianBlockers(b.homeSpot);
      this.setGuardianBlockersEnabled(true);
      for (const r of this.dangerRects) r.destroy();
      this.dangerRects = [];
      for (const r of this.meleeRingRects) r.destroy();
      this.meleeRingRects = [];
      if (fresh) this.sfx('roar', 0.4); // a low stir, not the full engage roar
      bus.emit('fight-start', { hp: 0, maxHp: 0, engagedAt: null, awakeMs: GUARDIAN_AWAKE_MS, roster: [], title: this.fightWardenName(fight) });
    } else {
      this.beginEngaged(fight, false);
    }
  }

  /** the first strike landed (broadcast): re-anchor to `engagedAt`, slam the Ward */
  private engageFight(fight: FightState): void {
    this.beginEngaged(fight, true);
  }

  /**
   * Bring the fight into its engaged, dangerous state: reset the wave trackers
   * against `engagedAt`, tint the fury glow, raise the Ward, and start the
   * music. `dramatic` = the live first-strike (roar + Ward-slam FX); otherwise a
   * quiet mid-fight join with the Ward already standing.
   */
  private beginEngaged(fight: FightState, dramatic: boolean): void {
    this.fight = fight;
    this.activeWarden = fight.warden ?? null;
    const kit = this.fightKit();
    const b = this.activeBoss();
    const engagedAt = fight.engagedAt ?? Date.now();
    this.renderedWave = -1;
    this.landedWave = -1;
    this.eyeOpenShown = false;
    const w = waveInfoAt(Date.now() - engagedAt, GUARDIAN_AWAKE_MS, kit);
    this.slammedWave = w.msIntoWave >= w.phase.telegraphMs ? w.index : w.index - 1;
    this.furyIndex = furyPhaseAt(Date.now() - engagedAt, GUARDIAN_AWAKE_MS, kit).index;
    b.glow.setTint(b.art.fury[this.furyIndex]);
    b.sprite.anims.play(b.art.idle);
    // The Ward is SLAMMED shut by the engage-leap, not raised on contact. For a
    // live first-strike (dramatic) that is still winding up wave 0, defer it to
    // the moment the leap crashes on the entrance (see slamWave); a quiet
    // mid-fight join finds the Ward already standing, so raise it at once.
    const preSlam = w.index === 0 && w.msIntoWave < w.phase.telegraphMs;
    if (dramatic && preSlam) {
      this.wardPending = true;
    } else {
      this.wardPending = false;
      this.raiseWard(dramatic);
    }
    if (dramatic) {
      this.sfx('roar', 0.7);
      this.cameras.main.shake(700, 0.01);
    }
    if (!this.fightMusic && this.cache.audio.exists('guardian_drums')) {
      this.fightMusic = this.sound.add('guardian_drums', {
        loop: true,
        volume: FIGHT_MUSIC_BASE_VOLUME * this.atmosphere.volumes.music * this.atmosphere.volumes.master,
      });
    }
    this.fightMusic?.play();
    bus.emit('fight-start', { hp: fight.hp, maxHp: fight.maxHp, engagedAt, awakeMs: GUARDIAN_AWAKE_MS, roster: fight.roster, title: this.fightWardenName(fight) });
  }

  /**
   * Raise the Ward across the arena entrance (the sealGate tiles). It reuses the
   * Seal's barrier art but is a distinct, per-fight barrier: it blocks outsiders
   * and Exhausted fighters and drops at victory/slumber. Permeability is
   * per-Player — the roster-and-not-Exhausted pass through (see below).
   */
  private raiseWard(dramatic: boolean): void {
    this.dropWard();
    const b = this.activeBoss();
    for (const g of b.sealGate) {
      const x = (g.tx + 0.5) * TILE;
      const y = (g.ty + 1) * TILE;
      const sprite = this.add.image(x, y, 'seal-barrier').setOrigin(0.5, 1).setDepth(y).setAlpha(0.9);
      sprite.setTint(b.art.ward); // the boss's Ward cast (Guardian amber / Mire teal), not the violet Seal
      if (dramatic) {
        sprite.setScale(1, 0);
        this.tweens.add({ targets: sprite, scaleY: 1, duration: 220, ease: 'back.out' });
      }
      const body = this.addBlockerBody(g.tx, g.ty);
      this.wardParts.push({ sprite, body });
    }
    this.updateWardPermeability();
    if (dramatic) {
      this.sfx('chop', 0.6);
      this.cameras.main.shake(300, 0.006);
    }
  }

  /** drop the Ward (victory or slumber) — the arena opens again */
  private dropWard(): void {
    for (const part of this.wardParts) {
      part.sprite.destroy();
      part.body.destroy();
    }
    this.wardParts = [];
  }

  /**
   * Per-Player permeability: the local Player passes the Ward only while a
   * roster member AND not Exhausted; outsiders and the Exhausted are blocked.
   * The Mock has one real Player, so toggling this body's collision enforces the
   * rule; a SupabaseBackend would resolve it per-Player.
   */
  private updateWardPermeability(): void {
    const mayPass = !!this.fight && this.fight.roster.includes(this.me.name) && !this.exhaustedThisFight;
    for (const part of this.wardParts) {
      (part.body.body as Phaser.Physics.Arcade.StaticBody).enable = !mayPass;
    }
  }

  private endFight(kind: 'victory' | 'slumber'): void {
    if (!this.fight) return;
    const wardenName = this.fightWardenName(this.fight);
    this.fight = null;
    this.exhaustedThisFight = false;
    this.wardPending = false;
    this.dropWard(); // the Ward falls — the arena opens again
    for (const r of this.dangerRects) r.destroy();
    this.dangerRects = [];
    for (const r of this.meleeRingRects) r.destroy();
    this.meleeRingRects = [];
    this.renderedWave = -1;
    this.furyIndex = -1;
    // collision settles back onto its resting place either way (the boss the
    // fight belonged to — activeWarden is still set until the very end here)
    const b = this.activeBoss();
    this.placeGuardian(b.homeSpot, 0);
    this.positionGuardianBlockers(b.homeSpot);
    this.setGuardianBlockersEnabled(true);
    b.eyeGlow.setAlpha(0);
    this.fightMusic?.stop();
    bus.emit('fight-end');
    if (kind === 'victory') {
      // slain: it doesn't just close its eyes — it BREAKS. Death throes now, then
      // a darkened wreck left on its resting place until it is summoned anew and
      // rebuilt (startFight → restoreGuardianWhole). See shatterGuardian.
      this.sfx('seal_gong', 0.6);
      this.cameras.main.shake(500, 0.006);
      this.floatText(b.sprite.x, b.sprite.y - 100, wardenName ? t.fight.wardenBestedFloat(wardenName) : t.fight.bestedFloat, '#ffd166');
      bus.emit('toast', wardenName ? t.toast.wardenBested(wardenName) : t.toast.guardianBested, 'good');
      this.shatterGuardian();
    } else {
      // unbeaten: it simply re-slumbers, whole, ready to be roused again
      this.restoreGuardianWhole();
      b.sprite.anims.stop();
      b.sprite.setFrame(0);
      this.sfx('roar', 0.35);
      bus.emit('toast', wardenName ? t.toast.wardenUnbeaten(wardenName) : t.toast.guardianUnbeaten, 'bad');
    }
    // the Reverberant is summon-only: it leaves NO lingering wreck in the walkable
    // puzzle court — hide it (after the death-throes on victory, at once on slumber)
    if (this.activeWarden === 'reverb') {
      this.reverbHideTimer?.remove(); // never stack two pending hides
      const hide = () => {
        this.reverbHideTimer = undefined;
        this.setReverbVisible(false);
        this.reverbBroken = false;
      };
      if (kind === 'victory') this.reverbHideTimer = this.time.delayedCall(1400, hide);
      else hide();
      // re-arm the summon latch so a fresh solve raises it again (the one-fight
      // mutex still gates re-summon; without this the ?echotest ever-covers path
      // would stay 'solved' forever and the latch could never re-arm)
      this.reverbSummonBusy = false;
    }
    this.activeWarden = null; // the fight's visuals are resolved — back to dormant selection
  }

  /**
   * The slain Guardian's death throes: a blown-out flash and a heavy topple, a
   * burst of stone shards and dust, the runic glow snuffed out — leaving a
   * darkened, broken wreck on its resting place until it is summoned anew
   * (restoreGuardianWhole). Purely client-side spectacle; the fight is resolved.
   */
  private shatterGuardian(): void {
    this.setBossBroken(true);
    const b = this.activeBoss();
    const spr = b.sprite;
    const cx = spr.x;
    const feetY = spr.y; // origin is bottom-centre — this is its base
    spr.anims.stop();
    spr.setFrame(7); // the crash pose, caught mid-collapse
    spr.setTintFill(0xffffff); // blown-out flash...
    this.time.delayedCall(90, () => spr.setTint(0x4a4650)); // ...settling to dead grey stone
    this.tweens.add({ targets: spr, angle: -24, duration: 640, ease: 'Bounce.out' }); // heavy topple on its base
    // the runes gutter out: implode + snuff the glow. Its night-smoulder is
    // driven every frame by the glows pool from `base`, so zero that too.
    const ge = this.atmosphere.glows.find((g) => g.img === b.glow);
    if (ge) ge.base = 0;
    this.tweens.add({
      targets: b.glow,
      scale: 0.3,
      duration: 320,
      ease: 'Quad.in',
      onComplete: () => b.glow.setVisible(false),
    });
    b.eyeGlow.setAlpha(0);
    // stone shards flung outward
    const bodyY = feetY - 34;
    for (let i = 0; i < 16; i++) {
      const ang = (Math.PI * 2 * i) / 16 + (i % 3) * 0.4;
      const dist = 30 + (i % 5) * 13;
      const sz = 3 + (i % 4) * 2;
      const shard = this.add
        .rectangle(cx + Math.cos(ang) * 6, bodyY, sz, sz, i % 3 === 0 ? 0x6f5da0 : 0x50515e)
        .setDepth(feetY + 40);
      this.tweens.add({
        targets: shard,
        x: cx + Math.cos(ang) * dist,
        y: bodyY + Math.sin(ang) * dist * 0.5 + 30,
        angle: 140 + i * 22,
        alpha: 0,
        duration: 520 + i * 18,
        ease: 'Quad.out',
        onComplete: () => shard.destroy(),
      });
    }
    // dust kicked up at the base
    for (let i = 0; i < 5; i++) {
      const puff = this.add.ellipse(cx + (i - 2) * 15, feetY - 6, 20, 11, 0x241f30, 0.5).setDepth(feetY + 30);
      this.tweens.add({
        targets: puff,
        scaleX: 2.6,
        scaleY: 2.1,
        alpha: 0,
        y: feetY - 18,
        duration: 720 + i * 70,
        ease: 'Quad.out',
        onComplete: () => puff.destroy(),
      });
    }
    this.sfx('chop', 0.5);
  }

  /** rebuild the slain wreck into the whole, slumbering Guardian (summon / re-slumber) */
  private restoreGuardianWhole(): void {
    this.setBossBroken(false);
    const b = this.activeBoss();
    b.sprite.setAngle(0);
    b.sprite.clearTint();
    b.glow.setVisible(true).setTint(b.art.glowBase).setScale(2.6);
    const ge = this.atmosphere.glows.find((g) => g.img === b.glow);
    if (ge) ge.base = 0.5;
  }

  /** world position of an arena spot (the active boss's feet on its bottom row) */
  private placeGuardian(spot: ArenaSpot, lift: number): void {
    const bv = this.activeBoss();
    const a = bv.arena;
    const x = (a.x + spot.ax + 0.5) * TILE;
    const groundY = (a.y + spot.ay + 2) * TILE;
    bv.sprite.setPosition(x, groundY - lift);
    bv.sprite.setDepth(groundY);
    bv.shadow.setPosition(x, groundY - 2);
    bv.shadow.setAlpha(lift > 0 ? 0.5 : 1);
    bv.glow.setPosition(x, groundY - lift - 45);
    bv.eyeGlow.setPosition(x, groundY - lift - 61);
  }

  /** center the active boss's 3x3 collision on an arena spot (bodies row-major) */
  private positionGuardianBlockers(spot: ArenaSpot): void {
    const bv = this.activeBoss();
    const a = bv.arena;
    const cx = (a.x + spot.ax + 0.5) * TILE;
    const cy = (a.y + spot.ay + 0.5) * TILE;
    let i = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const b = bv.blockers[i++];
        if (!b) continue;
        b.setPosition(cx + dx * TILE, cy + dy * TILE);
        (b.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
      }
    }
  }

  private setGuardianBlockersEnabled(on: boolean): void {
    for (const b of this.activeBoss().blockers) (b.body as Phaser.Physics.Arcade.StaticBody).enable = on;
  }

  /** render the telegraphs of one wave: slam tiles, or a lunge landing marker */
  private renderWave(w: WaveInfo): void {
    for (const r of this.dangerRects) r.destroy();
    this.dangerRects = [];
    const kit = this.fightKit();
    const bv = this.activeBoss();
    const a = bv.arena;
    const mark = (ax: number, ay: number, color: number, alpha: number) => {
      const rect = this.add.rectangle((a.x + ax + 0.5) * TILE, (a.y + ay + 0.5) * TILE, TILE - 2, TILE - 2, color, alpha);
      rect.setDepth(3);
      this.dangerRects.push(rect);
    };
    if (w.index === 0) {
      // wave 0 (ADR-0004): the engage-leap crashes on the entrance (the Ward
      // slam), so the doorway — not the authored slam tiles — is the danger
      const e = bv.entranceSpot;
      for (let dy = -kit.lungeZone; dy <= kit.lungeZone; dy++) {
        for (let dx = -kit.lungeZone; dx <= kit.lungeZone; dx++) mark(e.ax + dx, e.ay + dy, bv.art.lunge, 0.3);
      }
    } else if (w.kind === 'lunge') {
      // the landing marker glows on the pre-determined spot before impact
      const t = lungeTarget(w.lungeCount + 1, kit);
      for (let dy = -kit.lungeZone; dy <= kit.lungeZone; dy++) {
        for (let dx = -kit.lungeZone; dx <= kit.lungeZone; dx++) mark(t.ax + dx, t.ay + dy, bv.art.lunge, 0.3);
      }
    } else {
      const tiles = waveTiles(w.index, w.phase.density, kit);
      for (let ay = 0; ay < kit.arenaH; ay++) {
        for (let ax = 0; ax < kit.arenaW; ax++) {
          if (tiles[ay * kit.arenaW + ax]) mark(ax, ay, bv.art.danger, 0.22);
        }
      }
    }
  }

  /** the slam/landing moment: flash, shake, and adjudicate the local Player */
  private slamWave(w: WaveInfo): void {
    this.slammedWave = w.index;
    if (w.index === 0 && this.wardPending) {
      // the engage-leap has crashed on the entrance — the Ward slams shut NOW,
      // in lockstep with the Guardian landing (not raised early on first contact)
      this.wardPending = false;
      this.raiseWard(true);
    }
    const lunge = w.kind === 'lunge';
    const bv = this.activeBoss();
    for (const r of this.dangerRects) r.setFillStyle(lunge ? bv.art.lunge : bv.art.slam, 0.55);
    this.sfx('chop', lunge ? 0.6 : 0.35);
    this.cameras.main.shake(lunge ? 350 : 180, lunge ? 0.008 : 0.004);
    if (Date.now() < this.stunnedUntil) return; // already down — no double count
    const kit = this.fightKit();
    const ptx = Math.floor(this.player.x / TILE);
    const pty = Math.floor((this.player.y - 4) / TILE);
    const ax = ptx - bv.arena.x;
    const ay = pty - bv.arena.y;
    if (ax < 0 || ay < 0 || ax >= kit.arenaW || ay >= kit.arenaH) return;
    if (w.index === 0) {
      // wave 0's danger is the entrance (the Ward slam), not the slam tiles
      const e = bv.entranceSpot;
      if (Math.abs(ax - e.ax) > kit.lungeZone || Math.abs(ay - e.ay) > kit.lungeZone) return;
    } else if (lunge) {
      const t = lungeTarget(w.lungeCount + 1, kit);
      if (Math.abs(ax - t.ax) > kit.lungeZone || Math.abs(ay - t.ay) > kit.lungeZone) return;
    } else if (!waveTiles(w.index, w.phase.density, kit)[ay * kit.arenaW + ax]) {
      return;
    }
    // caught! stun locally, let the server adjudicate against ITS clock
    this.beginKnockdown();
    void this.backend.reportKnockdown(ptx, pty).then((res) => this.resolveKnockdown(res));
  }

  /** local knockdown FX: freeze, stun-marker, and the 5 s stun clock */
  private beginKnockdown(): void {
    this.stunnedUntil = Date.now() + KNOCKDOWN_STUN_MS;
    this.player.setVelocity(0, 0);
    this.stunMarker?.destroy();
    this.stunMarker = this.add
      .text(this.player.x, this.player.y - AVATAR_H - 6, '💫', { fontSize: '10px' })
      .setOrigin(0.5)
      .setResolution(4)
      .setDepth(999_999);
  }

  /** apply the server's knockdown verdict (shared by slam tiles and the melee ring) */
  private resolveKnockdown(res: KnockdownResult): void {
    if (!res.ok) {
      if (res.reason === 'NOT_IN_DANGER') this.stunnedUntil = 0; // the server disagrees — get up
      return;
    }
    if (res.exhausted) {
      // HARD Exhaustion (ADR-0004): out for this fight — the Ward now bars
      // re-entry (permeability recomputes to "blocked"), though prior hits
      // keep loot eligibility. Wake at the Village Hall/spawn, pack intact.
      this.exhaustedThisFight = true;
      this.updateWardPermeability();
      bus.emit(
        'toast',
        res.atVillage
          ? t.toast.exhaustionVillage
          : t.toast.exhaustionSpawn,
        'bad',
      );
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.time.delayedCall(450, () => {
        this.player.setPosition((res.wake.tx + 0.5) * TILE, (res.wake.ty + 0.5) * TILE);
        this.stunnedUntil = 0;
        this.cameras.main.fadeIn(500, 0, 0, 0);
      });
    } else {
      bus.emit('toast', t.toast.knockedDown(res.knockdowns), 'bad');
    }
  }

  /**
   * The authored melee danger-ring (ADR-0006 §7): while it is hot (the wind-up
   * slice of a stationary slam wave) it glows around the Guardian's footprint
   * and shoves — a knockback off the body, but NO stun — any melee attacker
   * camping inside it. The push is the whole tax: it interrupts camping without
   * the 5 s knockdown (nor an Exhaustion count). A Bow user at range stays clear.
   * Pure schedule + position; the Guardian never reacts.
   */
  private updateMeleeRing(elapsed: number, wave: WaveInfo, time: number): void {
    const kit = this.fightKit();
    const ring = meleeRingWindow(wave, kit);
    const hot = ring !== null && elapsed >= ring.openMs && elapsed < ring.closeMs;
    if (!hot) {
      if (this.meleeRingRects.length) {
        for (const r of this.meleeRingRects) r.destroy();
        this.meleeRingRects = [];
      }
      return;
    }
    const bv = this.activeBoss();
    const a = bv.arena;
    const centre = guardianSpotAt(wave.lungeCount, bv.homeSpot, kit);
    if (!this.meleeRingRects.length) {
      for (let dy = -kit.meleeRingMax; dy <= kit.meleeRingMax; dy++) {
        for (let dx = -kit.meleeRingMax; dx <= kit.meleeRingMax; dx++) {
          const ax = centre.ax + dx;
          const ay = centre.ay + dy;
          if (ax < 0 || ay < 0 || ax >= kit.arenaW || ay >= kit.arenaH) continue;
          if (!inMeleeRing(ax, ay, centre, kit)) continue;
          const rect = this.add.rectangle((a.x + ax + 0.5) * TILE, (a.y + ay + 0.5) * TILE, TILE - 3, TILE - 3, bv.art.ring, 0.26);
          rect.setDepth(3);
          this.meleeRingRects.push(rect);
        }
      }
    }
    const pulse = 0.2 + 0.12 * Math.sin(time / 55);
    for (const r of this.meleeRingRects) r.setFillStyle(bv.art.ring, pulse);
    // the Player standing in the hot ring gets shoved off the body — no stun,
    // no knockdown report. Gate on a short cooldown so the tween can't restack
    // while it plays; still frozen out if a slam tile has them stunned.
    if (Date.now() < this.stunnedUntil || Date.now() < this.meleeRingShoveUntil) return;
    const ptx = Math.floor(this.player.x / TILE);
    const pty = Math.floor((this.player.y - 4) / TILE);
    if (!inMeleeRing(ptx - a.x, pty - a.y, centre, kit)) return;
    // knockback juice: shove the Player off the body, away from the ring centre
    const cx = (a.x + centre.ax + 0.5) * TILE;
    const cy = (a.y + centre.ay + 0.5) * TILE;
    const ang = Phaser.Math.Angle.Between(cx, cy, this.player.x, this.player.y);
    this.meleeRingShoveUntil = Date.now() + 260;
    this.sfx('chop', 0.4);
    this.cameras.main.shake(160, 0.004);
    this.tweens.add({
      targets: this.player,
      x: this.player.x + Math.cos(ang) * TILE * 2.2,
      y: this.player.y + Math.sin(ang) * TILE * 2.2,
      duration: 220,
      ease: 'quad.out',
    });
  }

  private guardianAction(): EAction | null {
    // the colossus is 96px tall on a 3x3 footprint — aim at its lower body (the
    // ACTIVE fight's boss, so a Warden fight strikes its own sprite/arena)
    const spr = this.activeBoss().sprite;
    const d = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y - 4,
      spr.x,
      spr.y - TILE * 1.5,
    );
    // the Bow reaches ~8 tiles; melee needs to close to arm's length
    const bow = this.isBow();
    const range = bow ? TILE * 8 : INTERACT_RANGE + TILE * 2;
    if (d > range) return null;
    if (!this.fight) {
      if (this.sealSystem.seal?.broken) {
        return {
          swing: false,
          run: () => bus.emit('toast', t.toast.guardianSlumbersLay, 'info'),
        };
      }
      return null; // sealed away — nothing to interact with yet
    }
    // each weapon carries its own COMBAT attack speed (ADR-0006 §4); harvesting
    // is untouched — resolveEAction only sets cadenceMs on Guardian swings
    if (bow) return { swing: true, cadenceMs: this.atkCadence(weaponCombat(this.heldTool()).attackMs), run: () => this.fireBow() };
    return { swing: true, cadenceMs: this.atkCadence(weaponCombat(this.heldTool()).attackMs), run: () => this.swingAtGuardian() };
  }

  private swingAtGuardian(): void {
    const spr = this.activeBoss().sprite;
    this.fireGuardianHit(this.heldTool(), spr.x, spr.y - 60);
  }

  /** the mouse-aimed unit vector from the player's chest (the arrow's origin) */
  private aimDir(): { x: number; y: number } {
    const p = this.input.activePointer;
    p.updateWorldPoint(this.cameras.main); // fresh even if the mouse hasn't moved since a camera scroll
    const dx = p.worldX - this.player.x;
    const dy = p.worldY - (this.player.y - AVATAR_H / 2);
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  /** fly the arrow sprite along the aimed ray at constant speed; `onLand` fires
   *  where the ray met a body (null = a miss — full range, despawn, no call) */
  private looseArrowRay(dirX: number, dirY: number, distPx: number, onLand: (() => void) | null): void {
    const ox = this.player.x;
    const oy = this.player.y - AVATAR_H / 2;
    const arrow = this.add.image(ox, oy, 'arrow');
    arrow.setDepth(999_990);
    arrow.setRotation(Math.atan2(dirY, dirX));
    this.sfx('blip', 0.4); // bowstring twang
    this.tweens.add({
      targets: arrow,
      x: ox + dirX * distPx,
      y: oy + dirY * distPx,
      duration: Math.max(60, distPx / 0.9), // ~0.9 px/ms ≈ the old boss arrow's 240 ms at 8 tiles
      onComplete: () => {
        arrow.destroy();
        onLand?.();
      },
    });
  }

  /** distance along the aimed segment where it first meets the circle, or null */
  private rayHitPx(ox: number, oy: number, dx: number, dy: number, maxPx: number, cx: number, cy: number, rPx: number): number | null {
    const t = Phaser.Math.Clamp((cx - ox) * dx + (cy - oy) * dy, 0, maxPx);
    return Math.hypot(ox + dx * t - cx, oy + dy * t - cy) <= rPx + 4 ? t : null; // +4px forgiveness
  }

  /**
   * How far an arrow flies (2026-07 batch: "out of the screen", not a fixed
   * reach): half the camera view's diagonal + a margin — from the centered
   * follow-camera that is always past the visible edge, at every zoom. In the
   * Delve the first wall tile on the ray stops it instead (no through-wall
   * sniping); the overworld ray stays unobstructed — arrows arc over the
   * undergrowth like the swing echo always has.
   */
  private arrowRangePx(dirX: number, dirY: number): number {
    const view = this.cameras.main.worldView;
    const maxPx = Math.hypot(view.width, view.height) / 2 + TILE * 2;
    if (!this.inDelve) return maxPx;
    const S = this.stageDef();
    // march from the FEET (the tile the body actually stands in — the chest row
    // sits a full tile higher and overlaps the wall art when pressed against a
    // wall from below, which would clamp every shot to a 4px fizzle), and never
    // clamp inside the origin tile itself
    const ox = this.player.x;
    const oy = this.player.y - 4;
    const otx = Math.floor(ox / TILE);
    const oty = Math.floor(oy / TILE);
    const step = TILE / 4;
    for (let d = step; d <= maxPx; d += step) {
      const tx = Math.floor((ox + dirX * d) / TILE);
      const ty = Math.floor((oy + dirY * d) / TILE);
      if (tx === otx && ty === oty) continue;
      if (S.isBlocked(tx, ty)) return Math.max(step, d - step);
    }
    return maxPx;
  }

  /**
   * The one bow verb for every context (the 2026-07 batch): the arrow flies
   * toward the MOUSE, and the first body on the ray takes the hit when it lands
   * — the active boss (Eye-Window rule intact via fireGuardianHit), a Delve
   * Husk, or ANY wild creature, peaceful ones included (a survivor enrages and
   * charges its shooter; melee-reach foraging still catches them unharmed).
   * Nothing on the ray → the arrow flies clean off the screen and despawns: a
   * miss, the cadence still spent. Damage attribution is unchanged — the same
   * host-/server-authoritative messages as melee. Arrows stay a local cosmetic
   * (peers see the swing echo), the status quo.
   */
  private fireBow(): void {
    const dir = this.aimDir();
    const ox = this.player.x;
    const oy = this.player.y - AVATAR_H / 2;
    const maxPx = this.arrowRangePx(dir.x, dir.y); // off-screen, or the first Delve wall
    // re-face the shot so the pose matches the aim, not the last walk direction
    // (playSwingFx kill-restarts safely; markSwing already fired the first one)
    const d: Dir = Math.abs(dir.x) > Math.abs(dir.y) ? (dir.x > 0 ? 'right' : 'left') : dir.y > 0 ? 'down' : 'up';
    if (d !== this.lastDir) {
      this.lastDir = d;
      this.playSwingFx(this.player, this.heldSprite, d);
    }
    const tool = this.heldTool();
    let bestT: number | null = null;
    let onLand: (() => void) | null = null;
    const consider = (t: number | null, land: () => void): void => {
      if (t !== null && (bestT === null || t < bestT)) {
        bestT = t;
        onLand = land;
      }
    };
    if (this.inDelve) {
      for (const m of this.mobs.values()) {
        if (m.st === 'dead') continue;
        const t0 = this.rayHitPx(ox, oy, dir.x, dir.y, maxPx, m.x * TILE, m.y * TILE, profileOf(m.kind).radius * TILE);
        consider(t0, () => {
          // landing-time re-check: applyDelveHit guards dead/missing mobs
          if (this.isDelveHost) this.applyDelveHit(m.id, tool, this.me.name);
          else if (this.delveRunId) {
            this.backend.sendDungeon({ t: 'hit', runId: this.delveRunId, mobId: m.id, by: this.me.name, tool });
            this.delveHitLanded = true;
          }
        });
      }
    } else {
      if (this.fight) {
        const spr = this.activeBoss().sprite;
        // the colossus body: a generous 3x3-tile circle at its lower mass. The
        // BOSS hit keeps the authored 8-tile bow reach even though the arrow
        // itself now flies off-screen — the fight's whole safety design is
        // standing inside the arena (ADR-0002); a screen-length snipe from
        // beyond the wall would collapse "safe but weaker" into "perfectly
        // safe" and hand out participation loot for zero exposure.
        const bossMax = Math.min(maxPx, TILE * 8);
        const t0 = this.rayHitPx(ox, oy, dir.x, dir.y, bossMax, spr.x, spr.y - TILE * 1.5, TILE * 1.8);
        consider(t0, () => this.fireGuardianHit(tool, spr.x, spr.y - TILE * 3));
      }
      for (const m of this.wildMobs.values()) {
        if (m.st === 'dead') continue;
        if (!isWildKind(m.kind)) continue; // every creature is fair game — peaceful too
        const t0 = this.rayHitPx(ox, oy, dir.x, dir.y, maxPx, m.x * TILE, m.y * TILE, profileOf(m.kind).radius * TILE);
        consider(t0, () => {
          if (this.isWildHost) this.applyWildHit(m.id, tool, this.me.name);
          else this.backend.sendCreatures({ t: 'hit', id: m.id, by: this.me.name, tool });
        });
      }
    }
    this.looseArrowRay(dir.x, dir.y, bestT ?? maxPx, onLand);
  }

  /** LMB/E with a bow and nothing else in reach still shoots toward the cursor
   *  (placed LAST in resolveEAction so every other verb keeps priority) */
  private bowFallbackAction(): EAction | null {
    if (!this.isBow()) return null;
    return { swing: true, cadenceMs: this.atkCadence(weaponCombat(this.heldTool()).attackMs), run: () => this.fireBow() };
  }

  /**
   * Land one hit on the Guardian with the in-hand Tool. Predicts the Eye Window
   * locally from the same schedule the server adjudicates with — outside a
   * window the strike bounces off so the rule teaches itself. Shared by melee
   * swings and the Bow's arrow.
   */
  private fireGuardianHit(tool: ToolId | undefined, x: number, y: number): void {
    // dormant (engagedAt null): this strike IS the engage — always lands. Once
    // engaged, predict the Eye Window from the same schedule the server uses
    // (the ACTIVE fight's kit — ADR-0017).
    const engagedAt = this.fight?.engagedAt ?? null;
    const eyeOpen = engagedAt === null ? !!this.fight : eyeOpenAt(Date.now() - engagedAt, GUARDIAN_AWAKE_MS, this.fightKit());
    if (eyeOpen) {
      this.sfx('chop', 0.5);
      this.tweens.add({ targets: this.activeBoss().sprite, scaleX: 1.04, scaleY: 0.97, duration: 70, yoyo: true });
    } else {
      this.sfx('blip', 0.35);
      this.floatText(x + Phaser.Math.Between(-10, 10), y, t.fight.clang, '#9aa0a8');
    }
    void this.backend.hitGuardian(tool).then((res) => {
      if (!res.ok) return;
      this.setInv(res.inventory);
      if (res.deflected) return;
      // float the DAMAGE DEALT (cosmetically scaled), NOT remaining HP — the HP
      // bar owns the pool. A crit pops bigger and gold (ADR-0006 §1).
      const shown = res.damage * GUARDIAN_DISPLAY_SCALE;
      const hitSpr = this.activeBoss().sprite;
      const fx = hitSpr.x + Phaser.Math.Between(-8, 8);
      const fy = hitSpr.y - 100;
      if (res.crit) this.floatText(fx, fy, `${shown}!`, '#ffd166', 15);
      else this.floatText(fx, fy, `${shown}`, '#ff8866', 10);
    });
  }

  /**
   * E at the Mire Warden's altar (ADR-0017 rung 1): the real authored altar on
   * the Mangrove Coast. Near it, the whole Offering → summon arc runs through the
   * generic wardenAltarAction('mire') — no dev flag. (?wardenfight now only grants
   * the goods + shortens the fight; the altar itself is permanent world content.)
   */
  private mireAltarAction(): EAction | null {
    if (!this.world.wardenArenas?.mire) return null;
    const d = Phaser.Math.Distance.Between(this.player.x, this.player.y - 4, this.mireAltarPos.x, this.mireAltarPos.y - 8);
    if (d > INTERACT_RANGE + 8) return null;
    return this.wardenAltarAction('mire');
  }

  /** E at the Echo Warden's altar in The Cavern Mouth (ADR-0017 rung 2) — same
   *  generic arc as the Mire's, keyed 'echo'. */
  private echoAltarAction(): EAction | null {
    if (!this.world.wardenArenas?.echo) return null;
    const d = Phaser.Math.Distance.Between(this.player.x, this.player.y - 4, this.echoAltarPos.x, this.echoAltarPos.y - 8);
    if (d > INTERACT_RANGE + 8) return null;
    return this.wardenAltarAction('echo');
  }

  /** E at the Verdant Warden's altar in the Green Terraces (ADR-0017 rung 3) — same
   *  generic arc as the Mire's/Echo's, keyed 'verdant'. */
  private verdantAltarAction(): EAction | null {
    if (!this.world.wardenArenas?.verdant) return null;
    const d = Phaser.Math.Distance.Between(this.player.x, this.player.y - 4, this.verdantAltarPos.x, this.verdantAltarPos.y - 8);
    if (d > INTERACT_RANGE + 8) return null;
    return this.wardenAltarAction('verdant');
  }

  private summonAction(): EAction | null {
    const d = Phaser.Math.Distance.Between(this.player.x, this.player.y - 4, this.guardianAltarPos.x, this.guardianAltarPos.y - 8);
    if (d > INTERACT_RANGE + 8) return null;
    if (this.fight) {
      return { swing: false, run: () => bus.emit('toast', t.toast.guardianAlreadyAwake, 'info') };
    }
    if ((this.inventory.summon_totem ?? 0) <= 0) {
      return { swing: false, run: () => bus.emit('toast', t.toast.altarAwaitsTotem, 'info') };
    }
    return {
      swing: false,
      run: () => {
        void this.backend.summonGuardian().then((res) => {
          if (res.ok) {
            this.setInv(res.inventory);
          } else if (res.reason === 'FIGHT_IN_PROGRESS') {
            bus.emit('toast', t.toast.fightAlreadyRaging, 'bad');
          } else if (res.reason === 'NO_TOTEM') {
            bus.emit('toast', t.toast.needTotem, 'bad');
          } else if (res.reason === 'SEAL_INTACT') {
            bus.emit('toast', t.toast.sealStillHolds, 'bad');
          }
        });
      },
    };
  }

  /**
   * E at a Warden altar (ADR-0017): while its Offering is incomplete, lay the
   * carried demanded goods (the Seal-monument shape — one press pours in what
   * qualifies); once broken, a carried Warden Totem summons. The one-fight
   * mutex refusal comes back from the backend either way.
   */
  private wardenAltarAction(id: string): EAction {
    const def = WARDENS[id];
    // float text pops at THIS Warden's altar (the Mire's real altar, not the
    // Guardian's) — ?wardenfight is gone, every Warden has its own altar position
    const altarPos = id === 'mire' ? this.mireAltarPos : id === 'echo' ? this.echoAltarPos : id === 'verdant' ? this.verdantAltarPos : this.guardianAltarPos;
    if (this.fight) {
      return { swing: false, run: () => bus.emit('toast', t.toast.fightAlreadyRaging, 'info') };
    }
    if (!this.wardens[id]?.altar.broken) {
      return {
        swing: false,
        run: () => {
          void this.backend.contributeWardenAltar(id).then((res) => {
            if (res.ok) {
              this.setInv(res.inventory);
              const text = Object.entries(res.taken)
                .map(([item, n]) => `-${n} ${ITEMS[item as ItemId]?.name ?? item}`)
                .join('  ');
              this.floatText(altarPos.x, altarPos.y - 20, text, '#63e0b8');
              bus.emit('toast', t.toast.wardenAltarLaid, 'good');
              this.sfx('place', 0.6);
            } else if (res.reason === 'NOTHING_TO_GIVE') {
              const needs = Object.entries(this.wardens[id]?.altar.quotas ?? {})
                .map(([item, q]) => `${q} ${ITEMS[item as ItemId]?.name ?? item}`)
                .join(' · ');
              bus.emit('toast', t.toast.wardenAltarNeeds(needs), 'bad');
            }
          });
        },
      };
    }
    if ((this.inventory[def.totem] ?? 0) <= 0) {
      return { swing: false, run: () => bus.emit('toast', t.toast.wardenAwaitsTotem(ITEMS[def.totem].name), 'info') };
    }
    return {
      swing: false,
      run: () => {
        void this.backend.summonWarden(id).then((res) => {
          if (res.ok) {
            this.setInv(res.inventory);
          } else if (res.reason === 'FIGHT_IN_PROGRESS') {
            bus.emit('toast', t.toast.fightAlreadyRaging, 'bad');
          } else if (res.reason === 'NO_TOTEM') {
            bus.emit('toast', t.toast.wardenAwaitsTotem(ITEMS[def.totem].name), 'bad');
          }
        });
      },
    };
  }

  // ------------------------------------------------------------ v3: the Journey

  /** tick one Journey objective (idempotent; optimistic local + backend persist) */
  tickJourney(step: JourneyStepId): void {
    if (this.journey.steps[step]) return;
    this.journey.steps[step] = true;
    bus.emit('journey', this.journey);
    if (journeyComplete(this.journey)) {
      bus.emit('toast', t.toast.journeyComplete, 'good');
    }
    void this.backend.completeJourneyStep(step).then((j) => {
      this.journey = j;
      bus.emit('journey', j);
    });
  }

  /** count a successful use of a contextual hint; it retires after a few */
  private useHint(hint: HintId): void {
    if (hintRetired(this.journey, hint)) return;
    this.journey.hintUses[hint] = (this.journey.hintUses[hint] ?? 0) + 1;
    bus.emit('journey', this.journey);
    void this.backend.bumpHint(hint);
  }

  /**
   * Contextual key hints float at the moment of relevance ("E — gather" by
   * the first harvestable Resource Nodes, "E — read" at the Welcome Stone and
   * tablets). Runs on the coarse checkZone cadence, not every frame.
   */
  updateHints(): void {
    if (!this.hintText) return;
    const px = this.player.x;
    const py = this.player.y - 4;
    let text = '';
    let x = 0;
    let y = 0;
    if (!hintRetired(this.journey, 'read')) {
      if (Phaser.Math.Distance.Between(px, py, this.welcomeStonePos.x, this.welcomeStonePos.y - 8) < INTERACT_RANGE) {
        text = t.hint.read;
        x = this.welcomeStonePos.x;
        y = this.welcomeStonePos.y - 26;
      } else {
        for (const spot of this.tabletSpots) {
          if (Phaser.Math.Distance.Between(px, py, spot.x, spot.y - 8) < INTERACT_RANGE) {
            text = t.hint.read;
            x = spot.x;
            y = spot.y - 22;
            break;
          }
        }
      }
    }
    if (!text && !hintRetired(this.journey, 'gather')) {
      let best: NodeView | null = null;
      let bestDist = INTERACT_RANGE;
      for (const view of this.nodes.values()) {
        if (view.depletedShown) continue;
        const nt = NODE_TYPES[view.state.type];
        if (nt.requiredTool && (this.inventory[nt.requiredTool] ?? 0) <= 0) continue; // only nodes the Player can harvest teach
        const d = Phaser.Math.Distance.Between(px, py, view.sprite.x, view.sprite.y - TILE / 2);
        if (d < bestDist) {
          bestDist = d;
          best = view;
        }
      }
      if (best) {
        text = t.hint.gather;
        x = best.sprite.x;
        y = best.sprite.y - best.sprite.displayHeight - 4;
      }
    }
    if (text) this.hintText.setText(text).setPosition(x, y).setVisible(true);
    else this.hintText.setVisible(false);
  }

  // ------------------------------------------------------------ secrets

  private applyQuest(q: QuestState): void {
    this.quest = q;
    bus.emit('quest', q);
    this.refreshDelveEntrance(this.delveOpenNow());
    if (q.treasureLocation) {
      const x = (q.treasureLocation.tx + 0.5) * TILE;
      const y = (q.treasureLocation.ty + 0.5) * TILE;
      if (!this.digMarker) {
        this.digMarker = this.add
          .text(x, y, '✕', { fontSize: '12px', color: '#ff5544', stroke: '#000000', strokeThickness: 3 })
          .setOrigin(0.5)
          .setResolution(4);
      }
      this.digMarker.setPosition(x, y).setDepth(y);
    } else {
      this.digMarker?.destroy();
      this.digMarker = null;
    }
  }

  private buildGate(): void {
    for (const g of this.world.gate) {
      const x = (g.tx + 0.5) * TILE;
      const y = (g.ty + 1) * TILE;
      const sprite = this.objImage(x, y, 'fiber_vine');
      if (!sprite) continue;
      sprite.setTint(0x8fdc78);
      const body = this.addBlockerBody(g.tx, g.ty);
      this.gateParts.push({ sprite, body });
    }
  }

  private openGateVisual(): void {
    for (const part of this.gateParts) {
      this.tweens.add({
        targets: part.sprite,
        alpha: 0,
        y: part.sprite.y - 8,
        duration: 700,
        onComplete: () => part.sprite.destroy(),
      });
      part.body.destroy();
    }
    this.gateParts = [];
  }

  // ------------------------------------------------------------ Realm districts (ADR-0017 §2)

  /**
   * The Realm district containing tile (tx,ty), or null in the World proper.
   * Every district reserves its OWN 1-tile cliff ring inside its outer rect
   * (the void-filler cliff the generator never overwrites — tools/generate-map.ts
   * fills each district's interior at rect+1..rect+size-2, generate-map.ts:947/
   * 1091/1171); that ring is still solid wall, not the room. Checking the outer
   * rect inclusively meant a Player walking up to the World's south edge and
   * getting stopped by that very wall (their tile position resting exactly on
   * the rect's boundary row/col) still counted as "inside" — the camera would
   * immediately snap to the district's bounds and reveal the whole interior
   * through the wall (the "I can see the hidden Hushdark" clipping report).
   * The inset below excludes the ring, matching the carved interior exactly.
   */
  districtOf(tx: number, ty: number): DistrictDef | null {
    for (const d of this.world.districts ?? []) {
      const r = d.rect;
      if (tx > r.x && tx < r.x + r.w - 1 && ty > r.y && ty < r.y + r.h - 1) return d;
    }
    return null;
  }

  /**
   * Clamp the camera to the region the Player is standing in — a district's
   * rect inside a Realm, the pinned pre-Realm World otherwise (the void band
   * and other districts must never scroll into view). Derived POSITIONALLY on
   * the checkZone tick rather than in the gate interaction, so every
   * cross-region reposition — Exhaustion wake, Victory Arch recall, login
   * inside a district, dev teleports — re-clamps without touching a call site.
   * (The Delve owns the camera while inside; checkZone pauses then.)
   */
  applyCameraRegion(force = false): void {
    const d = this.districtOf(Math.floor(this.player.x / TILE), Math.floor(this.player.y / TILE));
    if (!force && d === this.activeDistrict) return;
    this.activeDistrict = d;
    const cam = this.cameras.main;
    if (d) cam.setBounds(d.rect.x * TILE, d.rect.y * TILE, d.rect.w * TILE, d.rect.h * TILE);
    else cam.setBounds(0, 0, WORLD_VIEW_W * TILE, WORLD_VIEW_H * TILE);
  }

  /** is this Realm's gate open? The Warden-defeat gate-key world flag (T4) —
   *  or the ?realmtest dev override that predates it (T2) */
  private realmGateOpen(d: DistrictDef): boolean {
    if (DEV_REALM_TEST) return true;
    const w = wardenForRealm(d.id);
    return !!w && !!this.wardens[w.id]?.gateOpen;
  }

  /** both arches of every Realm gate: a standing stone arch in the World and
   *  its twin inside the district. E teleports through (Delve-shaft interaction
   *  pattern, but NO instancing/roster/overlay — plain persistent map space). */
  private buildRealmGates(): void {
    for (const d of this.world.districts ?? []) {
      this.buildRealmGate(d, 'world', d.gate.worldTx, d.gate.worldTy);
      this.buildRealmGate(d, 'district', d.gate.districtTx, d.gate.districtTy);
    }
  }

  private buildRealmGate(d: DistrictDef, side: 'world' | 'district', tx: number, ty: number): void {
    const x = (tx + 0.5) * TILE;
    const y = (ty + 0.5) * TILE;
    const open = this.realmGateOpen(d);
    const c = this.add.container(x, y);
    // the Realm Arch: a weathered megalith gate — two pillars of stacked,
    // slightly off-line stones under a cracked lintel and capstone, moss on
    // every shelf, vines off the ends, and carved glyphs across the lintel
    // that wake teal once the way stands open. The passage is a black void
    // while dormant; open, it breathes with a slow shimmer.
    const portal = this.add.rectangle(0, -6, 16, 26, open ? 0x123830 : 0x07090c).setStrokeStyle(1, 0x05070a);
    const shimmer = this.add.rectangle(0, -6, 16, 26, 0x2a7a62).setAlpha(0);
    const parts: Phaser.GameObjects.GameObject[] = [portal, shimmer];
    const stone = (sx: number, sy: number, w: number, h: number, fill: number) => {
      parts.push(this.add.rectangle(sx, sy, w, h, fill).setStrokeStyle(1, 0x2c332c));
    };
    // pillars — three weathered blocks each, brighter toward the sky
    stone(-11, 3, 8, 10, 0x59635a);
    stone(11, 3, 8, 10, 0x555f56);
    stone(-10, -5, 7, 8, 0x646e5f);
    stone(10, -5, 7, 8, 0x606a5b);
    stone(-11, -13, 8, 8, 0x6d7766);
    stone(11, -13, 8, 8, 0x69735f);
    // the lintel and its capstone
    stone(0, -20, 34, 7, 0x717b68);
    stone(0, -25, 18, 5, 0x7a8470);
    // moss claims every shelf; two drips run down the stones
    const moss = (mx: number, my: number, w: number, h: number, tone = 0x4a5230) => {
      parts.push(this.add.rectangle(mx, my, w, h, tone));
    };
    moss(-12, -17, 6, 2);
    moss(10, -17, 5, 2);
    moss(-2, -27, 7, 2, 0x53603a);
    moss(-13, -9, 2, 5);
    moss(12, 0, 2, 6);
    moss(-9, 7, 3, 2, 0x424a2b);
    // carved glyphs across the lintel — dead grey, or smoldering teal
    const glyphs: Phaser.GameObjects.Rectangle[] = [];
    for (const gx of [-11, -5, 1, 7]) {
      const gl = this.add.rectangle(gx, -20, 2, 3, open ? 0x63e0b8 : 0x3d463f);
      glyphs.push(gl);
      parts.push(gl);
    }
    // hanging vines off the lintel ends
    for (const [vx, vlen] of [[-16, 9], [16, 7]] as const) {
      const vine = this.add.rectangle(vx, -17, 2, vlen, 0x435030).setOrigin(0.5, 0);
      parts.push(vine, this.add.rectangle(vx, -17 + vlen, 2, 2, 0x53603a).setOrigin(0.5, 0));
    }
    const label = this.add
      .text(0, -32, side === 'district' ? t.realm.return : open ? t.realm.gateTo(zoneName(d.name)) : t.realm.dormant, {
        fontSize: '8px',
        color: open || side === 'district' ? '#9fe0c9' : '#8a938c',
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setResolution(4);
    parts.push(label);
    c.add(parts);
    c.setDepth((ty + 1) * TILE);
    if (open || side === 'district') {
      this.tweens.add({ targets: shimmer, alpha: { from: 0.12, to: 0.38 }, duration: 1700, yoyo: true, repeat: -1, ease: 'sine.inout' });
      for (const gl of glyphs) {
        this.tweens.add({ targets: gl, alpha: { from: 0.65, to: 1 }, duration: 1100 + 200 * glyphs.indexOf(gl), yoyo: true, repeat: -1, ease: 'sine.inout' });
      }
    }
    const blocker = this.addBlockerBody(tx, ty);
    const shadow = this.addShadow(x, y + 8, 30);
    let glowImg: Phaser.GameObjects.Image | undefined;
    if (open || side === 'district') {
      const glow = this.add
        .image(x, y - 4, 'glow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0x4fd8a8)
        .setScale(0.9)
        .setAlpha(0)
        .setDepth(890_000);
      this.atmosphere.glows.push({ img: glow, base: 0.35, x, y: y - 4 });
      glowImg = glow;
    }
    this.realmGates.push({ d, side, x, y, objs: [c, blocker, shadow], glow: glowImg });
  }

  /**
   * Tear down and re-raise every Realm arch — a gate's open/dormant dressing
   * (portal shimmer, glyphs, label, glow) is baked at build time, so the
   * one-time gate opening (realmOpened) re-dresses by rebuilding, the same
   * way refreshDelveEntrance re-dresses the shaft.
   */
  private rebuildRealmGates(): void {
    for (const g of this.realmGates) {
      for (const o of g.objs) o.destroy();
      if (g.glow) {
        const i = this.atmosphere.glows.findIndex((e) => e.img === g.glow);
        if (i >= 0) this.atmosphere.glows.splice(i, 1);
        g.glow.destroy();
      }
    }
    this.realmGates = [];
    this.buildRealmGates();
  }

  /** E at a Realm gate: step through (open), or explain the dormant arch.
   *  Leaving a district is NEVER gated — the way back always works. */
  private realmGateAction(px: number, py: number): EAction | null {
    for (const g of this.realmGates) {
      if (Phaser.Math.Distance.Between(px, py, g.x, g.y) > INTERACT_RANGE + 10) continue;
      if (g.side === 'district') return { swing: false, run: () => this.leaveDistrict(g.d) };
      if (this.realmGateOpen(g.d)) return { swing: false, run: () => this.enterDistrict(g.d) };
      // dormant — but a carried gate key turns it (once, for everyone, forever)
      const w = wardenForRealm(g.d.id);
      if (w && (this.inventory[w.gateKey] ?? 0) > 0) {
        return { swing: false, run: () => void this.backend.openRealmGate(w.id) };
      }
      return { swing: false, run: () => bus.emit('toast', t.toast.realmGateDormant, 'info') };
    }
    return null;
  }

  /** step through the world-side arch into the Realm */
  private enterDistrict(d: DistrictDef): void {
    this.teleportThroughGate((d.gate.districtTx + 0.5) * TILE, (d.gate.districtTy + 1.5) * TILE);
    bus.emit('toast', t.toast.realmEntered(zoneName(d.name)), 'good');
  }

  /** step back through the district-side arch, out beside the world gate */
  private leaveDistrict(d: DistrictDef): void {
    this.teleportThroughGate((d.gate.worldTx + 0.5) * TILE, (d.gate.worldTy + 1.5) * TILE);
    bus.emit('toast', t.toast.realmLeft, 'info');
  }

  /** the shared gate-step: reposition, re-clamp, broadcast, banner — no
   *  instancing, no roster; the district is ordinary persistent World space */
  private teleportThroughGate(x: number, y: number): void {
    if (this.placing) this.exitPlaceMode();
    this.player.setPosition(x, y);
    this.player.setVelocity(0, 0);
    this.cameras.main.flash(300, 8, 14, 11);
    this.sfx('blip', 0.5);
    this.backend.sendPosition(this.player.x, this.player.y, this.lastDir, false, this.heldItem ?? undefined, this.swingCount);
    // immediate re-derive: camera clamp, zone banner and the minimap's district
    // view all update on this one pass instead of waiting for the 300 ms tick
    this.checkZone();
  }

  // ------------------------------------------------------------ faux-elevation (ADR-0009)

  /** in-world name-tag scale — FogSystem.labelScale (ADR-0018) */
  private labelScale(): number {
    return this.fogSystem.labelScale();
  }

  /** re-apply `labelScale()` to every live name tag (after a zoom or setting change) */
  private applyWorldLabelScale(): void {
    this.fogSystem.applyWorldLabelScale();
  }

  /**
   * Combined move-speed multiplier: the cooked-food buff (ADR-0012) × the
   * Village's collective tier bonus (ADR-0013). Both stack.
   */
  private moveSpeedFactor(): number {
    const cooked = Date.now() < this.buffUntil ? SPEED_BUFF_FACTOR : 1;
    // ADR-0013: a running Dorffest (Wishing Well) speeds everyone in the World
    const festival = festivalActive(this.village, Date.now()) ? FESTIVAL_SPEED_FACTOR : 1;
    // ADR-0017 rung 1: the Tide's flood slows wading inside the Sunken Mire — a
    // pure f(clock), whole-district; the Mirefang's bearer ignores it (realm
    // synergy). Keyed on CARRYING the Mirefang (its item text promises the effect
    // "carried", not in-hand), so it holds while a machete cuts the reeds. Client-
    // side positional slow, stacked like the other move factors.
    const wade =
      this.activeDistrict?.id === 'sunken_mire' && tideFloods(Date.now(), TIDE_PERIOD_MS) && !gearOwns(this.inventory, this.equipped, 'mirefang')
        ? WADE_SLOW_FACTOR
        : 1;
    // ADR-0017 §3: the Tideglass Boots add their +8% beside the Village bonus
    return cooked * festival * wade * (1 + villageBuff(this.village.tier).moveSpeed + armorBuff(this.equipped).moveSpeed);
  }

  /** combat swing cadence with the Village's attack-speed buff folded in
   *  (ADR-0013) + the worn Gloves' bonus (ADR-0017 §3) */
  private atkCadence(baseMs: number): number {
    return baseMs / (1 + villageBuff(this.village.tier).attackSpeed + armorBuff(this.equipped).attackSpeed);
  }

  /** the worn-Armor band raise of WHOEVER landed the hit (ADR-0017 §3): mine
   *  from my equipped record, a peer's from their synced `armor` field */
  private armorBandOf(by: string): { bandMin: number; bandMax: number } {
    return armorBuff(by === this.me.name ? this.equipped : this.remotes.get(by)?.armor);
  }

  /**
   * Wear/unwear one Armor piece (ADR-0017 §4): already worn → bare the slot,
   * else seat it there. The backend persists + re-validates and its record is
   * adopted; the sheet re-bakes locally at once (peers recompose off the
   * armor-carrying position broadcast the backend just pushed).
   *
   * Requests are SERIALIZED and coalesced: each toggle folds into a shared
   * desired record and the chain sends one equip at a time — without this,
   * two quick clicks would each compute from the last ACKNOWLEDGED state and
   * the slower round-trip would silently undo the faster one.
   */
  private toggleArmor(item: ItemId): void {
    const def = armorDef(item);
    if (!def) return;
    const next: EquippedGear = { ...(this.desiredEquip ?? this.equipped) };
    if (next[def.slot] === item) delete next[def.slot];
    else next[def.slot] = item;
    this.sendGear(next);
  }

  /** seat/clear one legacy gear weapon slot. Since the 2026-07-17 hotbar
   *  unification only the CLEAR path runs (the HUD's one-shot migration drains
   *  weapons an old client left equipped back into the bag); seating stays
   *  supported so an in-flight emit from an old session can't corrupt gear. */
  private setWeaponSlot(slot: WeaponSlot, item: ItemId | null): void {
    if (item && !isWeapon(item)) return;
    const next: EquippedGear = { ...(this.desiredEquip ?? this.equipped) };
    if (!item) delete next[slot];
    else {
      const other: WeaponSlot = slot === 'weapon1' ? 'weapon2' : 'weapon1';
      if (next[other] === item && (this.inventory[item] ?? 0) < 1) delete next[other];
      next[slot] = item;
    }
    this.sendGear(next);
  }

  /** the serialized, coalesced equip send shared by armor toggles and weapon slots */
  private sendGear(next: EquippedGear): void {
    this.desiredEquip = next;
    this.equipChain = this.equipChain.then(async () => {
      const want = this.desiredEquip;
      if (!want) return; // an earlier link already sent the coalesced record
      this.desiredEquip = null;
      const res = await this.backend.equip(want);
      this.equipped = res.equipped;
      this.rebuildOwnAvatar();
      // equip MOVES the piece: adopt the mutated bag so the equipped piece leaves
      // the inventory grid (and a bared one returns) live. 'inventory' BEFORE
      // 'equipped': a drained weapon must be back in the bag when the HUD
      // reconciles on the equipped event, or its quick-slot flickers
      this.setInv(res.inventory);
      bus.emit('equipped', this.equipped);
      this.sfx('craft', 0.4);
    });
  }

  /** re-bake my own sheet (equip/unequip) and point the live sprite at it */
  private rebuildOwnAvatar(): void {
    const myTexture = `avatar-${this.me.name}`;
    this.player.anims.stop();
    ensureAvatarTexture(this, myTexture, this.me.appearance, this.equipped);
    this.player.setTexture(myTexture, AVATAR_IDLE[this.lastDir]);
  }

  /**
   * The Victory Arch recalls the Player to the Village Hall — reuses the wake
   * relocation position-write + a presence broadcast, with a camera fade so it
   * reads as a ritual. Blocked while you are rostered in an ENGAGED Guardian
   * fight, so it is never a combat escape. (The Arch is an overworld Structure
   * and the Delve uses its own interaction resolver, so recall is unreachable
   * from inside a Dungeon.)
   */
  private recallHome(): void {
    const hall = this.village.hall;
    if (!hall) {
      bus.emit('toast', t.toast.recallNoHome, 'bad');
      return;
    }
    if (this.fight?.roster.includes(this.me.name)) {
      bus.emit('toast', t.toast.recallNoFight, 'bad');
      return;
    }
    const { w, h } = footprint('village_hall');
    const tx = hall.tx + Math.floor(w / 2);
    const ty = hall.ty + h; // stand just below the Hall footprint
    const cam = this.cameras.main;
    cam.fadeOut(200, 0, 0, 0, (_c: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress < 1) return;
      this.player.setVelocity(0, 0);
      this.player.setPosition((tx + 0.5) * TILE, (ty + 0.5) * TILE);
      this.backend.sendPosition(this.player.x, this.player.y, this.lastDir, false, this.heldItem ?? undefined, this.swingCount);
      cam.fadeIn(200, 0, 0, 0);
      this.sfx('blip', 0.5);
      bus.emit('toast', t.toast.recalled, 'good');
    });
  }

  /** the Stone Keep's bell — a broadcast rally to every online Player (reuses chat, ADR-0013) */
  private ringBell(): void {
    void this.backend.sendChat(`🔔 ${this.me.name} rings the bell — gather at the Village!`);
    this.sfx('blip', 0.6);
    bus.emit('toast', t.toast.bellRung, 'good');
  }

  /** the Market Square Trade Post (ADR-0013): open the resource-exchange panel */
  private openTradePost(): void {
    bus.emit('trade-open', { inventory: { ...this.inventory }, tier: this.village.tier });
  }

  private doTrade(give: ItemId, count: number, get: ItemId): void {
    void this.backend.tradeMarket(give, count, get).then((res) => {
      if (!res.ok) {
        bus.emit('toast', t.toast.tradeFailed, 'bad');
        return;
      }
      this.setInv(res.inventory);
      bus.emit('toast', t.toast.traded(res.got.count, ITEMS[res.got.item]?.name ?? res.got.item), 'good');
      this.sfx('craft', 0.6);
      bus.emit('trade-close');
    });
  }

  /** the Banner names the Village + picks a crest hue (ADR-0013) */
  private setVillageName(name: string, crest: number): void {
    void this.backend.setVillageName(name, crest).then((res) => {
      this.applyVillage(res.village);
      bus.emit('toast', t.toast.villageNamed(res.village.name ?? ''), 'good');
    });
  }

  /** the Well's Chronicle: auto-seeded tier lines (derived) + persisted player notes */
  private openChronicle(): void {
    const auto = VILLAGE_TIERS.filter((d) => d.tier >= 1 && d.tier <= this.village.tier).map(
      (d) => t.chron.became(t.village.tierName(d.tier)),
    );
    bus.emit('chronicle-open', { lines: [...auto, ...(this.village.chronicle ?? [])] });
  }

  private addVillageNote(text: string): void {
    if (!text.trim()) return;
    void this.backend.addVillageNote(text).then((res) => {
      this.applyVillage(res.village);
      this.openChronicle();
    });
  }

  /** the Fountain Wishing Well (ADR-0013): open the Dorffest contribution panel */
  private openFountain(): void {
    bus.emit('fountain-open', {
      have: this.inventory[FOUNTAIN_WISH_ITEM as ItemId] ?? 0,
      wishes: this.village.wishes ?? 0,
      threshold: FOUNTAIN_WISH_THRESHOLD,
      festivalUntil: this.village.festivalUntil ?? 0,
    });
  }

  private doWish(count: number): void {
    void this.backend.wishFountain(count).then((res) => {
      if (!res.ok) {
        bus.emit('toast', res.reason === 'FESTIVAL_ACTIVE' ? t.toast.festivalRunning : t.toast.wishFailed, 'bad');
        return;
      }
      this.setInv(res.inventory);
      this.applyVillage(res.village); // emits the 🎉 toast on the start transition
      this.sfx('blip', 0.5);
      if (!res.festivalStarted) bus.emit('toast', t.toast.wished(count), 'good');
      this.openFountain(); // refresh the panel with the new meter
    });
  }

  /** the Flower Bed: tend it (cosmetic bloom) */
  private tendFlowers(): void {
    this.sfx('harvest', 0.4);
    bus.emit('toast', t.toast.flowersTended, 'good');
  }

  private wireBus(): void {
    // v4: the HUD Loadout bar reports which single item is in-hand (keys 1–5)
    bus.on('held', (id: ItemId | null) => {
      this.heldItem = id;
      this.applyHeldSprite();
      // broadcast promptly so every other Player's in-hand item updates now
      this.backend.sendPosition(this.player.x, this.player.y, this.lastDir, false, this.heldItem ?? undefined, this.swingCount);
    });
    bus.on('send-chat', (text: string) => {
      void this.backend.sendChat(text);
    });
    bus.on('chat-focus', () => {
      this.chatFocused = true;
      this.player.setVelocity(0, 0);
      this.input.keyboard!.enabled = false;
      this.input.keyboard!.resetKeys();
    });
    bus.on('chat-blur', () => {
      this.chatFocused = false;
      this.input.keyboard!.enabled = true;
    });
    bus.on('craft', (recipeId: string) => {
      // backstop the Forge gate (the HUD already hides these cards away from a
      // Forge): the heavy forged gear can only be made beside a Forge Structure
      const recipe = RECIPES.find((r) => r.id === recipeId);
      if (recipe?.requiresForge && !this.fogSystem.nearForge) {
        bus.emit('toast', t.toast.forgeRequired, 'bad');
        return;
      }
      void this.backend.craft(recipeId).then((result) => {
        if (result.ok) {
          this.setInv(result.inventory);
          bus.emit('toast', t.toast.crafted(ITEMS[result.crafted].name), 'good');
          this.sfx('craft', 0.5);
          if (result.crafted === 'axe' || result.crafted === 'ancient_axe') this.tickJourney('craft_axe');
        } else if (result.reason === 'INSUFFICIENT') {
          bus.emit('toast', t.toast.notEnoughResources, 'bad');
        } else if (result.reason === 'TOOL_REQUIRED') {
          bus.emit('toast', t.toast.missingTool, 'bad');
        }
      });
    });
    // ADR-0017 §4: the inventory's Equip button toggles one Armor piece
    bus.on('equip-toggle', (item: ItemId) => this.toggleArmor(item));
    // the legacy gear weapon slots: only the HUD migration's CLEAR path fires now
    bus.on('weapon-slot-set', (slot: WeaponSlot, item: ItemId | null) => this.setWeaponSlot(slot, item));
    bus.on('request-place', (item: StructureId) => this.enterPlaceMode(item));
    // the Village contribution panel's Give button: pour the chosen amounts in
    bus.on('village-give', (amounts: Inventory) => this.contributeVillage(amounts));
    bus.on('trade-do', (o: { give: ItemId; count: number; get: ItemId }) => this.doTrade(o.give, o.count, o.get));
    bus.on('fountain-wish', (count: number) => this.doWish(count));
    bus.on('village-name-set', (o: { name: string; crest: number }) => this.setVillageName(o.name, o.crest));
    bus.on('village-note-add', (text: string) => this.addVillageNote(text));
    // crate storage / Sawmill ops requested by the HUD panels
    bus.on('crate-deposit', (crateId: string, item: ItemId, count: number) => {
      void this.backend.crateDeposit(crateId, item, count).then((res) => {
        if (!res.ok) return;
        this.setInv(res.inventory);
        bus.emit('crate-open', crateId, res.contents);
      });
    });
    bus.on('crate-withdraw', (crateId: string, item: ItemId, count: number) => {
      void this.backend.crateWithdraw(crateId, item, count).then((res) => {
        if (!res.ok) {
          if (res.reason === 'NOTHING') bus.emit('toast', t.toast.crateGone, 'bad');
          return;
        }
        this.setInv(res.inventory);
        bus.emit('crate-open', crateId, res.contents);
      });
    });
    // the boss Spoils window: take one drop, take everything, or close (which
    // sweeps up whatever is left so loot is never abandoned)
    bus.on('loot-take', (item: ItemId, count: number) => this.claimLoot({ [item]: count }));
    bus.on('loot-take-all', () => this.claimLoot({ ...this.lootPending }));
    bus.on('loot-close', () => this.claimLoot({ ...this.lootPending }));
    bus.on('sawmill-deposit', (sawmillId: string) => {
      void this.backend.sawmillDeposit(sawmillId).then((res) => {
        if (!res.ok) {
          if (res.reason === 'NOTHING') bus.emit('toast', t.toast.millFullOrNoWood, 'bad');
          return;
        }
        this.setInv(res.inventory);
        this.noteSawmillState(sawmillId, res.state);
        bus.emit('sawmill-open', sawmillId, res.state);
        this.sfx('place', 0.5);
      });
    });
    bus.on('sawmill-refresh', (sawmillId: string) => this.openSawmill(sawmillId));
    bus.on('sawmill-collect', (sawmillId: string) => {
      void this.backend.sawmillCollect(sawmillId).then((res) => {
        if (!res.ok) {
          if (res.reason === 'NOTHING') bus.emit('toast', t.toast.noPlankYet, 'bad');
          return;
        }
        this.setInv(res.inventory);
        this.noteSawmillState(sawmillId, res.state);
        bus.emit('sawmill-open', sawmillId, res.state);
        bus.emit('toast', t.toast.collectPlanks, 'good');
        this.sfx('harvest', 0.6);
      });
    });
    // the generic Refiner panel (ADR-0017 §6): ONE wiring for every Refiner
    // family — the HUD echoes back the {id, cfg, name} target it was opened with
    bus.on('refiner-deposit', (o: { id: string; cfg: RefinerConfig; name: string }) => {
      void this.backend.refinerDeposit(o.id, o.cfg).then((res) => {
        if (!res.ok) {
          if (res.reason === 'NOTHING') bus.emit('toast', t.toast.refinerFullOrEmpty(ITEMS[o.cfg.inputItem].name), 'bad');
          return;
        }
        this.setInv(res.inventory);
        bus.emit('refiner-open', o, res.state);
        this.sfx('place', 0.5);
      });
    });
    bus.on('refiner-refresh', (o: { id: string; cfg: RefinerConfig; name: string }) => this.openRefiner(o.id, o.cfg, o.name));
    bus.on('refiner-collect', (o: { id: string; cfg: RefinerConfig; name: string }) => {
      void this.backend.refinerCollect(o.id, o.cfg).then((res) => {
        if (!res.ok) {
          if (res.reason === 'NOTHING') bus.emit('toast', t.toast.refinerNotReady, 'bad');
          return;
        }
        this.setInv(res.inventory);
        bus.emit('refiner-open', o, res.state);
        bus.emit('toast', t.toast.refinerCollected(ITEMS[o.cfg.outputItem].name), 'good');
        this.sfx('harvest', 0.6);
      });
    });
    bus.on('eat', (id?: ItemId) => {
      // cooked meat, cooked fish and the Grasweave Ration grant the SAME move buff
      // (ADR-0012 — a new ingredient, NOT a new buff; ADR-0017 rung 3 wildgrain sink)
      const eat =
        id === 'cooked_meat'
          ? this.backend.eatCookedMeat()
          : id === 'grasweave_ration'
            ? this.backend.eatGrasweaveRation()
            : this.backend.eatCookedFish();
      void eat.then((res) => {
        if (!res.ok) return;
        this.setInv(res.inventory);
        this.buffUntil = Date.now() + res.buffMs;
        bus.emit('buff', this.buffUntil);
        bus.emit('toast', t.toast.warmHearty, 'good');
        this.sfx('munch', 0.6);
      });
    });
    bus.on('drop-item', (id: ItemId, count: number) => {
      void this.backend.dropItem(id, count).then((res) => {
        if (!res.ok) return;
        this.setInv(res.inventory);
        bus.emit('toast', t.toast.dropped(ITEMS[id].name, count), 'info');
      });
    });
  }

  private emitPresence(): void {
    bus.emit('presence', [this.me.name, ...this.remotes.keys()]);
  }

  /**
   * Reconcile the live roster from a backend presence sync: upsert everyone
   * present and drop the sprites of any Player who has left (the Mock's bots
   * never leave, so this only ever fires for the real multiplayer backend).
   */
  private reconcilePresence(players: PlayerPos[]): void {
    const live = new Set<string>();
    for (const p of players) {
      if (p.name === this.me.name) continue;
      live.add(p.name);
      this.upsertRemote(p);
    }
    for (const name of [...this.remotes.keys()]) if (!live.has(name)) this.removeRemote(name);
    this.emitPresence();
    // ADR-0012: presence changed → re-elect the creature host (graceful re-elect +
    // respawn on host-leave; the new host repopulates its pool around remaining Players)
    this.recomputeWildHost();
    // v1 host-leave (ADR-0007 §6): if I'm a guest and the host dropped off
    // presence without a clean 'end', the mobs' brain is gone — boot out, no loot
    if (this.inDelve && !this.isDelveHost && this.delveHostName && !live.has(this.delveHostName)) {
      bus.emit('toast', t.toast.hostLeftCollapse, 'bad');
      this.leaveDelve();
    }
  }

  private removeRemote(name: string): void {
    const r = this.remotes.get(name);
    if (!r) return;
    r.sprite.destroy();
    r.label.destroy();
    r.shadow.destroy();
    r.heldSprite.destroy();
    r.torchGlow.destroy();
    this.remotes.delete(name);
    this.emitPresence();
  }

  /** point the local held sprite at the in-hand item's texture and place it in-hand */
  private applyHeldSprite(): void {
    setHeldTexture(this, this.heldSprite, this.heldItem);
    positionHeld(this.heldSprite, this.player.x, this.player.y, this.lastDir);
  }

  /** the in-hand item as a Tool (for hit RPCs), or undefined for bare hands / a non-Tool */
  heldTool(): ToolId | undefined {
    const h = this.heldItem;
    return h && ITEMS[h].kind === 'tool' ? (h as ToolId) : undefined;
  }

  /** a ranged bow is in hand (the crafted Bow or the rare Fabled Bow) — strikes from afar */
  private isBow(): boolean {
    return this.heldItem === 'bow' || this.heldItem === 'fabled_bow';
  }

  // ------------------------------------------------------------ nodes

  private nodeAlive(n: NodeState): boolean {
    if (n.hp > 0) return true;
    const t = NODE_TYPES[n.type];
    return n.harvestedAt !== null && Date.now() >= n.harvestedAt + t.regrowMs;
  }

  /** soft ground shadow — sceneFx.addShadow (ADR-0018) */
  private addShadow(x: number, y: number, width: number): Phaser.GameObjects.Image {
    return addShadow(this, x, y, width);
  }

  /** depth-sorted object image — sceneFx.objImage (ADR-0018) */
  private objImage(x: number, y: number, kind: string): Phaser.GameObjects.Image | null {
    return objImage(this, x, y, kind);
  }

  private setObjTexture(img: Phaser.GameObjects.Image, kind: string): void {
    setObjTexture(this, img, kind);
  }

  /** show the Resource Node's name in a small tooltip while the cursor hovers it */
  private makeNodeHoverable(sprite: Phaser.GameObjects.Image, type: NodeState['type']): void {
    sprite.setInteractive();
    sprite.on('pointerover', () => {
      // World Nodes stay interactive under the Delve overlay (only their physics
      // colliders are disabled on entry); without this guard their hover label
      // would surface over the Dungeon. No label while we're below.
      if (this.inDelve) return;
      if (!this.nodeHoverLabel) {
        // same visual size as the remote-player name tags (fontSize 7, res 6)
        // so hover text reads consistently across the World; the base scale is
        // multiplied by the player's Name-label-size setting
        this.nodeHoverLabel = this.add
          .text(0, 0, '', {
            fontSize: '7px',
            color: '#e8f5e9',
            stroke: '#000000',
            strokeThickness: 2,
            backgroundColor: 'rgba(10, 20, 8, 0.82)',
            padding: { x: 4, y: 2 },
          })
          .setOrigin(0.5, 1)
          .setResolution(6)
          .setScale(this.labelScale())
          .setDepth(999_995);
      }
      this.nodeHoverLabel
        .setText(NODE_TYPES[type].name)
        .setPosition(sprite.x, sprite.y - sprite.displayHeight - 2)
        .setVisible(true);
    });
    sprite.on('pointerout', () => this.nodeHoverLabel?.setVisible(false));
  }

  private addNode(state: NodeState): void {
    const x = (state.tx + 0.5) * TILE;
    const y = (state.ty + 1) * TILE;
    const alive = state.hp > 0;
    const sprite = this.objImage(x, y, alive ? state.type : `${state.type}_depleted`);
    if (!sprite) return;
    this.makeNodeHoverable(sprite, state.type);
    const h = idHash(state.id);
    if (state.type === 'tree') {
      sprite.setScale(nodeRestScale(state));
      sprite.setFlipX(h % 2 === 0);
      this.addShadow(x, y - 1, 26 * sprite.scaleX);
    } else if (state.type === 'fruit_bush') {
      sprite.setFlipX(h % 2 === 0);
      this.addShadow(x, y - 1, 22);
    } else if (state.type === 'rock') {
      this.addShadow(x, y - 2, 16);
    } else if (state.type === 'wildgrain_bed' && alive) {
      // ADR-0017 rung 3: tint the fresh bed to its current growth stage so ripeness
      // reads immediately on load (the 600ms refresh keeps it current thereafter)
      sprite.setTint(WILDGRAIN_STAGE_TINT[wildgrainStage(Date.now(), idHash(state.id), CULTIVATION_PERIOD_MS)]);
    }
    let body: Phaser.GameObjects.Rectangle | null = null;
    if (NODE_TYPES[state.type].blocks) {
      body = this.addBlockerBody(state.tx, state.ty);
      body.setData('nodeId', state.id);
      (body.body as Phaser.Physics.Arcade.StaticBody).enable = alive;
    }
    this.nodes.set(state.id, { state, sprite, body, depletedShown: !alive });
    this.nodesByTile.set(`${state.tx},${state.ty}`, state.id);
  }

  private addBlockerBody(tx: number, ty: number): Phaser.GameObjects.Rectangle {
    return addBlockerBody(this, this.blockersGroup, tx, ty);
  }

  private updateNode(state: NodeState): void {
    const view = this.nodes.get(state.id);
    if (!view) return;
    // J3: hp changes land HERE and only here (my own hit via the backend's
    // nodeChanged relay, a friend's hit via the shared event, regrowth via
    // checkRegrowthVisuals) — so the pip display hooks this exact spot and can
    // never show a value the authoritative state doesn't hold.
    const prevHp = view.state.hp;
    view.state = state;
    const alive = state.hp > 0;
    if (alive === view.depletedShown) {
      // state flipped relative to what we show
      view.depletedShown = !alive;
      this.setObjTexture(view.sprite, alive ? state.type : `${state.type}_depleted`);
      if (view.body) (view.body.body as Phaser.Physics.Arcade.StaticBody).enable = alive;
      // J3: the finishing hit is the payoff beat — a slightly larger debris
      // burst rides the depletion squash below. Fired only on the flip (not on
      // repeated depleted events) and only when actually visible: nodeChanged
      // arrives for EVERY node on the map, and off-screen (or under the Delve
      // overlay) a burst would be nothing but invisible tween churn.
      if (!alive && this.nodeFxVisible(view)) this.nodeChipBurst(view, true);
    }
    if (!alive) {
      // J3: a punch tween still mid-flight would hand the squash below a
      // drifting start scale — settle the sprite at rest before the payoff
      this.settleNodePunch(view);
      this.hideNodePips(state.id); // depletion is the payoff beat; pips leave with it
      // depleting hit lands: little poof of scale
      this.tweens.add({ targets: view.sprite, scaleX: 1.15, scaleY: 0.9, duration: 80, yoyo: true });
    } else if (state.hp < prevHp) {
      // a landed hit left the node damaged — surface the authoritative hp
      this.showNodePips(view);
    } else if (state.hp > prevHp) {
      this.hideNodePips(state.id); // regrown/refreshed — stale pips must not survive
    }
  }

  private checkRegrowthVisuals(): void {
    const now = Date.now();
    for (const view of this.nodes.values()) {
      if (!view.depletedShown || view.state.harvestedAt === null) continue;
      const t = NODE_TYPES[view.state.type];
      if (now >= view.state.harvestedAt + t.regrowMs) {
        view.depletedShown = false;
        view.state = { ...view.state, hp: t.maxHp, harvestedAt: null };
        this.hideNodePips(view.state.id); // J3: back at max — no pips may linger
        this.setObjTexture(view.sprite, view.state.type);
        if (view.body) (view.body.body as Phaser.Physics.Arcade.StaticBody).enable = true;
        // settle back to the sprite's PLANTED scale (trees vary by idHash) — a
        // regrown tree left at flat 1.0 would visibly snap on its next punch
        const rest = nodeRestScale(view.state);
        this.tweens.add({ targets: view.sprite, scaleX: { from: rest * 0.6, to: rest }, scaleY: { from: rest * 0.6, to: rest }, duration: 250 });
      }
    }
  }

  /**
   * ADR-0017 rung 3: retint every wildgrain bed by its clock-derived growth stage
   * (bare → sprout → green → ripe golden) so ripeness sweeps the field as a spatial
   * gradient. A pure f(clock, idHash) — every client reads the identical stage. The
   * tint is reapplied each tick so it survives the depleted↔alive texture swaps; a
   * depleted (harvested) bed shows its own stubble sprite untinted.
   */
  private refreshWildgrainStages(): void {
    const now = Date.now();
    for (const view of this.nodes.values()) {
      if (view.state.type !== 'wildgrain_bed') continue;
      if (view.depletedShown) {
        view.sprite.clearTint();
        continue;
      }
      view.sprite.setTint(WILDGRAIN_STAGE_TINT[wildgrainStage(now, idHash(view.state.id), CULTIVATION_PERIOD_MS)]);
    }
  }

  // ------------------------------------------------- J3: harvest impact kit

  /**
   * Should node impact FX (chips, pips) render right now? nodeChanged events
   * arrive for the WHOLE map — a friend harvesting three Zones away must not
   * spawn invisible tweens here — and the Delve overlay (depth 900k+) hides
   * the World entirely, so anything fired beneath it would be pure churn.
   * Cheap: one rectangle-contains against the camera's live worldView.
   */
  private nodeFxVisible(view: NodeView): boolean {
    return !this.inDelve && this.cameras.main.worldView.contains(view.sprite.x, view.sprite.y - TILE / 2);
  }

  /** chip debris off a node, tinted by its type, at roughly swing height */
  private nodeChipBurst(view: NodeView, big: boolean): void {
    const s = view.sprite;
    this.burstChips(s.x, s.y - s.displayHeight * 0.4, s.depth + 2, CHIP_TINTS[view.state.type], big);
  }

  /**
   * A short-lived burst of 2-3px debris chips — J4's death-puff pattern
   * (tweened images off the shared 4px 'poof' texture, tinted per burst)
   * tightened into impact debris: constant pixel size (0.5/0.75 of the 4px
   * texture = whole 2/3px — no fractional-scaling shimmer), a flat outward
   * scatter with a slight lift, and a hard TTL sweep so nothing strays. Never
   * allocates a texture or an emitter — chips exist only at the impact point.
   */
  private burstChips(x: number, y: number, depth: number, tints: number[], big: boolean): void {
    const n = big ? CHIP_COUNT_FINISH : CHIP_COUNT_HIT;
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n + (i % 2) * 0.7;
      const dist = (big ? 12 : 8) + (i % 3) * 4;
      const chip = this.add
        .image(x + Math.cos(ang) * 2, y + Math.sin(ang), 'poof')
        .setTint(tints[i % tints.length])
        .setScale(i % 2 ? 0.5 : 0.75) // 2px / 3px off the 4px texture — whole pixels
        .setDepth(depth);
      this.tweens.add({
        targets: chip,
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist * 0.5 - (big ? 6 : 4), // flattened scatter, slight lift
        alpha: 0,
        duration: 250 + (i % 4) * 40,
        ease: 'Quad.out',
        // each chip has exactly ONE tween, so its onComplete is the reap — no
        // TTL constant to hand-sync against tween durations, nothing to leak
        // if a duration is ever retuned. Scene teardown destroys chip and
        // tween alike, so there is no orphan window.
        onComplete: () => chip.destroy(),
      });
    }
  }

  /**
   * The ~40ms hit punch: a squash (wider, slightly shorter) layered on the
   * existing ±3° wobble — different properties (scale vs angle), so the two
   * tweens compose freely. Kill-restart discipline like playSwingFx: a held-E
   * cadence re-punches before the last settled, so the old tween dies and the
   * sprite snaps back to its exact rest scale first (re-derived, never read
   * mid-tween — see nodeRestScale) to rule out cumulative drift.
   */
  private punchNode(view: NodeView): void {
    const s = view.sprite;
    this.settleNodePunch(view);
    const rest = nodeRestScale(view.state);
    const tween = this.tweens.add({
      targets: s,
      scaleX: rest * 1.06,
      scaleY: rest * 0.96,
      duration: NODE_PUNCH_MS,
      yoyo: true,
      ease: 'Quad.out',
      onComplete: () => {
        s.setScale(rest);
        s.setData(NODE_PUNCH_KEY, null);
      },
    });
    s.setData(NODE_PUNCH_KEY, tween);
  }

  /** kill an in-flight punch and restore rest scale (no-op when none is running) */
  private settleNodePunch(view: NodeView): void {
    // Phaser's getData lazily ALLOCATES a DataManager on first touch, and this
    // runs for every map-wide depletion event — most on sprites only remote
    // Players ever hit, which can never hold a punch (punchNode is local-only).
    // A punch implies punchNode's setData already built the manager, so a
    // data-less sprite provably has no punch: bail before allocating.
    if (!view.sprite.data) return;
    const prev = view.sprite.getData(NODE_PUNCH_KEY) as Phaser.Tweens.Tween | null | undefined;
    if (!prev) return;
    prev.remove();
    view.sprite.setScale(nodeRestScale(view.state));
    view.sprite.setData(NODE_PUNCH_KEY, null);
  }

  /**
   * Damage pips over a partially-damaged node: one 2px cell per max HP, lit
   * for remaining hp — the mob HP bar's job in a quieter voice (no bright
   * green, no outline; a whisper of UI fitting the restrained art direction).
   * Draws from view.state.hp, which updateNode has just set from the
   * authoritative event, so pips can never show a stale value. The display is
   * created lazily, redrawn (kill-restart on its fade) while hits keep
   * landing, and destroys ITSELF after hold+fade — steady state holds zero
   * pip objects, satisfying the no-standing-overhead constraint.
   */
  private showNodePips(view: NodeView): void {
    const st = view.state;
    const max = NODE_TYPES[st.type].maxHp;
    if (st.hp <= 0 || st.hp >= max) {
      this.hideNodePips(st.id);
      return;
    }
    if (!this.nodeFxVisible(view)) return;
    let pip = this.nodePips.get(st.id);
    if (!pip) {
      pip = { gfx: this.add.graphics(), tween: null };
      this.nodePips.set(st.id, pip);
    }
    const g = pip.gfx;
    const w = max * (NODE_PIP_SIZE + NODE_PIP_GAP) - NODE_PIP_GAP;
    // integer world position keeps the 2px cells on whole pixels at integer zoom
    g.setPosition(Math.round(view.sprite.x - w / 2), Math.round(view.sprite.y - view.sprite.displayHeight) - 6);
    g.setDepth(view.sprite.depth + 2);
    g.setAlpha(1);
    g.clear();
    g.fillStyle(0x000000, 0.35); // faint backing so pips read on bright foliage
    g.fillRect(-1, -1, w + 2, NODE_PIP_SIZE + 2);
    for (let i = 0; i < max; i++) {
      g.fillStyle(i < st.hp ? NODE_PIP_FILL : NODE_PIP_LOST, 1);
      g.fillRect(i * (NODE_PIP_SIZE + NODE_PIP_GAP), 0, NODE_PIP_SIZE, NODE_PIP_SIZE);
    }
    // hold, then fade and self-destruct; another hit inside the window simply
    // kill-restarts the countdown (the ~1.5s window measures from the LAST hit)
    pip.tween?.remove();
    pip.tween = this.tweens.add({
      targets: g,
      alpha: 0,
      delay: NODE_PIP_HOLD_MS,
      duration: NODE_PIP_FADE_MS,
      onComplete: () => {
        g.destroy();
        this.nodePips.delete(st.id);
      },
    });
  }

  /** drop a node's pip display immediately (depletion payoff, regrowth) */
  private hideNodePips(nodeId: string): void {
    const pip = this.nodePips.get(nodeId);
    if (!pip) return;
    pip.tween?.remove();
    pip.gfx.destroy();
    this.nodePips.delete(nodeId);
  }

  /**
   * The E priority chain, resolved WITHOUT side effects so held-E can check
   * the action type before firing (a held E near a tablet must not reopen it).
   */
  private resolveEAction(): EAction | null {
    const px = this.player.x;
    const py = this.player.y - 4;

    // inside the Delve, E means "attack a Husk" or "leave" — never a World action
    if (this.inDelve) return this.delveEAction(px, py);
    // the sealed mine shaft (clear it with an Ancient Pickaxe) / open shaft (enter)
    const delve = this.delveEntranceAction(px, py);
    if (delve) return delve;
    // a Realm gate (ADR-0017): step through, or learn that it is dormant
    const realm = this.realmGateAction(px, py);
    if (realm) return realm;

    // special interactables take priority over nodes
    if (Phaser.Math.Distance.Between(px, py, this.welcomeStonePos.x, this.welcomeStonePos.y - 8) < INTERACT_RANGE) {
      return {
        swing: false,
        run: () => {
          this.sfx('blip', 0.4);
          this.useHint('read');
          this.input.keyboard!.enabled = false;
          void showIntro().then(() => {
            this.input.keyboard!.enabled = true;
            this.input.keyboard!.resetKeys();
          });
        },
      };
    }
    for (const spot of this.tabletSpots) {
      if (Phaser.Math.Distance.Between(px, py, spot.x, spot.y - 8) < INTERACT_RANGE) {
        return {
          swing: false,
          run: () => {
            void this.backend.readTablet(spot.id);
            const tab = TABLETS[spot.id];
            bus.emit('lore', tab?.title ?? t.lore.tabletFallbackTitle, tab?.text ?? t.lore.tabletFallbackText);
            this.sfx('blip', 0.4);
            this.useHint('read');
            this.tickJourney('read_tablet');
          },
        };
      }
    }
    const special = this.sealSystem.contributeSealAction() ?? this.summonAction() ?? this.mireAltarAction() ?? this.echoAltarAction() ?? this.verdantAltarAction() ?? this.guardianAction();
    if (special) return special;
    if (Phaser.Math.Distance.Between(px, py, this.altarPos.x, this.altarPos.y - 8) < INTERACT_RANGE + 8) {
      return {
        swing: false,
        run: () => {
          if (this.quest?.gateOpen) {
            bus.emit('toast', t.toast.groveOpen, 'info');
          } else {
            void this.backend.offerAltar().then((res) => {
              if (res.ok) {
                this.setInv(res.inventory);
                bus.emit('toast', t.toast.offeringAccepted, 'good');
                this.sfx('craft', 0.6);
              } else if (res.reason === 'INSUFFICIENT') {
                bus.emit('toast', t.toast.altarAsks2, 'bad');
              }
            });
          }
        },
      };
    }
    if (this.quest?.treasureLocation) {
      const spot = this.quest.treasureLocation;
      const dx = (spot.tx + 0.5) * TILE;
      const dy = (spot.ty + 0.5) * TILE;
      if (Phaser.Math.Distance.Between(px, py, dx, dy) < INTERACT_RANGE) {
        return {
          swing: false,
          run: () => {
            void this.backend.dig().then((res) => {
              if (res.ok) {
                this.setInv(res.inventory);
                const text = Object.entries(res.loot)
                  .map(([item, n]) => `+${n} ${ITEMS[item as ItemId]?.name ?? item}`)
                  .join('  ');
                this.floatText(dx, dy - 8, text, '#ffd166');
                bus.emit('toast', t.toast.unearthedTreasure, 'good');
                this.sfx('craft', 0.7);
              } else if (res.reason === 'NOT_HERE') {
                bus.emit('toast', t.toast.digCloser, 'bad');
              }
            });
          },
        };
      }
    }

    const cook = this.fishingSystem.cookAction();
    if (cook) return cook;

    // the Village Hall: E opens the contribution panel — per-resource sliders let
    // the Player choose how much of each qualifying Resource/loot to give (ADR-0010)
    const hall = this.nearbyStructure(['village_hall']);
    if (hall) return { swing: false, run: () => this.openVillageContribute() };

    // ADR-0013 building functions: the Victory Arch recalls you home; the Stone
    // Keep rings the muster bell to call everyone to the Village.
    const arch = this.nearbyStructure(['victory_arch']);
    if (arch) return { swing: false, run: () => this.recallHome() };
    const keep = this.nearbyStructure(['stone_keep']);
    if (keep) return { swing: false, run: () => this.ringBell() };
    const market = this.nearbyStructure(['market_square']);
    if (market) return { swing: false, run: () => this.openTradePost() };
    const banner = this.nearbyStructure(['village_banner']);
    if (banner) return { swing: false, run: () => bus.emit('village-name-open', { name: this.village.name ?? '', crest: this.village.crest ?? 0 }) };
    const well = this.nearbyStructure(['village_well']);
    if (well) return { swing: false, run: () => this.openChronicle() };
    const fountain = this.nearbyStructure(['fountain']);
    if (fountain) return { swing: false, run: () => this.openFountain() };
    const flowerBed = this.nearbyStructure(['flower_bed']);
    if (flowerBed) return { swing: false, run: () => this.tendFlowers() };
    // ADR-0015: the Grand Monument — until now the one interaction-less Building —
    // is the Depth Record stone: E opens the engraved record board
    const monument = this.nearbyStructure(['grand_monument']);
    if (monument) return { swing: false, run: () => this.openRecordBoard() };
    // the Forge: E opens the craft menu on the Tools & Weapons tab, where the
    // heavy forged gear is now craftable (this station is what unlocks it)
    const forge = this.nearbyStructure(['forge']);
    if (forge) return { swing: false, run: () => bus.emit('open-forge') };

    // ADR-0017 rung 1: the Brine Kiln — E opens the generic Refiner panel with
    // the salt-reed → tideglass config (the kernel is untouched; data + art only)
    const kiln = this.nearbyStructure(['brine_kiln']);
    if (kiln) return { swing: false, run: () => this.openRefiner(kiln.id, BRINE_KILN, ITEMS.brine_kiln.name) };
    // ADR-0017 rung 2: the Chime Kiln — the same generic Refiner, echo crystal → hushsteel
    const chime = this.nearbyStructure(['chime_kiln']);
    if (chime) return { swing: false, run: () => this.openRefiner(chime.id, CHIME_KILN, ITEMS.chime_kiln.name) };
    // ADR-0017 rung 3: the Verdant Loom — the same generic Refiner, wildgrain → verdant fibre
    const loom = this.nearbyStructure(['verdant_loom']);
    if (loom) return { swing: false, run: () => this.openRefiner(loom.id, VERDANT_LOOM, ITEMS.verdant_loom.name) };
    // ADR-0017 rung 2: the Echoes — arm a recording at a pedestal / claim an open vault
    const echoE = this.echoAction();
    if (echoE) return echoE;

    // functional Structures: crate storage, the Sawmill, signposts
    const st = this.nearbyStructure(['crate', 'sawmill', 'signpost']);
    if (st) {
      if (st.type === 'crate') return { swing: false, run: () => this.openCrate(st.id) };
      // ?refinertest (dev-only, ADR-0017 §6): the Sawmill tile doubles as the
      // generic test Refiner so the kernel is exercisable end-to-end before any
      // player-facing Refiner Structure ships — the live Sawmill path is untouched
      // without the flag
      if (st.type === 'sawmill') {
        if (DEV_REFINER_TEST) return { swing: false, run: () => this.openRefiner(st.id, TEST_REFINER, t.refiner.testName) };
        return { swing: false, run: () => this.openSawmill(st.id) };
      }
      return {
        swing: false,
        run: () => {
          bus.emit('lore', `🪧 ${st.placedBy} wrote:`, st.text?.trim() ? st.text : '(nothing is written here)');
          this.sfx('blip', 0.4);
        },
      };
    }

    // ADR-0012: forage a peaceful creature / hunt a predator in reach, before
    // harvesting a Node that might be standing behind it
    const wild = this.wildlifeAction();
    if (wild) return wild;

    let best: NodeView | null = null;
    let bestDist = INTERACT_RANGE;
    for (const view of this.nodes.values()) {
      if (view.depletedShown) continue;
      const d = Phaser.Math.Distance.Between(px, py, view.sprite.x, view.sprite.y - TILE / 2);
      if (d < bestDist) {
        bestDist = d;
        best = view;
      }
    }
    // nothing else in reach: a held Bow still shoots toward the cursor (the
    // trailing fallback — every verb above keeps its priority)
    if (!best) return this.bowFallbackAction();
    const view = best;
    // fishing spots use the cast-and-wait rhythm when the rod is IN HAND;
    // without it the server refusal (TOOL_REQUIRED) falls through below
    if (view.state.type === 'fishing_spot' && this.heldItem === 'fishing_rod') {
      return { swing: false, run: () => this.fishingSystem.startFishing(view) };
    }
    // ADR-0017 rung 1: the Tide gates the salt-reed banks — a reed is harvestable
    // only while the ebb exposes it (validated within ±slack of the clock, the
    // eyeOpenWithin idiom). A submerged reed refuses the swing (swing:false, like
    // the pack cap) so it never mimes a chop to friends.
    if (this.reedSubmerged(view)) {
      return { swing: false, run: () => this.tideSubmergedToast() };
    }
    // ADR-0017 rung 3: Cultivation gates the wildgrain beds — a bed is reapable
    // only in its ripe window (validated within ±slack of the clock, the same
    // reed-exposure idiom). A still-growing bed refuses the swing (swing:false).
    if (this.wildgrainUnripe(view)) {
      return { swing: false, run: () => this.wildgrainGrowingToast(view) };
    }
    // ADR-0013 pack cap, resolved BEFORE the verb: a client-refused swing must
    // not read as one — swing:false skips the cadence stamp, the pose/arc AND
    // the peers' swing echo, so a full pack never mimes chopping to friends.
    if (this.packWouldOverflow(view)) {
      return { swing: false, run: () => this.packFullToast() };
    }
    return { swing: true, run: () => this.swingAtNode(view) };
  }

  /** true when a tide-gated Mire reed is currently submerged (un-harvestable) */
  private reedSubmerged(view: NodeView): boolean {
    if (view.state.type !== 'salt_reed_bed') return false;
    return !tideExposedWithin(Date.now(), TIDE_PERIOD_MS, TIDE_EXPOSURE_SLACK_MS);
  }

  /** the tide-submerged refusal toast, throttled so repeats don't spam it */
  private tideSubmergedToast(): void {
    const now = Date.now();
    if (now - this.tideToastAt > 1500) {
      bus.emit('toast', t.toast.reedSubmerged, 'info');
      this.tideToastAt = now;
    }
  }

  /** true when a Cultivation-gated wildgrain bed is still growing (not yet ripe).
   *  The bed's phase seed is a deterministic hash of its node id (idHash), stable
   *  per node, so every client derives the identical ripeness (ADR-0001/0002). */
  private wildgrainUnripe(view: NodeView): boolean {
    if (view.state.type !== 'wildgrain_bed') return false;
    return !wildgrainRipeWithin(Date.now(), idHash(view.state.id), CULTIVATION_PERIOD_MS, CULTIVATION_SLACK_MS);
  }

  /** the still-growing wildgrain refusal toast, throttled so repeats don't spam it;
   *  shows the "ripens in Ns" countdown when known, else the plain growing hint */
  private wildgrainGrowingToast(view: NodeView): void {
    const now = Date.now();
    if (now - this.cultivationToastAt > 1500) {
      const ms = msToNextRipe(now, idHash(view.state.id), CULTIVATION_PERIOD_MS);
      bus.emit('toast', ms > 0 ? t.cultivation.ripensIn(Math.ceil(ms / 1000)) : t.cultivation.bedGrowing, 'info');
      this.cultivationToastAt = now;
    }
  }

  /**
   * ADR-0013: true when the Node's yield needs a NEW pack slot we lack room
   * for (stacks of kinds already held always grow — a full pack leaves the
   * resource in the world, no held item is ever lost). A pure read, safe
   * inside the side-effect-free resolveEAction.
   */
  private packWouldOverflow(view: NodeView): boolean {
    const cap = inventoryCapacity(this.village.tier);
    const yields = Object.keys(NODE_TYPES[view.state.type]?.yield ?? {});
    return yields.some((it) => !canAcceptItem(this.inventory, it, cap));
  }

  /** the pack-full refusal toast, throttled so repeats don't spam it */
  private packFullToast(): void {
    const now = Date.now();
    if (now - this.packFullToastAt > 1500) {
      bus.emit('toast', t.toast.packFull, 'bad');
      this.packFullToastAt = now;
    }
  }

  private swingAtNode(view: NodeView): void {
    // pack-cap backstop: resolveEAction already resolves a full pack to
    // swing:false, but the cap is CLIENT-side (ADR-0005) — a hit slipping
    // through here would reach hitNode and overfill the pack, so keep the net.
    if (this.packWouldOverflow(view)) {
      this.packFullToast();
      return;
    }
    // tide backstop (ADR-0017 rung 1): the exposure gate is client-side (ADR-0001),
    // so keep the net here too — a submerged reed never reaches hitNode
    if (this.reedSubmerged(view)) {
      this.tideSubmergedToast();
      return;
    }
    // cultivation backstop (ADR-0017 rung 3): the ripeness gate is client-side too,
    // so keep the net here — a still-growing wildgrain bed never reaches hitNode
    if (this.wildgrainUnripe(view)) {
      this.wildgrainGrowingToast(view);
      return;
    }
    this.tweens.add({ targets: view.sprite, angle: { from: -3, to: 3 }, duration: 60, yoyo: true, repeat: 1, onComplete: () => view.sprite.setAngle(0) });
    // J3: debris chips + the squash punch ride the same optimism as the
    // wobble/sfx above — fired on the swing, not the roundtrip (a server-
    // refused hit still sparks, exactly as it already thunks). The pips and
    // the yield float stay on the authoritative result, byte-identical.
    this.nodeChipBurst(view, false);
    this.punchNode(view);
    const nodeType = view.state.type;
    const swingSfx = nodeType === 'tree' || nodeType === 'hardwood_tree' ? 'chop' : nodeType === 'rock' || nodeType === 'obsidian_rock' ? 'pick' : 'harvest';
    this.sfx(swingSfx, 0.5);
    void this.backend.hitNode(view.state.id, this.heldTool()).then((result) => {
      if (!result.ok) {
        if (result.reason === 'TOOL_REQUIRED') {
          bus.emit('toast', t.toast.needToolFor(ITEMS[result.requiredTool as StructureId]?.name ?? result.requiredTool), 'bad');
        } else if (result.reason === 'DEPLETED') {
          bus.emit('toast', t.toast.yieldTaken, 'bad');
        }
        return;
      }
      if (result.finishing && result.gained) {
        const text = Object.entries(result.gained)
          .map(([item, n]) => `+${n} ${ITEMS[item as ItemId]?.name ?? item}`)
          .join('  ');
        this.floatText(view.sprite.x, view.sprite.y - TILE, text, '#ffd166');
        this.sfx('harvest', 0.6);
        this.useHint('gather');
        if (result.gained.wood) this.tickJourney('gather_wood');
        if (result.gained.stone) this.tickJourney('harvest_stone');
      }
      if (result.inventory) {
        this.setInv(result.inventory);
      }
    });
  }

  // ------------------------------------------------------------ structures

  /** the first structure of one of `types` on the 3x3 of tiles around the Player */
  nearbyStructure(types: StructureId[]): Structure | null {
    const ptx = Math.floor(this.player.x / TILE);
    const pty = Math.floor((this.player.y - 4) / TILE);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const s = this.structuresByTile.get(`${ptx + dx},${pty + dy}`);
        if (s && types.includes(s.type)) return s;
      }
    }
    return null;
  }

  private openCrate(crateId: string): void {
    void this.backend.crateOpen(crateId).then((res) => {
      if (!res.ok) return;
      this.setInv(res.inventory);
      bus.emit('crate-open', crateId, res.contents);
      this.sfx('blip', 0.4);
    });
  }

  private openSawmill(sawmillId: string): void {
    void this.backend.sawmillOpen(sawmillId).then((res) => {
      if (!res.ok) return;
      this.setInv(res.inventory);
      this.noteSawmillState(sawmillId, res.state);
      bus.emit('sawmill-open', sawmillId, res.state);
      this.sfx('blip', 0.4);
    });
  }

  /** record when a Sawmill will finish milling everything it holds, from its last
   *  observed state (wood still milling × plank time + the current plank's remainder).
   *  updateSawmills spins the blade + puffs sawdust while `now` is before it. */
  private noteSawmillState(id: string, state: SawmillState): void {
    if (state.wood > 0 && state.nextPlankMs != null) {
      this.sawmillMillingUntil.set(id, Date.now() + state.nextPlankMs + (state.wood - 1) * SAWMILL_PLANK_MS);
    } else {
      this.sawmillMillingUntil.set(id, 0);
    }
  }

  /** the Into-the-Delve "Build a Sawmill" step: does any Sawmill stand in the World? */
  private emitSawmillBuilt(): void {
    let built = false;
    for (const s of this.structuresByTile.values()) {
      if (s.type === 'sawmill') { built = true; break; }
    }
    bus.emit('sawmill-built', built);
  }

  /** v3 (#3): a working Sawmill spins its blade and coughs sawdust. "Working" is the
   *  client's last-known milling window; a mill we've never opened simply sits idle. */
  private updateSawmills(time: number, dt: number): void {
    if (this.sawmillBlades.size === 0) return;
    const now = Date.now();
    for (const [id, v] of this.sawmillBlades) {
      const working = now < (this.sawmillMillingUntil.get(id) ?? 0);
      if (!working) {
        if (v.blade.visible) v.blade.setVisible(false);
        continue;
      }
      if (!v.blade.visible) v.blade.setVisible(true);
      v.blade.rotation += dt * 9; // a brisk spin reads as cutting
      // a small sawdust puff drifts off the blade every ~0.35 s
      if (time >= v.nextPuff) {
        v.nextPuff = time + 320 + Math.random() * 120;
        const puff = this.add
          .rectangle(v.x + (Math.random() - 0.5) * 8, v.y + 4, 2, 2, 0xd9b98a)
          .setDepth(v.baseY + 2);
        this.tweens.add({
          targets: puff,
          x: puff.x + (Math.random() - 0.5) * 10,
          y: puff.y + 8 + Math.random() * 6,
          alpha: 0,
          duration: 620,
          ease: 'quad.out',
          onComplete: () => puff.destroy(),
        });
      }
    }
  }

  /** open the generic Refiner panel on a station, run on the passed tuning (ADR-0017 §6) */
  private openRefiner(refinerId: string, cfg: RefinerConfig, name: string): void {
    void this.backend.refinerOpen(refinerId, cfg).then((res) => {
      if (!res.ok) return;
      this.setInv(res.inventory);
      bus.emit('refiner-open', { id: refinerId, cfg, name }, res.state);
      this.sfx('blip', 0.4);
    });
  }

  private addStructure(s: Structure): void {
    if (this.structureIds.has(s.id)) return;
    this.structureIds.add(s.id);
    // ADR-0008 footprint: a Building spans w×h tiles anchored at (tx,ty) toward
    // +x/+y; a Prop is 1×1. RESERVE those tiles first, unconditionally — even a
    // type we can no longer render (the retired fence/hut_wall) still claims its
    // tiles on the server (structure_tiles). Skipping the reservation makes the
    // client think that ground is free: the ghost shows green and the snap aims
    // there, but the server rejects it (OCCUPIED). Reserve, then render.
    const { w, h } = footprint(s.type);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) this.structuresByTile.set(`${s.tx + dx},${s.ty + dy}`, s);
    }
    // only a known type gets sprites/collision/glow; an unknown one is
    // reserved-but-invisible (future-proofs removals without crashing).
    const def = ITEMS[s.type];
    if (!def) return;
    const key =
      s.type === 'village_hall'
        ? `st_village_hall_${Math.max(1, Math.min(VILLAGE_MAX_TIER, this.village.tier))}`
        : `st_${s.type}`;
    const x = (s.tx + w / 2) * TILE;
    const baseY = (s.ty + h) * TILE;
    const img = this.objImage(x, baseY, key);
    if (!img) {
      // no art loaded, but the claim still stands — record an empty view so the
      // footprint frees correctly on dismantle
      this.structureViews.set(s.id, { objects: [], bodies: [], glowImg: null });
      return;
    }
    const objects: Phaser.GameObjects.GameObject[] = [img];
    if (s.type === 'village_hall') this.hallImg = img;
    const bodies: Phaser.GameObjects.Rectangle[] = [];
    let glowImg: Phaser.GameObjects.Image | null = null;
    if (s.type === 'bridge') {
      img.setDepth(-2); // floor
    } else {
      img.setDepth(baseY);
    }
    // the signpost's line is rendered in-world, readable by everyone
    if (s.type === 'signpost' && s.text?.trim()) {
      const label = this.add.text(x, baseY - 16, s.text, {
        fontSize: '7px',
        color: '#ffe9c9',
        stroke: '#3a2a18',
        strokeThickness: 2,
      });
      label.setOrigin(0.5, 1);
      label.setResolution(6);
      // ~1/3 the previous on-screen size — a small readable line, not a banner
      label.setScale(0.34);
      label.setDepth(baseY + 1);
      objects.push(label);
    }
    if (def.blocks) {
      // collision spans every footprint tile
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) bodies.push(this.addBlockerBody(s.tx + dx, s.ty + dy));
      }
      objects.push(this.addShadow(x, baseY - 1, Math.max(15, w * TILE - 2)));
    }
    if (s.type === 'bridge') {
      this.groundLayer.getTileAt(s.tx, s.ty)?.setCollision(false, false, false, false);
    }
    // light sources glow at night — the brazier burns bigger than any torch
    const glowDef = {
      campfire: { scale: 2.0, base: 0.7 },
      torch: { scale: 1.4, base: 0.6 },
      golden_idol: { scale: 1.6, base: 0.5 },
      brazier: { scale: 2.8, base: 0.8 },
      forge: { scale: 2.2, base: 0.7 }, // the furnace mouth burns warm into the night
    }[s.type as string];
    if (glowDef) {
      glowImg = this.add
        .image(x, baseY - 8, 'glow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(s.type === 'golden_idol' ? 0xffe27a : 0xffab52)
        .setScale(glowDef.scale)
        .setAlpha(0)
        .setDepth(890_001);
      this.atmosphere.glows.push({ img: glowImg, base: glowDef.base, x, y: baseY });
    }
    this.structureViews.set(s.id, { objects, bodies, glowImg });
    // v3: a working Sawmill spins a saw blade. Seat it near the top-centre of the
    // mill sprite, above it in depth, hidden until the mill is milling (updateSawmills).
    if (s.type === 'sawmill') {
      const by = baseY - TILE * 1.15;
      const blade = this.add.image(x, by, 'sawblade').setDepth(baseY + 1).setVisible(false);
      objects.push(blade);
      this.sawmillBlades.set(s.id, { blade, x, y: by, baseY, nextPuff: 0 });
    }
  }

  /**
   * Tear down a dismantled Structure locally (server-ordered via the
   * `structureRemoved` event, ADR-0008): destroy its sprites + collision bodies
   * and free every footprint tile it claimed.
   */
  private removeStructure(id: string): void {
    if (!this.structureIds.has(id)) return;
    // find the Structure record (any of its footprint tiles points to it)
    let s: Structure | null = null;
    for (const st of this.structuresByTile.values()) {
      if (st.id === id) { s = st; break; }
    }
    const view = this.structureViews.get(id);
    if (view) {
      for (const o of view.objects) o.destroy();
      for (const b of view.bodies) b.destroy();
      if (view.glowImg) this.atmosphere.glows = this.atmosphere.glows.filter((g) => g.img !== view.glowImg);
      this.structureViews.delete(id);
    }
    // the blade sprite is destroyed with view.objects above; drop its bookkeeping
    this.sawmillBlades.delete(id);
    this.sawmillMillingUntil.delete(id);
    if (s) {
      const { w, h } = footprint(s.type);
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const k = `${s.tx + dx},${s.ty + dy}`;
          if (this.structuresByTile.get(k)?.id === id) this.structuresByTile.delete(k);
        }
      }
      // a dismantled bridge restores the water tile's collision underfoot
      if (s.type === 'bridge') this.groundLayer.getTileAt(s.tx, s.ty)?.setCollision(true, true, true, true);
    }
    this.structureIds.delete(id);
  }

  private enterPlaceMode(item: StructureId): void {
    if (this.inDelve) return; // no building inside the ephemeral Delve
    if ((this.inventory[item] ?? 0) <= 0) return;
    if (item === 'village_hall' && !this.canFoundHall()) return; // only one Hall stands at a time (ADR-0010)
    this.placing = item;
    this.ghost?.destroy();
    this.ghost = this.objImage(0, 0, `st_${item}`);
    this.ghost?.setAlpha(0.6).setDepth(99999);
    this.ghostCells?.destroy();
    this.ghostCells = this.add.graphics().setDepth(99998);
    bus.emit('place-mode', true);
    bus.emit('toast', t.toast.placing(ITEMS[item].name), 'info');
  }

  private exitPlaceMode(): void {
    this.placing = null;
    this.ghost?.destroy();
    this.ghost = null;
    this.ghostCells?.destroy();
    this.ghostCells = null;
    bus.emit('place-mode', false);
  }

  private facingTile(): { tx: number; ty: number } {
    const tx = Math.floor(this.player.x / TILE);
    const ty = Math.floor((this.player.y - 4) / TILE);
    const d = this.lastDir;
    return {
      tx: tx + (d === 'left' ? -1 : d === 'right' ? 1 : 0),
      ty: ty + (d === 'up' ? -1 : d === 'down' ? 1 : 0),
    };
  }

  /**
   * Top-left placement anchor for `item`, positioned so the whole footprint
   * sits DIRECTLY AHEAD of the Player in the faced direction — adjacent to the
   * Player, centred on the perpendicular axis, never on the Player's own tile.
   * The stored footprint still anchors top-left and grows +x/+y (ADR-0008);
   * this only decides WHERE that top-left lands. A 1×1 Prop reduces to the
   * single tile the Player faces (unchanged from the old facingTile flow).
   */
  private footprintAnchor(item: StructureId): { tx: number; ty: number } {
    const px = Math.floor(this.player.x / TILE);
    const py = Math.floor((this.player.y - 4) / TILE);
    const { w, h } = footprint(item);
    const offX = Math.floor((w - 1) / 2); // centre the width across the Player when facing up/down
    const offY = Math.floor((h - 1) / 2); // centre the height when facing left/right
    switch (this.lastDir) {
      case 'up':    return { tx: px - offX, ty: py - h };
      case 'down':  return { tx: px - offX, ty: py + 1 };
      case 'left':  return { tx: px - w,    ty: py - offY };
      case 'right': return { tx: px + 1,    ty: py - offY };
      default:      return { tx: px - offX, ty: py + 1 };
    }
  }

  /**
   * Forgiving placement anchor: start from where the Player is aiming
   * (footprintAnchor); if that footprint is blocked, snap to the NEAREST valid
   * footprint within a small radius so a Building "just works" near clutter or
   * a shoreline instead of demanding pixel-perfect aim. Only Buildings snap —
   * a 1×1 Prop stays exactly on the faced tile (precise decor placement).
   * `snapped` lets the ghost show it moved.
   */
  private bestAnchorNear(item: StructureId): { tx: number; ty: number; snapped: boolean } {
    const base = this.footprintAnchor(item);
    if (!isBuilding(item) || this.canPlaceLocal(item, base.tx, base.ty)) {
      return { ...base, snapped: false };
    }
    const R = 3; // a few tiles — stays within the Player's reach
    let best: { tx: number; ty: number } | null = null;
    let bestD = Infinity;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx === 0 && dy === 0) continue;
        const tx = base.tx + dx;
        const ty = base.ty + dy;
        if (!this.canPlaceLocal(item, tx, ty)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = { tx, ty }; }
      }
    }
    return best ? { ...best, snapped: true } : { ...base, snapped: false };
  }

  /**
   * Why a single tile refuses `item`, or null if it's clear. Shared by the
   * whole-footprint check and the per-tile placement overlay so the ghost's
   * red cells always match what the server would reject.
   */
  private tileBlockReason(item: StructureId, fx: number, fy: number): 'oob' | 'structure' | 'node' | 'terrain' | null {
    if (fx < 0 || fy < 0 || fx >= MAP_W || fy >= MAP_H) return 'oob';
    if (this.structuresByTile.has(`${fx},${fy}`)) return 'structure';
    if (this.nodesByTile.has(`${fx},${fy}`)) return 'node';
    const b = this.world.blocked[fy * MAP_W + fx];
    const onWater = !!ITEMS[item].onWater;
    if (onWater ? b !== 1 : b !== 0) return 'terrain';
    return null;
  }

  private canPlaceLocal(item: StructureId, tx: number, ty: number): boolean {
    // ADR-0008: a Building claims its whole footprint — EVERY tile must be free,
    // in-bounds, and the right terrain, or the placement is refused (first on the
    // footprint wins). A 1×1 Prop reduces to the old single-tile check.
    const { w, h } = footprint(item);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (this.tileBlockReason(item, tx + dx, ty + dy) !== null) return false;
      }
    }
    return true;
  }

  /** the type name of the first Resource Node inside `item`'s footprint at (tx,ty), or null */
  private blockingNodeName(item: StructureId, tx: number, ty: number): string | null {
    const { w, h } = footprint(item);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const id = this.nodesByTile.get(`${tx + dx},${ty + dy}`);
        const view = id ? this.nodes.get(id) : undefined;
        if (view) return NODE_TYPES[view.state.type].name;
      }
    }
    return null;
  }

  /** the nearest placed Structure whose footprint sits within reach of the Player */
  private nearestStructure(): Structure | null {
    const ptx = Math.floor(this.player.x / TILE);
    const pty = Math.floor((this.player.y - 4) / TILE);
    let best: Structure | null = null;
    let bestDist = 3.2; // tiles — a touch beyond the facing tile
    const seen = new Set<string>();
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const s = this.structuresByTile.get(`${ptx + dx},${pty + dy}`);
        if (!s || seen.has(s.id)) continue;
        seen.add(s.id);
        const { w, h } = footprint(s.type);
        // distance to the footprint centre
        const d = Math.hypot(ptx + 0.5 - (s.tx + w / 2), pty + 0.5 - (s.ty + h / 2));
        if (d < bestDist) {
          bestDist = d;
          best = s;
        }
      }
    }
    return best;
  }

  /**
   * X near a Structure dismantles it (ADR-0008): any Player may remove any
   * Structure for the dismantler's FULL refund, server-ordered, no ownership.
   * Friction only: a Building someone else placed needs a confirming second X.
   */
  private dismantleFacing(): void {
    const s = this.nearestStructure();
    if (!s) {
      this.dismantleArmed = null;
      return;
    }
    const now = Date.now();
    const mine = s.placedBy === this.me.name;
    // a retired/unknown type (e.g. hut_wall) has no ITEMS entry — dismantling it
    // is exactly how a Player clears the invisible old build blocking their tiles,
    // so fall back to its raw id for the label instead of crashing on .name
    const sName = ITEMS[s.type]?.name ?? s.type;
    // speed bump: dismantling ANOTHER Player's Building asks for a second press
    if (isBuilding(s.type) && !mine) {
      if (!this.dismantleArmed || this.dismantleArmed.id !== s.id || now > this.dismantleArmed.until) {
        this.dismantleArmed = { id: s.id, until: now + 3000 };
        bus.emit('toast', t.toast.dismantleConfirm(s.placedBy, sName), 'info');
        return;
      }
    }
    this.dismantleArmed = null;
    void this.backend.dismantleStructure(s.id).then((res) => {
      if (!res.ok) return;
      this.setInv(res.inventory);
      this.sfx('place', 0.5);
      const gained = Object.entries(res.refund)
        .map(([item, n]) => `+${n} ${ITEMS[item as ItemId]?.name ?? item}`)
        .join('  ');
      bus.emit('toast', gained ? t.toast.dismantled(sName, gained) : t.toast.dismantledBare(sName), 'good');
      // the server-ordered `structureRemoved` event tears down the visuals for
      // everyone (incl. us); remove locally too in case we beat the echo
      this.removeStructure(s.id);
    });
  }

  private confirmPlace(): void {
    if (!this.placing) return;
    const { tx, ty } = this.bestAnchorNear(this.placing);
    this.placeAtTile(this.placing, tx, ty);
  }

  /** place `item` on a specific tile — signposts prompt for their line first */
  private placeAtTile(item: StructureId, tx: number, ty: number): void {
    if (item === 'village_hall' && !this.canFoundHall()) return; // backstop for drag-place (ADR-0010)
    if (item === 'signpost') {
      // the signpost line prompt freezes movement through the same chat-focus
      // wiring as the chat box
      bus.emit('sign-prompt');
      const done = (text: string | null) => {
        bus.off('sign-text', done);
        if (text === null) return; // cancelled
        this.doPlace(item, tx, ty, text);
      };
      bus.on('sign-text', done);
      return;
    }
    this.doPlace(item, tx, ty);
  }

  /**
   * Drag-to-place: dropping an inventory Structure onto the canvas places it on
   * the hovered tile if that tile is valid AND within a few tiles of the
   * Player. The select→face→Enter/E flow still works unchanged.
   */
  private wireDragPlace(): void {
    const canvas = this.game.canvas;
    const TYPE = 'application/x-jw-structure';
    canvas.addEventListener('dragover', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes(TYPE)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }
    });
    canvas.addEventListener('drop', (e) => {
      const item = e.dataTransfer?.getData(TYPE) as StructureId;
      if (!item) return;
      e.preventDefault();
      this.tryDragPlace(item, e.clientX, e.clientY);
    });
  }

  /** map a client (screen) point to world coordinates via the camera */
  private screenToWorld(clientX: number, clientY: number): Phaser.Math.Vector2 {
    const rect = this.game.canvas.getBoundingClientRect();
    const cx = (clientX - rect.left) * (this.scale.gameSize.width / rect.width);
    const cy = (clientY - rect.top) * (this.scale.gameSize.height / rect.height);
    return this.cameras.main.getWorldPoint(cx, cy);
  }

  private tryDragPlace(item: StructureId, clientX: number, clientY: number): void {
    const world = this.screenToWorld(clientX, clientY);
    const tx = Math.floor(world.x / TILE);
    const ty = Math.floor(world.y / TILE);
    const ptx = Math.floor(this.player.x / TILE);
    const pty = Math.floor((this.player.y - 4) / TILE);
    const REACH = 4; // a few tiles from the Player
    if (Math.abs(tx - ptx) > REACH || Math.abs(ty - pty) > REACH) {
      bus.emit('toast', t.toast.tooFarDrop, 'bad');
      return;
    }
    if (!this.canPlaceLocal(item, tx, ty)) {
      this.toastPlaceRefused(item, tx, ty);
      return;
    }
    this.placeAtTile(item, tx, ty);
  }

  /**
   * Pick the most helpful "can't build" message by finding the FIRST offending
   * footprint tile and naming its actual reason — a bush/tree, an existing
   * Structure, or unbuildable ground — instead of one catch-all string.
   */
  private toastPlaceRefused(item: StructureId, tx: number, ty: number): void {
    const { w, h } = footprint(item);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const reason = this.tileBlockReason(item, tx + dx, ty + dy);
        if (!reason) continue;
        if (reason === 'node') {
          const node = this.blockingNodeName(item, tx, ty);
          bus.emit('toast', node ? t.toast.blockedByNode(node) : t.toast.cantBuildTile, 'bad');
        } else if (reason === 'structure') {
          bus.emit('toast', t.toast.alreadyBuiltHere, 'bad');
        } else {
          // 'terrain' or 'oob'
          bus.emit('toast', ITEMS[item].onWater ? t.toast.bridgesOnWater : t.toast.cantBuildTile, 'bad');
        }
        return;
      }
    }
    bus.emit('toast', t.toast.cantBuildTile, 'bad');
  }

  private doPlace(item: StructureId, tx: number, ty: number, text?: string): void {
    const foundingHall = item === 'village_hall' && !this.village.hall; // first founding for the celebratory toast
    void this.backend.placeStructure(item, tx, ty, text).then((result) => {
      if (result.ok) {
        this.setInv(result.inventory);
        bus.emit('toast', t.toast.placed(ITEMS[item].name), 'good');
        this.sfx('place', 0.6);
        this.useHint('place');
        if (item === 'campfire') this.tickJourney('place_campfire');
        if (foundingHall) bus.emit('toast', t.toast.villageFoundedYou, 'good');
        this.exitPlaceMode();
      } else if (result.reason === 'OCCUPIED') {
        bus.emit('toast', t.toast.alreadyBuiltHere, 'bad');
      } else if (result.reason === 'INVALID') {
        this.toastPlaceRefused(item, tx, ty);
      } else {
        this.exitPlaceMode();
      }
    });
  }

  // ------------------------------------------------------------ remote players

  private upsertRemote(p: PlayerPos): void {
    if (p.name === this.me.name) return;
    // the recompose key folds the worn Armor in (ADR-0017 §4): an equip
    // re-dresses the remote body exactly like a rejoined-with-new-look edit
    const look = JSON.stringify([p.appearance, p.armor ?? null]);
    const texture = `avatar-${p.name}`;
    let r = this.remotes.get(p.name);
    if (!r) {
      ensureAvatarTexture(this, texture, p.appearance, p.armor);
      const shadow = this.addShadow(p.x, p.y, 14);
      const sprite = this.add.sprite(p.x, p.y, texture, AVATAR_IDLE.down);
      sprite.setOrigin(0.5, 1);
      const label = this.add.text(p.x, p.y - AVATAR_H - 4, p.name, {
        fontSize: '7px',
        color: '#e8f5e9',
        stroke: '#000000',
        strokeThickness: 2,
      });
      label.setOrigin(0.5, 1);
      label.setResolution(6);
      // world-space text is magnified by camera ZOOM — labelScale() scales it
      // well down AND counter-scales by zoom so the name stays a constant-size
      // readable tag over the head at any zoom (× the player setting)
      label.setScale(this.labelScale());
      label.setAlpha(0.9);
      // the item they hold, shown in their hand, synced through presence
      const heldSprite = this.add
        .image(p.x, p.y, 'held-axe')
        .setOrigin(0.5, 0.5)
        .setScale(0.8)
        .setDepth(p.y + 1)
        .setVisible(false);
      // a Hand Torch in their hand lights them too
      const torchGlow = this.add
        .image(p.x, p.y - 8, 'glow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(TORCH_TINT)
        .setScale(1.6)
        .setAlpha(0)
        .setDepth(890_000);
      r = { sprite, label, shadow, heldSprite, torchGlow, held: null, targetX: p.x, targetY: p.y, dir: p.dir, moving: p.moving, look, armor: p.armor };
      this.remotes.set(p.name, r);
      this.emitPresence();
    } else if (r.look !== look) {
      // they re-joined with an edited Avatar, or equipped Armor — recompose
      r.look = look;
      r.armor = p.armor;
      r.sprite.anims.stop();
      ensureAvatarTexture(this, texture, p.appearance, p.armor);
      r.sprite.setTexture(texture, AVATAR_IDLE[p.dir]);
    }
    r.targetX = p.x;
    r.targetY = p.y;
    r.dir = p.dir;
    r.moving = p.moving;
    const held = p.held ?? null;
    if (r.held !== held) {
      r.held = held;
      setHeldTexture(this, r.heldSprite, held);
    }
    // swing echo (PlayerPos.swings): the counter grew since the last packet →
    // they swung. Exactly ONE pose+arc per packet however big the jump (the
    // 10Hz stream batches the ~300ms cadence, so +1/+2 is normal); first sight
    // of the field initializes silently, so a mid-session joiner never replays
    // a burst. The mark is a high-water mark against small dips: presence-sync
    // snapshots refresh far slower than the broadcast stream, and a stale meta
    // interleaving with fresh packets must not re-echo an already-played swing.
    // A LARGE dip is different: swingCount restarts at 0 on reload, and a fast
    // reload keeps the presence key (the name) live so this RemoteView — and a
    // huge stale mark — survives. Without the reset the rejoined peer's echoes
    // would stay muted until they out-swung their whole previous session.
    if (p.swings !== undefined) {
      const stale = r.swings !== undefined && r.swings - p.swings > REMOTE_SWING_RESET_GAP;
      if (stale) {
        r.swings = p.swings; // their session restarted — adopt silently
      } else {
        if (r.swings !== undefined && p.swings > r.swings) {
          this.playSwingFx(r.sprite, r.heldSprite, r.dir);
        }
        r.swings = Math.max(r.swings ?? p.swings, p.swings);
      }
    }
  }

  private applyAnim(sprite: Phaser.GameObjects.Sprite, dir: Dir, moving: boolean): void {
    // a live swing pose (playSwingFx) outranks walk/idle for its short window —
    // gated here because this method re-writes the frame every update and
    // would otherwise stomp the pose on the very next frame
    const poseUntil = sprite.getData(SWING_POSE_KEY) as number | undefined;
    if (poseUntil !== undefined && poseUntil > Date.now()) {
      sprite.anims.stop();
      sprite.setFrame(AVATAR_SWING[dir]);
      return;
    }
    if (moving) {
      sprite.anims.play(`${sprite.texture.key}-walk-${dir}`, true);
    } else {
      sprite.anims.stop();
      sprite.setFrame(AVATAR_IDLE[dir]);
    }
  }

  /**
   * The ONE way a local swing happens: the cadence stamp, the peers' echo
   * counter and the body's pose/arc, fused so they can never desync — the
   * PlayerPos.swings contract (and the friends watching) depends on all three
   * firing together. Only the two update() cadence gates call this, and only
   * for an action that truly swings (a refused verb resolves swing:false and
   * never gets here).
   */
  private markSwing(now: number): void {
    this.lastSwingAt = now;
    this.swingCount++; // rides the position stream so peers echo it
    this.playSwingFx(this.player, this.heldSprite, this.lastDir);
  }

  /**
   * The cosmetic body of a swing: flash the avatar's raised-arm frame for
   * ~100ms and sweep the in-hand Tool through a ~120ms grip-pivoted arc.
   * Reached through markSwing() for the local Player and the swing echo for
   * remotes — never from adjudication itself, so it fires exactly once per
   * swing and never touches timing (the cadences of ADR-0002/0006 stay authoritative).
   *
   * Deliberately takes the sprite/heldSprite/dir triple instead of reading
   * `this.player`/`this.heldSprite`, so a later pass can replay a REMOTE
   * Player's swing on their RemoteView pair with the same code.
   */
  private playSwingFx(sprite: Phaser.GameObjects.Sprite, heldSprite: Phaser.GameObjects.Image, dir: Dir): void {
    // pose: applyAnim honors the window on every following frame; set the
    // frame directly too so the pose shows THIS frame, not one update later
    sprite.setData(SWING_POSE_KEY, Date.now() + SWING_POSE_MS);
    sprite.anims.stop();
    sprite.setFrame(AVATAR_SWING[dir]);

    // bare hands (heldSprite hidden when nothing is held): pose only, no arc
    if (!heldSprite.visible) return;

    // kill-restart, never stack: a combat cadence can re-swing before the last
    // arc settled — the old tween dies and the new one restarts at the wind-up
    const prev = heldSprite.getData(SWING_TWEEN_KEY) as Phaser.Tweens.Tween | null;
    if (prev) prev.remove();

    // grip pivot + mirrored arc for the flipped left profile. positionHeld()
    // owns position/flip/depth per frame and never writes angle/origin, so the
    // rotation composes with it; onComplete restores both to rest exactly.
    const flip = HELD_HAND[dir].flip;
    const sign = flip ? -1 : 1;
    heldSprite.setOrigin(flip ? 1 - SWING_GRIP_X : SWING_GRIP_X, SWING_GRIP_Y);
    heldSprite.setAngle(sign * SWING_ARC_FROM_DEG);
    const restore = () => {
      heldSprite.setAngle(0).setOrigin(0.5, 0.5); // back to rest — idle rendering unchanged
      heldSprite.setData(SWING_TWEEN_KEY, null);
    };
    const tween = this.tweens.add({
      targets: heldSprite,
      angle: sign * SWING_ARC_TO_DEG,
      duration: SWING_ARC_MS,
      ease: 'Quad.easeIn', // accelerate into the hit, like a real chop
      // positionHeld() re-flips the texture per frame from the CURRENT facing;
      // a left↔right turn mid-arc would leave this tween sweeping around the
      // stale mirrored grip — the tool visibly orbits its tip end — so bail to
      // rest the moment the live flip no longer matches the arc's facing.
      onUpdate: () => {
        if (heldSprite.flipX !== flip) {
          tween.remove();
          restore();
        }
      },
      onComplete: restore,
    });
    heldSprite.setData(SWING_TWEEN_KEY, tween);
  }

  /**
   * J4 — deaths, not despawns: flash-squash-poof for a felled mob/creature.
   * The caller has already DETACHED the view from its synced map (mobViews /
   * wildViews), so the render-sync sweep — which destroys any view whose
   * MobState vanished — can no longer erase it mid-tween; from here the orphan
   * animates frozen at the death spot. ~60ms blown-out tintFill flash, then a
   * 250ms squash (scaleY→0 onto the feet origin) with a slight downward settle,
   * plus a small burst of tinted puffs from the shared 'poof' texture (tweened
   * images — no per-death emitter or texture allocation). Attached decals leave
   * with the body: telegraph/HP bar hide instantly, the shadow fades under it.
   * One TTL sweep destroys every piece and drops the registry entry; the
   * registry lets teardown (leaveDelve, creature-host change) reap a mid-beat
   * orphan, so nothing leaks. Purely visual — adjudication, loot, participation
   * and the wire are all settled before this runs (ADR-0005/0007 untouched).
   */
  private playDeathBeat(v: MobView, puffTint: number, registry: Set<Phaser.GameObjects.GameObject[]>): void {
    playDeathBeat(this, v, puffTint, registry);
  }

  /** J4: detach a Delve mob's view from the render-sync map and play its death beat */
  private delveDeathBeat(id: string): void {
    const v = this.mobViews.get(id);
    if (!v) return;
    this.mobViews.delete(id);
    this.playDeathBeat(v, DEATH_PUFF_TINT_DELVE, this.delveDeathFx);
  }

  /** J4: detach a Wildlife creature's view and play its death beat (kills only — culls stay silent) */
  private wildDeathBeat(id: string): void {
    const v = this.wildViews.get(id);
    if (!v) return;
    this.wildViews.delete(id);
    this.playDeathBeat(v, DEATH_PUFF_TINT_WILD, this.wildDeathFx);
  }

  /** J4: reap every death-beat orphan still animating — teardown mid-beat must not leak */
  private clearDeathFx(registry: Set<Phaser.GameObjects.GameObject[]>): void {
    clearDeathFx(this, registry);
  }

  // ------------------------------------------------------------ helpers

  private sfx(key: string, volume: number): void {
    this.atmosphere.sfx(key, volume);
  }

  private floatText(x: number, y: number, text: string, color: string, sizePx = 10): void {
    floatText(this, x, y, text, color, sizePx);
  }

  /** the movement-cadence zone/fog/panels hub — FogSystem.checkZone (ADR-0018) */
  private checkZone(): void {
    this.fogSystem.checkZone();
  }

  // ------------------------------------------------------------ update

  // ============================================================ Dungeons: the Delve + the Deep (ADR-0007 / ADR-0011)

  /** the live Stage's interior/mobs/loot bundle — every Stage (authored 1–2 and
   *  generated 3+, ADR-0015) flows through this one lookup */
  private stageDef(): StageDef {
    return stageDefFor(this.delveStage);
  }

  /** a Stage's display name: generated Depths carry a composed localized name,
   *  the authored Stages translate their English zone id */
  private stageZoneLabel(S: StageDef): string {
    return S.names?.zone ?? zoneName(S.zone);
  }

  /** is the mine shaft open? (the persisted world flag, or the ?dungeon dev bypass) */
  private delveOpenNow(): boolean {
    return this.delveForceOpen || !!this.quest?.delveOpen;
  }

  /** the sealed mine-shaft entrance in the World — in the frontier Cavern Mouth */
  private buildDelveEntrance(): void {
    // the sealed mine shaft sits in the frontier's Cavern Mouth zone (ADR-0009) —
    // a rocky dig deep in the far south-west, a real trek from the Ruins where the
    // Ancient Pickaxe (its key) is earned. Room here for future dungeon entrances.
    const tx = 56;
    const ty = 260;
    const x = (tx + 0.5) * TILE;
    const y = (ty + 0.5) * TILE;
    this.delveEntrance = { x, y, tx, ty };
    const c = this.add.container(x, y);
    const frame = this.add.ellipse(0, 2, TILE * 2.9, TILE * 1.9, 0x000000, 0).setStrokeStyle(3, 0x4a3a2a);
    const mouth = this.add.ellipse(0, 2, TILE * 2.3, TILE * 1.45, 0x07080b).setStrokeStyle(2, 0x2a2018);
    const rubble = this.add.container(0, 0);
    const rockColors = [0x6b5844, 0x574636, 0x7a6650];
    for (let i = 0; i < 9; i++) {
      const rk = this.add
        .rectangle(Phaser.Math.Between(-17, 17), Phaser.Math.Between(-8, 9), Phaser.Math.Between(5, 9), Phaser.Math.Between(4, 7), rockColors[i % 3])
        .setStrokeStyle(1, 0x2a2018)
        .setAngle(Phaser.Math.Between(-20, 20));
      rubble.add(rk);
    }
    const label = this.add
      .text(0, -TILE * 1.7, '', { fontSize: '8px', color: '#c9b28a', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5)
      .setResolution(4);
    c.add([frame, mouth, rubble, label]);
    c.setDepth(y);
    c.setData('rubble', rubble);
    c.setData('label', label);
    this.delveEntranceSprite = c;
    this.refreshDelveEntrance(this.delveOpenNow());
    if (DEV_DUNGEON) this.player.setPosition(x, y + TILE * 1.4);
  }

  /** show the rubble sealed, or dissolve it once the shaft is opened, forever */
  private refreshDelveEntrance(open: boolean): void {
    const c = this.delveEntranceSprite;
    if (!c) return;
    const rubble = c.getData('rubble') as Phaser.GameObjects.Container;
    const label = c.getData('label') as Phaser.GameObjects.Text;
    if (open) {
      if (rubble.visible) this.tweens.add({ targets: rubble, alpha: 0, duration: 500, onComplete: () => rubble.setVisible(false) });
      label.setText(t.delve.descend);
    } else {
      rubble.setVisible(true).setAlpha(1);
      label.setText(t.delve.sealed);
    }
  }

  /** E at the shaft: clear the rubble (Ancient Pickaxe) while sealed, or descend once open */
  private delveEntranceAction(px: number, py: number): EAction | null {
    const e = this.delveEntrance;
    if (Phaser.Math.Distance.Between(px, py, e.x, e.y) > INTERACT_RANGE + 10) return null;
    if (this.delveOpenNow()) return { swing: false, run: () => this.enterDelve() };
    if (this.heldItem === 'ancient_pickaxe') return { swing: true, run: () => this.chipRubble() };
    return { swing: false, run: () => bus.emit('toast', t.toast.shaftSealed, 'info') };
  }

  private chipRubble(): void {
    this.sfx('pick', 0.5);
    this.cameras.main.shake(110, 0.003);
    this.floatText(this.delveEntrance.x, this.delveEntrance.y - 10, '*chip*', '#c9b28a', 9);
    // J3: the sealed shaft is not a Resource Node (its 4 hits live only in
    // this.rubbleHits), but it IS rock being picked — so it borrows the rock
    // debris from the harvest impact kit for a consistent read
    this.burstChips(this.delveEntrance.x, this.delveEntrance.y - 6, this.delveEntrance.y + 2, CHIP_TINTS.rock, false);
    if (++this.rubbleHits < 4) return;
    this.rubbleHits = 0;
    void this.backend.openDelve().then((res) => {
      if (res.ok) {
        this.sfx('craft', 0.7);
        this.cameras.main.shake(300, 0.006);
        bus.emit('toast', t.toast.rubbleCollapses, 'good');
      }
      this.refreshDelveEntrance(true);
    });
  }

  /** create + host an instanced run: lock the roster, spawn scaled mobs, descend */
  private enterDelve(): void {
    if (this.inDelve) return;
    this.delveStage = 1; // entering from the World shaft always starts at Stage 1
    const me = this.me.name;
    const roster = [me];
    for (const [name, r] of this.remotes) {
      if (Phaser.Math.Distance.Between(r.sprite.x, r.sprite.y, this.delveEntrance.x, this.delveEntrance.y) < TILE * 6) roster.push(name);
    }
    const runId = `${me}:${Date.now()}`;
    this.descentId = runId; // the Descent is born here — every deeper Stage keeps this id
    this.isDelveHost = true;
    this.delveHostName = me;
    this.delveRoster = roster;
    this.delveHeadcount = Math.max(1, roster.length);
    this.backend.sendDungeon({ t: 'start', runId, host: me, heads: this.delveHeadcount, roster, stage: 1 });
    this.spawnDelveMobs();
    this.beginDelve(runId);
    bus.emit('toast', roster.length > 1 ? t.toast.descendWithOthers(roster.length - 1) : t.toast.descendAlone, 'info');
  }

  /**
   * DESCENT (ADR-0011 §3, endless per ADR-0015): at the open door, press interact
   * to start the NEXT Stage as a FRESH run — a new runId with me as host, the old
   * interior torn down and the next Depth's built (generated from its number for
   * Depths 3+ — no seed on the wire). The roster is the non-Exhausted players at
   * the door (a subset of the last Stage's — it can only shrink); no one outside
   * the instance can join (the door is reachable only from inside). Broadcast
   * BEFORE teardown so lingering party-mates accept the descent. The Descent's
   * id (the Stage-1 runId) carries through unchanged.
   */
  private descendNextStage(): void {
    if (!this.inDelve || !this.deepDoorOpen) return;
    const me = this.me.name;
    const door = this.stageDef().door;
    const next = this.delveStage + 1;
    const roster = [me];
    if (door) {
      const dx = (door.tx + 0.5) * TILE;
      const dy = (door.ty + 0.5) * TILE;
      for (const [name, pv] of this.delvePeers) {
        if (Phaser.Math.Distance.Between(pv.x, pv.y, dx, dy) < TILE * 8) roster.push(name);
      }
    }
    const runId = `${me}:${Date.now()}:d${next}`;
    this.backend.sendDungeon({ t: 'start', runId, host: me, heads: roster.length, roster, stage: next });
    this.teardownDelve();
    this.delveStage = next;
    this.isDelveHost = true;
    this.delveHostName = me;
    this.delveRoster = roster;
    this.delveHeadcount = Math.max(1, roster.length);
    this.spawnDelveMobs();
    this.beginDelve(runId);
    const others = roster.length - 1;
    if (next === 2) {
      bus.emit('toast', others > 0 ? t.toast.descendIntoDeep(others) : t.toast.descendIntoDeepAlone, 'info');
    } else {
      const zone = this.stageZoneLabel(this.stageDef());
      bus.emit('toast', others > 0 ? t.toast.descendIntoDepth(zone, others) : t.toast.descendIntoDepthAlone(zone), 'info');
    }
  }

  /**
   * ?deep dev shortcut: start a fresh SOLO Deep run as host, skipping Stage 1 and
   * the boss-door. Identical to hosting a Stage-1 run, but at Stage 2 — so the
   * magma interior, Cinder/Ember Husks and the Forgeborn come up straight away.
   */
  private enterDeepDirect(): void {
    if (this.inDelve) return;
    this.delveStage = 2;
    const me = this.me.name;
    const roster = [me];
    const runId = `${me}:${Date.now()}:deep`;
    this.descentId = runId; // a dev shortcut is its own (skip-ahead) Descent
    this.isDelveHost = true;
    this.delveHostName = me;
    this.delveRoster = roster;
    this.delveHeadcount = 1;
    this.backend.sendDungeon({ t: 'start', runId, host: me, heads: 1, roster, stage: 2 });
    this.spawnDelveMobs();
    this.beginDelve(runId);
    bus.emit('toast', t.toast.descendIntoDeepAlone, 'info');
  }

  /** host: build the authoritative mob roster (HP lives ONLY here — never the DB) */
  private spawnDelveMobs(): void {
    const S = this.stageDef();
    this.mobs.clear();
    for (const s of S.planSpawns(this.delveHeadcount, Math.random)) {
      const id = `m${this.nextMobId++}`;
      this.mobs.set(id, createMob(id, s, this.delveHeadcount, S.bossHpPerHead, S.hpMul));
    }
    this.delveKills = 0;
    this.delveParticipants.clear();
  }

  /**
   * A party-mate's client announced a run. Stage 1: join if I'm rostered and at
   * the World shaft (unchanged). Deeper Stages (the descent, ADR-0011 §3 /
   * ADR-0015): the join-guard is RELAXED so a party-mate who is ALREADY inside —
   * lingering in the just-cleared Stage with the door open — accepts the descent
   * to the next Depth. A generated Depth's whole interior rebuilds from the
   * stage NUMBER the message carries (no seed on the wire). Guests who decline
   * simply stay in the lingering lobby or leave.
   */
  private onDelveStart(msg: Extract<DungeonMsg, { t: 'start' }>): void {
    if (msg.host === this.me.name) return;
    if (!msg.roster.includes(this.me.name)) return;
    const stage: Stage = msg.stage ?? 1;
    if (stage === 1) {
      if (this.inDelve) return; // Stage 1 is entered fresh from the World, never mid-run
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, this.delveEntrance.x, this.delveEntrance.y) > TILE * 8) return;
      this.delveStage = 1;
      this.descentId = msg.runId; // guests carry the same Descent id down the chain
      this.isDelveHost = false;
      this.delveHostName = msg.host;
      this.delveRoster = msg.roster;
      this.delveHeadcount = msg.heads;
      this.mobs.clear(); // a guest renders mobs from the host's snapshots
      this.beginDelve(msg.runId);
      this.backend.sendDungeon({ t: 'join', runId: msg.runId, name: this.me.name });
      bus.emit('toast', t.toast.followInto(msg.host), 'info');
      return;
    }
    // deeper: only at-the-door party-mates of the just-cleared previous Stage descend
    if (!this.inDelve || this.delveStage !== stage - 1 || !this.deepDoorOpen) return;
    const door = this.stageDef().door;
    if (door) {
      const dx = (door.tx + 0.5) * TILE;
      const dy = (door.ty + 0.5) * TILE;
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, dx, dy) > TILE * 8) return;
    }
    this.teardownDelve();
    this.delveStage = stage;
    this.isDelveHost = false;
    this.delveHostName = msg.host;
    this.delveRoster = msg.roster;
    this.delveHeadcount = msg.heads;
    this.mobs.clear();
    this.beginDelve(msg.runId);
    this.backend.sendDungeon({ t: 'join', runId: msg.runId, name: this.me.name });
    if (stage === 2) bus.emit('toast', t.toast.followIntoDeep(msg.host), 'info');
    else bus.emit('toast', t.toast.followIntoDepth(msg.host, this.stageZoneLabel(this.stageDef())), 'info');
  }

  /** shared entry: reset run state, build the live Stage's interior, swap collision, teleport in */
  private beginDelve(runId: string): void {
    const S = this.stageDef();
    this.inDelve = true;
    this.delveRunId = runId;
    this.delveKnockdowns = 0;
    this.delveExhausted = false;
    this.delveHitLanded = false;
    this.delveExhaustedRun = null;
    this.deepDoorOpen = false;
    this.projectiles = [];
    this.rubbleHits = 0;
    this.stunnedUntil = 0;
    if (this.placing) this.exitPlaceMode();
    this.buildDelveInterior();
    for (const c of this.worldColliders) c.active = false;
    if (this.delveWallCollider) this.delveWallCollider.active = true;
    this.player.setPosition((S.entry.tx + 0.5) * TILE, (S.entry.ty + 0.5) * TILE);
    this.player.setVelocity(0, 0);
    const cam = this.cameras.main;
    // Follow the player freely inside the Delve. Clamping the camera to the small
    // Stage rect (60×22 for Stage 1) let a tall viewport center the whole interior
    // so the camera never moved — you fought pinned to the screen edge. The Delve
    // backdrop tracks the camera and fills the viewport (updateDelve), so with no
    // bounds the void beyond the walls reads as solid dark rock. Bounds are
    // restored on exit by applyCameraRegion (leaveDelve).
    cam.removeBounds();
    // the Deep flashes hot-orange on descent; the mine flashes cool
    if (S.palette === 'magma') cam.flash(500, 60, 18, 6);
    else cam.flash(400, 3, 5, 9);
    bus.emit('zone', S.zone);
  }

  /** the interior render (a high-depth overlay hiding the World) + collision */
  private buildDelveInterior(): void {
    const S = this.stageDef();
    const bg = S.palette === 'magma' ? 0x0d0705 : 0x07090c;
    this.delveBackdrop = this.add.rectangle(0, 0, 10, 10, bg).setDepth(DELVE_DEPTH_BG);
    this.buildDelveFloor();
    const ex = (S.entry.tx + 0.5) * TILE;
    const ey = (S.entry.ty + 0.5) * TILE;
    const exit = this.add
      .text(ex, ey - TILE, t.delve.leave, { fontSize: '8px', color: '#9fe0a0', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5)
      .setResolution(4)
      .setDepth(DELVE_DEPTH_FLOOR + 3);
    this.delveObjects.push(exit);
    // static bodies for wall tiles bordering floor, PLUS blocking cover props —
    // the player physics-collides with both; mobs + projectiles use S.isBlocked
    this.delveWalls = this.physics.add.staticGroup();
    for (let ty = 0; ty < S.h; ty++) {
      for (let tx = 0; tx < S.w; tx++) {
        if (!S.isWall(tx, ty)) continue;
        let border = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (!S.isWall(tx + dx, ty + dy)) {
            border = true;
            break;
          }
        }
        if (!border) continue;
        const body = this.add.rectangle((tx + 0.5) * TILE, (ty + 0.5) * TILE, TILE, TILE).setVisible(false);
        this.delveWalls.add(body);
      }
    }
    for (const p of S.props) {
      if (!PROP_BLOCKS[p.kind]) continue;
      const body = this.add.rectangle((p.tx + 0.5) * TILE, (p.ty + 0.5) * TILE, TILE - 2, TILE - 2).setVisible(false);
      this.delveWalls.add(body);
    }
    this.delveWallCollider = this.physics.add.collider(this.player, this.delveWalls);
    this.buildDelveProps();
  }

  /** per-room textured stone floors: the mine→ruins ramp (Stage 1) or a uniform
   *  molten palette with glowing ember flecks (the Deep) — kills the flat fill */
  private buildDelveFloor(): void {
    const S = this.stageDef();
    const magma = S.palette === 'magma';
    // Stage 1 mine palette (with a ruins ramp east of ruinsFromX)
    const mine = {
      base: '#2a2620', toneA: '#221f1a', toneB: '#302b24', toneC: '#241f18',
      stain: '#1b1813', scuff: '#37312a', speckle: '#17140f',
      ruinTint: '#282430', ruinToneA: '#221f2a', ruinToneB: '#2f2a38',
      edgeMine: '#1e1a15', edgeRuin: '#1c1922',
    };
    // the Deep's magma palette — speckle is a bright ember fleck (a glowing floor)
    const lava = {
      toneA: '#301a14', base: '#3a221a', toneB: '#43271c', toneC: '#2a1712',
      stain: '#1e0f0a', scuff: '#4a2c1e', speckle: '#ff5a1e', edge: '#180d09',
    };
    // ADR-0015: a generated Depth paints its own per-Depth ramp (pure hue math
    // from the Depth number — identical on every client) instead of the two
    // authored palettes; the authored Stages keep their hand-picked colors.
    const gen = S.floor;
    // the corridor spine rows — keep specks out of the walking lane
    const spineRows = new Set<number>();
    for (const cor of S.corridors) for (let yy = cor.y; yy < cor.y + cor.h; yy++) spineRows.add(yy);
    for (const r of [...S.rooms, ...S.corridors]) {
      const ruins = !gen && !magma && r.x >= S.ruinsFromX;
      const ramp = gen
        ? [gen.toneA, gen.base, gen.toneB, gen.toneC]
        : magma
        ? [lava.toneA, lava.base, lava.toneB, lava.toneC]
        : ruins
        ? [mine.ruinToneA, mine.ruinTint, mine.ruinToneB, mine.toneC]
        : [mine.toneA, mine.base, mine.toneB, mine.toneC];
      const edge = gen ? gen.edge : magma ? lava.edge : ruins ? mine.edgeRuin : mine.edgeMine;
      const stain = gen ? gen.stain : magma ? lava.stain : mine.stain;
      const scuff = gen ? gen.scuff : magma ? lava.scuff : mine.scuff;
      const speckle = gen ? gen.speckle : magma ? lava.speckle : mine.speckle;
      const key = `delveFloor_${S.stage}_${r.x}_${r.y}`;
      if (this.textures.exists(key)) this.textures.remove(key);
      const tex = this.textures.createCanvas(key, r.w * TILE, r.h * TILE);
      if (!tex) continue;
      const c = tex.context;
      for (let ty = r.y; ty < r.y + r.h; ty++) {
        for (let tx = r.x; tx < r.x + r.w; tx++) {
          const lx = (tx - r.x) * TILE;
          const ly = (ty - r.y) * TILE;
          const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
          const h2 = (h * 2654435761) >>> 0;
          c.fillStyle = ramp[h & 3];
          c.fillRect(lx, ly, TILE, TILE);
          const m = h % 100;
          if (m < 8) {
            c.fillStyle = stain;
            c.fillRect(lx, ly, TILE, TILE);
          } else if (m < 13) {
            c.fillStyle = scuff;
            c.fillRect(lx, ly, TILE, TILE);
          }
          c.fillStyle = edge; // wall-cast edge shade (recessed look)
          if (S.isWall(tx, ty - 1)) c.fillRect(lx, ly, TILE, 3);
          if (S.isWall(tx, ty + 1)) c.fillRect(lx, ly + TILE - 3, TILE, 3);
          if (S.isWall(tx - 1, ty)) c.fillRect(lx, ly, 3, TILE);
          if (S.isWall(tx + 1, ty)) c.fillRect(lx + TILE - 3, ly, 3, TILE);
          if (h2 % 10 < 3) {
            const spine = spineRows.has(ty); // keep the walking lane clean
            c.fillStyle = speckle;
            const sx = 2 + (h2 % 12);
            const sy = 3 + ((h2 >> 4) % 11);
            if (!(spine && sx > 4 && sx < 10)) c.fillRect(lx + sx, ly + sy, 1, 1);
            const sx2 = 8 + ((h2 >> 8) % 6);
            const sy2 = 6 + ((h2 >> 12) % 8);
            if (!(spine && sx2 > 4 && sx2 < 10)) c.fillRect(lx + sx2, ly + sy2, 1, 1);
          }
        }
      }
      tex.refresh();
      const img = this.add.image(r.x * TILE, r.y * TILE, key).setOrigin(0, 0).setDepth(DELVE_DEPTH_FLOOR);
      this.delveObjects.push(img);
      this.delveFloorKeys.push(key);
    }
  }

  /** place every authored prop + its light pool (ADR-0007 §10 dressing) */
  private buildDelveProps(): void {
    const S = this.stageDef();
    for (const p of S.props) {
      const flat = PROP_FLAT[p.kind];
      const px = (p.tx + 0.5) * TILE;
      const py = flat ? (p.ty + 0.5) * TILE : (p.ty + 1) * TILE; // upright props stand on the tile
      const img = this.add.image(px, py, PROP_TEX[p.kind]).setOrigin(0.5, flat ? 0.5 : 1);
      img.setDepth(flat ? DELVE_DEPTH_FLOOR + 1 : DELVE_DEPTH_ENTITY + py);
      if (S.tint) img.setTint(S.tint.prop); // ADR-0015: re-dress the recycled dressing per Depth
      this.delveObjects.push(img);
      const light = PROP_LIGHT[p.kind];
      if (light) this.addDelveLight((p.tx + 0.5) * TILE, (p.ty + 0.5) * TILE - (flat ? 0 : TILE * 0.4), light.color, light.scale, light.alpha, light.flicker);
    }
    for (const l of S.lights) this.addDelveLight((l.tx + 0.5) * TILE, (l.ty + 0.5) * TILE, l.color, l.scale, l.alpha, false);
  }

  /** an additive glow pool above the floor, below entities — the room's light */
  private addDelveLight(x: number, y: number, color: number, scale: number, alpha: number, flicker: boolean): void {
    const glow = this.add
      .image(x, y, 'glow')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setScale(scale)
      .setAlpha(alpha)
      .setDepth(DELVE_DEPTH_FLOOR + 2);
    this.delveObjects.push(glow);
    if (flicker) this.tweens.add({ targets: glow, alpha: Math.max(0.08, alpha - 0.06), duration: 900, yoyo: true, repeat: -1, ease: 'sine.inout' });
  }

  private teardownDelve(): void {
    for (const o of this.delveObjects) {
      // repeat:-1 flicker/door tweens outlive destroy() — kill them or every
      // Descent strands zombie tweens (door glow lives INSIDE a container)
      this.tweens.killTweensOf(o);
      if (o instanceof Phaser.GameObjects.Container) for (const child of o.list) this.tweens.killTweensOf(child);
      o.destroy();
    }
    this.delveObjects = [];
    for (const key of this.delveFloorKeys) if (this.textures.exists(key)) this.textures.remove(key);
    this.delveFloorKeys = [];
    this.delveBackdrop?.destroy();
    this.delveBackdrop = null;
    for (const v of this.mobViews.values()) {
      v.sprite.destroy();
      v.shadow.destroy();
      v.tele.destroy();
      v.bar.destroy();
    }
    this.mobViews.clear();
    // J4: a death beat still animating is an orphan (already out of mobViews) —
    // reap it explicitly or leaving mid-tween would leak its puffs and tweens
    this.clearDeathFx(this.delveDeathFx);
    for (const v of this.projViews.values()) {
      v.sprite.destroy();
      v.glow.destroy();
    }
    this.projViews.clear();
    for (const pv of this.delvePeers.values()) {
      pv.marker.destroy();
      pv.label.destroy();
    }
    this.delvePeers.clear();
    this.delveWallCollider?.destroy();
    this.delveWallCollider = null;
    this.delveWalls?.destroy(true);
    this.delveWalls = null;
    this.mobs.clear();
    this.projectiles = [];
    this.stunMarker?.destroy();
    this.stunMarker = null;
  }

  /** the tile just south of the founded Village Hall — THE wake point (ADR-0010 §4
   *  as amended: Village Hall > World spawn; the Hammock rung is retired), shared
   *  by every Exhaustion path */
  private villageWakeTile(): { tx: number; ty: number } | null {
    const hall = this.village?.hall;
    return hall ? { tx: hall.tx, ty: hall.ty + footprint('village_hall').h } : null;
  }

  /** where an involuntary Delve exit drops you: the founded Village Hall, else the
   *  World spawn — a known, safe home, never the far-off shaft (issue: Exhaustion
   *  used to strand you at the Cavern Mouth) */
  private delveWakeTile(): { tx: number; ty: number } {
    return this.villageWakeTile() ?? { tx: this.world.spawn.tx, ty: this.world.spawn.ty };
  }

  /** leave the Delve. `wake` overrides the exit tile (Exhaustion/collapse wake you
   *  home); the default is the mine-shaft mouth you climbed out of. */
  private leaveDelve(wake?: { tx: number; ty: number }): void {
    if (!this.inDelve) return;
    this.inDelve = false;
    this.delveRunId = null;
    this.isDelveHost = false;
    this.delveHostName = '';
    this.deepDoorOpen = false;
    this.teardownDelve();
    for (const c of this.worldColliders) c.active = true;
    const cam = this.cameras.main;
    cam.flash(300, 6, 8, 12);
    const at = wake ?? { tx: this.delveEntrance.tx, ty: this.delveEntrance.ty + 1 };
    this.player.setPosition((at.tx + 0.5) * TILE, (at.ty + 0.5) * TILE);
    this.player.setVelocity(0, 0);
    // back to the positional region clamp (the shaft is never inside a district)
    this.applyCameraRegion(true);
    this.stunnedUntil = 0;
    this.delveExhausted = false;
    bus.emit('zone', this.fogSystem.currentZone || 'Ancient Ruins');
    // restore the entity depths the Delve overlay had bumped sky-high
    this.playerShadow.setDepth(2);
    this.torchGlow.setDepth(890_000);
    this.heldSprite.setDepth(this.player.y + 1);
  }

  /** walk out via the entrance room — a host leaving ends the run for everyone (v1) */
  private leaveDelveManual(): void {
    if (this.delveRunId) {
      if (this.isDelveHost) this.backend.sendDungeon({ t: 'end', runId: this.delveRunId, reason: 'hostleft' });
      else this.backend.sendDungeon({ t: 'down', runId: this.delveRunId, name: this.me.name, out: true });
    }
    bus.emit('toast', t.toast.climbOut, 'info');
    this.leaveDelve();
  }

  /** the live Stage's participation loot: common per Husk felled + the rare boss
   *  drop — except the generated Depths (3+), which pay ONE Depth Sigil and
   *  nothing else (ADR-0015 §4: prestige-only; the Record is the real prize) */
  private stageLoot(): Inventory {
    const S = this.stageDef();
    const loot: Inventory = {};
    if (S.stage >= 3) {
      loot[S.loot.rare] = 1;
      return loot;
    }
    const shards = this.delveKills * SHARD_PER_KILL;
    if (shards > 0) loot[S.loot.common] = shards;
    loot[S.loot.rare] = DEEP_CORE_DROP;
    return loot;
  }

  /**
   * A Stage boss fell (ADR-0011 §2, endless per ADR-0015): pay THIS run's
   * participation loot, write the Depth Record (it rides the same claim), shake
   * the screen, and open the next boss-door — but keep the instance ALIVE (do
   * NOT leaveDelve). No boss ends a Descent any more — the party lingers in the
   * cleared Stage to descend further or walk out with everything banked.
   */
  private onStageBossFelled(): void {
    const loot = this.stageLoot();
    const participants = [...this.delveParticipants];
    if (this.delveRunId) {
      this.backend.sendDungeon({ t: 'end', runId: this.delveRunId, reason: 'stagecleared', loot, participants });
    }
    this.cameras.main.shake(500, 0.01);
    this.sfx('roar', 0.6);
    if (this.delveStage >= 2) this.cameras.main.flash(700, 255, 120, 40);
    this.writeDepthRecord(participants);
    this.grantStageLoot(loot, this.delveHitLanded);
    this.openDeepDoor();
  }

  /**
   * The Depth Record write (ADR-0015 §5): rides the SAME RPC that pays the
   * participation loot — credit is exactly the participation-loot set, so only
   * a client that landed ≥1 hit sends it. Depth = the Stage just cleared;
   * roster = everyone in the participation set; id = the Descent's Stage-1 runId.
   */
  private writeDepthRecord(roster: string[]): void {
    if (!this.delveHitLanded) return;
    const record = { descentId: this.descentId || this.delveRunId || '', depth: this.delveStage, roster };
    void this.backend.claimDelveLoot({}, record).then(() => this.refreshDepthRecords());
  }

  /** open (and render) the boss-door to the next Depth in the cleared boss room */
  private openDeepDoor(): void {
    if (this.deepDoorOpen) return;
    this.deepDoorOpen = true;
    const nextLabel = this.stageZoneLabel(stageDefFor(this.delveStage + 1));
    bus.emit('toast', this.delveStage === 1 ? t.toast.deepDoorOpens : t.toast.depthDoorOpens(nextLabel), 'good');
    const door = this.stageDef().door;
    if (!door) return;
    const dx = (door.tx + 0.5) * TILE;
    const dy = (door.ty + 0.5) * TILE;
    const c = this.add.container(dx, dy);
    const glow = this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xff6a2a).setScale(2.8).setAlpha(0.42);
    const frame = this.add.rectangle(0, -2, TILE * 1.7, TILE * 2.1, 0x1a1210).setStrokeStyle(2, 0xff6a1e);
    const maw = this.add.rectangle(0, 0, TILE * 1.05, TILE * 1.7, 0x120806).setStrokeStyle(2, 0xff8c2a);
    const label = this.add
      .text(0, -TILE * 1.7, this.delveStage === 1 ? t.delve.descendDeep : t.delve.descendDepth(nextLabel), {
        fontSize: '8px',
        color: '#ffb060',
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setResolution(4);
    c.add([glow, frame, maw, label]);
    c.setDepth(DELVE_DEPTH_ENTITY + dy);
    this.tweens.add({ targets: glow, alpha: 0.24, duration: 900, yoyo: true, repeat: -1, ease: 'sine.inout' });
    this.delveObjects.push(c);
  }

  /**
   * Each client claims its OWN Stage loot iff it landed ≥1 hit — the run's only DB
   * write (the existing jw_claim_delve_loot merges any loot JSON; new ids ride the
   * inventory JSON, so no migration/new RPC). The success/no-hit toast is chosen
   * from the loot payload so it names the right boss (Deep Guardian vs Forgeborn
   * vs a generated Depth's composed boss name).
   */
  private grantStageLoot(loot: Inventory, eligible: boolean): void {
    const S = this.stageDef();
    const isDepth = S.stage >= 3 || DEPTH_SIGIL in loot;
    const isDeep = FORGE_CORE in loot;
    if (!eligible) {
      bus.emit(
        'toast',
        isDepth ? t.toast.depthClearedNoHit(this.stageZoneLabel(S)) : isDeep ? t.toast.deepClearedNoHit : t.toast.delveClearedNoHit,
        'info',
      );
      return;
    }
    // roll THIS client's own rare Fabled drops (the broadcast base loot is shared;
    // the ~1% weapons are personal) and fold them into the haul. The generated
    // Depths pay the Sigil and NOTHING else (ADR-0015 §4) — no Fabled roll there,
    // so deep farming never out-loots the authored bosses.
    const full: Inventory = isDepth ? { ...loot } : { ...loot, ...this.rollFabledDrops() };
    // the boss fell — announce it, then present the haul in the Spoils window so
    // the drops are taken out deliberately (claimDelveLoot fires on the take)
    const parts = Object.entries(full)
      .filter(([, n]) => (n as number) > 0)
      .map(([k, n]) => `+${n} ${ITEMS[k as ItemId]?.name ?? k}`)
      .join('  ');
    const bossName = S.names?.boss ?? '';
    bus.emit(
      'toast',
      isDepth ? t.toast.depthBossFalls(bossName, parts) : isDeep ? t.toast.forgebornFalls(parts) : t.toast.deepGuardianFalls(parts),
      'good',
    );
    this.openLoot(full, isDepth ? t.loot.fromDepthBoss(bossName) : isDeep ? t.loot.fromForgeborn : t.loot.fromDeepGuardian);
  }

  /**
   * Roll the rare Fabled world-drop for one boss kill — ONE 1% roll for the
   * category, then a uniform pick among the weapons. Rolled LOCALLY per client
   * (never broadcast) so every fighter's luck is their own; a win lands in that
   * Player's Spoils window.
   */
  private rollFabledDrops(): Inventory {
    const drop: Inventory = {};
    if (Math.random() < FABLED_DROP_CHANCE) {
      drop[FABLED_WEAPONS[Math.floor(Math.random() * FABLED_WEAPONS.length)]] = 1;
    }
    return drop;
  }

  /**
   * Open the read-only boss Spoils window with a fresh drop set, merging it into
   * anything still uncollected (a second boss before the first bag is emptied).
   * The loot is NOT in the pack yet: it lands there only as it is taken out
   * (claimLoot → claimDelveLoot). Every boss funnels through here.
   */
  private openLoot(loot: Inventory, sub: string): void {
    for (const [k, n] of Object.entries(loot)) {
      if ((n as number) > 0) this.lootPending[k as ItemId] = (this.lootPending[k as ItemId] ?? 0) + (n as number);
    }
    bus.emit('loot-open', { ...this.lootPending }, sub);
  }

  /**
   * Take some (or all) of the pending Spoils into the pack. Clamped to what is
   * actually owed, then granted through the same per-client claim the Delve uses
   * (claimDelveLoot merges arbitrary loot into MY inventory — no server grant, no
   * migration). Echoes the remainder back so the window updates / self-closes.
   */
  private claimLoot(part: Inventory): void {
    const take: Inventory = {};
    for (const [k, n] of Object.entries(part)) {
      const amt = Math.min(n as number, this.lootPending[k as ItemId] ?? 0);
      if (amt > 0) take[k as ItemId] = amt;
    }
    if (Object.keys(take).length === 0) {
      bus.emit('loot-changed', { ...this.lootPending });
      return;
    }
    for (const [k, n] of Object.entries(take)) {
      const left = (this.lootPending[k as ItemId] ?? 0) - (n as number);
      if (left > 0) this.lootPending[k as ItemId] = left;
      else delete this.lootPending[k as ItemId];
    }
    void this.backend.claimDelveLoot(take).then((res) => {
      this.setInv(res.inventory);
      this.sfx('craft', 0.8);
      bus.emit('loot-changed', { ...this.lootPending });
    });
  }

  /** inside a Stage, E means leave (at the entry), descend (Stage-1 open door), or strike the nearest mob */
  private delveEAction(px: number, py: number): EAction | null {
    void px;
    void py;
    const S = this.stageDef();
    const ex = (S.entry.tx + 0.5) * TILE;
    const ey = (S.entry.ty + 0.5) * TILE;
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, ex, ey) < INTERACT_RANGE) {
      return { swing: false, run: () => this.leaveDelveManual() };
    }
    // the open boss-door prompt — EVERY cleared Stage has one now (ADR-0015);
    // descending stays optional (a party may instead just leave with its haul)
    if (this.deepDoorOpen && S.door) {
      const dx = (S.door.tx + 0.5) * TILE;
      const dy = (S.door.ty + 0.5) * TILE;
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, dx, dy) < INTERACT_RANGE + 8) {
        return { swing: false, run: () => this.descendNextStage() };
      }
    }
    if (this.delveExhausted) return null;
    // the Bow always fires in the Delve — mouse-aimed, misses fly (the leave/
    // descend one-shots above keep priority)
    if (this.isBow()) {
      return { swing: true, cadenceMs: this.atkCadence(weaponCombat(this.heldTool()).attackMs), run: () => this.fireBow() };
    }
    const reach = 1.7; // melee closes to arm's length
    const ptx = this.player.x / TILE;
    const pty = (this.player.y - 4) / TILE;
    let best: MobState | null = null;
    let bd = reach;
    for (const m of this.mobs.values()) {
      if (m.st === 'dead') continue;
      const d = Math.hypot(m.x - ptx, m.y - pty) - profileOf(m.kind).radius;
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    if (!best) return null;
    const target = best;
    return { swing: true, cadenceMs: this.atkCadence(weaponCombat(this.heldTool()).attackMs), run: () => this.delveSwing(target) };
  }

  private delveSwing(m: MobState): void {
    const tool = this.heldTool();
    this.sfx('chop', 0.5);
    if (this.isDelveHost) {
      this.applyDelveHit(m.id, tool, this.me.name);
    } else if (this.delveRunId) {
      // ask the host to adjudicate; the mob's HP bar (from snapshots) shows the drop
      this.backend.sendDungeon({ t: 'hit', runId: this.delveRunId, mobId: m.id, by: this.me.name, tool });
      this.delveHitLanded = true;
    }
  }

  /** host: adjudicate a player→mob hit — reuse the ADR-0006 weapon roll, apply, float */
  private applyDelveHit(mobId: string, tool: ToolId | undefined, by: string): void {
    const m = this.mobs.get(mobId);
    if (!m || m.st === 'dead') return;
    if (!this.delveHitInRange(by, m)) return; // loose trusted-friends range check (ADR-0005)
    const roll = applyMobHit(m, tool, Math.random, villageBuff(this.village.tier).critChance, this.armorBandOf(by));
    this.delveParticipants.add(by);
    if (by === this.me.name) this.delveHitLanded = true;
    const fx = m.x * TILE + Phaser.Math.Between(-6, 6);
    const fy = m.y * TILE - profileOf(m.kind).radius * TILE - 8;
    // the Bulwark's guard (ADR-0016): the hit BOUNCES — show the clank, not a 0
    if (roll.damage === 0 && m.guard) {
      this.floatText(fx, fy, '✕', '#9aa0b5', 11);
      this.sfx('blip', 0.2);
      return;
    }
    const shown = roll.damage * GUARDIAN_DISPLAY_SCALE;
    if (roll.crit) this.floatText(fx, fy, `${shown}!`, '#ffd166', 13);
    else this.floatText(fx, fy, `${shown}`, '#ff9a66', 10);
    if (roll.dead) this.onMobFelled(m);
  }

  private delveHitInRange(by: string, m: MobState): boolean {
    let x: number;
    let y: number;
    if (by === this.me.name) {
      x = this.player.x / TILE;
      y = (this.player.y - 4) / TILE;
    } else {
      const pv = this.delvePeers.get(by);
      if (!pv) return true; // no position yet — trust the friend
      x = pv.x / TILE;
      y = pv.y / TILE;
    }
    return Math.hypot(m.x - x, m.y - y) <= 7 + profileOf(m.kind).radius;
  }

  private onMobFelled(m: MobState): void {
    this.sfx('harvest', 0.5);
    // J4: detach the view BEFORE the MobState vanishes — renderDelve's sweep
    // destroys any view whose mob is gone, which used to erase the sprite the
    // same frame and make the kill read as a glitch, not a victory. The
    // orphaned view plays the flash-squash-poof at the death spot instead.
    // The Stage boss gets the same miniature: its stage-clear presentation
    // (onStageBossFelled's shake/flash/roar) is screen-level, not sprite-level,
    // so the two layer rather than double up.
    this.delveDeathBeat(m.id);
    if (!isBossKind(m.kind)) {
      this.delveKills++;
      this.mobs.delete(m.id);
      return;
    }
    // a Stage boss fell — clear its corpse, pay the loot + Record, open the next
    // door, linger (ADR-0015: no boss ends a Descent — only wipe/leave/decline)
    this.mobs.delete(m.id);
    this.onStageBossFelled();
  }

  /** my 3rd knockdown: Exhaustion — out of the run. You wake safe at home (the
   *  Village Hall or spawn), pack intact — never stranded at the far shaft. A SOLO
   *  player is always the host, so their calm wake reads as a normal defeat, not
   *  the alarming "no host migration" collapse (which only a real party ever sees). */
  private exitDelveExhausted(): void {
    this.delveExhausted = true;
    const stage = this.delveStage;
    const solo = this.delveHeadcount <= 1;
    if (this.isDelveHost) {
      const msg = solo
        ? (stage >= 3 ? t.toast.exhaustionDepthSolo : stage === 2 ? t.toast.exhaustionDeepSolo : t.toast.exhaustionDelveSolo)
        : (stage >= 3 ? t.toast.exhaustionDepthHost : stage === 2 ? t.toast.exhaustionDeepHost : t.toast.exhaustionDelveHost);
      bus.emit('toast', msg, solo ? 'info' : 'bad');
      if (this.delveRunId) this.backend.sendDungeon({ t: 'end', runId: this.delveRunId, reason: 'hostleft' });
      this.leaveDelve(this.delveWakeTile());
    } else {
      const msg = stage >= 3 ? t.toast.exhaustionDepthYou : stage === 2 ? t.toast.exhaustionDeepYou : t.toast.exhaustionDelveYou;
      bus.emit('toast', msg, 'bad');
      if (this.delveRunId) {
        this.backend.sendDungeon({ t: 'down', runId: this.delveRunId, name: this.me.name, out: true });
        if (this.delveHitLanded) this.delveExhaustedRun = this.delveRunId;
      }
      this.leaveDelve(this.delveWakeTile());
    }
  }

  /** a mob attack caught me — knock down (with a shove) and count toward Exhaustion */
  private delveKnockdown(srcX: number, srcY: number): void {
    this.beginKnockdown();
    this.sfx('chop', 0.4);
    this.cameras.main.shake(160, 0.004);
    const ang = Phaser.Math.Angle.Between(srcX * TILE, srcY * TILE, this.player.x, this.player.y);
    this.tweens.add({
      targets: this.player,
      x: this.player.x + Math.cos(ang) * TILE * 1.6,
      y: this.player.y + Math.sin(ang) * TILE * 1.6,
      duration: 200,
      ease: 'quad.out',
    });
    this.delveKnockdowns++;
    if (this.delveKnockdowns >= EXHAUSTION_KNOCKDOWNS) this.exitDelveExhausted();
    else {
      const knocked =
        this.delveStage >= 3 ? t.toast.knockedInDepth : this.delveStage === 2 ? t.toast.knockedInDeep : t.toast.knockedInDelve;
      bus.emit('toast', knocked(this.delveKnockdowns, EXHAUSTION_KNOCKDOWNS), 'bad');
    }
  }

  /** alive player positions the host AI steers toward (tile units) */
  private delveTargets(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    if (!this.delveExhausted) out.push({ x: this.player.x / TILE, y: (this.player.y - 4) / TILE });
    for (const pv of this.delvePeers.values()) out.push({ x: pv.x / TILE, y: pv.y / TILE });
    return out;
  }

  // ============================================================ the Echoes (ADR-0017 rung 2)
  // Recorded, server-persisted movement shades + pedestal-vaults, all as pure
  // f(loop-phase) client-side (content/echoes.ts). Runs only inside the Hushdark.

  /** the Hushdark frame: refresh shades, advance a recording, render shades, vaults */
  updateEchoes(time: number, _delta: number): void {
    const inHush = this.activeDistrict?.id === 'the_hushdark';
    const now = Date.now();
    // refresh the shade list + the vault-claim weeks (RPC reads; throttled; NEVER
    // presence — rate-limit gotcha). The vault weeks gate the deep vault + claims.
    if (inHush && time - this.echoLastListAt > 3000) {
      this.echoLastListAt = time;
      void this.backend.listEchoes().then((gs) => {
        this.echoGhosts = gs;
      });
    }
    // advance an in-progress recording (sample the Player, close at the period)
    if (this.echoRecording) {
      if (!inHush) {
        this.echoRecording = null; // left mid-recording — abandon (no charm spent yet)
      } else {
        const rec = this.echoRecording;
        const elapsed = now - rec.startedAt;
        if (now - rec.lastSampleAt >= 110 && rec.samples.length < 400) {
          rec.lastSampleAt = now;
          rec.samples.push({ t: Math.min(elapsed, ECHO_PERIOD_MS), x: this.player.x / TILE, y: this.player.y / TILE, dir: this.lastDir });
        }
        if (elapsed >= ECHO_PERIOD_MS) this.finishEchoRecording();
      }
    }
    if (!inHush) {
      this.reapEchoViews();
      if (this.hushVaultGfx) this.hushVaultGfx.setVisible(false);
      return;
    }
    this.renderGhosts(now);
    this.updateVaults(now);
  }

  /** E at a Hushdark pedestal arms a 20s recording; a chime_charm is required */
  private armEchoRecording(): void {
    if (this.echoRecording) return;
    if ((this.inventory.chime_charm ?? 0) < 1) {
      bus.emit('toast', t.toast.echoNeedsCharm, 'bad');
      return;
    }
    const ghostId = `${this.me.name}#${this.echoNextSlot}`;
    this.echoNextSlot = (this.echoNextSlot + 1) % 3; // a Player keeps up to 3 shades
    this.echoRecording = { ghostId, startedAt: Date.now(), lastSampleAt: 0, samples: [] };
    bus.emit('toast', t.toast.echoArmed, 'info');
  }

  /** E at the memorial: record the PERMANENT greeting shade (no charm — the reward) */
  private armGreetingRecording(): void {
    if (this.echoRecording) return;
    this.echoRecording = { ghostId: `${this.me.name}@greet`, startedAt: Date.now(), lastSampleAt: 0, samples: [], greeting: true };
    bus.emit('toast', t.toast.echoArmed, 'info');
  }

  /** close a recording: reject a motionless shade (anti-parking), else persist it —
   *  an ordinary shade via recordEcho (spends a charm), a greeting via leaveGreeting */
  private finishEchoRecording(): void {
    const rec = this.echoRecording;
    this.echoRecording = null;
    if (!rec) return;
    if (ghostTravelTiles(rec.samples) < ECHO_MIN_MOVE_TILES) {
      bus.emit('toast', t.toast.echoTooStill, 'bad'); // no charm spent (nothing sent)
      return;
    }
    if (rec.greeting) {
      void this.backend.leaveGreeting(rec.samples, ECHO_PERIOD_MS).then((ghost) => {
        if (!ghost) return;
        this.echoGhosts = [ghost, ...this.echoGhosts.filter((g) => g.ghostId !== ghost.ghostId)];
        bus.emit('toast', t.toast.greetingLeft, 'good');
      });
      return;
    }
    void this.backend.recordEcho(rec.ghostId, rec.samples, ECHO_PERIOD_MS).then((res) => {
      if (!res) {
        bus.emit('toast', t.toast.echoNeedsCharm, 'bad');
        return;
      }
      this.setInv(res.inventory);
      this.echoGhosts = [res.ghost, ...this.echoGhosts.filter((g) => g.ghostId !== res.ghost.ghostId)];
      bus.emit('toast', t.toast.echoCaptured, 'good');
    });
  }

  /** position a translucent shade per listed ghost; reap views for vanished shades.
   *  Ordinary shades are cold blue; a greeting shade is warm gold + a floating name. */
  private renderGhosts(now: number): void {
    const live = new Set<string>();
    for (const g of this.echoGhosts) {
      const pose = ghostPoseAt(now, g, g.periodMs);
      if (!pose) continue;
      live.add(g.ghostId);
      const x = pose.x * TILE;
      const y = pose.y * TILE;
      const greeting = g.kind === 'greeting';
      const frame = AVATAR_IDLE[(pose.dir ?? 'down') as Dir];
      let view = this.echoGhostViews.get(g.ghostId);
      if (!view) {
        const texKey = this.textures.exists(`avatar-${g.who}`) ? `avatar-${g.who}` : `avatar-${this.me.name}`;
        const sprite = this.add
          .sprite(x, y, texKey, frame)
          .setOrigin(0.5, 1)
          .setAlpha(greeting ? 0.55 : 0.42)
          .setTint(greeting ? 0xffd98a : 0x9fc4ff);
        const shadow = this.addShadow(x, y - 1, 12).setAlpha(0.22);
        view = { sprite, shadow };
        if (greeting) {
          view.label = this.add
            .text(x, y - AVATAR_H - 4, g.who, { fontFamily: 'monospace', fontSize: '9px', color: '#ffe6a8' })
            .setOrigin(0.5, 1)
            .setDepth(y + 1);
        }
        this.echoGhostViews.set(g.ghostId, view);
      }
      view.sprite.setPosition(x, y).setDepth(y).setFrame(frame);
      view.shadow.setPosition(x, y - 1);
      view.label?.setPosition(x, y - AVATAR_H - 4).setDepth(y + 1);
    }
    for (const [id, view] of this.echoGhostViews) {
      if (!live.has(id)) {
        view.sprite.destroy();
        view.shadow.destroy();
        view.label?.destroy();
        this.echoGhostViews.delete(id);
      }
    }
  }

  /** does any point of a shade's loop cross the pedestal? (dev vault-open aid only) */
  private ghostEverCovers(g: Ghost, ped: { tx: number; ty: number }): boolean {
    const steps = 24;
    for (let i = 0; i < steps; i++) {
      const pose = ghostPoseAt(g.recordedAt + (i / steps) * g.periodMs, g, g.periodMs);
      if (poseOnPedestal(pose, { tx: ped.tx + 0.5, ty: ped.ty + 0.5 }, ECHO_PEDESTAL_RADIUS)) return true;
    }
    return false;
  }

  private ensureVaultGfx(): Phaser.GameObjects.Graphics {
    if (!this.hushVaultGfx) this.hushVaultGfx = this.add.graphics().setDepth(3);
    return this.hushVaultGfx;
  }

  /** derive the puzzle from live-player + shade coverage; when all three pedestals
   *  are covered AT ONCE (and no fight runs), SUMMON the Reverberant — the puzzle
   *  is a boss key, not a loot lever. Draws the pedestals + the court seal. */
  private updateVaults(now: number): void {
    const vaults = this.world.hushdarkVaults ?? [];
    const gfx = this.ensureVaultGfx();
    gfx.clear().setVisible(true);
    const coverers: (Pose | null)[] = [{ x: this.player.x / TILE, y: this.player.y / TILE }];
    for (const r of this.remotes.values()) coverers.push({ x: r.sprite.x / TILE, y: r.sprite.y / TILE });
    for (const g of this.echoGhosts) coverers.push(ghostPoseAt(now, g, g.periodMs));
    let anySolved = false;
    for (const v of vaults) {
      const centre = (p: { tx: number; ty: number }) => ({ tx: p.tx + 0.5, ty: p.ty + 0.5 });
      const coveredNow = (p: { tx: number; ty: number }) => coverers.some((c) => poseOnPedestal(c, centre(p), ECHO_PEDESTAL_RADIUS));
      let solved = v.pedestals.every(coveredNow);
      // ?echotest aid: a pedestal also counts if a shade's loop EVER crosses it, so
      // the async-coop plumbing is solo-testable without perfect phase alignment
      if (!solved && DEV_ECHO) {
        solved = v.pedestals.every((ped) => coveredNow(ped) || this.echoGhosts.some((g) => this.ghostEverCovers(g, ped)));
      }
      if (solved) anySolved = true;
      for (const ped of v.pedestals) this.drawPlinth(gfx, ped.tx, ped.ty, coveredNow(ped) ? 0x63ffb0 : 0x93a8c9);
      this.drawVaultDoor(gfx, v.door.tx, v.door.ty, solved); // the court seal — bright when solved
      if (solved) this.hushVaultOpen.add(v.id);
      else this.hushVaultOpen.delete(v.id);
      // fire the summon exactly once per coverage event (re-armed when coverage drops)
      if (solved && !this.fight && !this.reverbSummonBusy) {
        this.reverbSummonBusy = true;
        void this.summonReverberant();
      }
    }
    if (!anySolved && !this.fight) this.reverbSummonBusy = false; // re-arm for the next solve
    // the memorial plinth — warm once you've defeated the Reverberant, cold when locked
    const mem = this.world.hushdarkMemorial;
    if (mem) this.drawPlinth(gfx, mem.tx, mem.ty, this.reverbDefeated ? 0xffd98a : 0x6b6478);
  }

  private drawPlinth(gfx: Phaser.GameObjects.Graphics, tx: number, ty: number, color: number): void {
    const x = (tx + 0.5) * TILE;
    const y = (ty + 0.5) * TILE;
    gfx.fillStyle(color, 0.18).fillCircle(x, y, TILE * 0.5);
    gfx.lineStyle(2, color, 0.85).strokeCircle(x, y, TILE * 0.5);
  }

  private drawVaultDoor(gfx: Phaser.GameObjects.Graphics, tx: number, ty: number, solved: boolean): void {
    const x = (tx + 0.5) * TILE;
    const y = (ty + 0.5) * TILE;
    const c = solved ? 0xc9b0ff : 0x3a4560; // violet when solved (the Reverberant's colour)
    gfx.fillStyle(c, solved ? 0.34 : 0.5).fillRect(x - TILE * 0.6, y - TILE * 0.6, TILE * 1.2, TILE * 1.2);
    gfx.lineStyle(2, solved ? 0xe6dcff : 0x93a8c9, 0.9).strokeRect(x - TILE * 0.6, y - TILE * 0.6, TILE * 1.2, TILE * 1.2);
  }

  /** solving the 3-pedestal puzzle summons the Reverberant (no altar/totem) */
  private async summonReverberant(): Promise<void> {
    const res = await this.backend.summonReverberant().catch(() => ({ ok: false as const }));
    // on ok, the guardianSummoned event drives startFight (the boss rises); the busy
    // latch stays until coverage drops, and the one-fight mutex blocks any re-summon.
    if (!res.ok) this.reverbSummonBusy = false; // a refused summon may retry
  }

  /** the Reverberant's defeat reward (server-guarded, idempotent): the epic helm +
   *  Reliquary on the first-ever clear, an Echo Sigil + resources once per week */
  private async claimReverbReward(): Promise<void> {
    this.reverbDefeated = true; // unlocks the memorial greeting
    const res = await this.backend.claimReverb(vaultWeek(Date.now())).catch(() => ({ ok: false as const }));
    if (!res.ok) return;
    if ('inventory' in res && res.inventory) {
      this.setInv(res.inventory);
    }
    if ('weekly' in res && res.weekly) bus.emit('toast', t.toast.reverbWeekly, 'good');
    if ('firstEver' in res && res.firstEver) {
      bus.emit('toast', t.toast.reverbEpicHelm, 'good');
      bus.emit('toast', t.toast.reliquaryEarned, 'good');
    }
  }

  /** E in the Hushdark: arm a recording at a pedestal, or (once you've defeated the
   *  Reverberant) leave a permanent greeting at the memorial. The puzzle itself is
   *  solved by COVERAGE (shades on the 3 pedestals), which summons the boss — no
   *  door to press. */
  private echoAction(): EAction | null {
    if (this.activeDistrict?.id !== 'the_hushdark' || this.fight) return null;
    const px = this.player.x / TILE;
    const py = this.player.y / TILE;
    const near = (p: { tx: number; ty: number }) => Math.hypot(px - (p.tx + 0.5), py - (p.ty + 0.5)) <= 1.4;
    // the memorial plinth: leave a permanent greeting once you've bested the Reverberant
    const mem = this.world.hushdarkMemorial;
    if (mem && near(mem)) {
      if (!this.reverbDefeated) return { swing: false, run: () => bus.emit('toast', t.toast.greetingLocked, 'info') };
      return { swing: false, run: () => this.armGreetingRecording() };
    }
    // a pedestal: arm a recording (the shade that solves the puzzle)
    if (!this.echoRecording) {
      for (const v of this.world.hushdarkVaults ?? []) {
        for (const ped of v.pedestals) {
          if (near(ped)) return { swing: false, run: () => this.armEchoRecording() };
        }
      }
    }
    return null;
  }

  /** destroy every shade sprite (district exit / scene shutdown) */
  private reapEchoViews(): void {
    for (const view of this.echoGhostViews.values()) {
      view.sprite.destroy();
      view.shadow.destroy();
      view.label?.destroy();
    }
    this.echoGhostViews.clear();
  }

  /** the whole Delve frame: dark ambiance, movement, host sim, render, combat, netcode */
  private updateDelve(time: number, delta: number): void {
    const dt = delta / 1000;
    const cam = this.cameras.main;
    if (this.delveBackdrop) this.delveBackdrop.setPosition(cam.midPoint.x, cam.midPoint.y).setSize(cam.displayWidth + 8, cam.displayHeight + 8);
    this.atmosphere.hideForDelve();
    this.torchGlow
      .setPosition(this.player.x, this.player.y - 8)
      .setAlpha(this.heldItem === 'hand_torch' ? 0.5 : 0.22)
      .setDepth(DELVE_DEPTH_FLOOR + 2);
    positionHeld(this.heldSprite, this.player.x, this.player.y, this.lastDir);
    this.heldSprite.setDepth(DELVE_DEPTH_ENTITY + this.player.y + 1);
    this.playerShadow.setPosition(this.player.x, this.player.y - 1).setDepth(DELVE_DEPTH_ENTITY + this.player.y - 1);

    const stunned = Date.now() < this.stunnedUntil;
    if (!stunned && this.stunMarker) {
      this.stunMarker.destroy();
      this.stunMarker = null;
    }
    if (this.stunMarker) this.stunMarker.setPosition(this.player.x, this.player.y - AVATAR_H - 6).setDepth(999_999);

    // movement (frozen while stunned, chatting, or Exhausted-out)
    if (!this.chatFocused && !stunned && !this.delveExhausted) {
      const left = this.keys.left.isDown || this.keys.a.isDown;
      const right = this.keys.right.isDown || this.keys.d.isDown;
      const up = this.keys.up.isDown || this.keys.w.isDown;
      const down = this.keys.down.isDown || this.keys.s.isDown;
      let vx = (right ? 1 : 0) - (left ? 1 : 0);
      let vy = (down ? 1 : 0) - (up ? 1 : 0);
      if (vx !== 0 && vy !== 0) {
        vx *= Math.SQRT1_2;
        vy *= Math.SQRT1_2;
      }
      const speed = PLAYER_SPEED * this.moveSpeedFactor();
      this.player.setVelocity(vx * speed, vy * speed);
      const moving = vx !== 0 || vy !== 0;
      if (moving) this.lastDir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : vy > 0 ? 'down' : 'up';
      this.applyAnim(this.player, this.lastDir, moving);
    } else {
      this.player.setVelocity(0, 0);
      this.applyAnim(this.player, this.lastDir, false);
    }
    this.player.setDepth(DELVE_DEPTH_ENTITY + this.player.y);

    if (this.isDelveHost) this.simulateDelve(delta);
    this.stepProjectiles(dt);
    this.renderDelve(time);
    if (!stunned && !this.delveExhausted) this.checkDelveHarm();

    for (const pv of this.delvePeers.values()) {
      pv.marker.setPosition(pv.x, pv.y).setDepth(DELVE_DEPTH_ENTITY + pv.y);
      pv.label.setPosition(pv.x, pv.y - 16).setDepth(DELVE_DEPTH_ENTITY + pv.y + 1);
    }

    // netcode: my interior position, and (host) mob snapshots — both rate-capped
    if (this.delveRunId && time - this.lastPosSent > 150) {
      this.lastPosSent = time;
      this.backend.sendDungeon({ t: 'pos', runId: this.delveRunId, name: this.me.name, x: this.player.x / TILE, y: (this.player.y - 4) / TILE });
    }
    if (this.isDelveHost && this.delveRunId && time - this.lastMobSnapAt > 150) {
      this.lastMobSnapAt = time;
      this.broadcastMobSnap();
    }

    // E / LMB: strike / leave (same cadence discipline + alt-fire as the World swing loop)
    if (!this.chatFocused && !stunned) {
      const ePressed = Phaser.Input.Keyboard.JustDown(this.keys.e);
      // B1: LMB is alt-fire for swing:true attacks here too; one-shots (leave,
      // descend) stay E-only via the `ePressed` guard below (chat already excluded)
      const lmbActive = this.lmbDown;
      if (ePressed || this.keys.e.isDown || lmbActive) {
        const now = Date.now();
        if (ePressed || now - this.lastSwingAt >= SWING_CADENCE_MS) {
          const action = this.resolveEAction();
          if (action?.swing) {
            const cad = action.cadenceMs ?? SWING_CADENCE_MS;
            if (now - this.lastSwingAt >= cad) {
              this.markSwing(now); // stamp + peer echo counter + pose/arc, fused
              action.run();
            }
          } else if (action && ePressed) {
            action.run();
          }
        }
      }
    }
  }

  /** host: advance every mob's reactive AI one frame and act on what they emit */
  private simulateDelve(delta: number): void {
    const S = this.stageDef();
    const targets = this.delveTargets();
    // mobs treat cover props as walls too — so a Husk rounds a pillar. S.tune is
    // the per-Depth hardening (ADR-0015) — undefined on the authored Stages.
    const ctx = { targets, isWall: (tx: number, ty: number) => S.isBlocked(tx, ty), dt: delta, rng: Math.random, tune: S.tune };
    for (const m of this.mobs.values()) {
      if (m.st === 'dead') continue;
      const ev = stepMob(m, ctx);
      this.applyMobEvent(m, ev);
    }
  }

  private applyMobEvent(m: MobState, ev: MobEvent): void {
    if (ev.sfx === 'roar') this.sfx('roar', 0.3);
    else if (ev.sfx === 'lunge') this.sfx('chop', 0.25);
    else if (ev.sfx === 'spit') this.sfx('blip', 0.3);
    if (ev.projectile) {
      const p = ev.projectile;
      this.projectiles.push({ id: `p${this.nextProjId++}`, x: p.x, y: p.y, vx: p.vx, vy: p.vy, r: p.r, life: 3000 });
    }
    // the Broodmother's birth (ADR-0016): the host turns the summon positions
    // into live Husk adds — the Stage's own chaser kind, never past the mob cap
    // (guests receive them through the ordinary authoritative snap)
    if (ev.summon) {
      const S = this.stageDef();
      const kind = S.shot === 'acid' ? 'grasp' : 'cinder';
      const alive = [...this.mobs.values()].filter((x) => x.st !== 'dead').length;
      let room = Math.max(0, DEPTH_MOB_CAP - alive);
      for (const s of ev.summon) {
        if (room <= 0) break;
        const tx = Math.floor(s.x);
        const ty = Math.floor(s.y);
        if (S.isBlocked(tx, ty)) continue;
        const id = `m${this.nextMobId++}`;
        this.mobs.set(id, createMob(id, { kind, x: s.x, y: s.y }, this.delveHeadcount, S.bossHpPerHead, S.hpMul));
        room--;
      }
    }
    void m;
  }

  private stepProjectiles(dt: number): void {
    const S = this.stageDef();
    this.projectiles = this.projectiles.filter((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 1000;
      // a Husk's shot dies on a wall OR a cover prop — pillars are real cover
      return p.life > 0 && !S.isBlocked(Math.floor(p.x), Math.floor(p.y));
    });
  }

  /** draw mobs (body, telegraph, HP bar) + projectiles from this.mobs / this.projectiles */
  private renderDelve(time: number): void {
    const S = this.stageDef();
    const seen = new Set<string>();
    for (const m of this.mobs.values()) {
      if (m.st === 'dead') continue;
      seen.add(m.id);
      const prof = profileOf(m.kind);
      const rpx = prof.radius * TILE;
      const fh = MOB_FRAME[m.kind].h;
      const barW = Math.max(rpx * 2, MOB_FRAME[m.kind].w * 0.8);
      let v = this.mobViews.get(m.id);
      if (!v) {
        const sprite = this.add.sprite(0, 0, MOB_TEX[m.kind], 0).setOrigin(0.5, 0.78);
        // ADR-0015: a generated Depth re-dresses the recycled sprites with its tint
        if (S.tint) {
          const kiter = m.kind === 'spit' || m.kind === 'ember';
          sprite.setTint(isBossKind(m.kind) ? S.tint.boss : kiter ? S.tint.kiter : S.tint.chaser);
        }
        const shadow = this.add.image(0, 0, 'shadow').setDisplaySize(rpx * 2.6, rpx * 1.4).setAlpha(0.45);
        const tele = this.add.graphics();
        const bar = this.add.rectangle(0, 0, barW, 3, 0x66ff88).setOrigin(0, 0.5).setVisible(false);
        v = { sprite, shadow, tele, bar };
        this.mobViews.set(m.id, v);
        this.delveObjects.push(sprite, shadow, tele, bar);
      }
      const px = m.x * TILE;
      const py = m.y * TILE;
      const d = DELVE_DEPTH_ENTITY + py;
      v.shadow.setPosition(px, py + rpx * 0.5).setDepth(d - 1);
      v.sprite.setPosition(px, py + rpx * 0.5).setDepth(d);
      v.sprite.setFlipX(Math.cos(m.face) < -0.15); // face the way it's heading
      // snap to the telegraph pose during a wind-up, else play the idle heave.
      // the Whirlwind keeps its TUCKED pose through the whole spin and shimmers
      // (fast flip) so the rotation reads even in pixel art (ADR-0016)
      const idleKey = `${MOB_TEX[m.kind]}-idle`;
      const spinning = m.st === 'strike' && prof.kit === 'whirl';
      if (m.st === 'windup' || m.st === 'aim' || spinning) {
        if (v.sprite.anims.isPlaying) v.sprite.anims.stop();
        v.sprite.setFrame(2);
        if (spinning) v.sprite.setFlipX(Math.floor(time / 90) % 2 === 0);
      } else if (v.sprite.anims.currentAnim?.key !== idleKey || !v.sprite.anims.isPlaying) {
        v.sprite.anims.play(idleKey, true);
      }
      // HP bar only once the mob has been hurt (keeps the room uncluttered)
      const hurt = m.hp < m.maxHp;
      v.bar
        .setVisible(hurt)
        .setPosition(px - barW / 2, py - fh * 0.55)
        .setDepth(d + 1)
        .setScale(Math.max(0, m.hp / m.maxHp), 1);
      // ground telegraph reinforces the sprite's reared pose
      v.tele.clear();
      v.tele.setDepth(DELVE_DEPTH_FLOOR + 3);
      if (m.st === 'windup' && m.erupt) {
        // the Forgeborn's ERUPTION wind-up (ADR-0011 §6): a huge pulsing radius
        // centred on the boss — a clear "sprint to the room's edge" warning
        const tr = (prof.eruptR ?? prof.strikeR) * TILE;
        const warn = 0.32 + 0.26 * Math.sin(time / 45);
        v.tele.fillStyle(0xff5a1e, warn * 0.45);
        v.tele.fillCircle(m.ax * TILE, m.ay * TILE, tr);
        v.tele.lineStyle(3, 0xffb060, Math.min(0.95, warn + 0.35));
        v.tele.strokeCircle(m.ax * TILE, m.ay * TILE, tr);
      } else if (m.st === 'strike' && m.erupt) {
        // the eruption goes off — a bright blast across the whole radius
        const tr = (prof.eruptR ?? prof.strikeR) * TILE;
        v.tele.fillStyle(0xff7a2a, 0.5);
        v.tele.fillCircle(m.ax * TILE, m.ay * TILE, tr);
        v.tele.lineStyle(3, 0xffe0a0, 0.85);
        v.tele.strokeCircle(m.ax * TILE, m.ay * TILE, tr);
      } else if (m.st === 'strike' && prof.kit === 'whirl') {
        // the Whirlwind's SPIN (ADR-0016): the danger zone rides the boss itself
        // for the whole spin — a live, moving circle you keep your distance from
        v.tele.fillStyle(0xff3322, 0.3);
        v.tele.fillCircle(px, py, prof.strikeR * TILE);
        v.tele.lineStyle(3, 0xff7a55, 0.8);
        v.tele.strokeCircle(px, py, prof.strikeR * TILE);
      } else if (m.st === 'windup') {
        const warn = 0.35 + 0.25 * Math.sin(time / 55);
        v.tele.lineStyle(3, 0xff3322, warn);
        v.tele.lineBetween(px, py, m.ax * TILE, m.ay * TILE);
        v.tele.fillStyle(0xff3322, warn * 0.5);
        v.tele.fillCircle(m.ax * TILE, m.ay * TILE, prof.strikeR * TILE);
      } else if (m.st === 'aim') {
        const warn = 0.35 + 0.25 * Math.sin(time / 55);
        v.tele.lineStyle(2, 0xffaa33, warn);
        v.tele.lineBetween(px, py, m.ax * TILE, m.ay * TILE);
      }
      // the Bulwark's guard ring (ADR-0016): lit while hits bounce — the moment
      // it vanishes, the slab is down and the boss is yours to hurt
      if (m.guard) {
        const gp = 0.45 + 0.2 * Math.sin(time / 140);
        v.tele.lineStyle(2, 0xffc36a, gp);
        v.tele.strokeCircle(px, py, (prof.radius + 0.35) * TILE);
      }
    }
    for (const [id, v] of this.mobViews) {
      if (seen.has(id)) continue;
      v.sprite.destroy();
      v.shadow.destroy();
      v.tele.destroy();
      v.bar.destroy();
      this.mobViews.delete(id);
    }
    // projectiles wear the live Stage's spat shot (ADR-0011/0015): an acid glob
    // in the stone Stages, a molten cinder in the molten ones — a flickering
    // pixel sprite over an additive glow, sized to the shot's radius. Radial
    // art, so guest snapshots (position only) render identically.
    const projKey = PROJ_TEX[S.shot];
    const projGlow = PROJ_GLOW[S.shot];
    const seenP = new Set<string>();
    for (const p of this.projectiles) {
      seenP.add(p.id);
      const px = p.x * TILE;
      const py = p.y * TILE;
      let v = this.projViews.get(p.id);
      if (!v) {
        const glow = this.add
          .image(0, 0, 'glow')
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(projGlow.color)
          .setAlpha(projGlow.alpha);
        const sprite = this.add.sprite(0, 0, projKey, 0).setOrigin(0.5, 0.5);
        sprite.anims.play(`${projKey}-fly`, true);
        v = { sprite, glow };
        this.projViews.set(p.id, v);
        this.delveObjects.push(sprite, glow);
      }
      // the 12px art fills the shot's diameter; the 64px glow is a soft halo ~2.4× it
      const diam = Math.max(6, p.r * TILE * 2);
      v.sprite.setPosition(px, py).setDepth(DELVE_DEPTH_PROJ).setScale(diam / 12);
      v.glow
        .setPosition(px, py)
        .setDepth(DELVE_DEPTH_PROJ - 1)
        .setScale((diam / 26) * (projGlow.scale / 0.65));
    }
    for (const [id, v] of this.projViews) {
      if (seenP.has(id)) continue;
      v.sprite.destroy();
      v.glow.destroy();
      this.projViews.delete(id);
    }
  }

  /** each client checks its OWN player against live danger — melee strike zones + projectiles */
  private checkDelveHarm(): void {
    const ptx = this.player.x / TILE;
    const pty = (this.player.y - 4) / TILE;
    for (const m of this.mobs.values()) {
      if (m.st !== 'strike') continue;
      const prof = profileOf(m.kind);
      // the Forgeborn's eruption is a big radius centred where it planted (m.ax,m.ay);
      // an ordinary melee strike is prof.strikeR at the mob's live position
      const erupt = !!m.erupt;
      const r = erupt ? prof.eruptR ?? prof.strikeR : prof.strikeR;
      const cx = erupt ? m.ax : m.x;
      const cy = erupt ? m.ay : m.y;
      if (Math.hypot(cx - ptx, cy - pty) <= r + 0.35) {
        this.delveKnockdown(cx, cy);
        return;
      }
    }
    for (const p of this.projectiles) {
      if (Math.hypot(p.x - ptx, p.y - pty) <= p.r + 0.35) {
        p.life = -1;
        this.delveKnockdown(p.x, p.y);
        return;
      }
    }
  }

  /** host → peers: the live mob roster + projectiles (dead mobs drop off the wire) */
  private broadcastMobSnap(): void {
    if (!this.delveRunId) return;
    const mobs: MobSnap[] = [];
    for (const m of this.mobs.values()) {
      if (m.st === 'dead') continue;
      mobs.push({ id: m.id, kind: m.kind, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp, st: m.st, ax: m.ax, ay: m.ay, phase: m.phase, erupt: m.erupt, guard: m.guard });
    }
    const projectiles: ProjSnap[] = this.projectiles.map((p) => ({ id: p.id, x: p.x, y: p.y }));
    this.backend.sendDungeon({ t: 'snap', runId: this.delveRunId, mobs, projectiles });
  }

  /** guest: replace the rendered mob/projectile set from the host's authoritative snapshot */
  private applyDelveSnap(msg: Extract<DungeonMsg, { t: 'snap' }>): void {
    const alive = new Set<string>();
    for (const s of msg.mobs) {
      alive.add(s.id);
      const kind = s.kind as MobKind;
      let m = this.mobs.get(s.id);
      if (!m) {
        m = { id: s.id, kind, x: s.x, y: s.y, hp: s.hp, maxHp: s.maxHp, st: s.st as MobState['st'], t: 0, face: 0, ax: s.ax, ay: s.ay, phase: s.phase, erupt: s.erupt, guard: s.guard };
        this.mobs.set(s.id, m);
      } else {
        m.x = s.x;
        m.y = s.y;
        m.hp = s.hp;
        m.maxHp = s.maxHp;
        m.st = s.st as MobState['st'];
        m.ax = s.ax;
        m.ay = s.ay;
        m.phase = s.phase;
        m.erupt = s.erupt;
        m.guard = s.guard;
      }
      m.face = Math.atan2(s.ay - s.y, s.ax - s.x);
    }
    for (const id of [...this.mobs.keys()]) {
      if (alive.has(id)) continue;
      this.mobs.delete(id);
      // J4 guest path: a mob missing from a live snap was FELLED — dead mobs
      // drop off the wire (broadcastMobSnap skips st==='dead') and the Delve
      // never culls for range — so a guest plays the same death beat the host
      // saw, frozen at the view's last snapshot spot, not a silent removal.
      this.delveDeathBeat(id);
    }
    this.projectiles = msg.projectiles.map((p) => ({ id: p.id, x: p.x, y: p.y, vx: 0, vy: 0, r: 0.8, life: 2000 }));
  }

  /** dispatch a peer-host-authority Delve message (ADR-0007) */
  private onDungeonMsg(msg: DungeonMsg): void {
    switch (msg.t) {
      case 'start':
        this.onDelveStart(msg);
        break;
      case 'snap':
        if (this.inDelve && !this.isDelveHost && msg.runId === this.delveRunId) this.applyDelveSnap(msg);
        break;
      case 'end':
        this.onDelveEnd(msg);
        break;
      case 'pos':
        this.onDelvePos(msg);
        break;
      case 'hit':
        if (this.inDelve && this.isDelveHost && msg.runId === this.delveRunId) this.applyDelveHit(msg.mobId, msg.tool as ToolId | undefined, msg.by);
        break;
      case 'down':
        this.onDelveDown(msg);
        break;
      case 'join':
        break; // the host learns positions via 'pos'; nothing to do on join itself
    }
  }

  private onDelveEnd(msg: Extract<DungeonMsg, { t: 'end' }>): void {
    const active = msg.runId === this.delveRunId && this.inDelve;
    const exhausted = msg.runId === this.delveExhaustedRun;
    if (!active && !exhausted) return;
    // a Stage boss fell on the host: claim THIS run's loot (the Depth Record
    // rides the claim) and open the next door, but do NOT tear down — the party
    // lingers to descend or leave (ADR-0011 §2, endless per ADR-0015). An
    // Exhausted-out client whose hits landed still collects + gets credited.
    if (msg.reason === 'stagecleared') {
      const eligible = active ? this.delveHitLanded : true;
      if (eligible) this.writeDepthRecordAs(msg.participants ?? [], msg.runId);
      if (msg.loot) this.grantStageLoot(msg.loot, eligible);
      if (active) this.openDeepDoor();
      this.delveExhaustedRun = null;
      return;
    }
    if (msg.reason === 'victory' && msg.loot) {
      // legacy wire compat (pre-ADR-0015 hosts): the old "Forgeborn ends it" end
      this.grantStageLoot(msg.loot, active ? this.delveHitLanded : true);
    } else if (active) {
      // host-leave / wipe — name the live Stage in the collapse toast (CONTEXT terms)
      const stage = this.delveStage;
      const collapse =
        msg.reason === 'hostleft'
          ? stage >= 3
            ? t.toast.depthHostLeftCollapse
            : stage === 2
            ? t.toast.deepHostLeftCollapse
            : t.toast.hostLeftCollapse
          : stage >= 3
          ? t.toast.depthPartyOverwhelmed
          : stage === 2
          ? t.toast.deepPartyOverwhelmed
          : t.toast.partyOverwhelmed;
      bus.emit('toast', collapse, 'bad');
    }
    this.delveExhaustedRun = null;
    if (active) this.leaveDelve();
  }

  /** guest/exhausted-side Depth Record write for a stagecleared broadcast: same
   *  rules as the host's (participation credit), keyed by the shared Descent id */
  private writeDepthRecordAs(roster: string[], runId: string): void {
    const record = { descentId: this.descentId || runId, depth: this.delveStage, roster };
    void this.backend.claimDelveLoot({}, record).then(() => this.refreshDepthRecords());
  }

  /** ADR-0015: the Grand Monument's interact — fetch fresh and open the board */
  private openRecordBoard(): void {
    this.sfx('blip', 0.4);
    void this.backend.getDepthRecords().then((r) => bus.emit('records-open', r));
  }

  /** re-read the World's Depth Records and refresh the Hall panel's teaser line */
  private refreshDepthRecords(): void {
    void this.backend.getDepthRecords().then((r) => bus.emit('depth-record', r.descents[0] ?? null));
  }

  private onDelvePos(msg: Extract<DungeonMsg, { t: 'pos' }>): void {
    if (!this.inDelve || msg.runId !== this.delveRunId || msg.name === this.me.name) return;
    const px = msg.x * TILE;
    const py = msg.y * TILE + 4;
    let pv = this.delvePeers.get(msg.name);
    if (!pv) {
      const marker = this.add.circle(px, py, 6, 0x8fd0ff).setStrokeStyle(2, 0x0a1a2a);
      const label = this.add
        .text(px, py - 16, msg.name, { fontSize: '8px', color: '#dff0ff', stroke: '#000', strokeThickness: 3 })
        .setOrigin(0.5)
        .setResolution(4);
      pv = { marker, label, x: px, y: py };
      this.delvePeers.set(msg.name, pv);
      this.delveObjects.push(marker, label);
    }
    pv.x = px;
    pv.y = py;
  }

  private onDelveDown(msg: Extract<DungeonMsg, { t: 'down' }>): void {
    if (!this.isDelveHost || msg.runId !== this.delveRunId) return;
    if (!msg.out) return;
    const pv = this.delvePeers.get(msg.name);
    if (pv) {
      pv.marker.destroy();
      pv.label.destroy();
      this.delvePeers.delete(msg.name); // out of the run — no longer an AI target
    }
  }

  // ============================================================ ADR-0012: open-world Wildlife
  /**
   * Deterministic creature-host election from the shared presence roster (zero
   * negotiation): the lowest-sorting online real-Player name is the host; every
   * client computes the same. On a host change I (as a guest) drop any locally
   * simulated creatures — the host's snapshots drive me now. In single-player the
   * lone MockBackend Player is trivially the host. Re-run on every presence sync.
   */
  private recomputeWildHost(): void {
    const roster = this.backend.creatureRoster();
    const host = (roster.length ? [...roster].sort() : [this.me.name])[0];
    const wasHost = this.isWildHost;
    const hostChanged = host !== this.wildHostName;
    this.wildHostName = host;
    this.isWildHost = host === this.me.name;
    // stepping down from host, or the authority moved to someone else: my local
    // creatures are stale — clear them and rebuild from the new host's snapshots
    if (!this.isWildHost && (wasHost || hostChanged)) this.clearWildMobs();
    // PROMOTED to host: the inherited snapshot mobs may carry rage=true, but the
    // rage LEDGER (shooter + timer) was host-local and died with the old host —
    // without an entry the rage branch never runs and calmWild could never clear
    // the flag, leaving a permanently red, rage-telegraphing creature. Rage ends
    // on handover (a rare 12s window) rather than sticking forever.
    if (this.isWildHost && !wasHost) {
      for (const m of this.wildMobs.values()) m.rage = undefined;
    }
  }

  private clearWildMobs(): void {
    for (const v of this.wildViews.values()) {
      v.sprite.destroy();
      v.shadow.destroy();
      v.tele.destroy();
      v.bar.destroy();
    }
    this.wildViews.clear();
    this.wildMobs.clear();
    this.wildWander.clear();
    this.wildRage.clear();
    // J4: reap any death beat mid-animation — its objects are orphans (out of
    // wildViews) and a host handover must not strand them
    this.clearDeathFx(this.wildDeathFx);
  }

  /** real online Player positions in TILE units (self + rendered peers; not sim bots) */
  private wildPlayerPositions(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (const name of this.backend.creatureRoster()) {
      if (name === this.me.name) out.push({ x: this.player.x / TILE, y: (this.player.y - 4) / TILE });
      else {
        const r = this.remotes.get(name);
        if (r) out.push({ x: r.sprite.x / TILE, y: (r.sprite.y - 4) / TILE });
      }
    }
    if (!out.length) out.push({ x: this.player.x / TILE, y: (this.player.y - 4) / TILE });
    return out;
  }

  private wildPlayerAnchors(): { tx: number; ty: number }[] {
    return this.wildPlayerPositions().map((p) => ({ tx: Math.floor(p.x), ty: Math.floor(p.y) }));
  }

  /** ONE online Player's live position in TILE units (self or a rendered peer) —
   *  the enraged creature's quarry lookup */
  private wildPlayerPos(name: string): { x: number; y: number } | null {
    if (name === this.me.name) return { x: this.player.x / TILE, y: (this.player.y - 4) / TILE };
    const r = this.remotes.get(name);
    return r ? { x: r.sprite.x / TILE, y: (r.sprite.y - 4) / TILE } : null;
  }

  /** can a creature stand on this World tile? (open ground — not water/cliff, in bounds) */
  private wildWalkable(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    return this.world.blocked[ty * MAP_W + tx] === 0;
  }

  /**
   * Is (tx,ty) danger-flagged wilds (predator-eligible)? The Village is ALWAYS a
   * safe haven, and the un-zoned Deep Jungle + every core Zone are safe too —
   * predators only ever spawn/roam on a tile whose Zone carries `dangerous`.
   */
  private dangerAt(tx: number, ty: number): boolean {
    if (inVillageZone(this.village, tx, ty)) return false; // the Village never has teeth
    for (const z of this.world.zones) {
      if (tx >= z.x && tx < z.x + z.w && ty >= z.y && ty < z.y + z.h) return !!z.dangerous;
    }
    return false; // Deep Jungle / unzoned = safe core
  }

  /** the whole Wildlife frame: host sim + broadcast, then render + own-harm check (every client) */
  private updateWild(time: number, delta: number): void {
    if (this.isWildHost) {
      if (time - this.lastWildSpawnAt > WILD_SPAWN_TICK_MS) {
        this.lastWildSpawnAt = time;
        this.maintainWildPool();
      }
      this.stepWild(delta);
      if (time - this.lastWildSnapAt > WILD_BROADCAST_MS) {
        this.lastWildSnapAt = time;
        this.broadcastWild();
      }
    }
    this.renderWild(time, delta);
    if (Date.now() >= this.stunnedUntil) this.checkWildHarm();
  }

  /**
   * Host only: keep an ephemeral pool roaming around each online Player. Cull
   * creatures that drift far from everyone, then top up toward the density — more
   * (and predator-leaning) at night in danger Zones. Peaceful spawn anywhere
   * walkable; predators ONLY on danger tiles (planWildSpawn enforces this).
   */
  private maintainWildPool(): void {
    const anchors = this.wildPlayerAnchors();
    if (!anchors.length) return;
    const night = this.atmosphere.nightness() > CREATURE_NIGHT_THRESHOLD;
    for (const [id, m] of this.wildMobs) {
      let near = false;
      for (const a of anchors) {
        if (Math.hypot(m.x - a.tx, m.y - a.ty) <= CREATURE_DESPAWN_TILES) {
          near = true;
          break;
        }
      }
      if (!near) {
        this.wildMobs.delete(id);
        this.wildWander.delete(id);
        this.wildRage.delete(id);
      }
    }
    const predatorChance = Math.min(0.9, CREATURE_PREDATOR_CHANCE * (night ? CREATURE_NIGHT_MULT : 1));
    for (const a of anchors) {
      const boost = night && this.dangerAt(a.tx, a.ty) ? CREATURE_NIGHT_MULT : 1;
      const target = Math.round(CREATURE_DENSITY * boost);
      let count = 0;
      for (const m of this.wildMobs.values()) {
        if (Math.hypot(m.x - a.tx, m.y - a.ty) <= CREATURE_SPAWN_MAX_TILES + 6) count++;
      }
      // fill a few per tick so life fades in briskly without a pop-in wall
      for (let i = 0; i < 3 && count < target; i++) {
        const spawn = planWildSpawn(a, {
          rng: Math.random,
          minR: CREATURE_SPAWN_MIN_TILES,
          maxR: CREATURE_SPAWN_MAX_TILES,
          isWalkable: (tx, ty) => this.wildWalkable(tx, ty),
          dangerAt: (tx, ty) => this.dangerAt(tx, ty),
          predatorChance,
        });
        if (!spawn) break;
        const id = `w${this.nextWildId++}`;
        this.wildMobs.set(id, createMob(id, { kind: spawn.kind, x: spawn.x, y: spawn.y }, 1));
        count++;
      }
    }
  }

  /** host: advance every creature one frame through the SHARED engine (stepMob) */
  private stepWild(delta: number): void {
    const allTargets = this.wildPlayerPositions(); // peaceful flee from anyone nearby
    // predators only "see" Players standing in the wilds — step onto the safe core
    // and they lose the scent (de-aggro); they also can't physically follow (below)
    const dangerTargets = allTargets.filter((p) => this.dangerAt(Math.floor(p.x), Math.floor(p.y)));
    const now = Date.now();
    for (const m of this.wildMobs.values()) {
      if (m.st === 'dead') {
        this.wildMobs.delete(m.id);
        continue;
      }
      // ENRAGED: the creature hunts ITS SHOOTER with the rage profile — revenge
      // follows onto safe ground (unlike a predator's usual leash), but the
      // Village never has teeth: a shooter who reaches it calls the revenge off,
      // and a creature outside never steps in (one already inside may move out —
      // walling EVERY tile would freeze it into a statue). Timer dry, shooter
      // gone or shooter in sanctuary → it calms down.
      const rage = this.wildRage.get(m.id);
      if (rage) {
        const quarry = now < rage.until ? this.wildPlayerPos(rage.by) : null;
        const quarrySafe = !quarry || inVillageZone(this.village, Math.floor(quarry.x), Math.floor(quarry.y));
        if (quarry && !quarrySafe) {
          const mobInVillage = inVillageZone(this.village, Math.floor(m.x), Math.floor(m.y));
          const ev = stepMob(m, {
            targets: [quarry],
            isWall: (tx, ty) => !this.wildWalkable(tx, ty) || (!mobInVillage && inVillageZone(this.village, tx, ty)),
            dt: delta,
            rng: Math.random,
            profile: RAGE_PROFILES[m.kind as WildKind],
          });
          if (ev.sfx === 'lunge') this.sfx('chop', 0.2);
          continue;
        }
        this.calmWild(m);
        if (!this.wildMobs.has(m.id)) continue; // a stranded predator despawned
      }
      const predator = isWildKind(m.kind) && isPredator(m.kind as WildKind);
      if (predator) {
        const ev = stepMob(m, {
          targets: dangerTargets,
          // safe tiles are walls to a predator → it NEVER crosses into the core
          isWall: (tx, ty) => !this.wildWalkable(tx, ty) || !this.dangerAt(tx, ty),
          dt: delta,
          rng: Math.random,
        });
        if (ev.sfx === 'lunge') this.sfx('chop', 0.2);
      } else {
        const before = { x: m.x, y: m.y };
        stepMob(m, {
          targets: allTargets,
          isWall: (tx, ty) => !this.wildWalkable(tx, ty),
          dt: delta,
          rng: Math.random,
        });
        // idle (no one near) → a gentle host-side roam so the World reads alive
        if (m.x === before.x && m.y === before.y) this.wanderPeaceful(m, delta);
      }
    }
  }

  /** host orchestration (NOT engine AI): amble an idle peaceful creature along a slow random walk */
  private wanderPeaceful(m: MobState, delta: number): void {
    const now = Date.now();
    let w = this.wildWander.get(m.id);
    if (!w || now >= w.until) {
      w = { ang: Math.random() * Math.PI * 2, until: now + 1500 + Math.random() * 2500 };
      this.wildWander.set(m.id, w);
    }
    const P = profileOf(m.kind);
    const s = (P.speed * 0.4 * delta) / 1000; // an amble, well under a flee
    const nx = m.x + Math.cos(w.ang) * s;
    const ny = m.y + Math.sin(w.ang) * s;
    if (this.wildWalkable(Math.floor(nx + Math.sign(Math.cos(w.ang)) * P.radius), Math.floor(m.y))) m.x = nx;
    else w.until = 0;
    if (this.wildWalkable(Math.floor(m.x), Math.floor(ny + Math.sign(Math.sin(w.ang)) * P.radius))) m.y = ny;
    else w.until = 0;
    m.face = w.ang;
  }

  /** host → all: ONE batched creature snapshot per tick (already near-Player culled) */
  private broadcastWild(): void {
    const mobs: MobSnap[] = [];
    for (const m of this.wildMobs.values()) {
      if (m.st === 'dead') continue;
      mobs.push({
        id: m.id,
        kind: m.kind,
        x: +m.x.toFixed(2),
        y: +m.y.toFixed(2),
        hp: m.hp,
        maxHp: m.maxHp,
        st: m.st,
        ax: +m.ax.toFixed(2),
        ay: +m.ay.toFixed(2),
        phase: 0,
        rage: m.rage || undefined,
      });
    }
    this.backend.sendCreatures({ t: 'sync', host: this.me.name, mobs });
  }

  /** guest: replace the rendered creature set from the host's authoritative snapshot */
  private applyWildSnap(msg: Extract<CreatureMsg, { t: 'sync' }>): void {
    const alive = new Set<string>();
    for (const s of msg.mobs) {
      alive.add(s.id);
      let m = this.wildMobs.get(s.id);
      if (!m) {
        m = { id: s.id, kind: s.kind as MobKind, x: s.x, y: s.y, hp: s.hp, maxHp: s.maxHp, st: s.st as MobState['st'], t: 0, face: 0, ax: s.ax, ay: s.ay, phase: 0, rage: s.rage };
        this.wildMobs.set(s.id, m);
      } else {
        m.x = s.x;
        m.y = s.y;
        m.hp = s.hp;
        m.maxHp = s.maxHp;
        m.st = s.st as MobState['st'];
        m.ax = s.ax;
        m.ay = s.ay;
        m.rage = s.rage;
      }
    }
    for (const [id, m] of [...this.wildMobs]) {
      if (alive.has(id)) continue;
      this.wildMobs.delete(id);
      // J4: DEATH vs DESPAWN on a guest. A creature gone from the host's snap
      // was either range-CULLED (maintainWildPool — must stay a silent, instant
      // vanish) or FELLED by the host itself (kills by other Players arrive as
      // an explicit 'felled' broadcast; the host's own kills get no message,
      // and pure presentation may not add wire traffic — ADR-0005). Tell them
      // apart by wounds AND proximity: the cull only removes creatures farther
      // than CREATURE_DESPAWN_TILES from EVERY Player, so a vanished creature
      // still near ME cannot have been culled — hurt + near ⇒ genuinely felled.
      // (Wounds alone are not enough: at min zoom the viewport spans ~40 tiles,
      // so a wounded fleeing creature can be culled ON-SCREEN; the near-gate
      // keeps that a silent vanish. The -2 slop absorbs the host's lerped view
      // of my position. A real host kill farther out stays a silent miss —
      // rare and barely readable at that distance, never a wrong poof.)
      const nearMe = Math.hypot(m.x - this.player.x / TILE, m.y - this.player.y / TILE) <= CREATURE_DESPAWN_TILES - 2;
      if (m.hp < m.maxHp && nearMe) this.wildDeathBeat(id);
    }
  }

  /** dispatch an open-world Wildlife message (ADR-0012) */
  private onCreatureMsg(msg: CreatureMsg): void {
    switch (msg.t) {
      case 'sync':
        if (!this.isWildHost && msg.host === this.wildHostName) this.applyWildSnap(msg);
        break;
      case 'hit':
        if (this.isWildHost) this.applyWildHit(msg.id, msg.tool as ToolId | undefined, msg.by);
        break;
      case 'forage':
        if (this.isWildHost) {
          this.wildMobs.delete(msg.id);
          this.wildWander.delete(msg.id);
          this.wildRage.delete(msg.id);
        }
        break;
      case 'felled':
        // J4: every guest sees the kill, not just the hunter — the host has
        // already removed the creature authoritatively and the next 'sync'
        // would only silent-drop it, so detach the view here and play the
        // death beat at the spot it fell. (On the adjudicating host the
        // creature is already gone — delete() is false, no second beat.)
        if (this.wildMobs.delete(msg.id)) {
          this.wildWander.delete(msg.id);
          this.wildDeathBeat(msg.id);
        }
        if (msg.by === this.me.name) this.grantWildLoot(msg.loot, 'hunted');
        break;
    }
  }

  /** draw creatures (body, telegraph, HP bar) at World depth; guests interpolate snapshots */
  private renderWild(time: number, delta: number): void {
    const seen = new Set<string>();
    const k = Math.min(1, (delta / 1000) * 14);
    for (const m of this.wildMobs.values()) {
      if (m.st === 'dead') continue;
      seen.add(m.id);
      const prof = profileOf(m.kind);
      const rpx = prof.radius * TILE;
      const barW = Math.max(rpx * 2, 16);
      let v = this.wildViews.get(m.id);
      if (!v) {
        const sprite = this.add.sprite(m.x * TILE, m.y * TILE, MOB_TEX[m.kind], 0).setOrigin(0.5, 0.85);
        const shadow = this.add.image(0, 0, 'shadow').setDisplaySize(rpx * 2.6, rpx * 1.3).setAlpha(0.4);
        const tele = this.add.graphics();
        const bar = this.add.rectangle(0, 0, barW, 3, 0x66ff88).setOrigin(0, 0.5).setVisible(false);
        v = { sprite, shadow, tele, bar };
        this.wildViews.set(m.id, v);
      }
      const prevX = v.sprite.x;
      const tx = m.x * TILE;
      const ty = m.y * TILE;
      v.sprite.x += (tx - v.sprite.x) * k; // lerp smooths guest snapshots; host ~exact
      v.sprite.y += (ty - v.sprite.y) * k;
      const px = v.sprite.x;
      const py = v.sprite.y;
      v.sprite.setDepth(py);
      if (Math.abs(px - prevX) > 0.05) v.sprite.setFlipX(px < prevX); // face travel direction
      // enraged: the whole body flushes red until the revenge timer runs dry
      if (m.rage) v.sprite.setTint(0xff7a66);
      else v.sprite.clearTint();
      const idleKey = `${MOB_TEX[m.kind]}-idle`;
      if (m.st === 'windup' || m.st === 'aim') {
        if (v.sprite.anims.isPlaying) v.sprite.anims.stop();
        v.sprite.setFrame(2);
      } else if (v.sprite.anims.currentAnim?.key !== idleKey || !v.sprite.anims.isPlaying) {
        v.sprite.anims.play(idleKey, true);
      }
      v.shadow.setPosition(px, py + rpx * 0.4).setDepth(2);
      const hurt = m.hp < m.maxHp;
      v.bar.setVisible(hurt).setPosition(px - barW / 2, py - rpx * 2 - 2).setDepth(py + 1).setScale(Math.max(0, m.hp / m.maxHp), 1);
      v.tele.clear();
      v.tele.setDepth(3); // a ground-level warning decal
      if (m.st === 'windup') {
        const warn = 0.35 + 0.25 * Math.sin(time / 55);
        // an enraged creature telegraphs the rage profile's strike zone
        const strikeR = (m.rage && isWildKind(m.kind) ? RAGE_PROFILES[m.kind as WildKind] : prof).strikeR;
        v.tele.lineStyle(3, 0xff3322, warn);
        v.tele.lineBetween(px, py, m.ax * TILE, m.ay * TILE);
        v.tele.fillStyle(0xff3322, warn * 0.5);
        v.tele.fillCircle(m.ax * TILE, m.ay * TILE, strikeR * TILE);
      }
    }
    for (const [id, v] of this.wildViews) {
      if (seen.has(id)) continue;
      v.sprite.destroy();
      v.shadow.destroy();
      v.tele.destroy();
      v.bar.destroy();
      this.wildViews.delete(id);
    }
  }

  /** each client checks its OWN player against live creature strike zones
   *  (predators — and since the enrage batch, any ENRAGED creature — strike) */
  private checkWildHarm(): void {
    const ptx = this.player.x / TILE;
    const pty = (this.player.y - 4) / TILE;
    for (const m of this.wildMobs.values()) {
      if (m.st !== 'strike') continue;
      // an enraged creature strikes with the rage profile's zone (a peaceful
      // kind's base strikeR is 0 — its gore would otherwise be a phantom)
      const prof = m.rage && isWildKind(m.kind) ? RAGE_PROFILES[m.kind as WildKind] : profileOf(m.kind);
      if (Math.hypot(m.x - ptx, m.y - pty) <= prof.strikeR + 0.35) {
        this.wildKnockdown(m.x, m.y);
        return;
      }
    }
  }

  /** a predator caught me: knock down (3 s stun + shove), count toward rolling-window Exhaustion */
  private wildKnockdown(srcX: number, srcY: number): void {
    if (Date.now() < this.stunnedUntil) return;
    this.beginKnockdown();
    this.sfx('chop', 0.4);
    this.cameras.main.shake(160, 0.004);
    const ang = Phaser.Math.Angle.Between(srcX * TILE, srcY * TILE, this.player.x, this.player.y);
    this.tweens.add({
      targets: this.player,
      x: this.player.x + Math.cos(ang) * TILE * 1.6,
      y: this.player.y + Math.sin(ang) * TILE * 1.6,
      duration: 200,
      ease: 'quad.out',
    });
    const now = Date.now();
    this.wildKnockdownTimes = this.wildKnockdownTimes.filter((tms) => now - tms < WILD_EXHAUST_WINDOW_MS);
    this.wildKnockdownTimes.push(now);
    if (this.wildKnockdownTimes.length >= WILD_EXHAUSTION_KNOCKDOWNS) {
      this.wildKnockdownTimes = [];
      this.wildExhaust();
    } else {
      bus.emit('toast', t.toast.knockedInWild(this.wildKnockdownTimes.length, WILD_EXHAUSTION_KNOCKDOWNS), 'bad');
    }
  }

  /** Exhaustion in the wilds → wake at the Village Hall/spawn, inventory FULLY intact (only position + time lost) */
  private wildExhaust(): void {
    const wake = this.wildWakePoint();
    bus.emit('toast', wake.atVillage ? t.toast.wildExhaustionVillage : t.toast.wildExhaustionSpawn, 'bad');
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.time.delayedCall(450, () => {
      this.player.setPosition((wake.tx + 0.5) * TILE, (wake.ty + 0.5) * TILE);
      this.stunnedUntil = 0;
      this.stunMarker?.destroy();
      this.stunMarker = null;
      this.cameras.main.fadeIn(500, 0, 0, 0);
    });
  }

  /** where Exhaustion wakes me: the Village Hall, else World spawn */
  private wildWakePoint(): { tx: number; ty: number; atVillage: boolean } {
    const v = this.villageWakeTile();
    if (v) return { ...v, atVillage: true };
    return { tx: this.world.spawn.tx, ty: this.world.spawn.ty, atVillage: false };
  }

  /** in the World, E on the nearest creature in reach: hunt anything hostile —
   *  a predator or an ENRAGED survivor (swing) — or forage a calm peaceful (catch) */
  private wildlifeAction(): EAction | null {
    const bow = this.isBow();
    const ptx = this.player.x / TILE;
    const pty = (this.player.y - 4) / TILE;
    let best: MobState | null = null;
    let bd = Infinity;
    for (const m of this.wildMobs.values()) {
      if (m.st === 'dead') continue;
      // the Bow hunts hostiles from range; foraging is ALWAYS an arm's-length
      // catch (the old 6-tile bow forage was a latent oddity)
      const hostile = m.rage || (isWildKind(m.kind) && isPredator(m.kind as WildKind));
      const allowed = hostile && bow ? 6 : 1.9;
      const d = Math.hypot(m.x - ptx, m.y - pty) - profileOf(m.kind).radius;
      if (d < allowed && d < bd) {
        bd = d;
        best = m;
      }
    }
    if (!best) return null;
    const target = best;
    // an enraged creature — even a peaceful kind — is a FIGHT, not a catch: the
    // forage verb would delete the charging animal for free loot and, being
    // swing:false, would also swallow the LMB while it stands adjacent
    if (target.rage || (isWildKind(target.kind) && isPredator(target.kind as WildKind))) {
      // hunt: a repeatable weapon swing (the Bow fires mouse-aimed; melee must close)
      return { swing: true, cadenceMs: this.atkCadence(weaponCombat(this.heldTool()).attackMs), run: () => (bow ? this.fireBow() : this.wildSwing(target)) };
    }
    // forage: a one-shot catch (bare hands fine — it is a moving Node, not a fight)
    return { swing: false, run: () => this.forageWild(target) };
  }

  private wildSwing(m: MobState): void {
    const tool = this.heldTool();
    this.sfx('chop', 0.5);
    if (this.isWildHost) this.applyWildHit(m.id, tool, this.me.name);
    else this.backend.sendCreatures({ t: 'hit', id: m.id, by: this.me.name, tool });
  }

  /** host: adjudicate a player→predator hit — reuse the ADR-0006 weapon roll, apply, float */
  private applyWildHit(id: string, tool: ToolId | undefined, by: string): void {
    const m = this.wildMobs.get(id);
    if (!m || m.st === 'dead') return;
    const roll = applyMobHit(m, tool, Math.random, villageBuff(this.village.tier).critChance, this.armorBandOf(by));
    const prof = profileOf(m.kind);
    const fx = m.x * TILE + Phaser.Math.Between(-6, 6);
    const fy = m.y * TILE - prof.radius * TILE - 8;
    const shown = roll.damage * GUARDIAN_DISPLAY_SCALE;
    if (roll.crit) this.floatText(fx, fy, `${shown}!`, '#ffd166', 13);
    else this.floatText(fx, fy, `${shown}`, '#ff9a66', 10);
    if (roll.dead) this.onWildFelled(m, by);
    else this.enrageWild(m, by);
  }

  /** host: a surviving hit ENRAGES the creature — it drops flight, marks its
   *  attacker and charges (stepWild swaps in the rage profile while the timer
   *  runs; the flag rides the snapshot so every client sees it turn red) */
  private enrageWild(m: MobState, by: string): void {
    this.wildRage.set(m.id, { by, until: Date.now() + WILD_RAGE_MS });
    if (!m.rage) {
      m.rage = true;
      this.floatText(m.x * TILE, m.y * TILE - profileOf(m.kind).radius * TILE - 14, '!', '#ff5544', 13);
    }
  }

  /** host: rage over (timer dry / shooter gone) — peaceful kinds return to
   *  flight; a predator stranded off danger ground despawns (its normal brain
   *  treats safe tiles as walls — it would only stand there as a statue) */
  private calmWild(m: MobState): void {
    this.wildRage.delete(m.id);
    m.rage = undefined;
    const predator = isWildKind(m.kind) && isPredator(m.kind as WildKind);
    m.st = predator ? 'chase' : 'kite';
    m.t = 0;
    if (predator && !this.dangerAt(Math.floor(m.x), Math.floor(m.y))) {
      // it slinks off, it is not slain: guests read a wounded creature vanishing
      // NEAR them as a kill (applyWildSnap's death-vs-cull heuristic) and would
      // play a phantom death beat. Heal it, let one broadcast carry full HP so
      // every client reads the removal as a silent despawn, THEN delete.
      m.hp = m.maxHp;
      this.time.delayedCall(WILD_BROADCAST_MS * 2 + 50, () => {
        if (!this.isWildHost || this.wildRage.has(m.id)) return; // re-enraged/handover
        this.wildMobs.delete(m.id);
        this.wildWander.delete(m.id);
      });
    }
  }

  /** host: a predator fell — the hunter gets the hide/meat/trophy loot; the creature drops off the wire */
  private onWildFelled(m: MobState, by: string): void {
    this.sfx('harvest', 0.5);
    const loot = rollWildLoot(m.kind as WildKind, Math.random);
    // J4: detach + flash-squash-poof BEFORE the state vanishes — renderWild's
    // sweep would otherwise destroy the view this same frame (a despawn blink)
    this.wildDeathBeat(m.id);
    this.wildMobs.delete(m.id);
    this.wildWander.delete(m.id);
    this.wildRage.delete(m.id);
    if (by === this.me.name) this.grantWildLoot(loot, 'hunted');
    else this.backend.sendCreatures({ t: 'felled', id: m.id, by, loot });
  }

  /** forage a peaceful creature (catch): the catcher claims its loot, the host removes it */
  private forageWild(m: MobState): void {
    const loot = rollWildLoot(m.kind as WildKind, Math.random);
    this.sfx('harvest', 0.6);
    this.floatText(m.x * TILE, m.y * TILE - 10, '✦', '#dfffd6', 12);
    if (this.isWildHost) {
      this.wildMobs.delete(m.id);
      this.wildWander.delete(m.id);
      this.wildRage.delete(m.id);
    } else {
      this.wildMobs.delete(m.id); // optimistic; the host removes it authoritatively
      this.backend.sendCreatures({ t: 'forage', id: m.id, by: this.me.name });
    }
    this.grantWildLoot(loot, 'foraged');
  }

  /** grant Wildlife loot into my own inventory + persist (reuses the generic claim path — no new RPC) */
  private grantWildLoot(loot: Partial<Record<ResourceId, number>>, kind: 'foraged' | 'hunted'): void {
    const parts = Object.entries(loot).filter(([, n]) => (n as number) > 0);
    if (!parts.length) return;
    void this.backend.claimDelveLoot(loot as Inventory).then((res) => {
      this.setInv(res.inventory);
      const text = parts.map(([it, n]) => `+${n} ${ITEMS[it as ItemId]?.name ?? it}`).join('  ');
      bus.emit('toast', kind === 'foraged' ? t.toast.foraged(text) : t.toast.hunted(text), 'good');
    });
  }

  /**
   * The per-frame ORDER (ADR-0018 / plan §8) — preserved exactly from the
   * pre-refactor file; each numbered step migrates into a system without
   * moving in the sequence:
   *   1. pendingDeepEntry (?deep dev drop-in)
   *   2. [delve mode: updateDelve, then EARLY RETURN — no overworld step runs]
   *   3. sawmill blades/puffs
   *   4. atmosphere: night/dusk overlays, veils, echo-ambience (Hushdark), verdant
   *   5. torch/held/shadow follow + elevation depth
   *   6. waterfall audio proximity lerp
   *   7. remote-player interpolation
   *   8. wildlife (host sim + render + own-harm)
   *   9. fight block (waves, fury, melee ring, guardian pose, eye)
   *  10. stun marker upkeep
   *  11. fishing bite/timeout
   *  12. buff expiry
   *  13. [chat focus / stunned: halt movement + return]
   *  14. movement + animation + depth
   *  15. throttled sendPosition
   *  16. placement ghost
   *  17. X dismantle
   *  18. ESC/ENTER place-mode keys
   *  19. E/LMB action dispatch (resolveEAction + cadence gates)
   * Systems dispatch through `this.systems` in exactly this order as they are
   * extracted; until then the inline blocks below remain authoritative.
   */
  update(time: number, delta: number): void {
    if (!this.player) return;
    const dt = delta / 1000;
    // ADR-0018 dispatch: each extracted system's update() is called EXPLICITLY
    // at its numbered position in the sequence above (never a flat loop — the
    // delve early-return and the chat/stun halt live INSIDE the sequence).
    // `this.systems` carries the lifecycle (create/destroy) in the same order.

    // ?deep dev flag: drop straight into the Deep on the first frame (once)
    if (this.pendingDeepEntry) {
      this.pendingDeepEntry = false;
      this.enterDeepDirect();
      return;
    }

    // the Delve is a self-contained mode: its own dark ambiance, movement,
    // host mob sim, combat and camera — none of the World systems below run
    if (this.inDelve) {
      this.updateDelve(time, delta);
      return;
    }

    // v3 (#3): spin the blade + puff sawdust on any Sawmill currently milling
    this.updateSawmills(time, dt);

    // atmosphere (§8 step 4): overlays, veils (+ Hushdark echo-ambience), glow
    // pool, fireflies, leaves — AtmosphereSystem.update (ADR-0018)
    this.atmosphere.update(time, delta);
    const night = this.atmosphere.nightness();
    // v4: light follows only a held Hand Torch (warm orange, dim like a flame)
    this.torchGlow
      .setPosition(this.player.x, this.player.y - 8)
      .setAlpha(this.heldItem === 'hand_torch' ? 0.1 + night * 0.35 : 0);
    positionHeld(this.heldSprite, this.player.x, this.player.y, this.lastDir);
    // keep the in-hand item with the Player when they climb a plateau (ADR-0009)
    const heldBump = this.atmosphere.elevationBonus(this.player.x, this.player.y);
    if (heldBump) this.heldSprite.setDepth(this.heldSprite.depth + heldBump);
    this.playerShadow.setPosition(this.player.x, this.player.y - 1);

    // waterfall proximity bed (§8 step 6) — AtmosphereSystem.updateAudio
    this.atmosphere.updateAudio(dt);

    // remote interpolation
    for (const r of this.remotes.values()) {
      const k = Math.min(1, dt * 12);
      r.sprite.x += (r.targetX - r.sprite.x) * k;
      r.sprite.y += (r.targetY - r.sprite.y) * k;
      // elevation depth bump: a peer up on a plateau sorts above the base (ADR-0009)
      const rBump = this.atmosphere.elevationBonus(r.sprite.x, r.sprite.y);
      r.sprite.setDepth(r.sprite.y + rBump);
      r.shadow.setPosition(r.sprite.x, r.sprite.y - 1);
      r.label.setPosition(r.sprite.x, r.sprite.y - AVATAR_H - 2);
      r.label.setDepth(r.sprite.y + 1 + rBump);
      positionHeld(r.heldSprite, r.sprite.x, r.sprite.y, r.dir);
      if (rBump) r.heldSprite.setDepth(r.heldSprite.depth + rBump);
      r.torchGlow
        .setPosition(r.sprite.x, r.sprite.y - 8)
        .setAlpha(r.held === 'hand_torch' ? 0.1 + night * 0.35 : 0);
      const visuallyMoving = r.moving || Math.hypot(r.targetX - r.sprite.x, r.targetY - r.sprite.y) > 2;
      this.applyAnim(r.sprite, r.dir, visuallyMoving);
    }

    // ---- ADR-0012: open-world Wildlife — the host sims + broadcasts the roaming
    // creature pool; every client renders it and checks its OWN player for harm
    this.updateWild(time, delta);

    // ---- v2/v3/v5: the Guardian fight — the danger schedule derives from
    // engagedAt (the first strike). A DORMANT Guardian (engagedAt null) roams
    // harmlessly at home: no waves, no Eye, arena open — nothing to drive here.
    if (this.fight && this.fight.engagedAt !== null) {
      const kit = this.fightKit();
      const bv = this.activeBoss();
      const elapsed = Date.now() - this.fight.engagedAt;
      if (elapsed >= GUARDIAN_AWAKE_MS) {
        // every client derives the timer's end locally; the backend event follows
        this.endFight('slumber');
      } else {
        // fury phases at fixed elapsed-time thresholds — every client hits
        // the same transition at the same schedule position
        const phase = furyPhaseAt(elapsed, GUARDIAN_AWAKE_MS, kit);
        if (phase.index !== this.furyIndex) {
          this.furyIndex = phase.index;
          bv.glow.setTint(bv.art.fury[phase.index]);
          this.sfx('roar', 0.8);
          this.cameras.main.shake(600, 0.008);
          bus.emit('toast', phase.index === 1 ? t.fight.furyRestless : t.fight.furyFury, 'bad');
        }
        // the Reverberant is kept OUT of the dormant glow pool (no idle pulse
        // before it is summoned), so nothing lights its body glow — drive it HERE
        // for the fight so its smoulder + fury-colour tint read like the others
        if (this.activeWarden === 'reverb') bv.glow.setAlpha(0.5 + 0.12 * Math.sin(time / 90));
        const wave = waveInfoAt(elapsed, GUARDIAN_AWAKE_MS, kit);
        if (wave.index !== this.renderedWave) {
          this.renderedWave = wave.index;
          this.renderWave(wave);
        }
        if (wave.msIntoWave < wave.phase.telegraphMs) {
          // telegraph pulse rises toward the slam / crash
          const pulse = 0.14 + (wave.msIntoWave / wave.phase.telegraphMs) * 0.22 + 0.06 * Math.sin(time / 60);
          const color = wave.kind === 'lunge' ? bv.art.lunge : bv.art.danger;
          for (const r of this.dangerRects) r.setFillStyle(color, pulse);
        } else if (this.slammedWave !== wave.index) {
          this.slamWave(wave);
        }
        // the authored melee danger-ring (hot during the wind-up of slam waves)
        this.updateMeleeRing(elapsed, wave, time);

        // scripted position: wave 0 leaps to the entrance (Ward slam), later
        // waves telegraph lunges to pre-determined spots
        const pose = guardianPoseAt(elapsed, GUARDIAN_AWAKE_MS, bv.homeSpot, bv.entranceSpot, kit);
        // collision follows the boss's ground footprint; while airborne it has
        // none, so the whole arena (incl. the tiles it just left) opens up
        if (pose.airborne) this.setGuardianBlockersEnabled(false);
        else {
          this.positionGuardianBlockers(pose.spot);
          this.setGuardianBlockersEnabled(true);
        }
        bv.eyeGlow.setAlpha(0);
        if (pose.airborne && pose.target) {
          const a = bv.arena;
          const fx = (a.x + pose.spot.ax + 0.5) * TILE;
          const fy = (a.y + pose.spot.ay + 2) * TILE;
          const tx2 = (a.x + pose.target.ax + 0.5) * TILE;
          const ty2 = (a.y + pose.target.ay + 2) * TILE;
          const t = pose.leapT;
          const arc = Math.sin(t * Math.PI) * 56;
          bv.sprite.anims.stop();
          bv.sprite.setFrame(6);
          const gx = fx + (tx2 - fx) * t;
          const gy = fy + (ty2 - fy) * t;
          bv.sprite.setPosition(gx, gy - arc);
          bv.sprite.setDepth(gy);
          bv.shadow.setPosition(gx, gy - 2).setAlpha(0.45);
          bv.glow.setPosition(gx, gy - arc - 45);
          bv.eyeGlow.setPosition(gx, gy - arc - 61);
        } else {
          this.placeGuardian(pose.spot, 0);
          if (pose.windup) {
            bv.sprite.anims.stop();
            bv.sprite.setFrame(5);
          } else if (wave.kind === 'lunge' && wave.msIntoWave >= wave.phase.telegraphMs && this.landedWave !== wave.index) {
            // the crash-down moment
            this.landedWave = wave.index;
            bv.sprite.anims.stop();
            bv.sprite.setFrame(7);
          } else if (this.landedWave === wave.index && wave.msIntoWave < wave.phase.telegraphMs + 500) {
            // hold the landing pose for a beat
          } else {
            // Eye Window: the amber eye opens right after each slam
            const eyeOpen = eyeOpenAt(elapsed, GUARDIAN_AWAKE_MS, kit);
            if (eyeOpen !== this.eyeOpenShown) {
              this.eyeOpenShown = eyeOpen;
              if (eyeOpen) this.sfx('blip', 0.5);
            }
            const want = eyeOpen ? bv.art.eye : bv.art.idle;
            if (bv.sprite.anims.currentAnim?.key !== want || !bv.sprite.anims.isPlaying) {
              bv.sprite.anims.play(want, true);
            }
            bv.eyeGlow.setAlpha(eyeOpen ? 0.5 + 0.18 * Math.sin(time / 70) : 0);
          }
        }
      }
    }

    // ---- v2: stun (knocked down — can't move or act)
    const stunned = Date.now() < this.stunnedUntil;
    if (!stunned && this.stunMarker) {
      this.stunMarker.destroy();
      this.stunMarker = null;
    }
    if (this.stunMarker) this.stunMarker.setPosition(this.player.x, this.player.y - AVATAR_H - 6);

    // ---- v2: fishing (§8 step 11) — FishingSystem.update (bite/timeout)
    this.fishingSystem.update(time, delta);

    // ---- v2: speed buff expiry (client-side timer, trusted client)
    if (this.buffUntil > 0 && Date.now() >= this.buffUntil) {
      this.buffUntil = 0;
      bus.emit('buff', 0);
      bus.emit('toast', t.toast.mealFades, 'info');
    }

    if (this.chatFocused || stunned) {
      this.player.setVelocity(0, 0);
      if (stunned) this.applyAnim(this.player, this.lastDir, false);
      return;
    }

    const left = this.keys.left.isDown || this.keys.a.isDown;
    const right = this.keys.right.isDown || this.keys.d.isDown;
    const up = this.keys.up.isDown || this.keys.w.isDown;
    const down = this.keys.down.isDown || this.keys.s.isDown;
    let vx = (right ? 1 : 0) - (left ? 1 : 0);
    let vy = (down ? 1 : 0) - (up ? 1 : 0);
    if (vx !== 0 && vy !== 0) {
      vx *= Math.SQRT1_2;
      vy *= Math.SQRT1_2;
    }
    const speed = PLAYER_SPEED * this.moveSpeedFactor();
    this.player.setVelocity(vx * speed, vy * speed);
    const moving = vx !== 0 || vy !== 0;
    if (moving) {
      this.lastDir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : vy > 0 ? 'down' : 'up';
      this.fishingSystem.cancelFishing('You step away — the line goes slack.');
    }
    this.applyAnim(this.player, this.lastDir, moving);
    // elevation depth bump: on a plateau the Player draws above base entities (ADR-0009)
    this.player.setDepth(this.player.y + this.atmosphere.elevationBonus(this.player.x, this.player.y));

    if (time - this.lastPosSent > 100) {
      this.lastPosSent = time;
      this.backend.sendPosition(this.player.x, this.player.y, this.lastDir, moving, this.heldItem ?? undefined, this.swingCount);
    }

    // placement ghost — centred over the whole footprint (ADR-0008). Uses
    // bestAnchorNear so the preview shows the SAME spot confirmPlace will use,
    // including a snap to the nearest valid footprint for Buildings.
    if (this.placing && this.ghost) {
      const { tx, ty } = this.bestAnchorNear(this.placing);
      const { w, h } = footprint(this.placing);
      this.ghost.setPosition((tx + w / 2) * TILE, (ty + h) * TILE);
      this.ghost.setTint(this.canPlaceLocal(this.placing, tx, ty) ? 0x88ff88 : 0xff6666);
      // per-tile overlay: paint each footprint cell green (clear) or red (blocked)
      // so the exact bush/tile that refuses the build is visible, not just a hunch
      if (this.ghostCells) {
        this.ghostCells.clear();
        for (let dy = 0; dy < h; dy++) {
          for (let dx = 0; dx < w; dx++) {
            const clear = this.tileBlockReason(this.placing, tx + dx, ty + dy) === null;
            this.ghostCells.fillStyle(clear ? 0x33dd55 : 0xdd3333, 0.35);
            this.ghostCells.lineStyle(1, clear ? 0x33dd55 : 0xdd3333, 0.9);
            const px = (tx + dx) * TILE;
            const py = (ty + dy) * TILE;
            this.ghostCells.fillRect(px, py, TILE, TILE);
            this.ghostCells.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
          }
        }
      }
    }

    // X dismantles the nearest Structure (never while placing/fishing/in the Delve)
    if (!this.placing && !this.fishingSystem.active && !this.inDelve && Phaser.Input.Keyboard.JustDown(this.keys.dismantle)) {
      this.dismantleFacing();
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.esc) && this.placing) {
      this.exitPlaceMode();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.enter) && this.placing) {
      this.confirmPlace();
    }
    // E: one-shots fire once per press; harvesting and Guardian swings
    // auto-repeat while held, and taps are capped at the same cadence
    // (mashing is never faster than holding)
    const ePressed = Phaser.Input.Keyboard.JustDown(this.keys.e);
    // B1: LMB (held over the canvas, not while typing) is alternative fire, but
    // ONLY for swing:true actions — one-shot interactions stay E-only below
    const lmbActive = this.lmbDown && !this.chatFocused;
    if (this.placing) {
      if (ePressed) this.confirmPlace();
    } else if (this.fishingSystem.active) {
      if (ePressed) this.fishingSystem.reelIn();
    } else if (ePressed || this.keys.e.isDown || lmbActive) {
      const now = Date.now();
      // resolve at the base cadence; a per-action cadence (the Bow's slower
      // fire) then further gates the swing so bow < melee DPS
      const minReady = now - this.lastSwingAt >= SWING_CADENCE_MS;
      if (ePressed || minReady) {
        const action = this.resolveEAction();
        if (action?.swing) {
          const cadence = action.cadenceMs ?? SWING_CADENCE_MS;
          if (now - this.lastSwingAt >= cadence) {
            this.markSwing(now); // stamp + peer echo counter + pose/arc, fused
            action.run();
          }
        } else if (action && ePressed) {
          // one-shot interactions (crate, read, offer, enter Delve) fire once per
          // E press only — never from the alt-fire mouse button (B1)
          action.run();
        }
      }
    }
  }
}
