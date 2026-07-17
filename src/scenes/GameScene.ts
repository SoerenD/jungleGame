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
import { InputSystem } from '../systems/InputSystem';
import { PlayerSystem } from '../systems/PlayerSystem';
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
  player!: Phaser.Physics.Arcade.Sprite;
  /** reusable tooltip showing the name of the Resource Node under the cursor */
  nodeHoverLabel: Phaser.GameObjects.Text | null = null;
  blockersGroup!: Phaser.Physics.Arcade.StaticGroup;
  private inventory: Inventory = {};
  private lastDir: Dir = 'down';
  lastPosSent = 0;
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
  private playerSystem!: PlayerSystem;
  private inputSystem!: InputSystem;
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
  // ---- v4: Loadout — the single in-hand item (ctx.held wraps these hub fields)
  private heldItem: ItemId | null = null;

  // ---- PlayerSystem/InputSystem state, reached through accessors so the
  // DelveSystem frame + peer systems keep their exact reads/writes (ADR-0018)
  get chatFocused(): boolean {
    return this.inputSystem.chatFocused;
  }

  get lmbDown(): boolean {
    return this.inputSystem.lmbDown;
  }

  get keys(): InputSystem['keys'] {
    return this.inputSystem.keys;
  }

  get lastSwingAt(): number {
    return this.playerSystem.lastSwingAt;
  }

  get swingCount(): number {
    return this.playerSystem.swingCount;
  }

  get buffUntil(): number {
    return this.playerSystem.buffUntil;
  }

  set buffUntil(v: number) {
    this.playerSystem.buffUntil = v;
  }

  get heldSprite(): Phaser.GameObjects.Image {
    return this.playerSystem.heldSprite;
  }

  get torchGlow(): Phaser.GameObjects.Image {
    return this.playerSystem.torchGlow;
  }

  get playerShadow(): Phaser.GameObjects.Image {
    return this.playerSystem.playerShadow;
  }
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
    this.playerSystem = new PlayerSystem(this.ctx, this);
    this.systems.push(this.playerSystem);
    this.inputSystem = new InputSystem(this.ctx, this);
    this.systems.push(this.inputSystem);
    this.playerSystem.atmosphere = this.atmosphere;
    this.playerSystem.village = this.villageSystem;
    this.playerSystem.district = this.districtSystem;
    this.playerSystem.presence = this.presence;
    this.playerSystem.input = this.inputSystem;
    this.inputSystem.player = this.playerSystem;
    this.inputSystem.presence = this.presence;
    this.inputSystem.delve = this.delve;
    this.inputSystem.wildlife = this.wildlife;
    this.inputSystem.harvest = this.harvest;
    this.inputSystem.projectile = this.projectile;
    this.inputSystem.progression = this.progression;
    this.inputSystem.district = this.districtSystem;
    this.inputSystem.seal = this.sealSystem;
    this.inputSystem.fight = this.fightSystem;
    this.inputSystem.stations = this.stationsSystem;
    this.inputSystem.village = this.villageSystem;
    this.inputSystem.echo = this.echoSystem;
    this.inputSystem.build = this.buildSystem;
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

    // the own Player: avatar bake, physics sprite, world colliders, Loadout
    // visuals + the held/equip bus handlers — PlayerSystem.create (ADR-0018)
    this.playerSystem.create();

    const cam = this.cameras.main;
    // clamp to the region the Player stands in: a Realm district's rect, or the
    // pinned pre-Realm World (never the full grown grid — the void band and the
    // districts beyond must not scroll into view). Re-derived on the checkZone
    // tick, so every cross-region reposition (gates, Exhaustion wake, recall,
    // login inside a district) re-clamps without touching each call site.
    this.districtSystem.applyCameraRegion(true);
    cam.setZoom(ZOOM);
    cam.startFollow(this.player, true, 0.15, 0.15);
    // wheel zoom + LMB alt-fire hold + key wiring + chat-focus keyboard gate —
    // InputSystem.create (ADR-0018)
    this.inputSystem.create();

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

    this.inventory = { ...this.me.inventory };
    this.villageSystem.create(); // bakes the Village textures + wires its listeners
    this.wireBackend();
    this.presence.create(); // position/presence backend listeners (ADR-0018)
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
    bus.emit('equipped', this.playerSystem.equipped);
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
    this.inputSystem.fog = this.fogSystem;
    this.fishingSystem = new FishingSystem(this.ctx, this);
    this.systems.push(this.fishingSystem);
    this.fishingSystem.create();
    this.harvest.fishing = this.fishingSystem;
    this.inputSystem.fishing = this.fishingSystem;
    this.playerSystem.fishing = this.fishingSystem;
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

  /** contextual key hints — ProgressionSystem (called on the checkZone cadence) */
  updateHints(): void {
    this.progression.updateHints();
  }

  // ------------------------------------------------------------ secrets

  moveSpeedFactor(): number {
    return this.playerSystem.moveSpeedFactor();
  }

  atkCadence(baseMs: number): number {
    return this.playerSystem.atkCadence(baseMs);
  }

  armorBandOf(by: string): { bandMin: number; bandMax: number } {
    return this.playerSystem.armorBandOf(by);
  }

  heldTool(): ToolId | undefined {
    return this.playerSystem.heldTool();
  }

  isBow(): boolean {
    return this.playerSystem.isBow();
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

  /** the ONE ordered E-priority chain — InputSystem.resolveEAction (ADR-0018) */
  resolveEAction(): EAction | null {
    return this.inputSystem.resolveEAction();
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

  // ---------------------------------- PlayerSystem delegates (ADR-0018)

  applyAnim(sprite: Phaser.GameObjects.Sprite, dir: Dir, moving: boolean): void {
    this.playerSystem.applyAnim(sprite, dir, moving);
  }

  markSwing(now: number): void {
    this.playerSystem.markSwing(now);
  }

  playSwingFx(sprite: Phaser.GameObjects.Sprite, heldSprite: Phaser.GameObjects.Image, dir: Dir): void {
    this.playerSystem.playSwingFx(sprite, heldSprite, dir);
  }

  // ------------------------------------------------------------ helpers

  private sfx(key: string, volume: number): void {
    this.atmosphere.sfx(key, volume);
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
    // torch/held/shadow follow + elevation depth (§8 step 5) — PlayerSystem
    this.playerSystem.updateFollow(this.atmosphere.nightness());

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

    // ---- v2: speed buff expiry (§8 step 12) — PlayerSystem.updateBuff
    this.playerSystem.updateBuff();

    // §8 steps 13–19: halt / movement / broadcast / ghost / X / place keys /
    // E-LMB dispatch — InputSystem.update (movement via PlayerSystem.move)
    this.inputSystem.update(time, delta, stunned);
  }
}
