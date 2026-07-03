import Phaser from 'phaser';
import { OBJECTS, TILESET } from '../assetConfig';
import { AVATAR_H, AVATAR_IDLE, AVATAR_W, ensureAvatarTexture } from '../avatars';
import type {
  Backend,
  ChatMsg,
  Dir,
  FightState,
  Inventory,
  JoinResult,
  JourneyState,
  JourneyStepId,
  NodeState,
  PlayerPos,
  QuestState,
  SealState,
  Structure,
} from '../backend/types';
import { hintRetired, journeyComplete, type HintId } from '../content/journey';
import {
  BOW_CADENCE_MS,
  DAY_CYCLE_MS,
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
  LUNGE_ZONE,
  lungeTarget,
  waveInfoAt,
  waveTiles,
  type ArenaSpot,
  type WaveInfo,
} from '../content/guardian';
import { ITEMS, type ItemId, type StructureId, type ToolId } from '../content/items';
import { TABLETS } from '../content/lore';
import { NODE_TYPES } from '../content/nodeTypes';
import { bus } from '../ui/bus';
import { showIntro } from '../ui/intro';

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
  private renderedWave = -1;
  private slammedWave = -1;
  private landedWave = -1;
  private furyIndex = -1;
  private eyeOpenShown = false;
  private stunnedUntil = 0;
  private stunMarker: Phaser.GameObjects.Text | null = null;
  private fightMusic: Phaser.Sound.BaseSound | null = null;
  /** v5: the Ward — a fresh barrier slammed across the entrance for the fight */
  private wardParts: { sprite: Phaser.GameObjects.Image; body: Phaser.GameObjects.Rectangle }[] = [];
  /** arena-local center of the entrance (the sealGate) — the wave-0 Ward-slam spot */
  private entranceSpot: ArenaSpot = { ax: 0, ay: 0 };
  /** set once this Player is knocked out (3 knockdowns) — the Ward then bars re-entry */
  private exhaustedThisFight = false;
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
    this.physics.add.collider(this.player, this.groundLayer);
    this.physics.add.collider(this.player, this.blockersGroup);

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
      if (s.placedBy !== this.me.name) bus.emit('toast', `${s.placedBy} built a ${ITEMS[s.type].name}`, 'info');
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
    bus.emit('toast', '⚡ The Seal is broken — the arena stands open, forever!', 'good');
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
      this.floatText(this.guardianSprite.x, this.guardianSprite.y - 100, 'The Guardian is bested!', '#ffd166');
      bus.emit('toast', '🏆 The Guardian sinks into slumber — every fighter earns its Scales!', 'good');
    } else {
      this.sfx('roar', 0.35);
      bus.emit('toast', 'The Guardian returns to slumber, unbeaten. The totem is spent.', 'bad');
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
    this.stunnedUntil = Date.now() + KNOCKDOWN_STUN_MS;
    this.player.setVelocity(0, 0);
    this.stunMarker?.destroy();
    this.stunMarker = this.add
      .text(this.player.x, this.player.y - AVATAR_H - 6, '💫', { fontSize: '10px' })
      .setOrigin(0.5)
      .setResolution(4)
      .setDepth(999_999);
    void this.backend.reportKnockdown(ptx, pty).then((res) => {
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
            ? 'Exhaustion overtakes you — out for this fight, waking in your Hammock. Prior hits still count.'
            : 'Exhaustion overtakes you — out for this fight, waking at the spawn. Prior hits still count.',
          'bad',
        );
        this.cameras.main.fadeOut(400, 0, 0, 0);
        this.time.delayedCall(450, () => {
          this.player.setPosition((res.wake.tx + 0.5) * TILE, (res.wake.ty + 0.5) * TILE);
          this.stunnedUntil = 0;
          this.cameras.main.fadeIn(500, 0, 0, 0);
        });
      } else {
        bus.emit('toast', `Knocked down! (${res.knockdowns}/3 — the third means Exhaustion)`, 'bad');
      }
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
          run: () => bus.emit('toast', 'The Guardian slumbers. Lay a Summoning Totem upon the altar to wake it.', 'info'),
        };
      }
      return null; // sealed away — nothing to interact with yet
    }
    // the Bow looses from range on a slower cadence; melee closes and swings fast
    if (bow) return { swing: true, cadenceMs: BOW_CADENCE_MS, run: () => this.looseArrow() };
    return { swing: true, run: () => this.swingAtGuardian() };
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
      this.floatText(x + Phaser.Math.Between(-10, 10), y, 'clang', '#9aa0a8');
    }
    void this.backend.hitGuardian(tool).then((res) => {
      if (!res.ok) return;
      this.inventory = res.inventory;
      bus.emit('inventory', this.inventory);
      if (res.deflected || res.victory) return;
      this.floatText(this.guardianSprite.x, this.guardianSprite.y - 100, `${res.hp}`, '#ff8866');
    });
  }

  private summonAction(): EAction | null {
    const d = Phaser.Math.Distance.Between(this.player.x, this.player.y - 4, this.guardianAltarPos.x, this.guardianAltarPos.y - 8);
    if (d > INTERACT_RANGE + 8) return null;
    if (this.fight) {
      return { swing: false, run: () => bus.emit('toast', 'The Guardian is already awake!', 'info') };
    }
    if ((this.inventory.summon_totem ?? 0) <= 0) {
      return { swing: false, run: () => bus.emit('toast', 'The altar awaits a Summoning Totem (5 wood · 3 fiber · 2 fruit).', 'info') };
    }
    return {
      swing: false,
      run: () => {
        void this.backend.summonGuardian().then((res) => {
          if (res.ok) {
            this.inventory = res.inventory;
            bus.emit('inventory', this.inventory);
          } else if (res.reason === 'FIGHT_IN_PROGRESS') {
            bus.emit('toast', 'A fight is already raging — join it!', 'bad');
          } else if (res.reason === 'NO_TOTEM') {
            bus.emit('toast', 'You need a Summoning Totem.', 'bad');
          } else if (res.reason === 'SEAL_INTACT') {
            bus.emit('toast', 'The Seal still holds.', 'bad');
          }
        });
      },
    };
  }

  private contributeSealAction(): EAction | null {
    const d = Phaser.Math.Distance.Between(this.player.x, this.player.y - 4, this.monumentPos.x, this.monumentPos.y - 8);
    if (d > INTERACT_RANGE + 8) return null;
    if (this.seal?.broken) {
      return { swing: false, run: () => bus.emit('toast', 'The Seal lies broken — the arena stands open.', 'info') };
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
            bus.emit('toast', 'You lay your Offerings upon the Seal.', 'good');
            this.sfx('place', 0.6);
            this.tickJourney('first_offering');
          } else if (res.reason === 'NOTHING_TO_GIVE') {
            bus.emit('toast', 'The Seal asks for wood, stone, fiber and fruit — you carry nothing it still needs.', 'bad');
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
      bus.emit('toast', '🌱 Your Journey is complete — the jungle is yours!', 'good');
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
        text = 'E — read';
        x = this.welcomeStonePos.x;
        y = this.welcomeStonePos.y - 26;
      } else {
        for (const t of this.tabletSpots) {
          if (Phaser.Math.Distance.Between(px, py, t.x, t.y - 8) < INTERACT_RANGE) {
            text = 'E — read';
            x = t.x;
            y = t.y - 22;
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
        const t = NODE_TYPES[view.state.type];
        if (t.requiredTool && (this.inventory[t.requiredTool] ?? 0) <= 0) continue; // only nodes the Player can harvest teach
        const d = Phaser.Math.Distance.Between(px, py, view.sprite.x, view.sprite.y - TILE / 2);
        if (d < bestDist) {
          bestDist = d;
          best = view;
        }
      }
      if (best) {
        text = 'E — gather';
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
    bus.emit('toast', 'You cast your line... wait for the "!"', 'info');
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
      this.cancelFishing('You reel in too soon — nothing on the hook.');
      return;
    }
    const nodeId = f.nodeId;
    const { x, y } = f;
    this.cancelFishing();
    this.sfx('splash', 0.6);
    void this.backend.hitNode(nodeId, this.heldTool()).then((result) => {
      if (!result.ok) {
        if (result.reason === 'DEPLETED') bus.emit('toast', 'Too late — someone else landed it. It will return.', 'bad');
        return;
      }
      if (result.finishing && result.gained) {
        const text = Object.entries(result.gained)
          .map(([item, n]) => `+${n} ${item}`)
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
            bus.emit('toast', 'You cook a fish over the fire. (Eat it from your inventory.)', 'good');
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
          bus.emit('toast', `Crafted ${ITEMS[result.crafted].name}!`, 'good');
          this.sfx('craft', 0.5);
          if (result.crafted === 'axe' || result.crafted === 'ancient_axe') this.tickJourney('craft_axe');
        } else if (result.reason === 'INSUFFICIENT') {
          bus.emit('toast', 'Not enough resources.', 'bad');
        } else if (result.reason === 'TOOL_REQUIRED') {
          bus.emit('toast', 'You are missing the required tool.', 'bad');
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
          if (res.reason === 'NOTHING') bus.emit('toast', 'Someone was quicker — the crate no longer holds that.', 'bad');
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
          if (res.reason === 'NOTHING') bus.emit('toast', 'The mill is full or you carry no wood.', 'bad');
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
          if (res.reason === 'NOTHING') bus.emit('toast', 'No plank is finished yet — the mill works slowly.', 'bad');
          return;
        }
        this.inventory = res.inventory;
        bus.emit('inventory', this.inventory);
        bus.emit('sawmill-open', sawmillId, res.state);
        bus.emit('toast', 'You collect the finished planks.', 'good');
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
        bus.emit('toast', 'Warm and hearty — your step quickens! (+20% speed)', 'good');
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
    for (const t of this.tabletSpots) {
      if (Phaser.Math.Distance.Between(px, py, t.x, t.y - 8) < INTERACT_RANGE) {
        return {
          swing: false,
          run: () => {
            void this.backend.readTablet(t.id);
            const tab = TABLETS[t.id];
            bus.emit('lore', tab?.title ?? 'Ancient Tablet', tab?.text ?? 'The runes have faded beyond reading.');
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
            bus.emit('toast', 'The grove already stands open.', 'info');
          } else {
            void this.backend.offerAltar().then((res) => {
              if (res.ok) {
                this.inventory = res.inventory;
                bus.emit('inventory', this.inventory);
                bus.emit('toast', 'The offering is accepted — the vines part!', 'good');
                this.sfx('craft', 0.6);
              } else if (res.reason === 'INSUFFICIENT') {
                bus.emit('toast', 'The altar asks for 2 fruit and 2 fiber.', 'bad');
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
                bus.emit('toast', 'You unearthed a buried treasure!', 'good');
                this.sfx('craft', 0.7);
              } else if (res.reason === 'NOT_HERE') {
                bus.emit('toast', 'Dig closer to the ✕.', 'bad');
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
    const t = view.state.type;
    const swingSfx = t === 'tree' || t === 'hardwood_tree' ? 'chop' : t === 'rock' || t === 'obsidian_rock' ? 'pick' : 'harvest';
    this.sfx(swingSfx, 0.5);
    void this.backend.hitNode(view.state.id, this.heldTool()).then((result) => {
      if (!result.ok) {
        if (result.reason === 'TOOL_REQUIRED') {
          bus.emit('toast', `You need a ${ITEMS[result.requiredTool as StructureId]?.name ?? result.requiredTool} for that.`, 'bad');
        } else if (result.reason === 'DEPLETED') {
          bus.emit('toast', 'Too late — someone else took the yield. It will regrow.', 'bad');
        }
        return;
      }
      if (result.finishing && result.gained) {
        const text = Object.entries(result.gained)
          .map(([item, n]) => `+${n} ${item}`)
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
    if ((this.inventory[item] ?? 0) <= 0) return;
    this.placing = item;
    this.ghost?.destroy();
    this.ghost = this.objImage(0, 0, `st_${item}`);
    this.ghost?.setAlpha(0.6).setDepth(99999);
    bus.emit('place-mode', true);
    bus.emit('toast', `Placing ${ITEMS[item].name} — face a tile and press Enter`, 'info');
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
      bus.emit('toast', 'Too far to reach — step closer to drop it there.', 'bad');
      return;
    }
    if (!this.canPlaceLocal(item, tx, ty)) {
      bus.emit('toast', ITEMS[item].onWater ? 'Bridges must be placed on water.' : "Can't build on that tile.", 'bad');
      return;
    }
    this.placeAtTile(item, tx, ty);
  }

  private doPlace(item: StructureId, tx: number, ty: number, text?: string): void {
    void this.backend.placeStructure(item, tx, ty, text).then((result) => {
      if (result.ok) {
        this.inventory = result.inventory;
        bus.emit('inventory', this.inventory);
        bus.emit('toast', `${ITEMS[item].name} placed!`, 'good');
        this.sfx('place', 0.6);
        this.useHint('place');
        if (item === 'campfire') this.tickJourney('place_campfire');
        if (item === 'hammock') bus.emit('toast', 'Your Hammock is set — Exhaustion and login bring you here.', 'info');
        this.exitPlaceMode();
      } else if (result.reason === 'OCCUPIED') {
        bus.emit('toast', 'Someone already built here — first placement wins. Item kept.', 'bad');
      } else if (result.reason === 'INVALID') {
        bus.emit('toast', ITEMS[item].onWater ? 'Bridges must be placed on water.' : "Can't build on that tile.", 'bad');
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

  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.add.text(x, y, text, { fontSize: '10px', color, stroke: '#000', strokeThickness: 3 });
    t.setOrigin(0.5, 1);
    t.setResolution(4);
    t.setDepth(999999);
    this.tweens.add({ targets: t, y: y - 18, alpha: { from: 1, to: 0 }, duration: 1200, onComplete: () => t.destroy() });
  }

  private checkZone(): void {
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

  update(time: number, delta: number): void {
    if (!this.player) return;
    const dt = delta / 1000;

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
      bus.emit('toast', 'The warmth of the meal fades.', 'info');
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
