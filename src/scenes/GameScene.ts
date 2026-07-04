import Phaser from 'phaser';
import { OBJECTS, TILESET } from '../assetConfig';
import { AVATAR_H, AVATAR_IDLE, AVATAR_W, ensureAvatarTexture } from '../avatars';
import type {
  Backend,
  ChatMsg,
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
  SealState,
  Structure,
} from '../backend/types';
import { hintRetired, journeyComplete, type HintId } from '../content/journey';
import {
  DAY_CYCLE_MS,
  DEV_DUNGEON,
  EXHAUSTION_KNOCKDOWNS,
  FOG_CHUNK,
  FOG_REVEAL_RADIUS,
  FORCE_NIGHT,
  GUARDIAN_AWAKE_MS,
  INTERACT_RANGE,
  KNOCKDOWN_STUN_MS,
  MAP_H,
  MAP_W,
  MUTE_KEY,
  VOLUME_KEY,
  AMBIENT_BASE_VOLUME,
  FIGHT_MUSIC_BASE_VOLUME,
  loadVolumes,
  type AudioChannel,
  PLAYER_SPEED,
  SPEED_BUFF_FACTOR,
  SWING_CADENCE_MS,
  TILE,
  ZOOM,
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
  type WaveInfo,
} from '../content/guardian';
import {
  applyMobHit,
  createMob,
  DEEP_CORE,
  DEEP_CORE_DROP,
  DELVE_CORRIDORS,
  DELVE_ENTRY,
  DELVE_H,
  DELVE_LIGHTS,
  DELVE_PROPS,
  DELVE_ROOMS,
  DELVE_W,
  HUSK_SHARD,
  isDelveBlocked,
  isDelveWall,
  MOB_PROFILES,
  planDelveSpawns,
  PROP_BLOCKS,
  PROP_LIGHT,
  RUINS_FROM_X,
  SHARD_PER_KILL,
  stepMob,
  type MobEvent,
  type MobKind,
  type MobState,
} from '../content/dungeon';
import { ITEMS, type ItemId, type StructureId, type ToolId } from '../content/items';
import { TABLETS } from '../content/lore';
import { NODE_TYPES } from '../content/nodeTypes';
import { MOB_FRAME, MOB_TEX } from '../mobSprites';
import { PROP_FLAT, PROP_TEX } from '../delveProps';
import { bus } from '../ui/bus';
import { showIntro } from '../ui/intro';
import { t } from '../i18n';

type OkJoin = Extract<JoinResult, { ok: true }>;

interface WorldData {
  spawn: { tx: number; ty: number };
  zones: { name: string; x: number; y: number; w: number; h: number }[];
  nodes: { id: string; type: keyof typeof NODE_TYPES; tx: number; ty: number }[];
  foliage: { kind: string; tx: number; ty: number }[];
  blocked: number[];
  collide: number[];
  tablets: { id: string; tx: number; ty: number }[];
  gate: { tx: number; ty: number }[];
  altar: { tx: number; ty: number };
  treasureSpots: { tx: number; ty: number }[];
  arena: { x: number; y: number; w: number; h: number };
  guardianHome: { tx: number; ty: number };
  sealMonument: { tx: number; ty: number };
  guardianAltar: { tx: number; ty: number };
  sealGate: { tx: number; ty: number }[];
  welcomeStone: { tx: number; ty: number };
}

interface FishingCast {
  nodeId: string;
  x: number;
  y: number;
  biteAt: number;
  /** the bite window closes at this time — reel in between biteAt and this */
  until: number;
  bit: boolean;
  marker: Phaser.GameObjects.Text | null;
}

interface NodeView {
  state: NodeState;
  sprite: Phaser.GameObjects.Image;
  body: Phaser.GameObjects.Rectangle | null;
  depletedShown: boolean;
}

/**
 * What pressing E would do right now. `swing: true` marks the only two
 * auto-repeatable actions (harvesting a Resource Node, hitting the Guardian);
 * everything else fires once per key press, held or not.
 */
interface EAction {
  swing: boolean;
  /** swing cadence override (the Bow fires slower than melee); defaults to SWING_CADENCE_MS */
  cadenceMs?: number;
  run: () => void;
}

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
}

/**
 * Where the in-hand item sits relative to the Player's feet origin, per facing.
 * `flip` mirrors the sprite for the left profile; `behind` draws it behind the
 * body when the Player faces away.
 */
const HELD_HAND: Record<Dir, { x: number; y: number; flip: boolean; behind: boolean }> = {
  down: { x: 6, y: -9, flip: false, behind: false },
  right: { x: 7, y: -10, flip: false, behind: false },
  left: { x: -7, y: -10, flip: true, behind: false },
  up: { x: -6, y: -11, flip: false, behind: true },
};

/** warm, deep flame-orange cast by a held Hand Torch (dim — a small flame, not a floodlight) */
const TORCH_TINT = 0xff5a0a;

/** point a held-item Image at the in-hand Tool's texture, or hide it when nothing is held */
function setHeldTexture(scene: Phaser.Scene, img: Phaser.GameObjects.Image, id: ItemId | null): void {
  const key = id ? `held-${id}` : null;
  if (key && scene.textures.exists(key)) img.setTexture(key).setVisible(true);
  else img.setVisible(false);
}

/** place a held-item Image at the character's hand for the given facing */
function positionHeld(img: Phaser.GameObjects.Image, px: number, py: number, dir: Dir): void {
  const h = HELD_HAND[dir];
  img.setPosition(px + h.x, py + h.y);
  img.setFlipX(h.flip);
  img.setDepth(py + (h.behind ? -1 : 1));
}

/** rune glow tint per fury phase: calm violet → restless amber → fury red */
const FURY_TINTS = [0xb478ff, 0xff9a3d, 0xff4433];

/** deterministic per-id variance so the forest looks grown, not stamped */
function idHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** the host's per-mob render objects (drawn on the high-depth Delve overlay) */
interface MobView {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  tele: Phaser.GameObjects.Graphics;
  bar: Phaser.GameObjects.Rectangle;
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

export class GameScene extends Phaser.Scene {
  private backend!: Backend;
  private me!: OkJoin;
  private world!: WorldData;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private player!: Phaser.Physics.Arcade.Sprite;
  private nodes = new Map<string, NodeView>();
  private nodesByTile = new Map<string, string>();
  /** reusable tooltip showing the name of the Resource Node under the cursor */
  private nodeHoverLabel: Phaser.GameObjects.Text | null = null;
  private structuresByTile = new Map<string, Structure>();
  private structureIds = new Set<string>();
  private blockersGroup!: Phaser.Physics.Arcade.StaticGroup;
  private remotes = new Map<string, RemoteView>();
  private inventory: Inventory = {};
  private lastDir: Dir = 'down';
  private chatFocused = false;
  private placing: StructureId | null = null;
  private ghost: Phaser.GameObjects.Image | null = null;
  private lastPosSent = 0;
  private lastSwingAt = 0;
  private currentZone = '';
  private muted = false;
  /** per-channel 0..1 volume mix, editable from the settings menu */
  private volumes: Record<AudioChannel, number> = { master: 1, ambience: 1, music: 1, sfx: 1 };
  /** the looping jungle bed — kept so its volume can track the mix live */
  private ambientSound: Phaser.Sound.BaseSound | null = null;
  private quest: QuestState | null = null;
  private tabletSpots: { id: string; x: number; y: number }[] = [];
  private altarPos = { x: 0, y: 0 };
  private gateParts: { sprite: Phaser.GameObjects.Image; body: Phaser.GameObjects.Rectangle }[] = [];
  private digMarker: Phaser.GameObjects.Text | null = null;
  // ---- v2: the Seal
  private seal: SealState | null = null;
  private monumentPos = { x: 0, y: 0 };
  private sealBarrierParts: { sprite: Phaser.GameObjects.Image; body: Phaser.GameObjects.Rectangle }[] = [];
  private nearMonument = false;
  // ---- v2: the Guardian
  private fight: FightState | null = null;
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
  private stunnedUntil = 0;
  private stunMarker: Phaser.GameObjects.Text | null = null;
  /** melee-ring shove cooldown: one push per contact so the tween can't restack (no stun) */
  private meleeRingShoveUntil = 0;
  private fightMusic: Phaser.Sound.BaseSound | null = null;
  /** v5: the Ward — a fresh barrier slammed across the entrance for the fight */
  private wardParts: { sprite: Phaser.GameObjects.Image; body: Phaser.GameObjects.Rectangle }[] = [];
  /** arena-local center of the entrance (the sealGate) — the wave-0 Ward-slam spot */
  private entranceSpot: ArenaSpot = { ax: 0, ay: 0 };
  /** set once this Player is knocked out (3 knockdowns) — the Ward then bars re-entry */
  private exhaustedThisFight = false;
  // ---- Dungeons v1: the Delve (ADR-0007) — an ephemeral, host-simmed instance
  /** world-tile + pixel position of the sealed mine-shaft entrance */
  private delveEntrance = { x: 0, y: 0, tx: 0, ty: 0 };
  private delveEntranceSprite: Phaser.GameObjects.Container | null = null;
  /** ?dungeon: treat the shaft as open regardless of the persisted flag */
  private delveForceOpen = DEV_DUNGEON;
  private rubbleHits = 0;
  /** captured World colliders, disabled while inside the Delve */
  private worldColliders: Phaser.Physics.Arcade.Collider[] = [];
  private inDelve = false;
  private delveRunId: string | null = null;
  private isDelveHost = false;
  /** roster locked at entry (like the Ward) — no late join */
  private delveRoster: string[] = [];
  private delveHeadcount = 1;
  /** host: authoritative mob state (HP lives ONLY here — never the DB). Peers: last snapshot. */
  private mobs = new Map<string, MobState>();
  private mobViews = new Map<string, MobView>();
  /** host: live projectiles. Peers render them from snapshots. */
  private projectiles: DelveProjectile[] = [];
  private projViews = new Map<string, Phaser.GameObjects.Arc>();
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
  // ---- v3: the Journey (onboarding tracker + contextual hints)
  private journey: JourneyState = { steps: {}, hintUses: {} };
  private hintText: Phaser.GameObjects.Text | null = null;
  // ---- v2: fishing, cooking, intro
  private fishing: FishingCast | null = null;
  private buffUntil = 0;
  private welcomeStonePos = { x: 0, y: 0 };
  private glows: { img: Phaser.GameObjects.Image; base: number; x: number; y: number }[] = [];
  // ---- v4: Loadout — the single in-hand item, shown in the Player's hand + torch light
  private heldItem: ItemId | null = null;
  private heldSprite!: Phaser.GameObjects.Image;
  private torchGlow!: Phaser.GameObjects.Image;
  private playerShadow!: Phaser.GameObjects.Image;
  private nightOverlay!: Phaser.GameObjects.Rectangle;
  private duskOverlay!: Phaser.GameObjects.Rectangle;
  private fireflies!: Phaser.GameObjects.Particles.ParticleEmitter;
  private leaves!: Phaser.GameObjects.Particles.ParticleEmitter;
  private leavesActive = false;
  private lastFireflyAt = 0;
  private lastLeafAt = 0;
  // ---- fog of war (per-Player, persisted through the Backend)
  private fogRT!: Phaser.GameObjects.RenderTexture;
  private explored = new Set<number>();
  private readonly fogChunksW = Math.ceil(MAP_W / FOG_CHUNK);
  private readonly fogChunksH = Math.ceil(MAP_H / FOG_CHUNK);
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
  };

  constructor() {
    super('GameScene');
  }

  init(data: { backend: Backend; me: OkJoin }): void {
    this.backend = data.backend;
    this.me = data.me;
  }

  create(): void {
    this.world = this.cache.json.get('worldData') as WorldData;
    this.muted = localStorage.getItem(MUTE_KEY) === '1';
    this.sound.mute = this.muted;
    this.volumes = loadVolumes();

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
    // Seal monument outside the arena entrance (E to contribute Offerings)
    {
      const m = this.world.sealMonument;
      const x = (m.tx + 1) * TILE;
      const y = (m.ty + 1) * TILE;
      this.objImage(x, y, 'seal_monument');
      this.addBlockerBody(m.tx, m.ty);
      this.addBlockerBody(m.tx + 1, m.ty);
      this.addShadow(x, y - 1, 28);
      this.monumentPos = { x, y };
    }
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
      this.glows.push({ img: this.guardianGlow, base: 0.5, x, y });
      // the amber eye's blaze while an Eye Window is open
      this.guardianEyeGlow = this.add
        .image(x, y - 61, 'glow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xffb437)
        .setScale(1.5)
        .setAlpha(0)
        .setDepth(890_002);
    }

    // player — the Avatar texture is composed from this Player's palette picks
    const myTexture = `avatar-${this.me.name}`;
    ensureAvatarTexture(this, myTexture, this.me.appearance);
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
    cam.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    cam.setZoom(ZOOM);
    cam.startFollow(this.player, true, 0.15, 0.15);
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 1 / 1.15 : 1.15), 1.25, 5));
    });

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
    this.wireBackend();
    this.wireBus();
    bus.emit('journey', this.journey);

    void this.backend.loadWorld().then((snap) => {
      for (const n of snap.nodes) this.addNode(n);
      for (const s of snap.structures) this.addStructure(s);
      for (const p of snap.players) this.upsertRemote(p);
      bus.emit('chatlog', snap.chatLog);
      this.emitPresence();
      this.applyQuest(snap.quest);
      if (!snap.quest.gateOpen) this.buildGate();
      this.applySeal(snap.seal);
      if (!snap.seal.broken) this.buildSealBarrier();
      // joining mid-fight: dormant or engaged, the state derives from the fight
      // row (engagedAt), not from having witnessed the summon/engage events
      if (snap.fight) this.startFight(snap.fight, false);
    });
    bus.emit('inventory', this.inventory);

    // zone tracking + lazy regrowth visuals — both timestamp-derived, no game tick
    this.time.addEvent({ delay: 300, loop: true, callback: () => this.checkZone() });
    this.time.addEvent({ delay: 600, loop: true, callback: () => this.checkRegrowthVisuals() });

    const startAmbient = () => {
      if (this.cache.audio.exists('ambient')) {
        this.ambientSound = this.sound.add('ambient', {
          loop: true,
          volume: AMBIENT_BASE_VOLUME * this.volumes.ambience * this.volumes.master,
        });
        this.ambientSound.play();
      }
    };
    if (this.sound.locked) this.sound.once('unlocked', startAmbient);
    else startAmbient();

    // ---- atmosphere: day/night overlays, player glow, fireflies, leaves
    this.duskOverlay = this.add.rectangle(0, 0, 10, 10, 0xff7b39).setAlpha(0).setDepth(899_998);
    this.nightOverlay = this.add.rectangle(0, 0, 10, 10, 0x0a1433).setAlpha(0).setDepth(899_999);
    // both ambient emitters stay parked at (0,0) forever and are fed with
    // emitParticleAt — moving a Phaser 3.60+ emitter drags every live
    // particle with it, which used to fill the night screen with fast dots
    this.fireflies = this.add
      .particles(0, 0, 'glow', {
        scale: { start: 0.06, end: 0.015 },
        alpha: { start: 0.9, end: 0 },
        tint: 0xd8ff8a,
        blendMode: 'ADD',
        lifespan: 4200,
        speed: { min: 4, max: 16 },
        emitting: false,
      })
      .setDepth(895_000);
    this.leaves = this.add
      .particles(0, 0, 'leaf', {
        angle: { min: 80, max: 100 },
        speed: { min: 18, max: 34 },
        rotate: { min: -180, max: 180 },
        alpha: { start: 0.9, end: 0.4 },
        lifespan: 6000,
        emitting: false,
      })
      .setDepth(894_000);

    this.initFog();
    this.wireDragPlace();
    this.buildDelveEntrance();

    if (import.meta.env.DEV) {
      (window as any).__jw = {
        scene: this,
        state: () => ({
          player: { x: this.player.x, y: this.player.y, tx: Math.floor(this.player.x / TILE), ty: Math.floor(this.player.y / TILE) },
          zone: this.currentZone,
          inventory: { ...this.inventory },
          remotes: [...this.remotes.keys()],
          muted: this.muted,
        }),
        teleport: (tx: number, ty: number) => {
          this.player.setPosition((tx + 0.5) * TILE, (ty + 0.5) * TILE);
        },
        grant: (items: Inventory) => {
          const inv = (this.backend as any).debugGrant?.(items) as Inventory | null;
          if (inv) {
            this.inventory = inv;
            bus.emit('inventory', inv);
          }
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
      if (s.placedBy !== this.me.name) bus.emit('toast', t.builtBy(s.placedBy, ITEMS[s.type].name), 'info');
    });
    this.backend.on('crateChanged', (crateId: string, contents: Inventory) => {
      bus.emit('crate-changed', crateId, contents);
    });
    this.backend.on('position', (p: PlayerPos) => this.upsertRemote(p));
    this.backend.on('presence', (players: PlayerPos[]) => this.reconcilePresence(players));
    this.backend.on('quest', (q: QuestState) => this.applyQuest(q));
    this.backend.on('gateOpened', () => this.openGateVisual());
    this.backend.on('sealChanged', (s: SealState) => this.applySeal(s));
    this.backend.on('sealBroken', () => this.epicSealBreak());
    this.backend.on('guardianSummoned', (f: FightState) => this.startFight(f, true));
    this.backend.on('guardianEngaged', (f: FightState) => this.engageFight(f));
    this.backend.on('guardianHit', (hp: number) => {
      if (this.fight) {
        this.fight = { ...this.fight, hp };
        bus.emit('fight-hp', hp);
        this.guardianSprite.setTintFill(0xffffff);
        this.time.delayedCall(60, () => this.guardianSprite.clearTint());
      }
    });
    this.backend.on('guardianVictory', () => this.endFight('victory'));
    this.backend.on('guardianSlumber', () => this.endFight('slumber'));
    this.backend.on('delveOpened', () => this.refreshDelveEntrance(true));
    this.backend.on('dungeon', (msg: DungeonMsg) => this.onDungeonMsg(msg));
  }

  // ------------------------------------------------------------ v2: the Seal

  private applySeal(seal: SealState): void {
    this.seal = seal;
    bus.emit('seal', seal);
  }

  private buildSealBarrier(): void {
    for (const g of this.world.sealGate) {
      const x = (g.tx + 0.5) * TILE;
      const y = (g.ty + 1) * TILE;
      const sprite = this.add.image(x, y, 'seal-barrier');
      sprite.setOrigin(0.5, 1);
      sprite.setDepth(y);
      sprite.setAlpha(0.85);
      this.tweens.add({ targets: sprite, alpha: 0.6, duration: 900, yoyo: true, repeat: -1, ease: 'sine.inout' });
      const body = this.addBlockerBody(g.tx, g.ty);
      this.sealBarrierParts.push({ sprite, body });
    }
  }

  /** the one-time, forever moment */
  private epicSealBreak(): void {
    this.sfx('seal_gong', 0.8);
    this.cameras.main.shake(600, 0.008);
    this.cameras.main.flash(500, 180, 140, 255);
    for (const part of this.sealBarrierParts) {
      this.tweens.killTweensOf(part.sprite);
      this.add
        .particles(part.sprite.x, part.sprite.y - 12, 'glow', {
          scale: { start: 0.14, end: 0 },
          tint: 0xb478ff,
          blendMode: 'ADD',
          speed: { min: 20, max: 70 },
          lifespan: 900,
          quantity: 14,
          emitting: false,
        })
        .explode(14);
      this.tweens.add({
        targets: part.sprite,
        alpha: 0,
        y: part.sprite.y - 14,
        duration: 900,
        onComplete: () => part.sprite.destroy(),
      });
      part.body.destroy();
    }
    this.sealBarrierParts = [];
    bus.emit('toast', t.toast.sealBroken, 'good');
  }

  // ------------------------------------------------------------ v2: the Guardian fight

  /**
   * A summon (or a mid-fight join). A DORMANT Guardian (`engagedAt === null`)
   * roams harmlessly — the arena open, no Ward, no danger schedule — until the
   * first strike engages it. An already-engaged fight (mid-join) goes straight
   * to the live schedule (Ward already up), derived from `engagedAt`.
   */
  private startFight(fight: FightState, fresh: boolean): void {
    this.exhaustedThisFight = false;
    if (fight.engagedAt === null) {
      this.fight = fight;
      this.renderedWave = -1;
      this.landedWave = -1;
      this.slammedWave = -1;
      this.eyeOpenShown = false;
      this.furyIndex = -1;
      this.guardianGlow.setTint(0xb478ff);
      this.guardianSprite.anims.play('guardian-idle');
      this.placeGuardian(this.guardianHomeSpot, 0);
      this.positionGuardianBlockers(this.guardianHomeSpot);
      this.setGuardianBlockersEnabled(true);
      for (const r of this.dangerRects) r.destroy();
      this.dangerRects = [];
      for (const r of this.meleeRingRects) r.destroy();
      this.meleeRingRects = [];
      if (fresh) this.sfx('roar', 0.4); // a low stir, not the full engage roar
      bus.emit('fight-start', { hp: 0, maxHp: 0, engagedAt: null, awakeMs: GUARDIAN_AWAKE_MS, roster: [] });
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
    const engagedAt = fight.engagedAt ?? Date.now();
    this.renderedWave = -1;
    this.landedWave = -1;
    this.eyeOpenShown = false;
    const w = waveInfoAt(Date.now() - engagedAt, GUARDIAN_AWAKE_MS);
    this.slammedWave = w.msIntoWave >= w.phase.telegraphMs ? w.index : w.index - 1;
    this.furyIndex = furyPhaseAt(Date.now() - engagedAt, GUARDIAN_AWAKE_MS).index;
    this.guardianGlow.setTint(FURY_TINTS[this.furyIndex]);
    this.guardianSprite.anims.play('guardian-idle');
    this.raiseWard(dramatic);
    if (dramatic) {
      this.sfx('roar', 0.7);
      this.cameras.main.shake(700, 0.01);
    }
    if (!this.fightMusic && this.cache.audio.exists('guardian_drums')) {
      this.fightMusic = this.sound.add('guardian_drums', {
        loop: true,
        volume: FIGHT_MUSIC_BASE_VOLUME * this.volumes.music * this.volumes.master,
      });
    }
    this.fightMusic?.play();
    bus.emit('fight-start', { hp: fight.hp, maxHp: fight.maxHp, engagedAt, awakeMs: GUARDIAN_AWAKE_MS, roster: fight.roster });
  }

  /**
   * Raise the Ward across the arena entrance (the sealGate tiles). It reuses the
   * Seal's barrier art but is a distinct, per-fight barrier: it blocks outsiders
   * and Exhausted fighters and drops at victory/slumber. Permeability is
   * per-Player — the roster-and-not-Exhausted pass through (see below).
   */
  private raiseWard(dramatic: boolean): void {
    this.dropWard();
    for (const g of this.world.sealGate) {
      const x = (g.tx + 0.5) * TILE;
      const y = (g.ty + 1) * TILE;
      const sprite = this.add.image(x, y, 'seal-barrier').setOrigin(0.5, 1).setDepth(y).setAlpha(0.9);
      sprite.setTint(0xffb9a0); // amber cast — the Guardian's Ward, not the violet Seal
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
    this.fight = null;
    this.exhaustedThisFight = false;
    this.dropWard(); // the Ward falls — the arena opens again
    for (const r of this.dangerRects) r.destroy();
    this.dangerRects = [];
    for (const r of this.meleeRingRects) r.destroy();
    this.meleeRingRects = [];
    this.renderedWave = -1;
    this.furyIndex = -1;
    this.guardianSprite.anims.stop();
    this.guardianSprite.setFrame(0);
    // it sinks back onto its resting place — collision returns home with it
    this.placeGuardian(this.guardianHomeSpot, 0);
    this.positionGuardianBlockers(this.guardianHomeSpot);
    this.setGuardianBlockersEnabled(true);
    this.guardianGlow.setTint(0xb478ff);
    this.guardianEyeGlow.setAlpha(0);
    this.fightMusic?.stop();
    bus.emit('fight-end');
    if (kind === 'victory') {
      this.sfx('seal_gong', 0.6);
      this.cameras.main.shake(500, 0.006);
      this.floatText(this.guardianSprite.x, this.guardianSprite.y - 100, t.fight.bestedFloat, '#ffd166');
      bus.emit('toast', t.toast.guardianBested, 'good');
    } else {
      this.sfx('roar', 0.35);
      bus.emit('toast', t.toast.guardianUnbeaten, 'bad');
    }
  }

  /** world position of an arena spot (the Guardian's feet on its bottom row) */
  private placeGuardian(spot: ArenaSpot, lift: number): void {
    const a = this.world.arena;
    const x = (a.x + spot.ax + 0.5) * TILE;
    const groundY = (a.y + spot.ay + 2) * TILE;
    this.guardianSprite.setPosition(x, groundY - lift);
    this.guardianSprite.setDepth(groundY);
    this.guardianShadow.setPosition(x, groundY - 2);
    this.guardianShadow.setAlpha(lift > 0 ? 0.5 : 1);
    this.guardianGlow.setPosition(x, groundY - lift - 45);
    this.guardianEyeGlow.setPosition(x, groundY - lift - 61);
  }

  /** center the Guardian's 3x3 collision on an arena spot (bodies stored row-major) */
  private positionGuardianBlockers(spot: ArenaSpot): void {
    const a = this.world.arena;
    const cx = (a.x + spot.ax + 0.5) * TILE;
    const cy = (a.y + spot.ay + 0.5) * TILE;
    let i = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const b = this.guardianBlockers[i++];
        if (!b) continue;
        b.setPosition(cx + dx * TILE, cy + dy * TILE);
        (b.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
      }
    }
  }

  private setGuardianBlockersEnabled(on: boolean): void {
    for (const b of this.guardianBlockers) (b.body as Phaser.Physics.Arcade.StaticBody).enable = on;
  }

  /** render the telegraphs of one wave: slam tiles, or a lunge landing marker */
  private renderWave(w: WaveInfo): void {
    for (const r of this.dangerRects) r.destroy();
    this.dangerRects = [];
    const a = this.world.arena;
    const mark = (ax: number, ay: number, color: number, alpha: number) => {
      const rect = this.add.rectangle((a.x + ax + 0.5) * TILE, (a.y + ay + 0.5) * TILE, TILE - 2, TILE - 2, color, alpha);
      rect.setDepth(3);
      this.dangerRects.push(rect);
    };
    if (w.index === 0) {
      // wave 0 (ADR-0004): the engage-leap crashes on the entrance (the Ward
      // slam), so the doorway — not the authored slam tiles — is the danger
      const e = this.entranceSpot;
      for (let dy = -LUNGE_ZONE; dy <= LUNGE_ZONE; dy++) {
        for (let dx = -LUNGE_ZONE; dx <= LUNGE_ZONE; dx++) mark(e.ax + dx, e.ay + dy, 0xffa02f, 0.3);
      }
    } else if (w.kind === 'lunge') {
      // the landing marker glows on the pre-determined spot before impact
      const t = lungeTarget(w.lungeCount + 1);
      for (let dy = -LUNGE_ZONE; dy <= LUNGE_ZONE; dy++) {
        for (let dx = -LUNGE_ZONE; dx <= LUNGE_ZONE; dx++) mark(t.ax + dx, t.ay + dy, 0xffa02f, 0.3);
      }
    } else {
      const tiles = waveTiles(w.index, w.phase.density);
      for (let ay = 0; ay < ARENA_H; ay++) {
        for (let ax = 0; ax < ARENA_W; ax++) {
          if (tiles[ay * ARENA_W + ax]) mark(ax, ay, 0xff3322, 0.22);
        }
      }
    }
  }

  /** the slam/landing moment: flash, shake, and adjudicate the local Player */
  private slamWave(w: WaveInfo): void {
    this.slammedWave = w.index;
    const lunge = w.kind === 'lunge';
    for (const r of this.dangerRects) r.setFillStyle(lunge ? 0xffa02f : 0xff2211, 0.55);
    this.sfx('chop', lunge ? 0.6 : 0.35);
    this.cameras.main.shake(lunge ? 350 : 180, lunge ? 0.008 : 0.004);
    if (Date.now() < this.stunnedUntil) return; // already down — no double count
    const ptx = Math.floor(this.player.x / TILE);
    const pty = Math.floor((this.player.y - 4) / TILE);
    const ax = ptx - this.world.arena.x;
    const ay = pty - this.world.arena.y;
    if (ax < 0 || ay < 0 || ax >= ARENA_W || ay >= ARENA_H) return;
    if (w.index === 0) {
      // wave 0's danger is the entrance (the Ward slam), not the slam tiles
      const e = this.entranceSpot;
      if (Math.abs(ax - e.ax) > LUNGE_ZONE || Math.abs(ay - e.ay) > LUNGE_ZONE) return;
    } else if (lunge) {
      const t = lungeTarget(w.lungeCount + 1);
      if (Math.abs(ax - t.ax) > LUNGE_ZONE || Math.abs(ay - t.ay) > LUNGE_ZONE) return;
    } else if (!waveTiles(w.index, w.phase.density)[ay * ARENA_W + ax]) {
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
      // keep loot eligibility. Wake at Hammock/spawn, pack intact.
      this.exhaustedThisFight = true;
      this.updateWardPermeability();
      bus.emit(
        'toast',
        res.atHammock
          ? t.toast.exhaustionHammock
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
    const ring = meleeRingWindow(wave);
    const hot = ring !== null && elapsed >= ring.openMs && elapsed < ring.closeMs;
    if (!hot) {
      if (this.meleeRingRects.length) {
        for (const r of this.meleeRingRects) r.destroy();
        this.meleeRingRects = [];
      }
      return;
    }
    const a = this.world.arena;
    const centre = guardianSpotAt(wave.lungeCount, this.guardianHomeSpot);
    if (!this.meleeRingRects.length) {
      for (let dy = -MELEE_RING_MAX; dy <= MELEE_RING_MAX; dy++) {
        for (let dx = -MELEE_RING_MAX; dx <= MELEE_RING_MAX; dx++) {
          const ax = centre.ax + dx;
          const ay = centre.ay + dy;
          if (ax < 0 || ay < 0 || ax >= ARENA_W || ay >= ARENA_H) continue;
          if (!inMeleeRing(ax, ay, centre)) continue;
          const rect = this.add.rectangle((a.x + ax + 0.5) * TILE, (a.y + ay + 0.5) * TILE, TILE - 3, TILE - 3, 0xff5a2f, 0.26);
          rect.setDepth(3);
          this.meleeRingRects.push(rect);
        }
      }
    }
    const pulse = 0.2 + 0.12 * Math.sin(time / 55);
    for (const r of this.meleeRingRects) r.setFillStyle(0xff5a2f, pulse);
    // the Player standing in the hot ring gets shoved off the body — no stun,
    // no knockdown report. Gate on a short cooldown so the tween can't restack
    // while it plays; still frozen out if a slam tile has them stunned.
    if (Date.now() < this.stunnedUntil || Date.now() < this.meleeRingShoveUntil) return;
    const ptx = Math.floor(this.player.x / TILE);
    const pty = Math.floor((this.player.y - 4) / TILE);
    if (!inMeleeRing(ptx - a.x, pty - a.y, centre)) return;
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
    // the colossus is 96px tall on a 3x3 footprint — aim at its lower body
    const d = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y - 4,
      this.guardianSprite.x,
      this.guardianSprite.y - TILE * 1.5,
    );
    // the Bow reaches ~8 tiles; melee needs to close to arm's length
    const bow = this.heldItem === 'bow';
    const range = bow ? TILE * 8 : INTERACT_RANGE + TILE * 2;
    if (d > range) return null;
    if (!this.fight) {
      if (this.seal?.broken) {
        return {
          swing: false,
          run: () => bus.emit('toast', t.toast.guardianSlumbersLay, 'info'),
        };
      }
      return null; // sealed away — nothing to interact with yet
    }
    // each weapon carries its own COMBAT attack speed (ADR-0006 §4); harvesting
    // is untouched — resolveEAction only sets cadenceMs on Guardian swings
    if (bow) return { swing: true, cadenceMs: weaponCombat('bow').attackMs, run: () => this.looseArrow() };
    return { swing: true, cadenceMs: weaponCombat(this.heldTool()).attackMs, run: () => this.swingAtGuardian() };
  }

  private swingAtGuardian(): void {
    this.fireGuardianHit(this.heldTool(), this.guardianSprite.x, this.guardianSprite.y - 60);
  }

  /** loose an arrow at the Guardian; the hit registers when the arrow lands */
  private looseArrow(): void {
    if (!this.fight) return;
    const gx = this.guardianSprite.x;
    const gy = this.guardianSprite.y - TILE * 3; // aim at the eye / upper body
    const arrow = this.add.image(this.player.x, this.player.y - AVATAR_H / 2, 'arrow');
    arrow.setDepth(999_990);
    arrow.setRotation(Phaser.Math.Angle.Between(arrow.x, arrow.y, gx, gy));
    this.sfx('blip', 0.4); // bowstring twang
    this.tweens.add({
      targets: arrow,
      x: gx,
      y: gy,
      duration: 240,
      onComplete: () => {
        arrow.destroy();
        // adjudicate on landing (server re-checks the Eye Window at its own time)
        this.fireGuardianHit('bow', gx, gy);
      },
    });
  }

  /**
   * Land one hit on the Guardian with the in-hand Tool. Predicts the Eye Window
   * locally from the same schedule the server adjudicates with — outside a
   * window the strike bounces off so the rule teaches itself. Shared by melee
   * swings and the Bow's arrow.
   */
  private fireGuardianHit(tool: ToolId | undefined, x: number, y: number): void {
    // dormant (engagedAt null): this strike IS the engage — always lands. Once
    // engaged, predict the Eye Window from the same schedule the server uses.
    const engagedAt = this.fight?.engagedAt ?? null;
    const eyeOpen = engagedAt === null ? !!this.fight : eyeOpenAt(Date.now() - engagedAt, GUARDIAN_AWAKE_MS);
    if (eyeOpen) {
      this.sfx('chop', 0.5);
      this.tweens.add({ targets: this.guardianSprite, scaleX: 1.04, scaleY: 0.97, duration: 70, yoyo: true });
    } else {
      this.sfx('blip', 0.35);
      this.floatText(x + Phaser.Math.Between(-10, 10), y, t.fight.clang, '#9aa0a8');
    }
    void this.backend.hitGuardian(tool).then((res) => {
      if (!res.ok) return;
      this.inventory = res.inventory;
      bus.emit('inventory', this.inventory);
      if (res.deflected) return;
      // float the DAMAGE DEALT (cosmetically scaled), NOT remaining HP — the HP
      // bar owns the pool. A crit pops bigger and gold (ADR-0006 §1).
      const shown = res.damage * GUARDIAN_DISPLAY_SCALE;
      const fx = this.guardianSprite.x + Phaser.Math.Between(-8, 8);
      const fy = this.guardianSprite.y - 100;
      if (res.crit) this.floatText(fx, fy, `${shown}!`, '#ffd166', 15);
      else this.floatText(fx, fy, `${shown}`, '#ff8866', 10);
    });
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
            this.inventory = res.inventory;
            bus.emit('inventory', this.inventory);
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

  private contributeSealAction(): EAction | null {
    const d = Phaser.Math.Distance.Between(this.player.x, this.player.y - 4, this.monumentPos.x, this.monumentPos.y - 8);
    if (d > INTERACT_RANGE + 8) return null;
    if (this.seal?.broken) {
      return { swing: false, run: () => bus.emit('toast', t.toast.sealBrokenArenaOpen, 'info') };
    }
    return {
      swing: false,
      run: () => {
        void this.backend.contributeSeal().then((res) => {
          if (res.ok) {
            this.inventory = res.inventory;
            bus.emit('inventory', this.inventory);
            const text = Object.entries(res.taken)
              .map(([item, n]) => `-${n} ${item}`)
              .join('  ');
            this.floatText(this.monumentPos.x, this.monumentPos.y - 20, text, '#b478ff');
            bus.emit('toast', t.toast.laidOfferings, 'good');
            this.sfx('place', 0.6);
            this.tickJourney('first_offering');
          } else if (res.reason === 'NOTHING_TO_GIVE') {
            bus.emit('toast', t.toast.offerNothingNeeded, 'bad');
          }
        });
      },
    };
  }

  // ------------------------------------------------------------ v3: the Journey

  /** tick one Journey objective (idempotent; optimistic local + backend persist) */
  private tickJourney(step: JourneyStepId): void {
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
  private updateHints(): void {
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

  // ------------------------------------------------------------ v2: fishing & cooking

  private startFishing(view: NodeView): void {
    const now = Date.now();
    this.fishing = {
      nodeId: view.state.id,
      x: view.sprite.x,
      y: view.sprite.y,
      biteAt: now + 1000 + Math.random() * 3000, // 1–4 s — client-side flavor only
      until: 0,
      bit: false,
      marker: null,
    };
    bus.emit('toast', t.toast.castLine, 'info');
  }

  private cancelFishing(reason?: string): void {
    if (!this.fishing) return;
    this.fishing.marker?.destroy();
    this.fishing = null;
    if (reason) bus.emit('toast', reason, 'bad');
  }

  /** E pressed while a cast is out */
  private reelIn(): void {
    const f = this.fishing!;
    if (!f.bit) {
      this.cancelFishing(t.toast.reelTooSoon);
      return;
    }
    const nodeId = f.nodeId;
    const { x, y } = f;
    this.cancelFishing();
    this.sfx('splash', 0.6);
    void this.backend.hitNode(nodeId, this.heldTool()).then((result) => {
      if (!result.ok) {
        if (result.reason === 'DEPLETED') bus.emit('toast', t.toast.fishTooLate, 'bad');
        return;
      }
      if (result.finishing && result.gained) {
        const text = Object.entries(result.gained)
          .map(([item, n]) => `+${n} ${ITEMS[item as ItemId]?.name ?? item}`)
          .join('  ');
        this.floatText(x, y - 10, text, '#8ce9ff');
      }
      if (result.inventory) {
        this.inventory = result.inventory;
        bus.emit('inventory', this.inventory);
      }
    });
  }

  private cookAction(): EAction | null {
    if ((this.inventory.fish ?? 0) <= 0) return null;
    const ptx = Math.floor(this.player.x / TILE);
    const pty = Math.floor((this.player.y - 4) / TILE);
    let campfire: Structure | null = null;
    for (let dy = -1; dy <= 1 && !campfire; dy++) {
      for (let dx = -1; dx <= 1 && !campfire; dx++) {
        const s = this.structuresByTile.get(`${ptx + dx},${pty + dy}`);
        if (s?.type === 'campfire') campfire = s;
      }
    }
    if (!campfire) return null;
    return {
      swing: false,
      run: () => {
        void this.backend.cook().then((res) => {
          if (res.ok) {
            this.inventory = res.inventory;
            bus.emit('inventory', this.inventory);
            bus.emit('toast', t.toast.cookFish, 'good');
            this.sfx('craft', 0.5);
          }
        });
      },
    };
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

  // ------------------------------------------------------------ fog of war

  /**
   * The fog overlay: one RenderTexture pixel per tile, scaled up to cover
   * the World, sitting above every world sprite. Explored chunks are erased
   * with a feathered brush so the frontier fades instead of snapping.
   */
  private initFog(): void {
    this.fogRT = this.add.renderTexture(0, 0, MAP_W, MAP_H);
    this.fogRT.setOrigin(0, 0);
    this.fogRT.setScale(TILE);
    this.fogRT.setDepth(899_990);
    this.fogRT.fill(0x06120a, 0.96);
    this.fogRT.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    for (const c of this.me.explored) {
      if (c >= 0 && c < this.fogChunksW * this.fogChunksH) this.explored.add(c);
    }
    for (const c of this.explored) this.eraseFogChunk(c);
    bus.emit('fog', this.explored, this.fogChunksW, this.fogChunksH);
    this.updateFog();
  }

  private eraseFogChunk(idx: number): void {
    const cx = idx % this.fogChunksW;
    const cy = Math.floor(idx / this.fogChunksW);
    // the 24-tile brush centered on the chunk; overlapping erases keep the
    // interior fully clear while the frontier stays feathered
    this.fogRT.erase('fog-brush', (cx + 0.5) * FOG_CHUNK - 12, (cy + 0.5) * FOG_CHUNK - 12);
  }

  /** reveal chunks around the Player; new ones persist through the Backend */
  private updateFog(): void {
    const pcx = Math.floor(this.player.x / TILE / FOG_CHUNK);
    const pcy = Math.floor(this.player.y / TILE / FOG_CHUNK);
    const r = FOG_REVEAL_RADIUS;
    const fresh: number[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + 1) continue;
        const cx = pcx + dx;
        const cy = pcy + dy;
        if (cx < 0 || cy < 0 || cx >= this.fogChunksW || cy >= this.fogChunksH) continue;
        const idx = cy * this.fogChunksW + cx;
        if (this.explored.has(idx)) continue;
        this.explored.add(idx);
        this.eraseFogChunk(idx);
        fresh.push(idx);
      }
    }
    if (fresh.length) {
      void this.backend.markExplored(fresh);
      bus.emit('fog', this.explored, this.fogChunksW, this.fogChunksH);
    }
  }

  /** 0 = noon, 1 = midnight — derived from the real clock, no tick state */
  private nightness(): number {
    if (FORCE_NIGHT) return 1;
    const phase = (Date.now() % DAY_CYCLE_MS) / DAY_CYCLE_MS;
    return 1 - (0.5 + 0.5 * Math.cos(phase * Math.PI * 2));
  }

  private wireBus(): void {
    // v4: the HUD Loadout bar reports which single item is in-hand (keys 1–3)
    bus.on('held', (id: ItemId | null) => {
      this.heldItem = id;
      this.applyHeldSprite();
      // broadcast promptly so every other Player's in-hand item updates now
      this.backend.sendPosition(this.player.x, this.player.y, this.lastDir, false, this.heldItem ?? undefined);
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
    bus.on('toggle-mute', () => {
      this.muted = !this.muted;
      this.sound.mute = this.muted;
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
      bus.emit('mute', this.muted);
    });
    bus.on('set-volume', (channel: AudioChannel, value: number) => {
      this.volumes[channel] = Math.max(0, Math.min(1, value));
      localStorage.setItem(VOLUME_KEY, JSON.stringify(this.volumes));
      this.applyMusicVolumes();
    });
    bus.on('craft', (recipeId: string) => {
      void this.backend.craft(recipeId).then((result) => {
        if (result.ok) {
          this.inventory = result.inventory;
          bus.emit('inventory', this.inventory);
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
    bus.on('request-place', (item: StructureId) => this.enterPlaceMode(item));
    // crate storage / Sawmill ops requested by the HUD panels
    bus.on('crate-deposit', (crateId: string, item: ItemId, count: number) => {
      void this.backend.crateDeposit(crateId, item, count).then((res) => {
        if (!res.ok) return;
        this.inventory = res.inventory;
        bus.emit('inventory', this.inventory);
        bus.emit('crate-open', crateId, res.contents);
      });
    });
    bus.on('crate-withdraw', (crateId: string, item: ItemId, count: number) => {
      void this.backend.crateWithdraw(crateId, item, count).then((res) => {
        if (!res.ok) {
          if (res.reason === 'NOTHING') bus.emit('toast', t.toast.crateGone, 'bad');
          return;
        }
        this.inventory = res.inventory;
        bus.emit('inventory', this.inventory);
        bus.emit('crate-open', crateId, res.contents);
      });
    });
    bus.on('sawmill-deposit', (sawmillId: string) => {
      void this.backend.sawmillDeposit(sawmillId).then((res) => {
        if (!res.ok) {
          if (res.reason === 'NOTHING') bus.emit('toast', t.toast.millFullOrNoWood, 'bad');
          return;
        }
        this.inventory = res.inventory;
        bus.emit('inventory', this.inventory);
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
        this.inventory = res.inventory;
        bus.emit('inventory', this.inventory);
        bus.emit('sawmill-open', sawmillId, res.state);
        bus.emit('toast', t.toast.collectPlanks, 'good');
        this.sfx('harvest', 0.6);
      });
    });
    bus.on('eat', () => {
      void this.backend.eatCookedFish().then((res) => {
        if (!res.ok) return;
        this.inventory = res.inventory;
        bus.emit('inventory', this.inventory);
        this.buffUntil = Date.now() + res.buffMs;
        bus.emit('buff', this.buffUntil);
        bus.emit('toast', t.toast.warmHearty, 'good');
        this.sfx('munch', 0.6);
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
  private heldTool(): ToolId | undefined {
    const h = this.heldItem;
    return h && ITEMS[h].kind === 'tool' ? (h as ToolId) : undefined;
  }

  // ------------------------------------------------------------ nodes

  private nodeAlive(n: NodeState): boolean {
    if (n.hp > 0) return true;
    const t = NODE_TYPES[n.type];
    return n.harvestedAt !== null && Date.now() >= n.harvestedAt + t.regrowMs;
  }

  /** soft ground shadow — drawn in a low depth band above the floor, below all sprites */
  private addShadow(x: number, y: number, width: number): Phaser.GameObjects.Image {
    const sh = this.add.image(x, y, 'shadow');
    sh.setDisplaySize(width, width * 0.45);
    sh.setDepth(2);
    return sh;
  }

  /** create a depth-sorted image for an object kind (respects spritesheet frames) */
  private objImage(x: number, y: number, kind: string): Phaser.GameObjects.Image | null {
    if (!this.textures.exists(kind)) return null;
    const img = this.add.image(x, y, kind, OBJECTS[kind]?.frame);
    img.setOrigin(0.5, 1);
    img.setDepth(y);
    return img;
  }

  private setObjTexture(img: Phaser.GameObjects.Image, kind: string): void {
    if (this.textures.exists(kind)) img.setTexture(kind, OBJECTS[kind]?.frame);
  }

  /** show the Resource Node's name in a small tooltip while the cursor hovers it */
  private makeNodeHoverable(sprite: Phaser.GameObjects.Image, type: NodeState['type']): void {
    sprite.setInteractive();
    sprite.on('pointerover', () => {
      if (!this.nodeHoverLabel) {
        // same visual size as the remote-player name tags (fontSize 7, res 6,
        // scale 0.34) so hover text reads consistently across the World
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
          .setScale(0.34)
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
      sprite.setScale(0.9 + (h % 40) / 100);
      sprite.setFlipX(h % 2 === 0);
      this.addShadow(x, y - 1, 26 * sprite.scaleX);
    } else if (state.type === 'fruit_bush') {
      sprite.setFlipX(h % 2 === 0);
      this.addShadow(x, y - 1, 22);
    } else if (state.type === 'rock') {
      this.addShadow(x, y - 2, 16);
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
    const rect = this.add.rectangle((tx + 0.5) * TILE, (ty + 0.5) * TILE, TILE - 2, TILE - 4);
    rect.setVisible(false);
    this.blockersGroup.add(rect);
    return rect;
  }

  private updateNode(state: NodeState): void {
    const view = this.nodes.get(state.id);
    if (!view) return;
    view.state = state;
    const alive = state.hp > 0;
    if (alive === view.depletedShown) {
      // state flipped relative to what we show
      view.depletedShown = !alive;
      this.setObjTexture(view.sprite, alive ? state.type : `${state.type}_depleted`);
      if (view.body) (view.body.body as Phaser.Physics.Arcade.StaticBody).enable = alive;
    }
    if (!alive) {
      // depleting hit lands: little poof of scale
      this.tweens.add({ targets: view.sprite, scaleX: 1.15, scaleY: 0.9, duration: 80, yoyo: true });
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
        this.setObjTexture(view.sprite, view.state.type);
        if (view.body) (view.body.body as Phaser.Physics.Arcade.StaticBody).enable = true;
        this.tweens.add({ targets: view.sprite, scaleX: { from: 0.6, to: 1 }, scaleY: { from: 0.6, to: 1 }, duration: 250 });
      }
    }
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
    const special = this.contributeSealAction() ?? this.summonAction() ?? this.guardianAction();
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
                this.inventory = res.inventory;
                bus.emit('inventory', this.inventory);
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
                this.inventory = res.inventory;
                bus.emit('inventory', this.inventory);
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

    const cook = this.cookAction();
    if (cook) return cook;

    // functional Structures: crate storage, the Sawmill, signposts
    const st = this.nearbyStructure(['crate', 'sawmill', 'signpost']);
    if (st) {
      if (st.type === 'crate') return { swing: false, run: () => this.openCrate(st.id) };
      if (st.type === 'sawmill') return { swing: false, run: () => this.openSawmill(st.id) };
      return {
        swing: false,
        run: () => {
          bus.emit('lore', `🪧 ${st.placedBy} wrote:`, st.text?.trim() ? st.text : '(nothing is written here)');
          this.sfx('blip', 0.4);
        },
      };
    }

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
    if (!best) return null;
    const view = best;
    // fishing spots use the cast-and-wait rhythm when the rod is IN HAND;
    // without it the server refusal (TOOL_REQUIRED) falls through below
    if (view.state.type === 'fishing_spot' && this.heldItem === 'fishing_rod') {
      return { swing: false, run: () => this.startFishing(view) };
    }
    return { swing: true, run: () => this.swingAtNode(view) };
  }

  private swingAtNode(view: NodeView): void {
    this.tweens.add({ targets: view.sprite, angle: { from: -3, to: 3 }, duration: 60, yoyo: true, repeat: 1, onComplete: () => view.sprite.setAngle(0) });
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
        this.inventory = result.inventory;
        bus.emit('inventory', this.inventory);
      }
    });
  }

  // ------------------------------------------------------------ structures

  /** the first structure of one of `types` on the 3x3 of tiles around the Player */
  private nearbyStructure(types: StructureId[]): Structure | null {
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
      this.inventory = res.inventory;
      bus.emit('inventory', this.inventory);
      bus.emit('crate-open', crateId, res.contents);
      this.sfx('blip', 0.4);
    });
  }

  private openSawmill(sawmillId: string): void {
    void this.backend.sawmillOpen(sawmillId).then((res) => {
      if (!res.ok) return;
      this.inventory = res.inventory;
      bus.emit('inventory', this.inventory);
      bus.emit('sawmill-open', sawmillId, res.state);
      this.sfx('blip', 0.4);
    });
  }

  private addStructure(s: Structure): void {
    if (this.structureIds.has(s.id)) return;
    // defensive: a saved structure whose type is no longer known (e.g. the
    // retired fence) is skipped instead of crashing — future-proofs removals
    const def = ITEMS[s.type];
    if (!def) return;
    this.structureIds.add(s.id);
    this.structuresByTile.set(`${s.tx},${s.ty}`, s);
    const key = `st_${s.type}`;
    const x = (s.tx + 0.5) * TILE;
    const baseY = (s.ty + 1) * TILE;
    const img = this.objImage(x, baseY, key);
    if (!img) return;
    if (s.type === 'bridge' || s.type === 'obsidian_path') {
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
    }
    if (def.blocks) {
      this.addBlockerBody(s.tx, s.ty);
      this.addShadow(x, baseY - 1, s.type === 'hut_wall' ? 17 : 15);
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
    }[s.type as string];
    if (glowDef) {
      const glow = this.add
        .image(x, baseY - 8, 'glow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(s.type === 'golden_idol' ? 0xffe27a : 0xffab52)
        .setScale(glowDef.scale)
        .setAlpha(0)
        .setDepth(890_001);
      this.glows.push({ img: glow, base: glowDef.base, x, y: baseY });
    }
  }

  private enterPlaceMode(item: StructureId): void {
    if (this.inDelve) return; // no building inside the ephemeral Delve
    if ((this.inventory[item] ?? 0) <= 0) return;
    this.placing = item;
    this.ghost?.destroy();
    this.ghost = this.objImage(0, 0, `st_${item}`);
    this.ghost?.setAlpha(0.6).setDepth(99999);
    bus.emit('place-mode', true);
    bus.emit('toast', t.toast.placing(ITEMS[item].name), 'info');
  }

  private exitPlaceMode(): void {
    this.placing = null;
    this.ghost?.destroy();
    this.ghost = null;
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

  private canPlaceLocal(item: StructureId, tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    if (this.structuresByTile.has(`${tx},${ty}`)) return false;
    if (this.nodesByTile.has(`${tx},${ty}`)) return false;
    const b = this.world.blocked[ty * MAP_W + tx];
    return ITEMS[item].onWater ? b === 1 : b === 0;
  }

  private confirmPlace(): void {
    if (!this.placing) return;
    const { tx, ty } = this.facingTile();
    this.placeAtTile(this.placing, tx, ty);
  }

  /** place `item` on a specific tile — signposts prompt for their line first */
  private placeAtTile(item: StructureId, tx: number, ty: number): void {
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
      bus.emit('toast', ITEMS[item].onWater ? t.toast.bridgesOnWater : t.toast.cantBuildTile, 'bad');
      return;
    }
    this.placeAtTile(item, tx, ty);
  }

  private doPlace(item: StructureId, tx: number, ty: number, text?: string): void {
    void this.backend.placeStructure(item, tx, ty, text).then((result) => {
      if (result.ok) {
        this.inventory = result.inventory;
        bus.emit('inventory', this.inventory);
        bus.emit('toast', t.toast.placed(ITEMS[item].name), 'good');
        this.sfx('place', 0.6);
        this.useHint('place');
        if (item === 'campfire') this.tickJourney('place_campfire');
        if (item === 'hammock') bus.emit('toast', t.toast.hammockSet, 'info');
        this.exitPlaceMode();
      } else if (result.reason === 'OCCUPIED') {
        bus.emit('toast', t.toast.alreadyBuiltHere, 'bad');
      } else if (result.reason === 'INVALID') {
        bus.emit('toast', ITEMS[item].onWater ? t.toast.bridgesOnWater : t.toast.cantBuildTile, 'bad');
      } else {
        this.exitPlaceMode();
      }
    });
  }

  // ------------------------------------------------------------ remote players

  private upsertRemote(p: PlayerPos): void {
    if (p.name === this.me.name) return;
    const look = JSON.stringify(p.appearance);
    const texture = `avatar-${p.name}`;
    let r = this.remotes.get(p.name);
    if (!r) {
      ensureAvatarTexture(this, texture, p.appearance);
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
      // world-space text is magnified by camera ZOOM — scale it well down so the
      // name is a small tag over the head, not a billboard
      label.setScale(0.34);
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
      r = { sprite, label, shadow, heldSprite, torchGlow, held: null, targetX: p.x, targetY: p.y, dir: p.dir, moving: p.moving, look };
      this.remotes.set(p.name, r);
      this.emitPresence();
    } else if (r.look !== look) {
      // they re-joined with an edited Avatar — recompose their texture
      r.look = look;
      r.sprite.anims.stop();
      ensureAvatarTexture(this, texture, p.appearance);
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
  }

  private applyAnim(sprite: Phaser.GameObjects.Sprite, dir: Dir, moving: boolean): void {
    if (moving) {
      sprite.anims.play(`${sprite.texture.key}-walk-${dir}`, true);
    } else {
      sprite.anims.stop();
      sprite.setFrame(AVATAR_IDLE[dir]);
    }
  }

  // ------------------------------------------------------------ helpers

  private sfx(key: string, volume: number): void {
    if (this.cache.audio.exists(key)) {
      this.sound.play(key, { volume: volume * this.volumes.sfx * this.volumes.master });
    }
  }

  /** push the current mix onto the two live looping beds (SFX read it per-play) */
  private applyMusicVolumes(): void {
    const setVol = (s: Phaser.Sound.BaseSound | null, base: number, ch: AudioChannel) => {
      // BaseSound has no setVolume in its type; the concrete web/HTML5 sounds do
      (s as Phaser.Sound.WebAudioSound | null)?.setVolume?.(base * this.volumes[ch] * this.volumes.master);
    };
    setVol(this.ambientSound, AMBIENT_BASE_VOLUME, 'ambience');
    setVol(this.fightMusic, FIGHT_MUSIC_BASE_VOLUME, 'music');
  }

  private floatText(x: number, y: number, text: string, color: string, sizePx = 10): void {
    const t = this.add.text(x, y, text, { fontSize: `${sizePx}px`, color, stroke: '#000', strokeThickness: 3 });
    t.setOrigin(0.5, 1);
    t.setResolution(4);
    t.setDepth(999999);
    this.tweens.add({ targets: t, y: y - 18, alpha: { from: 1, to: 0 }, duration: 1200, onComplete: () => t.destroy() });
  }

  private checkZone(): void {
    if (this.inDelve) return; // the Delve owns the zone banner while you're inside
    bus.emit('pos', {
      x: this.player.x,
      y: this.player.y,
      others: [...this.remotes.values()].map((r) => ({ x: r.sprite.x, y: r.sprite.y })),
    });
    const tx = this.player.x / TILE;
    const ty = this.player.y / TILE;
    let zone = 'Deep Jungle';
    for (const z of this.world.zones) {
      if (tx >= z.x && tx < z.x + z.w && ty >= z.y && ty < z.y + z.h) {
        zone = z.name;
        break;
      }
    }
    if (zone !== this.currentZone) {
      this.currentZone = zone;
      bus.emit('zone', zone);
    }
    this.leavesActive = zone === 'Dense Grove' || zone === 'Hidden Grove' || zone === 'Deep Jungle';
    // the Seal monument shows its progress on approach
    const nearMon =
      Phaser.Math.Distance.Between(this.player.x, this.player.y, this.monumentPos.x, this.monumentPos.y) < TILE * 6;
    if (nearMon !== this.nearMonument) {
      this.nearMonument = nearMon;
      bus.emit('seal-near', nearMon);
      if (nearMon) this.tickJourney('visit_seal');
    }
    this.updateFog();
    this.updateHints();
  }

  // ------------------------------------------------------------ update

  // ============================================================ Dungeons v1: the Delve (ADR-0007)

  /** is the mine shaft open? (the persisted world flag, or the ?dungeon dev bypass) */
  private delveOpenNow(): boolean {
    return this.delveForceOpen || !!this.quest?.delveOpen;
  }

  /** the sealed mine-shaft entrance in the World, a few tiles south of the arena */
  private buildDelveEntrance(): void {
    // the sealed mine shaft sits in the South Quarry — a rocky dig, fitting for a
    // mine, and a trek from the Ruins where the Ancient Pickaxe is earned
    const tx = 48;
    const ty = 128;
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
    const me = this.me.name;
    const roster = [me];
    for (const [name, r] of this.remotes) {
      if (Phaser.Math.Distance.Between(r.sprite.x, r.sprite.y, this.delveEntrance.x, this.delveEntrance.y) < TILE * 6) roster.push(name);
    }
    const runId = `${me}:${Date.now()}`;
    this.isDelveHost = true;
    this.delveHostName = me;
    this.delveRoster = roster;
    this.delveHeadcount = Math.max(1, roster.length);
    this.backend.sendDungeon({ t: 'start', runId, host: me, heads: this.delveHeadcount, roster });
    this.spawnDelveMobs();
    this.beginDelve(runId);
    bus.emit('toast', roster.length > 1 ? t.toast.descendWithOthers(roster.length - 1) : t.toast.descendAlone, 'info');
  }

  /** host: build the authoritative mob roster (HP lives ONLY here — never the DB) */
  private spawnDelveMobs(): void {
    this.mobs.clear();
    for (const s of planDelveSpawns(this.delveHeadcount, Math.random)) {
      const id = `m${this.nextMobId++}`;
      this.mobs.set(id, createMob(id, s, this.delveHeadcount));
    }
    this.delveKills = 0;
    this.delveParticipants.clear();
  }

  /** a party-mate's client announced a run — join it if I'm rostered and at the shaft */
  private onDelveStart(msg: Extract<DungeonMsg, { t: 'start' }>): void {
    if (this.inDelve || msg.host === this.me.name) return;
    if (!msg.roster.includes(this.me.name)) return;
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, this.delveEntrance.x, this.delveEntrance.y) > TILE * 8) return;
    this.isDelveHost = false;
    this.delveHostName = msg.host;
    this.delveRoster = msg.roster;
    this.delveHeadcount = msg.heads;
    this.mobs.clear(); // a guest renders mobs from the host's snapshots
    this.beginDelve(msg.runId);
    this.backend.sendDungeon({ t: 'join', runId: msg.runId, name: this.me.name });
    bus.emit('toast', t.toast.followInto(msg.host), 'info');
  }

  /** shared entry: reset run state, build the interior, swap collision, teleport in */
  private beginDelve(runId: string): void {
    this.inDelve = true;
    this.delveRunId = runId;
    this.delveKnockdowns = 0;
    this.delveExhausted = false;
    this.delveHitLanded = false;
    this.delveExhaustedRun = null;
    this.projectiles = [];
    this.rubbleHits = 0;
    this.stunnedUntil = 0;
    if (this.placing) this.exitPlaceMode();
    this.buildDelveInterior();
    for (const c of this.worldColliders) c.active = false;
    if (this.delveWallCollider) this.delveWallCollider.active = true;
    this.player.setPosition((DELVE_ENTRY.tx + 0.5) * TILE, (DELVE_ENTRY.ty + 0.5) * TILE);
    this.player.setVelocity(0, 0);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, DELVE_W * TILE, DELVE_H * TILE);
    cam.flash(400, 3, 5, 9);
    bus.emit('zone', 'The Delve');
  }

  /** the interior render (a high-depth overlay hiding the World) + collision */
  private buildDelveInterior(): void {
    this.delveBackdrop = this.add.rectangle(0, 0, 10, 10, 0x07090c).setDepth(DELVE_DEPTH_BG);
    this.buildDelveFloor();
    const ex = (DELVE_ENTRY.tx + 0.5) * TILE;
    const ey = (DELVE_ENTRY.ty + 0.5) * TILE;
    const exit = this.add
      .text(ex, ey - TILE, t.delve.leave, { fontSize: '8px', color: '#9fe0a0', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5)
      .setResolution(4)
      .setDepth(DELVE_DEPTH_FLOOR + 3);
    this.delveObjects.push(exit);
    // static bodies for wall tiles bordering floor, PLUS blocking cover props —
    // the player physics-collides with both; mobs + projectiles use isDelveBlocked
    this.delveWalls = this.physics.add.staticGroup();
    for (let ty = 0; ty < DELVE_H; ty++) {
      for (let tx = 0; tx < DELVE_W; tx++) {
        if (!isDelveWall(tx, ty)) continue;
        let border = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (!isDelveWall(tx + dx, ty + dy)) {
            border = true;
            break;
          }
        }
        if (!border) continue;
        const body = this.add.rectangle((tx + 0.5) * TILE, (ty + 0.5) * TILE, TILE, TILE).setVisible(false);
        this.delveWalls.add(body);
      }
    }
    for (const p of DELVE_PROPS) {
      if (!PROP_BLOCKS[p.kind]) continue;
      const body = this.add.rectangle((p.tx + 0.5) * TILE, (p.ty + 0.5) * TILE, TILE - 2, TILE - 2).setVisible(false);
      this.delveWalls.add(body);
    }
    this.delveWallCollider = this.physics.add.collider(this.player, this.delveWalls);
    this.buildDelveProps();
  }

  /** per-room textured stone floors (mine → ruins ramp) — kills the flat fill */
  private buildDelveFloor(): void {
    const F = {
      base: '#2a2620', toneA: '#221f1a', toneB: '#302b24', toneC: '#241f18',
      stain: '#1b1813', scuff: '#37312a', speckle: '#17140f',
      ruinTint: '#282430', ruinToneA: '#221f2a', ruinToneB: '#2f2a38',
      edgeMine: '#1e1a15', edgeRuin: '#1c1922',
    };
    for (const r of [...DELVE_ROOMS, ...DELVE_CORRIDORS]) {
      const ruins = r.x >= RUINS_FROM_X;
      const ramp = ruins ? [F.ruinToneA, F.ruinTint, F.ruinToneB, F.toneC] : [F.toneA, F.base, F.toneB, F.toneC];
      const edge = ruins ? F.edgeRuin : F.edgeMine;
      const key = `delveFloor_${r.x}_${r.y}`;
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
            c.fillStyle = F.stain;
            c.fillRect(lx, ly, TILE, TILE);
          } else if (m < 13) {
            c.fillStyle = F.scuff;
            c.fillRect(lx, ly, TILE, TILE);
          }
          c.fillStyle = edge; // wall-cast edge shade (recessed look)
          if (isDelveWall(tx, ty - 1)) c.fillRect(lx, ly, TILE, 3);
          if (isDelveWall(tx, ty + 1)) c.fillRect(lx, ly + TILE - 3, TILE, 3);
          if (isDelveWall(tx - 1, ty)) c.fillRect(lx, ly, 3, TILE);
          if (isDelveWall(tx + 1, ty)) c.fillRect(lx + TILE - 3, ly, 3, TILE);
          if (h2 % 10 < 3) {
            const spine = ty === 10 || ty === 11; // keep the walking lane clean
            c.fillStyle = F.speckle;
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
    for (const p of DELVE_PROPS) {
      const flat = PROP_FLAT[p.kind];
      const px = (p.tx + 0.5) * TILE;
      const py = flat ? (p.ty + 0.5) * TILE : (p.ty + 1) * TILE; // upright props stand on the tile
      const img = this.add.image(px, py, PROP_TEX[p.kind]).setOrigin(0.5, flat ? 0.5 : 1);
      img.setDepth(flat ? DELVE_DEPTH_FLOOR + 1 : DELVE_DEPTH_ENTITY + py);
      this.delveObjects.push(img);
      const light = PROP_LIGHT[p.kind];
      if (light) this.addDelveLight((p.tx + 0.5) * TILE, (p.ty + 0.5) * TILE - (flat ? 0 : TILE * 0.4), light.color, light.scale, light.alpha, light.flicker);
    }
    for (const l of DELVE_LIGHTS) this.addDelveLight((l.tx + 0.5) * TILE, (l.ty + 0.5) * TILE, l.color, l.scale, l.alpha, false);
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
    for (const o of this.delveObjects) o.destroy();
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
    for (const a of this.projViews.values()) a.destroy();
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

  /** tear down the instance and return to the World entrance (broadcasts are at call sites) */
  private leaveDelve(): void {
    if (!this.inDelve) return;
    this.inDelve = false;
    this.delveRunId = null;
    this.isDelveHost = false;
    this.delveHostName = '';
    this.teardownDelve();
    for (const c of this.worldColliders) c.active = true;
    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    cam.flash(300, 6, 8, 12);
    this.player.setPosition((this.delveEntrance.tx + 0.5) * TILE, (this.delveEntrance.ty + 1.5) * TILE);
    this.player.setVelocity(0, 0);
    this.stunnedUntil = 0;
    this.delveExhausted = false;
    bus.emit('zone', this.currentZone || 'Ancient Ruins');
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

  /** host: the Deep Guardian fell — grant participation loot and complete the run */
  private completeDelveRun(): void {
    const shards = this.delveKills * SHARD_PER_KILL;
    const loot: Inventory = {};
    if (shards > 0) loot[HUSK_SHARD] = shards;
    loot[DEEP_CORE] = DEEP_CORE_DROP;
    if (this.delveRunId) this.backend.sendDungeon({ t: 'end', runId: this.delveRunId, reason: 'victory', loot });
    this.cameras.main.flash(600, 120, 90, 255);
    this.grantDelveLootIfEligible(loot, this.delveHitLanded);
    this.leaveDelve();
  }

  /** each client claims its OWN loot iff it landed ≥1 hit — the run's only DB write */
  private grantDelveLootIfEligible(loot: Inventory, eligible: boolean): void {
    if (!eligible) {
      bus.emit('toast', t.toast.delveClearedNoHit, 'info');
      return;
    }
    void this.backend.claimDelveLoot(loot).then((res) => {
      this.inventory = res.inventory;
      bus.emit('inventory', this.inventory);
      const parts = Object.entries(loot)
        .filter(([, n]) => (n as number) > 0)
        .map(([k, n]) => `+${n} ${ITEMS[k as ItemId]?.name ?? k}`)
        .join('  ');
      bus.emit('toast', t.toast.deepGuardianFalls(parts), 'good');
      this.sfx('craft', 0.8);
    });
  }

  /** inside the Delve, E means leave (at the entrance) or strike the nearest mob in reach */
  private delveEAction(px: number, py: number): EAction | null {
    void px;
    void py;
    const ex = (DELVE_ENTRY.tx + 0.5) * TILE;
    const ey = (DELVE_ENTRY.ty + 0.5) * TILE;
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, ex, ey) < INTERACT_RANGE) {
      return { swing: false, run: () => this.leaveDelveManual() };
    }
    if (this.delveExhausted) return null;
    const reach = this.heldItem === 'bow' ? 6 : 1.7; // the Bow strikes mobs from range
    const ptx = this.player.x / TILE;
    const pty = (this.player.y - 4) / TILE;
    let best: MobState | null = null;
    let bd = reach;
    for (const m of this.mobs.values()) {
      if (m.st === 'dead') continue;
      const d = Math.hypot(m.x - ptx, m.y - pty) - MOB_PROFILES[m.kind].radius;
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    if (!best) return null;
    const target = best;
    return { swing: true, cadenceMs: weaponCombat(this.heldTool()).attackMs, run: () => this.delveSwing(target) };
  }

  private delveSwing(m: MobState): void {
    const tool = this.heldTool();
    this.sfx(tool === 'bow' ? 'blip' : 'chop', 0.5);
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
    const roll = applyMobHit(m, tool, Math.random);
    this.delveParticipants.add(by);
    if (by === this.me.name) this.delveHitLanded = true;
    const fx = m.x * TILE + Phaser.Math.Between(-6, 6);
    const fy = m.y * TILE - MOB_PROFILES[m.kind].radius * TILE - 8;
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
    return Math.hypot(m.x - x, m.y - y) <= 7 + MOB_PROFILES[m.kind].radius;
  }

  private onMobFelled(m: MobState): void {
    this.sfx('harvest', 0.5);
    if (m.kind === 'boss') {
      this.completeDelveRun();
    } else {
      this.delveKills++;
      this.mobs.delete(m.id);
    }
  }

  /** my 3rd knockdown: Exhaustion — out of the run; a host leaving ends it for all (v1) */
  private exitDelveExhausted(): void {
    this.delveExhausted = true;
    if (this.isDelveHost) {
      bus.emit('toast', t.toast.exhaustionDelveHost, 'bad');
      if (this.delveRunId) this.backend.sendDungeon({ t: 'end', runId: this.delveRunId, reason: 'hostleft' });
      this.leaveDelve();
    } else {
      bus.emit('toast', t.toast.exhaustionDelveYou, 'bad');
      if (this.delveRunId) {
        this.backend.sendDungeon({ t: 'down', runId: this.delveRunId, name: this.me.name, out: true });
        if (this.delveHitLanded) this.delveExhaustedRun = this.delveRunId;
      }
      this.leaveDelve();
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
    else bus.emit('toast', t.toast.knockedInDelve(this.delveKnockdowns, EXHAUSTION_KNOCKDOWNS), 'bad');
  }

  /** alive player positions the host AI steers toward (tile units) */
  private delveTargets(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    if (!this.delveExhausted) out.push({ x: this.player.x / TILE, y: (this.player.y - 4) / TILE });
    for (const pv of this.delvePeers.values()) out.push({ x: pv.x / TILE, y: pv.y / TILE });
    return out;
  }

  /** the whole Delve frame: dark ambiance, movement, host sim, render, combat, netcode */
  private updateDelve(time: number, delta: number): void {
    const dt = delta / 1000;
    const cam = this.cameras.main;
    if (this.delveBackdrop) this.delveBackdrop.setPosition(cam.midPoint.x, cam.midPoint.y).setSize(cam.displayWidth + 8, cam.displayHeight + 8);
    this.nightOverlay.setAlpha(0);
    this.duskOverlay.setAlpha(0);
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
      const speed = PLAYER_SPEED * (Date.now() < this.buffUntil ? SPEED_BUFF_FACTOR : 1);
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

    // E: strike / leave (same cadence discipline as the World swing loop)
    if (!this.chatFocused && !stunned) {
      const ePressed = Phaser.Input.Keyboard.JustDown(this.keys.e);
      if (ePressed || this.keys.e.isDown) {
        const now = Date.now();
        if (ePressed || now - this.lastSwingAt >= SWING_CADENCE_MS) {
          const action = this.resolveEAction();
          if (action?.swing) {
            const cad = action.cadenceMs ?? SWING_CADENCE_MS;
            if (now - this.lastSwingAt >= cad) {
              this.lastSwingAt = now;
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
    const targets = this.delveTargets();
    // mobs treat cover props as walls too — so a Grasp Husk rounds a pillar
    const ctx = { targets, isWall: (tx: number, ty: number) => isDelveBlocked(tx, ty), dt: delta, rng: Math.random };
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
    void m;
  }

  private stepProjectiles(dt: number): void {
    this.projectiles = this.projectiles.filter((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 1000;
      // a Spit Husk's shot dies on a wall OR a cover prop — pillars are real cover
      return p.life > 0 && !isDelveBlocked(Math.floor(p.x), Math.floor(p.y));
    });
  }

  /** draw mobs (body, telegraph, HP bar) + projectiles from this.mobs / this.projectiles */
  private renderDelve(time: number): void {
    const seen = new Set<string>();
    for (const m of this.mobs.values()) {
      if (m.st === 'dead') continue;
      seen.add(m.id);
      const prof = MOB_PROFILES[m.kind];
      const rpx = prof.radius * TILE;
      const fh = MOB_FRAME[m.kind].h;
      const barW = Math.max(rpx * 2, MOB_FRAME[m.kind].w * 0.8);
      let v = this.mobViews.get(m.id);
      if (!v) {
        const sprite = this.add.sprite(0, 0, MOB_TEX[m.kind], 0).setOrigin(0.5, 0.78);
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
      // snap to the telegraph pose during a wind-up, else play the idle heave
      const idleKey = `${MOB_TEX[m.kind]}-idle`;
      if (m.st === 'windup' || m.st === 'aim') {
        if (v.sprite.anims.isPlaying) v.sprite.anims.stop();
        v.sprite.setFrame(2);
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
      if (m.st === 'windup') {
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
    }
    for (const [id, v] of this.mobViews) {
      if (seen.has(id)) continue;
      v.sprite.destroy();
      v.shadow.destroy();
      v.tele.destroy();
      v.bar.destroy();
      this.mobViews.delete(id);
    }
    const seenP = new Set<string>();
    for (const p of this.projectiles) {
      seenP.add(p.id);
      let a = this.projViews.get(p.id);
      if (!a) {
        a = this.add.circle(0, 0, Math.max(3, p.r * TILE), 0xffcc44).setStrokeStyle(1, 0x3a2a08);
        this.projViews.set(p.id, a);
        this.delveObjects.push(a);
      }
      a.setPosition(p.x * TILE, p.y * TILE).setDepth(DELVE_DEPTH_PROJ);
    }
    for (const [id, a] of this.projViews) {
      if (seenP.has(id)) continue;
      a.destroy();
      this.projViews.delete(id);
    }
  }

  /** each client checks its OWN player against live danger — melee strike zones + projectiles */
  private checkDelveHarm(): void {
    const ptx = this.player.x / TILE;
    const pty = (this.player.y - 4) / TILE;
    for (const m of this.mobs.values()) {
      if (m.st !== 'strike') continue;
      const r = MOB_PROFILES[m.kind].strikeR;
      if (Math.hypot(m.x - ptx, m.y - pty) <= r + 0.35) {
        this.delveKnockdown(m.x, m.y);
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
      mobs.push({ id: m.id, kind: m.kind, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp, st: m.st, ax: m.ax, ay: m.ay, phase: m.phase });
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
        m = { id: s.id, kind, x: s.x, y: s.y, hp: s.hp, maxHp: s.maxHp, st: s.st as MobState['st'], t: 0, face: 0, ax: s.ax, ay: s.ay, phase: s.phase };
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
      }
      m.face = Math.atan2(s.ay - s.y, s.ax - s.x);
    }
    for (const id of [...this.mobs.keys()]) if (!alive.has(id)) this.mobs.delete(id);
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
    if (msg.reason === 'victory' && msg.loot) {
      this.grantDelveLootIfEligible(msg.loot, active ? this.delveHitLanded : true);
    } else if (active) {
      bus.emit('toast', msg.reason === 'hostleft' ? t.toast.hostLeftCollapse : t.toast.partyOverwhelmed, 'bad');
    }
    this.delveExhaustedRun = null;
    if (active) this.leaveDelve();
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

  update(time: number, delta: number): void {
    if (!this.player) return;
    const dt = delta / 1000;

    // the Delve is a self-contained mode: its own dark ambiance, movement,
    // host mob sim, combat and camera — none of the World systems below run
    if (this.inDelve) {
      this.updateDelve(time, delta);
      return;
    }

    // atmosphere: day/night tint, light glows, fireflies, leaves
    const cam = this.cameras.main;
    const night = this.nightness();
    this.nightOverlay
      .setPosition(cam.midPoint.x, cam.midPoint.y)
      .setSize(cam.displayWidth + 8, cam.displayHeight + 8)
      .setAlpha(Math.pow(night, 1.6) * 0.5);
    this.duskOverlay
      .setPosition(cam.midPoint.x, cam.midPoint.y)
      .setSize(cam.displayWidth + 8, cam.displayHeight + 8)
      .setAlpha(Math.max(0, 1 - Math.abs(night - 0.5) * 4) * 0.12);
    // v4: light follows only a held Hand Torch (warm orange, dim like a flame)
    this.torchGlow
      .setPosition(this.player.x, this.player.y - 8)
      .setAlpha(this.heldItem === 'hand_torch' ? 0.1 + night * 0.35 : 0);
    positionHeld(this.heldSprite, this.player.x, this.player.y, this.lastDir);
    this.playerShadow.setPosition(this.player.x, this.player.y - 1);
    for (let i = 0; i < this.glows.length; i++) {
      const g = this.glows[i];
      g.img.setAlpha(night * (g.base + 0.12 * Math.sin(time / 90 + i * 2.1)));
    }
    if (night > 0.5 && time - this.lastFireflyAt > 260) {
      this.lastFireflyAt = time;
      const v = cam.worldView;
      this.fireflies.emitParticleAt(v.x + Math.random() * v.width, v.y + Math.random() * v.height);
    }
    if (this.leavesActive && time - this.lastLeafAt > 320) {
      this.lastLeafAt = time;
      const v = cam.worldView;
      this.leaves.emitParticleAt(v.x + Math.random() * v.width, v.y - 6);
    }

    // remote interpolation
    for (const r of this.remotes.values()) {
      const k = Math.min(1, dt * 12);
      r.sprite.x += (r.targetX - r.sprite.x) * k;
      r.sprite.y += (r.targetY - r.sprite.y) * k;
      r.sprite.setDepth(r.sprite.y);
      r.shadow.setPosition(r.sprite.x, r.sprite.y - 1);
      r.label.setPosition(r.sprite.x, r.sprite.y - AVATAR_H - 2);
      r.label.setDepth(r.sprite.y + 1);
      positionHeld(r.heldSprite, r.sprite.x, r.sprite.y, r.dir);
      r.torchGlow
        .setPosition(r.sprite.x, r.sprite.y - 8)
        .setAlpha(r.held === 'hand_torch' ? 0.1 + night * 0.35 : 0);
      const visuallyMoving = r.moving || Math.hypot(r.targetX - r.sprite.x, r.targetY - r.sprite.y) > 2;
      this.applyAnim(r.sprite, r.dir, visuallyMoving);
    }

    // ---- v2/v3/v5: the Guardian fight — the danger schedule derives from
    // engagedAt (the first strike). A DORMANT Guardian (engagedAt null) roams
    // harmlessly at home: no waves, no Eye, arena open — nothing to drive here.
    if (this.fight && this.fight.engagedAt !== null) {
      const elapsed = Date.now() - this.fight.engagedAt;
      if (elapsed >= GUARDIAN_AWAKE_MS) {
        // every client derives the timer's end locally; the backend event follows
        this.endFight('slumber');
      } else {
        // fury phases at fixed elapsed-time thresholds — every client hits
        // the same transition at the same schedule position
        const phase = furyPhaseAt(elapsed, GUARDIAN_AWAKE_MS);
        if (phase.index !== this.furyIndex) {
          this.furyIndex = phase.index;
          this.guardianGlow.setTint(FURY_TINTS[phase.index]);
          this.sfx('roar', 0.8);
          this.cameras.main.shake(600, 0.008);
          bus.emit(
            'toast',
            phase.index === 1 ? 'The Guardian grows restless — the runes burn hotter!' : 'FURY — the runes blaze red!',
            'bad',
          );
        }
        const wave = waveInfoAt(elapsed, GUARDIAN_AWAKE_MS);
        if (wave.index !== this.renderedWave) {
          this.renderedWave = wave.index;
          this.renderWave(wave);
        }
        if (wave.msIntoWave < wave.phase.telegraphMs) {
          // telegraph pulse rises toward the slam / crash
          const pulse = 0.14 + (wave.msIntoWave / wave.phase.telegraphMs) * 0.22 + 0.06 * Math.sin(time / 60);
          const color = wave.kind === 'lunge' ? 0xffa02f : 0xff3322;
          for (const r of this.dangerRects) r.setFillStyle(color, pulse);
        } else if (this.slammedWave !== wave.index) {
          this.slamWave(wave);
        }
        // the authored melee danger-ring (hot during the wind-up of slam waves)
        this.updateMeleeRing(elapsed, wave, time);

        // scripted position: wave 0 leaps to the entrance (Ward slam), later
        // waves telegraph lunges to pre-determined spots
        const pose = guardianPoseAt(elapsed, GUARDIAN_AWAKE_MS, this.guardianHomeSpot, this.entranceSpot);
        // collision follows the Guardian's ground footprint; while airborne it has
        // none, so the whole arena (incl. the tiles it just left) opens up
        if (pose.airborne) this.setGuardianBlockersEnabled(false);
        else {
          this.positionGuardianBlockers(pose.spot);
          this.setGuardianBlockersEnabled(true);
        }
        this.guardianEyeGlow.setAlpha(0);
        if (pose.airborne && pose.target) {
          const a = this.world.arena;
          const fx = (a.x + pose.spot.ax + 0.5) * TILE;
          const fy = (a.y + pose.spot.ay + 2) * TILE;
          const tx2 = (a.x + pose.target.ax + 0.5) * TILE;
          const ty2 = (a.y + pose.target.ay + 2) * TILE;
          const t = pose.leapT;
          const arc = Math.sin(t * Math.PI) * 56;
          this.guardianSprite.anims.stop();
          this.guardianSprite.setFrame(6);
          const gx = fx + (tx2 - fx) * t;
          const gy = fy + (ty2 - fy) * t;
          this.guardianSprite.setPosition(gx, gy - arc);
          this.guardianSprite.setDepth(gy);
          this.guardianShadow.setPosition(gx, gy - 2).setAlpha(0.45);
          this.guardianGlow.setPosition(gx, gy - arc - 45);
          this.guardianEyeGlow.setPosition(gx, gy - arc - 61);
        } else {
          this.placeGuardian(pose.spot, 0);
          if (pose.windup) {
            this.guardianSprite.anims.stop();
            this.guardianSprite.setFrame(5);
          } else if (wave.kind === 'lunge' && wave.msIntoWave >= wave.phase.telegraphMs && this.landedWave !== wave.index) {
            // the crash-down moment
            this.landedWave = wave.index;
            this.guardianSprite.anims.stop();
            this.guardianSprite.setFrame(7);
          } else if (this.landedWave === wave.index && wave.msIntoWave < wave.phase.telegraphMs + 500) {
            // hold the landing pose for a beat
          } else {
            // Eye Window: the amber eye opens right after each slam
            const eyeOpen = eyeOpenAt(elapsed, GUARDIAN_AWAKE_MS);
            if (eyeOpen !== this.eyeOpenShown) {
              this.eyeOpenShown = eyeOpen;
              if (eyeOpen) this.sfx('blip', 0.5);
            }
            const want = eyeOpen ? 'guardian-eye' : 'guardian-idle';
            if (this.guardianSprite.anims.currentAnim?.key !== want || !this.guardianSprite.anims.isPlaying) {
              this.guardianSprite.anims.play(want, true);
            }
            this.guardianEyeGlow.setAlpha(eyeOpen ? 0.5 + 0.18 * Math.sin(time / 70) : 0);
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

    // ---- v2: fishing — bite arrives, window opens, then it gets away
    if (this.fishing) {
      const f = this.fishing;
      const now = Date.now();
      if (!f.bit && now >= f.biteAt) {
        f.bit = true;
        f.until = now + 900;
        f.marker = this.add
          .text(f.x, f.y - 14, '!', { fontSize: '12px', color: '#ffd166', stroke: '#000', strokeThickness: 3 })
          .setOrigin(0.5)
          .setResolution(4)
          .setDepth(999_999);
        this.sfx('blip', 0.6);
      } else if (f.bit && now > f.until) {
        this.cancelFishing('It got away...');
      }
    }

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
    const speed = PLAYER_SPEED * (Date.now() < this.buffUntil ? SPEED_BUFF_FACTOR : 1);
    this.player.setVelocity(vx * speed, vy * speed);
    const moving = vx !== 0 || vy !== 0;
    if (moving) {
      this.lastDir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : vy > 0 ? 'down' : 'up';
      if (this.fishing) this.cancelFishing('You step away — the line goes slack.');
    }
    this.applyAnim(this.player, this.lastDir, moving);
    this.player.setDepth(this.player.y);

    if (time - this.lastPosSent > 100) {
      this.lastPosSent = time;
      this.backend.sendPosition(this.player.x, this.player.y, this.lastDir, moving, this.heldItem ?? undefined);
    }

    // placement ghost
    if (this.placing && this.ghost) {
      const { tx, ty } = this.facingTile();
      this.ghost.setPosition((tx + 0.5) * TILE, (ty + 1) * TILE);
      this.ghost.setTint(this.canPlaceLocal(this.placing, tx, ty) ? 0x88ff88 : 0xff6666);
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
    if (this.placing) {
      if (ePressed) this.confirmPlace();
    } else if (this.fishing) {
      if (ePressed) this.reelIn();
    } else if (ePressed || this.keys.e.isDown) {
      const now = Date.now();
      // resolve at the base cadence; a per-action cadence (the Bow's slower
      // fire) then further gates the swing so bow < melee DPS
      const minReady = now - this.lastSwingAt >= SWING_CADENCE_MS;
      if (ePressed || minReady) {
        const action = this.resolveEAction();
        if (action?.swing) {
          const cadence = action.cadenceMs ?? SWING_CADENCE_MS;
          if (now - this.lastSwingAt >= cadence) {
            this.lastSwingAt = now;
            action.run();
          }
        } else if (action && ePressed) {
          action.run();
        }
      }
    }
  }
}
