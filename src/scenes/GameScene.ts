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
import { FightSystem } from '../systems/FightSystem';
import { FishingSystem } from '../systems/FishingSystem';
import { ProjectileSystem } from '../systems/ProjectileSystem';
import { FogSystem } from '../systems/FogSystem';
import { CHIP_TINTS, HarvestSystem } from '../systems/HarvestSystem';
import { DelveSystem } from '../systems/DelveSystem';
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
  chatFocused = false;
  lastPosSent = 0;
  lastSwingAt = 0;
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
  private delve!: DelveSystem;
  private fightSystem!: FightSystem;
  private projectile!: ProjectileSystem;
  /**
   * Count of MY swings this session — incremented ONLY at the two lastSwingAt
   * stamp sites (never by remote-triggered playSwingFx replays) and shipped on
   * the position stream (PlayerPos.swings) so peers can echo my swings.
   */
  swingCount = 0;
  // ---- v2: the Guardian — FightSystem state, reached through accessors so the
  // not-yet-extracted input/delve/wildlife seams keep their exact reads/writes
  get fight(): FightState | null {
    return this.fightSystem.fight;
  }

  get wardens(): Record<string, WardenWorldState> {
    return this.fightSystem.wardens;
  }

  get stunnedUntil(): number {
    return this.fightSystem.stunnedUntil;
  }

  set stunnedUntil(v: number) {
    this.fightSystem.stunnedUntil = v;
  }

  get stunMarker(): Phaser.GameObjects.Text | null {
    return this.fightSystem.stunMarker;
  }

  set stunMarker(v: Phaser.GameObjects.Text | null) {
    this.fightSystem.stunMarker = v;
  }

  get fightMusic(): Phaser.Sound.BaseSound | null {
    return this.fightSystem.fightMusic;
  }

  get reverbSummonBusy(): boolean {
    return this.fightSystem.reverbSummonBusy;
  }

  set reverbSummonBusy(v: boolean) {
    this.fightSystem.reverbSummonBusy = v;
  }

  get reverbDefeated(): boolean {
    return this.fightSystem.reverbDefeated;
  }

  set reverbDefeated(v: boolean) {
    this.fightSystem.reverbDefeated = v;
  }

  get mireAltarPos(): { x: number; y: number } {
    return this.fightSystem.altarPosOf('mire');
  }

  get echoAltarPos(): { x: number; y: number } {
    return this.fightSystem.altarPosOf('echo');
  }

  get verdantAltarPos(): { x: number; y: number } {
    return this.fightSystem.altarPosOf('verdant');
  }

  /** captured World colliders, disabled while inside the Delve (DelveSystem toggles) */
  worldColliders: Phaser.Physics.Arcade.Collider[] = [];
  inDelve = false;

  get isDelveHost(): boolean {
    return this.delve.isDelveHost;
  }

  get delveHostName(): string {
    return this.delve.delveHostName;
  }
  // ---- v2: fishing, cooking, intro
  buffUntil = 0;
  // ---- v4: Loadout — the single in-hand item, shown in the Player's hand + torch light
  private heldItem: ItemId | null = null;
  heldSprite!: Phaser.GameObjects.Image;
  torchGlow!: Phaser.GameObjects.Image;
  playerShadow!: Phaser.GameObjects.Image;
  keys!: {
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
  lmbDown = false;
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
    this.inventory = inv;
    bus.emit('inventory', inv);
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
    this.progression = new ProgressionSystem(this.ctx, this);
    this.systems.push(this.progression);
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
    this.delve = new DelveSystem(this.ctx, this);
    this.systems.push(this.delve);
    this.delve.atmosphere = this.atmosphere;
    this.delve.district = this.districtSystem;
    this.delve.village = this.villageSystem;
    this.delve.progression = this.progression;
    this.wildlife = new WildlifeSystem(this.ctx, this);
    this.systems.push(this.wildlife);
    this.wildlife.atmosphere = this.atmosphere;
    this.wildlife.presence = this.presence;
    this.wildlife.village = this.villageSystem;
    this.wildlife.create();
    this.sealSystem = new SealSystem(this.ctx, this);
    this.systems.push(this.sealSystem);
    this.fightSystem = new FightSystem(this.ctx, this);
    this.systems.push(this.fightSystem);
    this.projectile = new ProjectileSystem(this.ctx, this);
    this.systems.push(this.projectile);
    this.fightSystem.seal = this.sealSystem;
    this.fightSystem.district = this.districtSystem;
    this.fightSystem.atmosphere = this.atmosphere;
    this.fightSystem.delve = this.delve;
    this.fightSystem.echo = this.echoSystem;
    this.fightSystem.projectile = this.projectile;
    this.projectile.fight = this.fightSystem;
    this.projectile.delve = this.delve;
    this.projectile.wildlife = this.wildlife;
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
    this.progression.create();

    // ---- v2 landmarks
    // Seal monument outside the arena entrance — SealSystem.create (ADR-0018)
    this.sealSystem.create();
    // Guardian altar + every Warden court/rig + fight backend events —
    // FightSystem.create (ADR-0018; the §1.7 BossRig dedup)
    this.fightSystem.create();

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
      this.fightSystem.wardens = snap.wardens ?? {};
      for (const [id, w] of Object.entries(this.wardens)) bus.emit('warden-altar', id, w.altar);
      bus.emit('wardens', this.wardens); // the Chapter-2 tracker phases tick off altar.broken/gateOpen
      this.districtSystem.rebuildRealmGates();
      // joining mid-fight: dormant or engaged, the state derives from the fight
      // row (engagedAt), not from having witnessed the summon/engage events
      if (snap.fight) this.fightSystem.startFight(snap.fight, false);
      // ADR-0015: seed the Hall panel's Depth Record teaser (records accrue from
      // the first Descent even while the Grand Monument is unbuilt)
      this.delve.refreshDepthRecords();
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
    this.delve.fog = this.fogSystem;
    this.delve.harvest = this.harvest;
    this.delve.presence = this.presence;
    this.delve.create(); // the shaft entrance + delve listeners + Spoils handlers (ADR-0018)
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
          stage: () => this.delve.delveStage,
          inDelve: () => this.inDelve,
          doorOpen: () => this.delve.deepDoorOpen,
          mobs: () =>
            [...this.delve.mobs.values()].map((m) => ({
              id: m.id, kind: m.kind, hp: m.hp, maxHp: m.maxHp, st: m.st, erupt: !!m.erupt, guard: !!m.guard,
              x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10,
            })),
          enterStage1: () => this.delve.enterDelve(),
          enterDeep: () => this.delve.enterDeepDirect(),
          descend: () => this.delve.descendNextStage(),
          /** force the next signature move (eruption/slam/wall/birth) to charge now */
          erupt: () => {
            for (const m of this.delve.mobs.values()) {
              if (m.st !== 'dead' && profileOf(m.kind).eruptEveryMs) { m.eruptCd = 0; return true; }
            }
            return false;
          },
          /** fell one mob by id as a lethal host-adjudicated hit (drives the real loot/door/complete path) */
          fell: (id: string) => {
            const m = this.delve.mobs.get(id);
            if (!m || m.st === 'dead') return false;
            this.delve.delveHitLanded = true;
            this.delve.delveParticipants.add(this.me.name);
            m.hp = 0;
            m.st = 'dead';
            this.delve.onMobFelled(m);
            return true;
          },
          /** fell every Husk (leaves the boss) — bank kills for shard loot */
          fellHusks: () => {
            let n = 0;
            for (const m of [...this.delve.mobs.values()]) {
              if (isBossKind(m.kind) || m.st === 'dead') continue;
              this.delve.delveHitLanded = true;
              this.delve.delveParticipants.add(this.me.name);
              m.hp = 0;
              m.st = 'dead';
              this.delve.onMobFelled(m);
              n++;
            }
            return n;
          },
          /** fell the current Stage boss (pays loot + Record, opens the next door — ADR-0015) */
          fellBoss: () => {
            for (const m of [...this.delve.mobs.values()]) {
              if (!isBossKind(m.kind) || m.st === 'dead') continue;
              this.delve.delveHitLanded = true;
              this.delve.delveParticipants.add(this.me.name);
              m.hp = 0;
              m.st = 'dead';
              this.delve.onMobFelled(m);
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
  }

  // ------------------------------------------------ fight/bow delegates (ADR-0018)

  /** knockdown FX + stun clock — FightSystem (Delve/Wildlife call through) */
  beginKnockdown(): void {
    this.fightSystem.beginKnockdown();
  }

  /** the one bow verb — ProjectileSystem (Wildlife/Delve hunt entries call through) */
  fireBow(): void {
    this.projectile.fireBow();
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
  moveSpeedFactor(): number {
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
  resolveEAction(): EAction | null {
    const px = this.player.x;
    const py = this.player.y - 4;

    // inside the Delve, E means "attack a Husk" or "leave" — never a World action
    if (this.inDelve) return this.delve.delveEAction(px, py);
    // the sealed mine shaft (clear it with an Ancient Pickaxe) / open shaft (enter)
    const delve = this.delve.delveEntranceAction(px, py);
    if (delve) return delve;
    // a Realm gate (ADR-0017): step through, or learn that it is dormant
    const realm = this.districtSystem.realmGateAction(px, py);
    if (realm) return realm;

    // special interactables take priority over nodes
    const stone = this.progression.welcomeStoneAction(px, py);
    if (stone) return stone;
    const tablet = this.progression.tabletAction(px, py);
    if (tablet) return tablet;
    const special = this.sealSystem.contributeSealAction() ?? this.fightSystem.summonAction() ?? this.fightSystem.wardenCourtAltarAction('mire') ?? this.fightSystem.wardenCourtAltarAction('echo') ?? this.fightSystem.wardenCourtAltarAction('verdant') ?? this.fightSystem.guardianAction();
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
    if (monument) return { swing: false, run: () => this.delve.openRecordBoard() };
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
    return this.projectile.bowFallbackAction();
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
  markSwing(now: number): void {
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

  /** is the mine shaft open? — DelveSystem (ADR-0018) */
  delveOpenNow(): boolean {
    return this.delve.delveOpenNow();
  }

  /** re-dress the sealed/open shaft — DelveSystem (ADR-0018) */
  refreshDelveEntrance(open: boolean): void {
    this.delve.refreshDelveEntrance(open);
  }

  /** the tile just south of the founded Village Hall — THE wake point (ADR-0010 §4
   *  as amended: Village Hall > World spawn; the Hammock rung is retired), shared
   *  by every Exhaustion path */
  villageWakeTile(): { tx: number; ty: number } | null {
    const hall = this.villageSystem.village?.hall;
    return hall ? { tx: hall.tx, ty: hall.ty + footprint('village_hall').h } : null;
  }

  /** leave the Delve — DelveSystem (Presence host-leave calls this) */
  leaveDelve(wake?: { tx: number; ty: number }): void {
    this.delve.leaveDelve(wake);
  }

  /** the Hushdark frame — EchoSystem.updateEchoes (ADR-0018) */
  updateEchoes(time: number, delta: number): void {
    this.echoSystem.updateEchoes(time, delta);
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
    if (this.delve.pendingDeepEntry) {
      this.delve.pendingDeepEntry = false;
      this.delve.enterDeepDirect();
      return;
    }

    // the Delve is a self-contained mode: its own dark ambiance, movement,
    // host mob sim, combat and camera — none of the World systems below run
    if (this.inDelve) {
      this.delve.updateDelve(time, delta);
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

    // ---- v2/v3/v5: the Guardian fight (§8 step 9) — FightSystem.update
    this.fightSystem.update(time, delta);

    // ---- v2: stun upkeep (§8 step 10) — FightSystem.updateStunMarker
    const stunned = this.fightSystem.updateStunMarker();

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
