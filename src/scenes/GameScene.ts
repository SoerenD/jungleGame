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
import { BuildSystem } from '../systems/BuildSystem';
import { FishingSystem } from '../systems/FishingSystem';
import { FogSystem } from '../systems/FogSystem';
import { CHIP_TINTS, HarvestSystem } from '../systems/HarvestSystem';
import { DistrictSystem } from '../systems/DistrictSystem';
import { EchoSystem } from '../systems/EchoSystem';
import { PresenceSystem } from '../systems/PresenceSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { SealSystem } from '../systems/SealSystem';
import { StationsSystem } from '../systems/StationsSystem';
import { VillageSystem } from '../systems/VillageSystem';
import { WildlifeSystem } from '../systems/WildlifeSystem';
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
  /** reusable tooltip showing the name of the Resource Node under the cursor */
  nodeHoverLabel: Phaser.GameObjects.Text | null = null;
  blockersGroup!: Phaser.Physics.Arcade.StaticGroup;
  private inventory: Inventory = {};
  /** the worn gear (ADR-0017 §4) — armor bakes into my sheet; the legacy weapon
   *  slots only ever DRAIN now (the HUD migration returns them to the bag) */
  private equipped: EquippedGear = {};
  /** un-sent equip intent (rapid toggles coalesce here) + the send serializer */
  private desiredEquip: EquippedGear | null = null;
  private equipChain: Promise<void> = Promise.resolve();
  private lastDir: Dir = 'down';
  private chatFocused = false;
  lastPosSent = 0;
  private lastSwingAt = 0;
  // ---- ADR-0018 systems (referenced by other systems + transitional delegates)
  private fogSystem!: FogSystem;
  private atmosphere!: AtmosphereSystem;
  private fishingSystem!: FishingSystem;
  private sealSystem!: SealSystem;
  private villageSystem!: VillageSystem;
  private progression!: ProgressionSystem;
  private districtSystem!: DistrictSystem;
  private stationsSystem!: StationsSystem;
  private harvest!: HarvestSystem;
  private buildSystem!: BuildSystem;
  private presence!: PresenceSystem;
  private echoSystem!: EchoSystem;
  private wildlife!: WildlifeSystem;
  /**
   * Count of MY swings this session — incremented ONLY at the two lastSwingAt
   * stamp sites (never by remote-triggered playSwingFx replays) and shipped on
   * the position stream (PlayerPos.swings) so peers can echo my swings.
   */
  swingCount = 0;
  // ---- v2: the Guardian
  fight: FightState | null = null;
  /** per-Warden altar/gate progress (ADR-0017) — mirrors the backend's view */
  wardens: Record<string, WardenWorldState> = {};
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
  stunnedUntil = 0;
  stunMarker: Phaser.GameObjects.Text | null = null;
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
  reverbSummonBusy = false;
  /** true once this Player has defeated the Reverberant this session (gates the memorial) */
  reverbDefeated = false;
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
  isDelveHost = false;
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
  delveHostName = '';
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
  // ---- v2: fishing, cooking, intro
  buffUntil = 0;
  // ---- v4: Loadout — the single in-hand item, shown in the Player's hand + torch light
  private heldItem: ItemId | null = null;
  private heldSprite!: Phaser.GameObjects.Image;
  private torchGlow!: Phaser.GameObjects.Image;
  private playerShadow!: Phaser.GameObjects.Image;
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
        return self.progression.journey;
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
    this.districtSystem = new DistrictSystem(this.ctx, this, this.atmosphere);
    this.systems.push(this.districtSystem);
    this.atmosphere.district = this.districtSystem;
    this.villageSystem = new VillageSystem(this.ctx, this);
    this.systems.push(this.villageSystem);
    this.stationsSystem = new StationsSystem(this.ctx, this);
    this.systems.push(this.stationsSystem);
    this.harvest = new HarvestSystem(this.ctx, this);
    this.systems.push(this.harvest);
    this.buildSystem = new BuildSystem(this.ctx, this);
    this.systems.push(this.buildSystem);
    this.buildSystem.atmosphere = this.atmosphere;
    this.buildSystem.harvest = this.harvest;
    this.buildSystem.stations = this.stationsSystem;
    this.stationsSystem.build = this.buildSystem;
    this.presence = new PresenceSystem(this.ctx, this);
    this.systems.push(this.presence);
    this.presence.atmosphere = this.atmosphere;
    this.echoSystem = new EchoSystem(this.ctx, this);
    this.systems.push(this.echoSystem);
    this.echoSystem.district = this.districtSystem;
    this.echoSystem.presence = this.presence;
    this.echoSystem.create();
    this.wildlife = new WildlifeSystem(this.ctx, this);
    this.systems.push(this.wildlife);
    this.wildlife.atmosphere = this.atmosphere;
    this.wildlife.presence = this.presence;
    this.wildlife.village = this.villageSystem;
    this.wildlife.create();
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

    // lore tablets + grove altar + Welcome Stone — ProgressionSystem.create (ADR-0018)
    this.progression = new ProgressionSystem(this.ctx, this);
    this.systems.push(this.progression);
    this.progression.create();

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
    this.districtSystem.applyCameraRegion(true);
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
    this.villageSystem.create(); // bakes the Village textures + wires its listeners
    this.wireBackend();
    this.presence.create(); // position/presence backend listeners (ADR-0018)
    this.wireBus();
    this.stationsSystem.create(); // craft/eat/drop + crate/sawmill/refiner bus handlers (ADR-0018)
    this.harvest.village = this.villageSystem;
    this.harvest.progression = this.progression;
    this.buildSystem.village = this.villageSystem;
    this.buildSystem.progression = this.progression;
    this.progression.harvest = this.harvest;
    this.harvest.create(); // nodeChanged listener + the 600 ms regrow/wildgrain tick
    this.recomputeWildHost(); // ADR-0012: elect the creature host now (re-run on every presence sync)
    bus.emit('journey', this.progression.journey);

    void this.backend.loadWorld().then((snap) => {
      this.villageSystem.applyVillage(snap.village); // before structures so the Hall's grandeur is ready
      for (const n of snap.nodes) this.harvest.addNode(n);
      for (const s of snap.structures) this.buildSystem.addStructure(s);
      for (const p of snap.players) this.presence.upsertRemote(p);
      bus.emit('chatlog', snap.chatLog);
      this.presence.emitPresence();
      this.progression.applyQuest(snap.quest);
      if (!snap.quest.gateOpen) this.progression.buildGate();
      this.sealSystem.applySeal(snap.seal);
      if (!snap.seal.broken) this.sealSystem.buildSealBarrier();
      // ADR-0017: per-Warden altar/gate progress — re-dress gates already open
      this.wardens = snap.wardens ?? {};
      for (const [id, w] of Object.entries(this.wardens)) bus.emit('warden-altar', id, w.altar);
      bus.emit('wardens', this.wardens); // the Chapter-2 tracker phases tick off altar.broken/gateOpen
      this.districtSystem.rebuildRealmGates();
      // joining mid-fight: dormant or engaged, the state derives from the fight
      // row (engagedAt), not from having witnessed the summon/engage events
      if (snap.fight) this.startFight(snap.fight, false);
      // ADR-0015: seed the Hall panel's Depth Record teaser (records accrue from
      // the first Descent even while the Grand Monument is unbuilt)
      this.refreshDepthRecords();
      this.stationsSystem.emitSawmillBuilt(); // Into-the-Delve step: a Sawmill stands in the World
    });
    // 'equipped' BEFORE 'inventory': the HUD's loadout reconcile persists on the
    // inventory event and checks ownership through the gear record too — the
    // reverse order let it wipe gear-held legacy weapons before gear arrived
    bus.emit('equipped', this.equipped);
    bus.emit('inventory', this.inventory);


    // AtmosphereSystem.create() covers (in the original order): the ambient +
    // waterfall audio beds, day/night + veil overlays, mist puffs, fireflies,
    // leaves, and the elevation/waterfall world dressing (ADR-0009).
    this.atmosphere.create();
    this.fogSystem = new FogSystem(this.ctx, this, this.atmosphere);
    this.fogSystem.seal = this.sealSystem;
    this.fogSystem.village = this.villageSystem;
    this.systems.push(this.fogSystem);
    this.fogSystem.create();
    this.atmosphere.fog = this.fogSystem;
    this.stationsSystem.fog = this.fogSystem;
    this.presence.fog = this.fogSystem;
    this.fogSystem.presence = this.presence;
    this.harvest.fog = this.fogSystem;
    this.harvest.fishing = this.fishingSystem;
    this.fishingSystem = new FishingSystem(this.ctx, this);
    this.systems.push(this.fishingSystem);
    this.fishingSystem.create();
    this.buildSystem.create(); // request-place + structure listeners + drag-place (ADR-0018)
    this.buildDelveEntrance();
    this.districtSystem.create(); // the Realm gates (ADR-0018)

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
          remotes: [...this.presence.remotes.keys()],
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
          host: () => ({ isHost: this.wildlife.isWildHost, hostName: this.wildlife.wildHostName, roster: this.backend.creatureRoster() }),
          list: () =>
            [...this.wildlife.wildMobs.values()].map((m) => ({
              id: m.id, kind: m.kind, st: m.st, hp: m.hp, maxHp: m.maxHp,
              predator: isWildKind(m.kind) && isPredator(m.kind as WildKind),
              x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10,
              danger: this.wildlife.dangerAt(Math.floor(m.x), Math.floor(m.y)),
              rage: !!m.rage, rageBy: this.wildlife.wildRage.get(m.id)?.by ?? null,
            })),
          danger: (tx?: number, ty?: number) =>
            this.wildlife.dangerAt(tx ?? Math.floor(this.player.x / TILE), ty ?? Math.floor((this.player.y - 4) / TILE)),
          knockdowns: () => this.wildlife.wildKnockdownTimes.length,
          /** force-spawn one creature near the Player (host only): kind or 'predator'/'peaceful' */
          spawn: (kind: string) => {
            if (!this.wildlife.isWildHost) return null;
            const tx = Math.floor(this.player.x / TILE) + 2;
            const ty = Math.floor((this.player.y - 4) / TILE);
            let k = kind as WildKind;
            if (kind === 'predator') k = 'jaguar';
            else if (kind === 'peaceful') k = 'capybara';
            const id = `w${this.wildlife.nextWildId++}`;
            this.wildlife.wildMobs.set(id, createMob(id, { kind: k, x: tx + 0.5, y: ty + 0.5 }, 1));
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
    this.backend.on('crateChanged', (crateId: string, contents: Inventory) => {
      bus.emit('crate-changed', crateId, contents);
    });
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
          void this.echoSystem.claimReverbReward();
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
      this.districtSystem.rebuildRealmGates();
    });
    this.backend.on('delveOpened', () => this.refreshDelveEntrance(true));
    this.backend.on('dungeon', (msg: DungeonMsg) => this.onDungeonMsg(msg));
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
  beginKnockdown(): void {
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
  fireBow(): void {
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
      for (const m of this.wildlife.wildMobs.values()) {
        if (m.st === 'dead') continue;
        if (!isWildKind(m.kind)) continue; // every creature is fair game — peaceful too
        const t0 = this.rayHitPx(ox, oy, dir.x, dir.y, maxPx, m.x * TILE, m.y * TILE, profileOf(m.kind).radius * TILE);
        consider(t0, () => {
          if (this.wildlife.isWildHost) this.wildlife.applyWildHit(m.id, tool, this.me.name);
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

  /** tick one Journey objective — ProgressionSystem (ADR-0018) */
  tickJourney(step: JourneyStepId): void {
    this.progression.tickJourney(step);
  }

  private useHint(hint: HintId): void {
    this.progression.useHint(hint);
  }

  /** contextual key hints — ProgressionSystem (called on the checkZone cadence) */
  updateHints(): void {
    this.progression.updateHints();
  }

  // ------------------------------------------------------------ secrets

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
    const festival = festivalActive(this.villageSystem.village, Date.now()) ? FESTIVAL_SPEED_FACTOR : 1;
    // ADR-0017 rung 1: the Tide's flood slows wading inside the Sunken Mire — a
    // pure f(clock), whole-district; the Mirefang's bearer ignores it (realm
    // synergy). Keyed on CARRYING the Mirefang (its item text promises the effect
    // "carried", not in-hand), so it holds while a machete cuts the reeds. Client-
    // side positional slow, stacked like the other move factors.
    const wade =
      this.districtSystem.activeDistrict?.id === 'sunken_mire' && tideFloods(Date.now(), TIDE_PERIOD_MS) && !gearOwns(this.inventory, this.equipped, 'mirefang')
        ? WADE_SLOW_FACTOR
        : 1;
    // ADR-0017 §3: the Tideglass Boots add their +8% beside the Village bonus
    return cooked * festival * wade * (1 + villageBuff(this.villageSystem.village.tier).moveSpeed + armorBuff(this.equipped).moveSpeed);
  }

  /** combat swing cadence with the Village's attack-speed buff folded in
   *  (ADR-0013) + the worn Gloves' bonus (ADR-0017 §3) */
  atkCadence(baseMs: number): number {
    return baseMs / (1 + villageBuff(this.villageSystem.village.tier).attackSpeed + armorBuff(this.equipped).attackSpeed);
  }

  /** the worn-Armor band raise of WHOEVER landed the hit (ADR-0017 §3): mine
   *  from my equipped record, a peer's from their synced `armor` field */
  armorBandOf(by: string): { bandMin: number; bandMax: number } {
    return armorBuff(by === this.me.name ? this.equipped : this.presence.remotes.get(by)?.armor);
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
    // ADR-0017 §4: the inventory's Equip button toggles one Armor piece
    bus.on('equip-toggle', (item: ItemId) => this.toggleArmor(item));
    // the legacy gear weapon slots: only the HUD migration's CLEAR path fires now
    bus.on('weapon-slot-set', (slot: WeaponSlot, item: ItemId | null) => this.setWeaponSlot(slot, item));
    // the boss Spoils window: take one drop, take everything, or close (which
    // sweeps up whatever is left so loot is never abandoned)
    bus.on('loot-take', (item: ItemId, count: number) => this.claimLoot({ [item]: count }));
    bus.on('loot-take-all', () => this.claimLoot({ ...this.lootPending }));
    bus.on('loot-close', () => this.claimLoot({ ...this.lootPending }));
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
  isBow(): boolean {
    return this.heldItem === 'bow' || this.heldItem === 'fabled_bow';
  }

  // ---- sceneFx delegates (ADR-0018 transitional — callers migrate into systems)
  private addShadow(x: number, y: number, width: number): Phaser.GameObjects.Image {
    return addShadow(this, x, y, width);
  }

  private objImage(x: number, y: number, kind: string): Phaser.GameObjects.Image | null {
    return objImage(this, x, y, kind);
  }

  private addBlockerBody(tx: number, ty: number): Phaser.GameObjects.Rectangle {
    return addBlockerBody(this, this.blockersGroup, tx, ty);
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
    const realm = this.districtSystem.realmGateAction(px, py);
    if (realm) return realm;

    // special interactables take priority over nodes
    const stone = this.progression.welcomeStoneAction(px, py);
    if (stone) return stone;
    const tablet = this.progression.tabletAction(px, py);
    if (tablet) return tablet;
    const special = this.sealSystem.contributeSealAction() ?? this.summonAction() ?? this.mireAltarAction() ?? this.echoAltarAction() ?? this.verdantAltarAction() ?? this.guardianAction();
    if (special) return special;
    const grove = this.progression.groveAltarAction(px, py);
    if (grove) return grove;
    const dig = this.progression.digAction(px, py);
    if (dig) return dig;

    const cook = this.fishingSystem.cookAction();
    if (cook) return cook;

    // the Village Hall: E opens the contribution panel — per-resource sliders let
    // the Player choose how much of each qualifying Resource/loot to give (ADR-0010)
    const hall = this.nearbyStructure(['village_hall']);
    if (hall) return { swing: false, run: () => this.villageSystem.openVillageContribute() };

    // ADR-0013 building functions: the Victory Arch recalls you home; the Stone
    // Keep rings the muster bell to call everyone to the Village.
    const arch = this.nearbyStructure(['victory_arch']);
    if (arch) return { swing: false, run: () => this.villageSystem.recallHome() };
    const keep = this.nearbyStructure(['stone_keep']);
    if (keep) return { swing: false, run: () => this.villageSystem.ringBell() };
    const market = this.nearbyStructure(['market_square']);
    if (market) return { swing: false, run: () => this.villageSystem.openTradePost() };
    const banner = this.nearbyStructure(['village_banner']);
    if (banner) return { swing: false, run: () => bus.emit('village-name-open', { name: this.villageSystem.village.name ?? '', crest: this.villageSystem.village.crest ?? 0 }) };
    const well = this.nearbyStructure(['village_well']);
    if (well) return { swing: false, run: () => this.villageSystem.openChronicle() };
    const fountain = this.nearbyStructure(['fountain']);
    if (fountain) return { swing: false, run: () => this.villageSystem.openFountain() };
    const flowerBed = this.nearbyStructure(['flower_bed']);
    if (flowerBed) return { swing: false, run: () => this.villageSystem.tendFlowers() };
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
    if (kiln) return { swing: false, run: () => this.stationsSystem.openRefiner(kiln.id, BRINE_KILN, ITEMS.brine_kiln.name) };
    // ADR-0017 rung 2: the Chime Kiln — the same generic Refiner, echo crystal → hushsteel
    const chime = this.nearbyStructure(['chime_kiln']);
    if (chime) return { swing: false, run: () => this.stationsSystem.openRefiner(chime.id, CHIME_KILN, ITEMS.chime_kiln.name) };
    // ADR-0017 rung 3: the Verdant Loom — the same generic Refiner, wildgrain → verdant fibre
    const loom = this.nearbyStructure(['verdant_loom']);
    if (loom) return { swing: false, run: () => this.stationsSystem.openRefiner(loom.id, VERDANT_LOOM, ITEMS.verdant_loom.name) };
    // ADR-0017 rung 2: the Echoes — arm a recording at a pedestal / claim an open vault
    const echoE = this.echoSystem.echoAction();
    if (echoE) return echoE;

    // functional Structures: crate storage, the Sawmill, signposts
    const st = this.nearbyStructure(['crate', 'sawmill', 'signpost']);
    if (st) {
      if (st.type === 'crate') return { swing: false, run: () => this.stationsSystem.openCrate(st.id) };
      // ?refinertest (dev-only, ADR-0017 §6): the Sawmill tile doubles as the
      // generic test Refiner so the kernel is exercisable end-to-end before any
      // player-facing Refiner Structure ships — the live Sawmill path is untouched
      // without the flag
      if (st.type === 'sawmill') {
        if (DEV_REFINER_TEST) return { swing: false, run: () => this.stationsSystem.openRefiner(st.id, TEST_REFINER, t.refiner.testName) };
        return { swing: false, run: () => this.stationsSystem.openSawmill(st.id) };
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
    const wild = this.wildlife.wildlifeAction();
    if (wild) return wild;

    // the nearest live Resource Node in reach (fishing cast / gates / swing) —
    // HarvestSystem.nodeAction; nothing in reach falls through to the Bow
    const nodeAct = this.harvest.nodeAction(px, py);
    if (nodeAct) return nodeAct;
    // nothing else in reach: a held Bow still shoots toward the cursor (the
    // trailing fallback — every verb above keeps its priority)
    return this.bowFallbackAction();
  }

  // ------------------------------------------------------------ structures (BuildSystem delegates, ADR-0018)

  /** the first structure of one of `types` on the 3x3 around the Player — BuildSystem */
  nearbyStructure(types: StructureId[]): Structure | null {
    return this.buildSystem.nearbyStructure(types);
  }

  exitPlaceMode(): void {
    this.buildSystem.exitPlaceMode();
  }

  /** live place-mode item (BuildSystem state) — read by the input/update seams */
  get placing(): StructureId | null {
    return this.buildSystem.placing;
  }

  // ------------------------------------------------------------ remote players

  applyAnim(sprite: Phaser.GameObjects.Sprite, dir: Dir, moving: boolean): void {
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
  playSwingFx(sprite: Phaser.GameObjects.Sprite, heldSprite: Phaser.GameObjects.Image, dir: Dir): void {
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
  checkZone(): void {
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
  delveOpenNow(): boolean {
    return this.delveForceOpen || !!this.progression.quest?.delveOpen;
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
  refreshDelveEntrance(open: boolean): void {
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
    this.harvest.burstChips(this.delveEntrance.x, this.delveEntrance.y - 6, this.delveEntrance.y + 2, CHIP_TINTS.rock, false);
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
  enterDelve(): void {
    if (this.inDelve) return;
    this.delveStage = 1; // entering from the World shaft always starts at Stage 1
    const me = this.me.name;
    const roster = [me];
    for (const [name, r] of this.presence.remotes) {
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
  villageWakeTile(): { tx: number; ty: number } | null {
    const hall = this.villageSystem.village?.hall;
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
  leaveDelve(wake?: { tx: number; ty: number }): void {
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
    this.districtSystem.applyCameraRegion(true);
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
    const roll = applyMobHit(m, tool, Math.random, villageBuff(this.villageSystem.village.tier).critChance, this.armorBandOf(by));
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

  /** the Hushdark frame — EchoSystem.updateEchoes (ADR-0018) */
  updateEchoes(time: number, delta: number): void {
    this.echoSystem.updateEchoes(time, delta);
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

  // ---------------------------------- ADR-0012 Wildlife (WildlifeSystem delegates)

  /** re-elect the creature host (presence sync + create) — WildlifeSystem */
  recomputeWildHost(): void {
    this.wildlife.recomputeWildHost();
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
    this.stationsSystem.update(time, delta);

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

    // remote interpolation (§8 step 7) — PresenceSystem.update (ADR-0018)
    this.presence.update(time, delta);

    // ---- ADR-0012: open-world Wildlife (§8 step 8) — WildlifeSystem.update
    this.wildlife.update(time, delta);

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

    // throttled position broadcast (§8 step 15) — PresenceSystem
    this.presence.throttledSend(time, moving);

    // placement ghost (§8 step 16) — BuildSystem.update (ADR-0018)
    this.buildSystem.update(time, delta);

    // X dismantles the nearest Structure (never while placing/fishing/in the Delve)
    if (!this.placing && !this.fishingSystem.active && !this.inDelve && Phaser.Input.Keyboard.JustDown(this.keys.dismantle)) {
      this.buildSystem.dismantleFacing();
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.esc) && this.placing) {
      this.exitPlaceMode();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.enter) && this.placing) {
      this.buildSystem.confirmPlace();
    }
    // E: one-shots fire once per press; harvesting and Guardian swings
    // auto-repeat while held, and taps are capped at the same cadence
    // (mashing is never faster than holding)
    const ePressed = Phaser.Input.Keyboard.JustDown(this.keys.e);
    // B1: LMB (held over the canvas, not while typing) is alternative fire, but
    // ONLY for swing:true actions — one-shot interactions stay E-only below
    const lmbActive = this.lmbDown && !this.chatFocused;
    if (this.placing) {
      if (ePressed) this.buildSystem.confirmPlace();
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
