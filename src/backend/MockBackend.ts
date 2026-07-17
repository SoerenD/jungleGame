import {
  ARENA_EMPTY_SLUMBER_MS,
  DEV_ARMOR,
  DEV_FIGHT,
  DEV_FIGHT_HP,
  DEV_VILLAGE,
  DEV_WARDEN_FIGHT,
  DEV_VERDANT_FIGHT,
  DORMANT_TIMEOUT_MS,
  wardenAltarQuotas,
  WARDEN_ALTAR_PER_HEAD,
  GUARDIAN_AWAKE_MS,
  HP_PER_HEAD,
  GUARDIAN_SCALE_DROP,
  EXHAUSTION_KNOCKDOWNS,
  LATENCY_MAX,
  LATENCY_MIN,
  MAP_H,
  MAP_PIECE_DROP_CHANCE,
  MAP_W,
  SAWMILL_PLANK_MS,
  SAWMILL_WOOD_CAP,
  sealQuotas,
  SPEED_BUFF_MS,
  STORAGE_KEY,
  TILE,
} from '../config';
import {
  ADJUDICATION_SLACK_MS,
  eyeOpenWithin,
  inMeleeRingDangerAt,
  isDangerousAt,
  rollGuardianDamage,
  waveInfoAt,
  type ArenaSpot,
} from '../content/guardian';
import { footprint, ITEMS, type ItemId, type StructureId, type ToolId } from '../content/items';
import { NODE_TYPES, toolSatisfies, type NodeTypeId } from '../content/nodeTypes';
import { RECIPES } from '../content/recipes';
import { quantizeStart, type EchoSample, type Ghost } from '../content/echoes';
import {
  emptyVillage,
  villageBuff,
  festivalActive,
  FESTIVAL_MS,
  FOUNTAIN_WISH_ITEM,
  FOUNTAIN_WISH_THRESHOLD,
  inVillageZone,
  isVillageStructure,
  milestoneForTier,
  recomputeTier,
  TRADEABLE,
  tradeYield,
  villageContribution,
  villagePoolCap,
  VILLAGE_MAX_TIER,
  type VillageRecord,
  type VillageTier,
} from '../content/village';
import { legacyAppearance, sanitizeAppearance } from '../avatars';
import { armorBuff, ARMOR_BUFFS, ARMOR_SLOTS, gearOwns, sanitizeEquipped, WEAPON_SLOTS, type EquippedGear, type GearSlot } from '../content/armor';
import { kitOf, wardenDef } from '../content/wardens';
import { asset } from '../paths';
import { normalizeWorldId, WORLD_ID_DEFAULT } from '../world';
import { t } from '../i18n';
import type {
  Appearance,
  AvatarId,
  Backend,
  BackendEvents,
  ChatMsg,
  ContributeSealResult,
  ContributeVillageResult,
  ContributeWardenResult,
  OpenRealmResult,
  TradeResult,
  WardenAltarState,
  WardenWorldState,
  WishResult,
  CookResult,
  CraftResult,
  CrateResult,
  DepthRecords,
  DepthRecordWrite,
  DigResult,
  Dir,
  DismantleResult,
  DropResult,
  EatResult,
  EquipResult,
  FightState,
  GuardianHitResult,
  HitResult,
  Inventory,
  JoinResult,
  JourneyState,
  JourneyStepId,
  KnockdownResult,
  NodeState,
  DungeonMsg,
  CreatureMsg,
  OfferResult,
  OpenDelveResult,
  PlaceResult,
  PlayerPos,
  QuestState,
  RefinerConfig,
  RefinerResult,
  RefinerState,
  SawmillResult,
  SawmillState,
  SealResourceId,
  SealState,
  Structure,
  SummonResult,
  WorldSnapshot,
} from './types';

interface StaticNode {
  id: string;
  type: NodeTypeId;
  tx: number;
  ty: number;
}

interface WorldData {
  spawn: { tx: number; ty: number };
  zones: { name: string; x: number; y: number; w: number; h: number }[];
  nodes: StaticNode[];
  /** MAP_W*MAP_H row-major: 0 walkable, 1 water, 2 solid */
  blocked: number[];
  tablets: { id: string; tx: number; ty: number }[];
  gate: { tx: number; ty: number }[];
  altar: { tx: number; ty: number };
  treasureSpots: { tx: number; ty: number }[];
  /** v2 — Guardian arena playfield (tile rect) at the Ruins */
  arena: { x: number; y: number; w: number; h: number };
  /** top-left tile of the Guardian's 3x3 resting place */
  guardianHome: { tx: number; ty: number };
  sealMonument: { tx: number; ty: number };
  guardianAltar: { tx: number; ty: number };
  /** arena entrance tiles blocked until the Seal breaks */
  sealGate: { tx: number; ty: number }[];
  welcomeStone: { tx: number; ty: number };
  /** ADR-0017 §1: per-Warden arenas (keyed by WardenDef id) — the Guardian keeps
   *  the top-level arena/guardianHome/sealGate; each further rung's court lives here */
  wardenArenas?: Record<
    string,
    {
      arena: { x: number; y: number; w: number; h: number };
      home: { tx: number; ty: number };
      altar: { tx: number; ty: number };
      monument: { tx: number; ty: number };
      sealGate: { tx: number; ty: number }[];
    }
  >;
}

interface DbPlayer {
  pin: string;
  /** legacy tint preset from pre-update rows — mapped to a default Appearance once */
  avatar?: AvatarId;
  appearance?: Appearance;
  x: number;
  y: number;
  inventory: Inventory;
  tablets?: string[];
  introSeen?: boolean;
  /** Journey onboarding progress + hint use counts (persisted like introSeen) */
  journey?: JourneyState;
  /** legacy Hammock wake tile — hammocks are retired; the load sweep clears it */
  wakePoint?: { tx: number; ty: number };
  /** fog-of-war chunk indices this Player has explored (persisted like journey) */
  explored?: number[];
  /** the row-stride the `explored` indices were saved under (fog-of-war remap) */
  exploredStride?: number;
  /** worn Armor (ADR-0017 §4) — persisted like wakePoint, moved out of the bag when worn */
  equipped?: EquippedGear;
}

/** a live fight; the private fields never leave the server */
interface DbFight {
  /** ADR-0017: WardenDef id, or absent for the Guardian (rung 0) */
  warden?: string;
  summonedAt: number;
  /** null while dormant; the server timestamp of the first landed hit (ADR-0004) */
  engagedAt: number | null;
  /** the party inside the arena at the first strike — HP scales to it, the Ward seals it in */
  roster: string[];
  hp: number;
  maxHp: number;
  participants: string[];
  knockdowns: Record<string, number>;
  /** wave index of each Player's last counted knockdown (dedupes re-reports) */
  lastKnockdownWave: Record<string, number>;
  /** set when the whole roster Exhausts: the timestamp the arena re-slumbers, else null */
  emptySlumberAt: number | null;
}

interface Db {
  players: Record<string, DbPlayer>;
  /** only touched nodes live here; pristine nodes are implicit */
  nodes: Record<string, { hp: number; harvestedAt: number | null }>;
  structures: Record<string, Structure>;
  /** per-crate shared inventories, keyed by structure id */
  crates?: Record<string, Inventory>;
  /** per-sawmill queue: wood still milling since `since` (lazy timestamps) */
  sawmills?: Record<string, { wood: number; since: number }>;
  /** per-Refiner queue (generic kernel, ADR-0017 §6): raw input refining since `since` */
  refiners?: Record<string, { input: number; since: number }>;
  /** the Echoes (ADR-0017 rung 2): persisted movement shades, keyed by ghost id */
  echoes?: Record<string, { who: string; recordedAt: number; periodMs: number; samples: EchoSample[]; kind?: 'echo' | 'greeting' }>;
  /** players who have ever felled the Reverberant — gates the one-time epic helm +
   *  reliquary. Its own dedicated ledger, mirroring reverb_trophies in migration
   *  0015, so the marquee reward is granted exactly once and never pre-empted. */
  reverbTrophies?: string[];
  /** per-(who, week) Reverberant weekly-clear ledger, keyed "who#week" */
  reverbClears?: Record<string, boolean>;
  chatLog: ChatMsg[];
  world?: {
    gateOpen: boolean;
    /** the Delve mine shaft, cleared once forever with an Ancient Pickaxe (ADR-0007) */
    delveOpen?: boolean;
    treasureIndex: number;
    seal?: { broken: boolean; contributed: Record<SealResourceId, number> };
    fight?: DbFight | null;
    /** the communal Village (ADR-0010): tier + additive pool + Hall location, tile-independent */
    village?: VillageRecord;
    /** per-Warden progress (ADR-0017): its altar Offering + its Realm gate flag */
    wardens?: Record<string, { altar: { broken: boolean; contributed: Record<string, number> }; gateOpen: boolean }>;
    /**
     * the World's Depth Records (ADR-0015) — the localStorage mirror of
     * migration 0011: one entry per Descent (deepest Depth + the roster that
     * cleared it) and one personal best per Player. Append/upsert-only.
     */
    depthRecords?: {
      descents: Record<string, { depth: number; roster: string[]; at: number }>;
      bests: Record<string, { depth: number; at: number }>;
    };
  };
}

const SEAL_RESOURCES: SealResourceId[] = ['wood', 'stone', 'fiber', 'fruit'];

const BOT_DEFS: { name: string; appearance: Appearance; lines: string[] }[] = [
  {
    name: 'Kiki',
    appearance: { skin: 2, hair: 4, shirt: 1, pants: 3 },
    lines: t.botChatter.Kiki,
  },
  {
    name: 'Bruno',
    appearance: { skin: 4, hair: 0, shirt: 2, pants: 1 },
    lines: t.botChatter.Bruno,
  },
];

interface Bot {
  name: string;
  appearance: Appearance;
  x: number;
  y: number;
  dir: Dir;
  moving: boolean;
  mode: 'idle' | 'walk' | 'harvest';
  targetX: number;
  targetY: number;
  targetNode: StaticNode | null;
  idleUntil: number;
  nextChatAt: number;
  nextHitAt: number;
  lines: string[];
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const delay = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));
const tileKey = (tx: number, ty: number) => `${tx},${ty}`;

export class MockBackend implements Backend {
  private world!: WorldData;
  private db!: Db;
  /** the World this single-player save belongs to (ADR-0014); namespaces storage */
  private worldId: string = WORLD_ID_DEFAULT;
  private me: string | null = null;
  private listeners = new Map<string, Set<(...args: any[]) => void>>();
  private nodesByTile = new Map<string, StaticNode>();
  private nodesById = new Map<string, StaticNode>();
  /**
   * Every tile claimed by a placed Structure → that Structure (ADR-0008
   * footprint). `db.structures` stays keyed by the anchor tile for persistence;
   * this index spans a Building's whole footprint for occupancy + walkability.
   */
  private structTiles = new Map<string, Structure>();
  private bots: Bot[] = [];
  private botTimer: number | null = null;
  private saveTimer: number | null = null;
  private slumberTimer: number | null = null;

  async init(): Promise<void> {
    const res = await fetch(asset('/map/world-data.json'));
    this.world = (await res.json()) as WorldData;
    for (const n of this.world.nodes) {
      this.nodesByTile.set(tileKey(n.tx, n.ty), n);
      this.nodesById.set(n.id, n);
    }
    this.loadDb();
    window.addEventListener('beforeunload', () => this.saveNow());
  }

  /**
   * Load (and normalise + dev-seed) the current World's save from localStorage
   * into `this.db`. Split out of init() so switching Worlds (useWorld) can reload
   * without re-fetching the shared static map or re-wiring the beforeunload hook.
   */
  private loadDb(): void {
    const raw = localStorage.getItem(this.storageKey());
    this.db = raw
      ? (JSON.parse(raw) as Db)
      : { players: {}, nodes: {}, structures: {}, chatLog: [] };
    this.db.world ??= { gateOpen: false, treasureIndex: 0 };
    this.db.world.seal ??= { broken: false, contributed: { wood: 0, stone: 0, fiber: 0, fruit: 0 } };
    this.db.world.fight ??= null;
    this.db.world.village ??= emptyVillage();
    this.db.world.wardens ??= {};
    this.db.world.depthRecords ??= { descents: {}, bests: {} };
    this.db.crates ??= {};
    this.db.sawmills ??= {};
    this.db.refiners ??= {};
    // drop anything whose id is no longer a known item — retired Structures/Tools
    // (e.g. the fence, the Stone Path) vanish for good instead of crashing later
    // lookups in placed structures, player packs, and crate storage
    for (const [key, s] of Object.entries(this.db.structures)) {
      if (!ITEMS[s.type]) delete this.db.structures[key];
    }
    this.rebuildStructTiles();
    for (const p of Object.values(this.db.players)) {
      for (const k of Object.keys(p.inventory)) {
        if (!ITEMS[k as ItemId]) delete p.inventory[k as ItemId];
      }
      // hammocks are retired — a stale wake point would strand logins at a ghost tile
      delete p.wakePoint;
    }
    for (const contents of Object.values(this.db.crates ?? {})) {
      for (const k of Object.keys(contents)) {
        if (!ITEMS[k as ItemId]) delete contents[k as ItemId];
      }
    }
    this.saveSoon();
    if (DEV_FIGHT) this.db.world.seal.broken = true; // ?fight — jump straight to the Guardian
    if (DEV_VERDANT_FIGHT) {
      // ?verdantfight — the Verdant Warden's altar starts broken so its granted
      // totem summons at once (the warden-altar analog of ?fight's seal break)
      const wardens = (this.db.world.wardens ??= {});
      const wv = (wardens.verdant ??= { altar: { broken: false, contributed: {} }, gateOpen: false });
      wv.altar.broken = true;
    }
    if (DEV_VILLAGE) this.seedDevVillage(); // ?village — founded Capital + the ADR-0013 buildings
    this.scheduleSlumberCheck();
  }

  /**
   * Switch to the World the Player picked on the join screen (ADR-0014). Each
   * World is its own save, namespaced in localStorage; the default World keeps
   * the original key. A no-op when already on that World.
   */
  private useWorld(world: string): void {
    const slug = normalizeWorldId(world);
    if (slug === this.worldId) return;
    this.saveNow(); // persist the World we are leaving (still under its own key)
    this.worldId = slug;
    this.loadDb();
  }

  // ---------------------------------------------------------------- events

  on<K extends keyof BackendEvents>(event: K, cb: BackendEvents[K]): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb as any);
  }

  off<K extends keyof BackendEvents>(event: K, cb: BackendEvents[K]): void {
    this.listeners.get(event)?.delete(cb as any);
  }

  private emit(event: keyof BackendEvents, ...args: any[]): void {
    this.listeners.get(event)?.forEach((cb) => cb(...args));
  }

  // ---------------------------------------------------------------- persistence

  /** localStorage key for the current World (ADR-0014): the default World keeps
   *  the original key, so existing single-player saves are untouched */
  private storageKey(): string {
    return this.worldId === WORLD_ID_DEFAULT ? STORAGE_KEY : `${STORAGE_KEY}:${this.worldId}`;
  }

  private saveNow(): void {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    localStorage.setItem(this.storageKey(), JSON.stringify(this.db));
  }

  private saveSoon(): void {
    if (this.saveTimer !== null) return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      localStorage.setItem(this.storageKey(), JSON.stringify(this.db));
    }, 400);
  }

  private async lag(): Promise<void> {
    await delay(rand(LATENCY_MIN, LATENCY_MAX));
  }

  // ---------------------------------------------------------------- world state

  /** Lazy regrowth: state is derived from harvestedAt, never ticked. */
  private nodeState(sn: StaticNode): NodeState {
    const t = NODE_TYPES[sn.type];
    const dyn = this.db.nodes[sn.id];
    if (dyn) {
      if (dyn.harvestedAt !== null && Date.now() >= dyn.harvestedAt + t.regrowMs) {
        delete this.db.nodes[sn.id]; // fully regrown → pristine
        this.saveSoon();
      } else {
        return { id: sn.id, type: sn.type, tx: sn.tx, ty: sn.ty, hp: dyn.hp, harvestedAt: dyn.harvestedAt };
      }
    }
    return { id: sn.id, type: sn.type, tx: sn.tx, ty: sn.ty, hp: t.maxHp, harvestedAt: null };
  }

  isWalkableTile(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    if (!this.db.world!.gateOpen && this.world.gate.some((g) => g.tx === tx && g.ty === ty)) return false;
    if (!this.db.world!.seal!.broken && this.world.sealGate.some((g) => g.tx === tx && g.ty === ty)) return false;
    const b = this.world.blocked[ty * MAP_W + tx];
    const s = this.structTiles.get(tileKey(tx, ty)); // any footprint tile, not just the anchor
    if (b === 1) return s?.type === 'bridge';
    if (b !== 0) return false;
    if (s && ITEMS[s.type]?.blocks) return false;
    const n = this.nodesByTile.get(tileKey(tx, ty));
    if (n && NODE_TYPES[n.type].blocks && this.nodeState(n).hp > 0) return false;
    return true;
  }

  /** the tiles a Structure claims, anchored at (tx,ty) toward +x/+y (ADR-0008) */
  private footprintTiles(s: Structure): string[] {
    const { w, h } = footprint(s.type);
    const out: string[] = [];
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push(tileKey(s.tx + dx, s.ty + dy));
    return out;
  }

  /** rebuild the whole-footprint occupancy index from db.structures */
  private rebuildStructTiles(): void {
    this.structTiles.clear();
    for (const s of Object.values(this.db.structures)) {
      for (const k of this.footprintTiles(s)) this.structTiles.set(k, s);
    }
  }

  /**
   * ?village dev seed (DEV only, MockBackend): stand up a founded Capital-tier
   * Village at spawn with the five ADR-0013 building-function Structures — Trade
   * Post, Banner, Well, Fountain, Flower Bed — laid out in a plaza just south of
   * the wake tile, so the resource-exchange / Name & Crest / Chronicle / Trophy
   * panels can be reached on foot for solo UI verification. Idempotent: fixed
   * ids keyed by tile, so re-loading overwrites rather than accumulates.
   */
  private seedDevVillage(): void {
    const spawn = this.world.spawn; // {tx:100, ty:100} in the shipped map
    // a founded Capital (max tier) so every building is unlocked and the market trades
    this.db.world!.village = {
      tier: 5,
      pool: 12_000,
      hall: { tx: spawn.tx, ty: spawn.ty },
      milestonesBuilt: 5,
      name: 'Alt-Grünhain',
      crest: 2,
      chronicle: [
        'Wir gruben den ersten Brunnen bei Sonnenaufgang.',
        'Der Wächter fiel — drei von uns trugen Narben davon.',
      ],
    };
    // Hall at spawn + the five demo Buildings in a tidy row 3 tiles south of the
    // wake tile, spaced so no single player tile is adjacent to two of them.
    const row = spawn.ty + footprint('village_hall').h + 3;
    const seed: { id: string; type: StructureId; tx: number; ty: number }[] = [
      { id: 'dev_hall', type: 'village_hall', tx: spawn.tx, ty: spawn.ty },
      { id: 'dev_market', type: 'market_square', tx: spawn.tx - 8, ty: row },
      { id: 'dev_banner', type: 'village_banner', tx: spawn.tx - 4, ty: row },
      { id: 'dev_well', type: 'village_well', tx: spawn.tx - 1, ty: row },
      { id: 'dev_fountain', type: 'fountain', tx: spawn.tx + 3, ty: row },
      { id: 'dev_flowers', type: 'flower_bed', tx: spawn.tx + 7, ty: row },
    ];
    for (const s of seed) {
      this.db.structures[tileKey(s.tx, s.ty)] = { ...s, placedBy: 'dev', placedAt: Date.now() };
    }
    this.rebuildStructTiles();
    this.saveNow();
  }

  // ---------------------------------------------------------------- join / snapshot

  async join(name: string, pin: string, appearance: Appearance, world: string): Promise<JoinResult> {
    await this.lag();
    name = name.trim();
    if (!/^[\w :-]{2,16}$/.test(name)) return { ok: false, reason: 'BAD_NAME' };
    if (!/^\d{4}$/.test(pin)) return { ok: false, reason: 'BAD_PIN' };
    this.useWorld(world); // load this World's save before reading/creating the Player
    let p = this.db.players[name];
    let isNew = false;
    if (p) {
      if (p.pin !== pin) return { ok: false, reason: 'WRONG_PIN' };
    } else {
      isNew = true;
      p = {
        pin,
        x: (this.world.spawn.tx + 0.5) * TILE,
        y: (this.world.spawn.ty + 0.5) * TILE,
        inventory: {},
      };
      this.db.players[name] = p;
      this.saveNow();
    }
    // the join screen's picks become the look (Appearance is editable at
    // every join); a missing payload falls back to the legacy-tint mapping
    p.appearance = appearance
      ? sanitizeAppearance(appearance)
      : p.appearance ?? legacyAppearance(p.avatar ?? 0);
    this.me = name;
    if (DEV_FIGHT && (p.inventory.summon_totem ?? 0) === 0) {
      p.inventory.summon_totem = 1; // ?fight — instant summon ready
      this.saveNow();
    }
    if (DEV_ARMOR) {
      // ?armor — hand over all three pieces so equip/overlays/stats are testable (T3)
      for (const id of Object.keys(ARMOR_BUFFS) as ItemId[]) {
        if ((p.inventory[id] ?? 0) === 0) p.inventory[id] = 1;
      }
      this.saveNow();
    }
    if (DEV_WARDEN_FIGHT) {
      // ?wardenfight — the Mire Warden's totem + enough altar goods for the
      // whole solo arc (Offering → summon → fight → gate key)
      const grants: Partial<Record<ItemId, number>> = { mire_totem: 1 };
      for (const [item, per] of Object.entries(WARDEN_ALTAR_PER_HEAD.mire ?? {})) {
        grants[item as ItemId] = per * 2;
      }
      for (const [item, n] of Object.entries(grants)) {
        if ((p.inventory[item as ItemId] ?? 0) < n!) p.inventory[item as ItemId] = n!;
      }
      this.saveNow();
    }
    if (DEV_VERDANT_FIGHT) {
      // ?verdantfight — the Verdant Warden's totem + enough altar goods for the
      // whole solo arc (Offering → summon → fight → terrace key). Granted by item
      // id (no wardenDef dependency), mirroring the ?wardenfight Mire grant.
      const grants: Partial<Record<ItemId, number>> = { verdant_totem: 1 };
      for (const [item, per] of Object.entries(WARDEN_ALTAR_PER_HEAD.verdant ?? {})) {
        grants[item as ItemId] = per * 2;
      }
      for (const [item, n] of Object.entries(grants)) {
        if ((p.inventory[item as ItemId] ?? 0) < n!) p.inventory[item as ItemId] = n!;
      }
      this.saveNow();
    }
    // Armor is worn by MOVING the piece out of the bag. Keep every shape-valid
    // worn slot (it is its own proof of ownership); and transition a LEGACY save
    // where a piece is worn AND still sitting in the bag by removing the bag copy
    // once (idempotent — after the first load the piece is gone from the pack).
    p.equipped = sanitizeEquipped(p.equipped);
    for (const slot of ARMOR_SLOTS) {
      const it = p.equipped[slot];
      if (it && (p.inventory[it] ?? 0) > 0) {
        p.inventory[it] = (p.inventory[it] ?? 0) - 1;
        if ((p.inventory[it] ?? 0) <= 0) delete p.inventory[it];
      }
    }
    if (DEV_VILLAGE) {
      // ?village — keep a stock of tradeables so the Trade Post has surplus to swap
      const stock: Partial<Record<ItemId, number>> = { wood: 40, stone: 40, fiber: 40, fruit: 40, fish: 8 };
      for (const [it, n] of Object.entries(stock)) {
        if ((p.inventory[it as ItemId] ?? 0) < n!) p.inventory[it as ItemId] = n!;
      }
      this.saveNow();
    }
    this.normalizeJourney(name, p);
    this.startBots();
    // login position (ADR-0010 §4 as amended): a founded Hall makes the Village
    // home — a Player wakes there; unfounded keeps the last spot.
    if (this.db.world!.village?.hall) {
      const w = this.wakeTileFor(p);
      p.x = (w.tx + 0.5) * TILE;
      p.y = (w.ty + 0.5) * TILE;
    }
    return {
      ok: true,
      name,
      appearance: { ...p.appearance },
      x: p.x,
      y: p.y,
      inventory: { ...p.inventory },
      isNew,
      introSeen: !!p.introSeen,
      journey: this.journeyState(p),
      explored: [...(p.explored ?? [])],
      exploredStride: p.exploredStride,
      equipped: { ...p.equipped },
    };
  }

  /**
   * wear/unwear gear (ADR-0017 §4 + weapon slots): MOVE the piece between the bag
   * and the slot. Slots are honoured against a WORKING ledger (already-worn
   * instances + bag copies, consumed as slots claim them) — so the same weapon in
   * both slots genuinely needs two copies; then every changed slot transacts the
   * inventory (a newly worn piece is decremented out, a newly bared one returned).
   */
  async equip(equipped: EquippedGear): Promise<EquipResult> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    if (!p) return { equipped: {}, inventory: {} };
    const prev = p.equipped ?? {};
    const want = sanitizeEquipped(equipped); // shape only
    const next: EquippedGear = {};
    const gearSlots: GearSlot[] = [...ARMOR_SLOTS, ...WEAPON_SLOTS];
    const avail: Partial<Record<string, number>> = {};
    for (const slot of gearSlots) {
      const it = prev[slot];
      if (it) avail[it] = (avail[it] ?? 0) + 1;
    }
    for (const [it, n] of Object.entries(p.inventory)) avail[it] = (avail[it] ?? 0) + (n ?? 0);
    for (const slot of gearSlots) {
      const item = want[slot];
      if (!item || (avail[item] ?? 0) <= 0) continue;
      avail[item] = (avail[item] ?? 0) - 1;
      next[slot] = item;
    }
    // ALL unequip credits land before ANY equip debit: a cross-slot move
    // (weapon2 → weapon1) debits the covering copy's slot first in fixed slot
    // order, and the zero-clamped bag would silently lose the debit — minting
    // a duplicate once the credit lands after it
    for (const slot of gearSlots) {
      const before = prev[slot];
      if (before && before !== next[slot]) p.inventory[before] = (p.inventory[before] ?? 0) + 1; // unequip → bag
    }
    for (const slot of gearSlots) {
      const after = next[slot];
      if (after && after !== prev[slot]) {
        p.inventory[after] = (p.inventory[after] ?? 0) - 1; // equip → out of bag
        if ((p.inventory[after] ?? 0) <= 0) delete p.inventory[after];
      }
    }
    p.equipped = next;
    this.saveNow();
    return { equipped: { ...p.equipped }, inventory: { ...p.inventory } };
  }

  async markExplored(chunks: number[], stride: number): Promise<void> {
    const p = this.me ? this.db.players[this.me] : null;
    if (!p) return;
    // Self-heal on a stride change (map growth): remap the stored indices from
    // their old row-width to the new one so pinned chunks keep their (cx,cy),
    // then stamp the new stride. Union the fresh chunks (already under `stride`).
    const old = p.exploredStride;
    let base = p.explored ?? [];
    if (typeof old === 'number' && old !== stride && base.length) {
      const remapped: number[] = [];
      for (const idx of base) {
        if (idx < 0) continue;
        const cx = idx % old;
        const cy = Math.floor(idx / old);
        remapped.push(cy * stride + cx);
      }
      base = remapped;
    }
    const seen = new Set(base);
    for (const c of chunks) seen.add(c);
    p.explored = [...seen];
    p.exploredStride = stride;
    this.saveSoon();
  }

  // ------------------------------------------------------------ the Journey

  private journeyState(p: DbPlayer): JourneyState {
    const j = p.journey ?? { steps: {}, hintUses: {} };
    return { steps: { ...j.steps }, hintUses: { ...j.hintUses } };
  }

  /**
   * Veteran auto-complete: a Player record from before the Journey shipped
   * gets its steps initialized from evidence in existing state — nobody
   * re-does completed content. Also runs on every join so the Seal steps
   * never dead-end once the Seal is broken (contributing became impossible).
   */
  private normalizeJourney(name: string, p: DbPlayer): void {
    const inv = p.inventory;
    if (!p.journey) {
      const steps: Partial<Record<JourneyStepId, boolean>> = {};
      // crafting an axe consumed wood and stone — those steps are implied
      if ((inv.axe ?? 0) > 0 || (inv.ancient_axe ?? 0) > 0) {
        steps.craft_axe = true;
        steps.gather_wood = true;
        steps.harvest_stone = true;
      }
      if ((inv.wood ?? 0) > 0) steps.gather_wood = true;
      if ((inv.stone ?? 0) > 0) steps.harvest_stone = true;
      if (Object.values(this.db.structures).some((s) => s.type === 'campfire' && s.placedBy === name)) {
        steps.place_campfire = true;
      }
      if ((p.tablets?.length ?? 0) > 0) steps.read_tablet = true;
      p.journey = { steps, hintUses: {} };
    }
    if (this.db.world!.seal!.broken) {
      // the Seal breaks once, forever — its steps can no longer be performed
      p.journey.steps.visit_seal = true;
      p.journey.steps.first_offering = true;
    }
    this.saveSoon();
  }

  async completeJourneyStep(step: JourneyStepId): Promise<JourneyState> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    if (!p) return { steps: {}, hintUses: {} };
    p.journey ??= { steps: {}, hintUses: {} };
    if (!p.journey.steps[step]) {
      p.journey.steps[step] = true;
      this.saveNow();
    }
    return this.journeyState(p);
  }

  async bumpHint(hintId: string): Promise<JourneyState> {
    const p = this.me ? this.db.players[this.me] : null;
    if (!p) return { steps: {}, hintUses: {} };
    p.journey ??= { steps: {}, hintUses: {} };
    p.journey.hintUses[hintId] = (p.journey.hintUses[hintId] ?? 0) + 1;
    this.saveSoon();
    return this.journeyState(p);
  }

  async loadWorld(): Promise<WorldSnapshot> {
    await this.lag();
    this.reconcileGuardian();
    return {
      nodes: this.world.nodes.map((n) => this.nodeState(n)),
      structures: Object.values(this.db.structures),
      chatLog: this.db.chatLog.slice(-50),
      players: this.bots.map((b) => this.botPos(b)),
      quest: this.questState(),
      seal: this.sealState(),
      fight: this.fightState(),
      village: this.villageState(),
      wardens: this.wardensState(),
    };
  }

  private villageState(): VillageRecord {
    const v = (this.db.world!.village ??= emptyVillage());
    return {
      tier: v.tier,
      pool: v.pool,
      hall: v.hall ? { ...v.hall } : null,
      milestonesBuilt: v.milestonesBuilt,
      name: v.name,
      crest: v.crest,
      chronicle: v.chronicle ? [...v.chronicle] : undefined,
      wishes: v.wishes,
      festivalUntil: v.festivalUntil,
    };
  }

  /**
   * Where a Player wakes/appears (ADR-0010 §4 as amended — the Hammock rung is
   * retired): priority Village Hall > World spawn. The Hall tile is just south
   * of its footprint (the footprint itself is solid). Used by both login and
   * Exhaustion.
   */
  private wakeTileFor(_p: DbPlayer): { tx: number; ty: number } {
    const hall = this.db.world!.village?.hall;
    if (hall) return { tx: hall.tx, ty: hall.ty + footprint('village_hall').h };
    return { ...this.world.spawn };
  }

  /**
   * Record a Village build (ADR-0010): the Hall founds/re-founds the Village
   * (tile-independent — never resets the pool/tier); the later milestone
   * Buildings advance it only when raised inside the village zone. Decor is a
   * no-op. Returns true when the record changed (→ emit villageChanged).
   */
  private noteVillageBuild(item: StructureId, tx: number, ty: number): boolean {
    const v = (this.db.world!.village ??= emptyVillage());
    let changed = false;
    if (item === 'village_hall') {
      v.hall = { tx, ty }; // found or relocate — progress belongs to the group, not the tile
      if (v.milestonesBuilt < 1) v.milestonesBuilt = 1;
      changed = true;
    } else {
      for (let tier = 2; tier <= VILLAGE_MAX_TIER; tier++) {
        if (milestoneForTier(tier) !== item) continue;
        if (inVillageZone(v, tx, ty) && v.milestonesBuilt < tier) {
          v.milestonesBuilt = tier as VillageTier;
          changed = true;
        }
        break;
      }
    }
    if (changed) v.tier = recomputeTier(v).tier;
    return changed;
  }

  private questState(): QuestState {
    const p = this.me ? this.db.players[this.me] : null;
    const pieces = p?.inventory.map_piece ?? 0;
    return {
      tabletsRead: [...(p?.tablets ?? [])],
      tabletsTotal: this.world.tablets.length,
      mapPieces: pieces,
      gateOpen: this.db.world!.gateOpen,
      treasureLocation: pieces >= 3 ? { ...this.world.treasureSpots[this.db.world!.treasureIndex] } : null,
      delveOpen: !!this.db.world!.delveOpen,
    };
  }

  /** the live Seal target: the Mock world has one real Player, so heads = 1 */
  private sealTargets(): Record<SealResourceId, number> {
    return sealQuotas(1);
  }

  private sealState(): SealState {
    const s = this.db.world!.seal!;
    return { broken: s.broken, contributed: { ...s.contributed }, quotas: this.sealTargets() };
  }

  private fightState(): FightState | null {
    const f = this.db.world!.fight;
    if (!f) return null;
    return {
      warden: f.warden ?? null,
      summonedAt: f.summonedAt,
      engagedAt: f.engagedAt,
      roster: [...f.roster],
      hp: f.hp,
      maxHp: f.maxHp,
      participants: [...f.participants],
      emptySlumberAt: f.emptySlumberAt,
    };
  }

  /** one Warden's public per-World state — altar bars carry the live quotas */
  private wardenState(id: string): WardenWorldState {
    const w = this.db.world!.wardens?.[id];
    const altar: WardenAltarState = {
      broken: !!w?.altar.broken,
      contributed: { ...(w?.altar.contributed ?? {}) },
      quotas: wardenAltarQuotas(id, 1), // the Mock world has one real Player
    };
    return { altar, gateOpen: !!w?.gateOpen };
  }

  /** every known Warden's state, for the world snapshot */
  private wardensState(): Record<string, WardenWorldState> {
    const out: Record<string, WardenWorldState> = {};
    for (const id of Object.keys(WARDEN_ALTAR_PER_HEAD)) out[id] = this.wardenState(id);
    return out;
  }

  /**
   * Arena-local center spot of the entrance (the sealGate the Ward re-seals).
   * The gate sits just below the arena's bottom row, so the ay is clamped into
   * the arena — the Guardian's wave-0 leap lands in front of the doorway.
   */
  /**
   * The arena anatomy the active fight belongs to (ADR-0017 §1): a Warden fight
   * adjudicates in its OWN court (world.wardenArenas[warden]); the Guardian keeps
   * the top-level arena/guardianHome/sealGate. Every arena-relative computation
   * below routes through here so a second Warden fights in the right place.
   */
  private arenaAnatomy(warden: string | null | undefined): {
    arena: { x: number; y: number; w: number; h: number };
    home: { tx: number; ty: number };
    sealGate: { tx: number; ty: number }[];
  } {
    const wa = warden ? this.world.wardenArenas?.[warden] : undefined;
    if (wa) return { arena: wa.arena, home: wa.home, sealGate: wa.sealGate };
    return { arena: this.world.arena, home: this.world.guardianHome, sealGate: this.world.sealGate };
  }

  private entranceSpot(warden: string | null | undefined): { ax: number; ay: number } {
    const { arena: a, sealGate: g } = this.arenaAnatomy(warden);
    const mid = g[Math.floor(g.length / 2)] ?? { tx: a.x + Math.floor(a.w / 2), ty: a.y + a.h - 1 };
    return {
      ax: Math.max(0, Math.min(a.w - 1, mid.tx - a.x)),
      ay: Math.max(0, Math.min(a.h - 1, mid.ty - a.y)),
    };
  }

  /**
   * Arena-local centre of the boss's 3×3 home footprint (home is the top-left
   * tile; +1 gives the centre) — the melee-ring adjudicates around the same spot
   * every client renders with (guardianSpotAt).
   */
  private homeSpot(warden: string | null | undefined): ArenaSpot {
    const { arena: a, home: g } = this.arenaAnatomy(warden);
    return { ax: g.tx + 1 - a.x, ay: g.ty + 1 - a.y };
  }

  /**
   * Names of the Players (the local Player + bots) whose tile falls inside the
   * active fight's arena rect right now — the roster snapshot at the first strike.
   * In a SupabaseBackend this reads live presence; the Mock has one real Player.
   */
  private playersInArena(warden: string | null | undefined): string[] {
    const a = this.arenaAnatomy(warden).arena;
    const inRect = (x: number, y: number) => {
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      return tx >= a.x && tx < a.x + a.w && ty >= a.y && ty < a.y + a.h;
    };
    const names: string[] = [];
    const me = this.me ? this.db.players[this.me] : null;
    if (this.me && me && inRect(me.x, me.y)) names.push(this.me);
    for (const b of this.bots) if (inRect(b.x, b.y)) names.push(b.name);
    return names;
  }

  /**
   * Count the roster members who are LIVE inside the arena right now: online
   * (the local Player or a live bot), not Exhausted, and standing in the rect.
   * Exhausted fighters are teleported to their wake point, so a position check
   * already excludes them; offline peers simply aren't present.
   */
  private liveRosterInArena(f: DbFight): number {
    const a = this.arenaAnatomy(f.warden).arena;
    const inRect = (x: number, y: number) => {
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      return tx >= a.x && tx < a.x + a.w && ty >= a.y && ty < a.y + a.h;
    };
    let n = 0;
    for (const name of f.roster) {
      if ((f.knockdowns[name] ?? 0) >= EXHAUSTION_KNOCKDOWNS) continue; // Exhausted → out of the fight
      if (name === this.me) {
        const p = this.db.players[name];
        if (p && inRect(p.x, p.y)) n++;
      } else {
        const b = this.bots.find((bb) => bb.name === name);
        if (b && inRect(b.x, b.y)) n++;
      }
    }
    return n;
  }

  /**
   * B2 (ADR-0004): end an engaged fight when the arena holds ZERO live roster
   * members (all offline/Exhausted/outside) for ~5 s. Lazily evaluated on the
   * events that drop the count; a brief step-out that returns within the grace
   * clears the pending re-slumber, so it doesn't end a fight a lone fighter
   * merely clipped out of. Subsumes the all-Exhausted wipe.
   */
  private evaluateArenaOccupancy(): void {
    const f = this.db.world!.fight;
    if (!f || f.engagedAt === null || f.hp <= 0) return;
    const live = this.liveRosterInArena(f);
    if (live === 0) {
      if (f.emptySlumberAt === null) {
        f.emptySlumberAt = Date.now() + ARENA_EMPTY_SLUMBER_MS;
        this.saveSoon();
        this.scheduleSlumberCheck();
      }
    } else if (f.emptySlumberAt !== null) {
      // a fighter returned within the grace window — cancel the re-slumber
      f.emptySlumberAt = null;
      this.saveSoon();
      this.scheduleSlumberCheck();
    }
  }

  private emitQuest(): void {
    this.emit('quest', this.questState());
  }

  // ---------------------------------------------------------------- realtime-ish

  sendPosition(x: number, y: number, _dir: Dir, _moving: boolean, _held?: ItemId, _swings?: number): void {
    // `_held`/`_swings` are Realtime-broadcast fields in a real backend (a
    // SupabaseBackend relays them to other clients for the in-hand icon and
    // the swing echo); the single-client Mock has no peers to echo them to, so
    // they are accepted and dropped. Its bots likewise never SEND `swings` —
    // the field is optional, so they render exactly as before.
    const p = this.me ? this.db.players[this.me] : null;
    if (p) {
      p.x = x;
      p.y = y;
      this.saveSoon();
      // B2: a step out of (or back into) the arena may start/cancel the
      // empty-arena re-slumber grace during an engaged fight
      if (this.db.world?.fight?.engagedAt != null) this.evaluateArenaOccupancy();
    }
  }

  async sendChat(text: string): Promise<void> {
    await this.lag();
    if (!this.me) return;
    this.pushChat({ from: this.me, text: text.slice(0, 200), ts: Date.now() });
  }

  private pushChat(msg: ChatMsg): void {
    this.db.chatLog.push(msg);
    if (this.db.chatLog.length > 100) this.db.chatLog.splice(0, this.db.chatLog.length - 100);
    this.saveSoon();
    this.emit('chat', msg);
  }

  // ---------------------------------------------------------------- RPCs (atomic in Postgres later)

  async hitNode(nodeId: string, withTool?: ToolId): Promise<HitResult> {
    await this.lag();
    return this.doHit(nodeId, this.me, withTool);
  }

  /** Shared mutation path for the local player and bots — server-ordered by JS single-threading. */
  private doHit(nodeId: string, who: string | null, withTool?: ToolId): HitResult {
    const sn = this.nodesById.get(nodeId);
    if (!sn) return { ok: false, reason: 'UNKNOWN_NODE' };
    const t = NODE_TYPES[sn.type];
    const state = this.nodeState(sn);
    if (state.hp <= 0) return { ok: false, reason: 'DEPLETED' };
    const inv = who ? this.db.players[who]?.inventory ?? {} : {};
    // trust the claimed in-hand Tool only as far as the Player actually owns it
    // (a slotted weapon lives in players.equipped, not the bag — gearOwns covers both)
    const owned = withTool && gearOwns(inv, who ? this.db.players[who]?.equipped : null, withTool) ? withTool : undefined;
    // a `requiredTool` Node needs that Tool (or its tier-2 upgrade) IN HAND;
    // the `bonusTool` ×2 likewise applies only when the matching Tool is in hand
    if (t.requiredTool && !toolSatisfies(owned, t.requiredTool)) {
      return { ok: false, reason: 'TOOL_REQUIRED', requiredTool: t.requiredTool };
    }
    const dmg = toolSatisfies(owned, t.bonusTool) ? 2 : 1;
    const hp = Math.max(0, state.hp - dmg);
    const finishing = hp === 0;
    this.db.nodes[sn.id] = { hp, harvestedAt: finishing ? Date.now() : null };
    let gained: Inventory | undefined;
    let droppedPiece = false;
    if (finishing && who && this.db.players[who]) {
      gained = { ...t.yield };
      for (const [item, count] of Object.entries(t.yield)) {
        inv[item as keyof Inventory] = (inv[item as keyof Inventory] ?? 0) + (count as number);
      }
      // old map scraps drift back when the jungle is worked (see tablet t3)
      if (Math.random() < MAP_PIECE_DROP_CHANCE) {
        inv.map_piece = (inv.map_piece ?? 0) + 1;
        gained.map_piece = 1;
        droppedPiece = true;
      }
    }
    this.saveSoon();
    if (droppedPiece) this.emitQuest();
    const node = this.nodeState(sn);
    this.emit('nodeChanged', node);
    return {
      ok: true,
      node,
      finishing,
      gained,
      inventory: who && this.db.players[who] ? { ...this.db.players[who].inventory } : undefined,
    };
  }

  async craft(recipeId: string): Promise<CraftResult> {
    await this.lag();
    const recipe = RECIPES.find((r) => r.id === recipeId);
    const p = this.me ? this.db.players[this.me] : null;
    if (!recipe || !p) return { ok: false, reason: 'UNKNOWN_RECIPE' };
    if (recipe.requiresTool && (p.inventory[recipe.requiresTool] ?? 0) <= 0) {
      return { ok: false, reason: 'TOOL_REQUIRED' };
    }
    for (const [res, count] of Object.entries(recipe.cost)) {
      if ((p.inventory[res as keyof Inventory] ?? 0) < (count as number)) {
        return { ok: false, reason: 'INSUFFICIENT' };
      }
    }
    for (const [res, count] of Object.entries(recipe.cost)) {
      p.inventory[res as keyof Inventory]! -= count as number;
    }
    p.inventory[recipe.output] = (p.inventory[recipe.output] ?? 0) + recipe.count;
    this.saveNow();
    return { ok: true, crafted: recipe.output, inventory: { ...p.inventory } };
  }

  async placeStructure(item: StructureId, tx: number, ty: number, text?: string): Promise<PlaceResult> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    if (!p || (p.inventory[item] ?? 0) <= 0) return { ok: false, reason: 'NOT_IN_INVENTORY' };
    const key = tileKey(tx, ty);
    const def = ITEMS[item];
    // ADR-0008 footprint-claim: EVERY footprint tile must be free, in-bounds, and
    // the right terrain — first on the footprint wins.
    const { w, h } = footprint(item);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const fx = tx + dx;
        const fy = ty + dy;
        if (fx < 0 || fy < 0 || fx >= MAP_W || fy >= MAP_H) return { ok: false, reason: 'INVALID' };
        if (this.structTiles.has(tileKey(fx, fy))) return { ok: false, reason: 'OCCUPIED' };
        if (this.nodesByTile.get(tileKey(fx, fy))) return { ok: false, reason: 'INVALID' }; // never build on a Resource Node's spot (incl. fishing spots)
        const b = this.world.blocked[fy * MAP_W + fx];
        if (def.onWater ? b !== 1 : b !== 0) return { ok: false, reason: 'INVALID' };
      }
    }
    p.inventory[item]! -= 1;
    const structure: Structure = {
      id: `s${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      type: item,
      tx,
      ty,
      placedBy: this.me!,
      placedAt: Date.now(),
    };
    if (item === 'signpost') structure.text = (text ?? '').trim().slice(0, 40);
    this.db.structures[key] = structure; // keyed by the anchor tile
    for (const k of this.footprintTiles(structure)) this.structTiles.set(k, structure);
    // A3 (ADR-0010): the Hall founds/relocates the Village; a milestone Building
    // raised in-zone advances the tier. Emit villageChanged so grandeur updates.
    if (isVillageStructure(item)) {
      const before = this.db.world!.village!.tier;
      if (this.noteVillageBuild(item, tx, ty)) {
        const v = this.db.world!.village!;
        if (item === 'village_hall' && before === 0) {
          this.pushChat({ from: t.system.sender, text: t.system.villageFounded(this.me ?? ''), ts: Date.now() });
        } else if (v.tier > before) {
          this.pushChat({ from: t.system.sender, text: t.system.villageGrew(t.village.tierName(v.tier)), ts: Date.now() });
        }
        this.emit('villageChanged', this.villageState());
      }
    }
    this.saveNow();
    this.emit('structurePlaced', structure);
    return { ok: true, structure, inventory: { ...p.inventory } };
  }

  async dismantleStructure(id: string): Promise<DismantleResult> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    if (!p) return { ok: false, reason: 'NO_STRUCTURE' };
    const entry = Object.entries(this.db.structures).find(([, s]) => s.id === id);
    if (!entry) return { ok: false, reason: 'NO_STRUCTURE' };
    const [key, s] = entry;
    // remove the row + free every footprint tile it claimed (ADR-0008: no ownership)
    delete this.db.structures[key];
    for (const k of this.footprintTiles(s)) {
      if (this.structTiles.get(k)?.id === id) this.structTiles.delete(k);
    }
    // functional-Structure state dies with the Structure
    if (s.type === 'crate') delete this.db.crates?.[id];
    if (s.type === 'sawmill') delete this.db.sawmills?.[id];
    // the generic Refiner kernel is type-blind (keyed by structure id alone),
    // so ANY Refiner's queue dies here — no per-type case ever needed
    delete this.db.refiners?.[id];
    // A3 (ADR-0010): dismantling THE Hall un-homes the Village (spawn falls back
    // to World spawn) but PRESERVES tier/pool/milestones — progress is
    // tile-independent, re-founding never resets it.
    const village = this.db.world!.village;
    if (s.type === 'village_hall' && village?.hall && village.hall.tx === s.tx && village.hall.ty === s.ty) {
      village.hall = null;
      this.emit('villageChanged', this.villageState());
    }
    // FULL refund of the crafting cost to the dismantler (nothing for an
    // uncraftable Structure, e.g. a dug golden idol)
    const recipe = RECIPES.find((r) => r.output === s.type);
    const refund: Inventory = {};
    if (recipe) {
      for (const [res, count] of Object.entries(recipe.cost)) {
        refund[res as keyof Inventory] = count as number;
        p.inventory[res as keyof Inventory] = (p.inventory[res as keyof Inventory] ?? 0) + (count as number);
      }
    }
    this.saveNow();
    this.emit('structureRemoved', id);
    return { ok: true, removed: id, refund, inventory: { ...p.inventory } };
  }

  // ------------------------------------------------------------ v3: crates (shared storage)

  private crateOf(crateId: string): Inventory | null {
    const s = Object.values(this.db.structures).find((st) => st.id === crateId && st.type === 'crate');
    if (!s) return null;
    return (this.db.crates![crateId] ??= {});
  }

  async crateOpen(crateId: string): Promise<CrateResult> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    const contents = this.crateOf(crateId);
    if (!contents || !p) return { ok: false, reason: 'NO_CRATE' };
    return { ok: true, contents: { ...contents }, inventory: { ...p.inventory } };
  }

  async crateDeposit(crateId: string, item: ItemId, count: number): Promise<CrateResult> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    const contents = this.crateOf(crateId);
    if (!contents || !p) return { ok: false, reason: 'NO_CRATE' };
    const give = Math.min(Math.max(0, Math.floor(count)), p.inventory[item] ?? 0);
    if (give <= 0) return { ok: false, reason: 'NOTHING' };
    p.inventory[item]! -= give;
    contents[item] = (contents[item] ?? 0) + give;
    this.saveNow();
    this.emit('crateChanged', crateId, { ...contents });
    return { ok: true, contents: { ...contents }, inventory: { ...p.inventory } };
  }

  async crateWithdraw(crateId: string, item: ItemId, count: number): Promise<CrateResult> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    const contents = this.crateOf(crateId);
    if (!contents || !p) return { ok: false, reason: 'NO_CRATE' };
    // server-ordered: simultaneous withdrawals clamp to what is really there
    const take = Math.min(Math.max(0, Math.floor(count)), contents[item] ?? 0);
    if (take <= 0) return { ok: false, reason: 'NOTHING' };
    contents[item]! -= take;
    if (contents[item] === 0) delete contents[item];
    p.inventory[item] = (p.inventory[item] ?? 0) + take;
    this.saveNow();
    this.emit('crateChanged', crateId, { ...contents });
    return { ok: true, contents: { ...contents }, inventory: { ...p.inventory } };
  }

  // ------------------------------------------------------------ v3: the Sawmill

  /**
   * Lazy-timestamp milling (ADR-0001, same pattern as node regrowth): one
   * plank finishes every SAWMILL_PLANK_MS; nothing ticks, everything is
   * derived from `since` whenever the mill is next touched.
   */
  private sawmillOf(sawmillId: string): { wood: number; since: number } | null {
    const s = Object.values(this.db.structures).find((st) => st.id === sawmillId && st.type === 'sawmill');
    if (!s) return null;
    return (this.db.sawmills![sawmillId] ??= { wood: 0, since: 0 });
  }

  private sawmillPublic(m: { wood: number; since: number }): SawmillState {
    const now = Date.now();
    const done = m.wood > 0 ? Math.min(m.wood, Math.floor((now - m.since) / SAWMILL_PLANK_MS)) : 0;
    const milling = m.wood - done;
    return {
      wood: milling,
      ready: done,
      nextPlankMs: milling > 0 ? SAWMILL_PLANK_MS - ((now - m.since) % SAWMILL_PLANK_MS) : null,
    };
  }

  async sawmillOpen(sawmillId: string): Promise<SawmillResult> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    const m = this.sawmillOf(sawmillId);
    if (!m || !p) return { ok: false, reason: 'NO_SAWMILL' };
    return { ok: true, state: this.sawmillPublic(m), inventory: { ...p.inventory } };
  }

  async sawmillDeposit(sawmillId: string): Promise<SawmillResult> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    const m = this.sawmillOf(sawmillId);
    if (!m || !p) return { ok: false, reason: 'NO_SAWMILL' };
    const room = SAWMILL_WOOD_CAP - m.wood;
    const give = Math.min(p.inventory.wood ?? 0, room);
    if (give <= 0) return { ok: false, reason: 'NOTHING' };
    if (m.wood === 0) m.since = Date.now(); // the mill starts on the first log
    p.inventory.wood! -= give;
    m.wood += give;
    this.saveNow();
    return { ok: true, state: this.sawmillPublic(m), inventory: { ...p.inventory } };
  }

  async sawmillCollect(sawmillId: string): Promise<SawmillResult> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    const m = this.sawmillOf(sawmillId);
    if (!m || !p) return { ok: false, reason: 'NO_SAWMILL' };
    const now = Date.now();
    const done = m.wood > 0 ? Math.min(m.wood, Math.floor((now - m.since) / SAWMILL_PLANK_MS)) : 0;
    if (done <= 0) return { ok: false, reason: 'NOTHING' }; // collecting early yields only what is finished
    m.wood -= done;
    m.since += done * SAWMILL_PLANK_MS; // keep the partial progress of the next plank
    p.inventory.plank = (p.inventory.plank ?? 0) + done;
    this.saveNow();
    return { ok: true, state: this.sawmillPublic(m), inventory: { ...p.inventory } };
  }

  // ------------------------------------------------------------ generic Refiners (ADR-0017 §6)

  /**
   * The Sawmill's lazy-timestamp semantics, generalized: one unit refines every
   * `config.msPerUnit`; nothing ticks, everything derives from `since` when the
   * Refiner is next touched. Type-blind like the SQL twin — the row is keyed by
   * structure id alone, the client decides which Structures are Refiners.
   */
  private refinerOf(refinerId: string): { input: number; since: number } | null {
    if (!Object.values(this.db.structures).some((st) => st.id === refinerId)) return null;
    return (this.db.refiners![refinerId] ??= { input: 0, since: 0 });
  }

  private refinerPublic(m: { input: number; since: number }, cfg: RefinerConfig): RefinerState {
    const now = Date.now();
    const done = m.input > 0 ? Math.min(m.input, Math.floor((now - m.since) / cfg.msPerUnit)) : 0;
    const refining = m.input - done;
    return {
      input: refining,
      ready: done,
      nextMs: refining > 0 ? cfg.msPerUnit - ((now - m.since) % cfg.msPerUnit) : null,
    };
  }

  async refinerOpen(refinerId: string, cfg: RefinerConfig): Promise<RefinerResult> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    const m = this.refinerOf(refinerId);
    if (!m || !p) return { ok: false, reason: 'NO_REFINER' };
    return { ok: true, state: this.refinerPublic(m, cfg), inventory: { ...p.inventory } };
  }

  async refinerDeposit(refinerId: string, cfg: RefinerConfig): Promise<RefinerResult> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    const m = this.refinerOf(refinerId);
    if (!m || !p) return { ok: false, reason: 'NO_REFINER' };
    const give = Math.min(p.inventory[cfg.inputItem] ?? 0, cfg.cap - m.input);
    if (give <= 0) return { ok: false, reason: 'NOTHING' };
    if (m.input === 0) m.since = Date.now(); // work starts on the first deposit
    p.inventory[cfg.inputItem]! -= give;
    m.input += give;
    this.saveNow();
    return { ok: true, state: this.refinerPublic(m, cfg), inventory: { ...p.inventory } };
  }

  async refinerCollect(refinerId: string, cfg: RefinerConfig): Promise<RefinerResult> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    const m = this.refinerOf(refinerId);
    if (!m || !p) return { ok: false, reason: 'NO_REFINER' };
    const now = Date.now();
    const done = m.input > 0 ? Math.min(m.input, Math.floor((now - m.since) / cfg.msPerUnit)) : 0;
    if (done <= 0) return { ok: false, reason: 'NOTHING' }; // collecting early yields only what is finished
    m.input -= done;
    m.since += done * cfg.msPerUnit; // keep the partial progress of the next unit
    p.inventory[cfg.outputItem] = (p.inventory[cfg.outputItem] ?? 0) + done;
    this.saveNow();
    return { ok: true, state: this.refinerPublic(m, cfg), inventory: { ...p.inventory } };
  }

  async readTablet(id: string): Promise<QuestState> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    if (p && this.world.tablets.some((t) => t.id === id)) {
      p.tablets ??= [];
      if (!p.tablets.includes(id)) {
        p.tablets.push(id);
        this.saveNow();
        if (p.tablets.length === this.world.tablets.length) {
          this.pushChat({ from: t.system.sender, text: t.system.tabletsAllRead(this.me ?? ''), ts: Date.now() });
        }
      }
    }
    const q = this.questState();
    this.emit('quest', q);
    return q;
  }

  async offerAltar(): Promise<OfferResult> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    if (this.db.world!.gateOpen) return { ok: false, reason: 'ALREADY_OPEN' };
    if (!p || (p.inventory.fruit ?? 0) < 2 || (p.inventory.fiber ?? 0) < 2) {
      return { ok: false, reason: 'INSUFFICIENT' };
    }
    p.inventory.fruit! -= 2;
    p.inventory.fiber! -= 2;
    this.db.world!.gateOpen = true;
    this.saveNow();
    this.emit('gateOpened');
    this.pushChat({ from: t.system.sender, text: t.system.groveOpened(this.me ?? ''), ts: Date.now() });
    const q = this.questState();
    this.emit('quest', q);
    return { ok: true, inventory: { ...p.inventory }, quest: q };
  }

  async dig(): Promise<DigResult> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    if (!p || (p.inventory.map_piece ?? 0) < 3) return { ok: false, reason: 'NO_MAP' };
    const spot = this.world.treasureSpots[this.db.world!.treasureIndex];
    const ptx = Math.floor(p.x / TILE);
    const pty = Math.floor(p.y / TILE);
    if (Math.abs(ptx - spot.tx) > 1 || Math.abs(pty - spot.ty) > 1) return { ok: false, reason: 'NOT_HERE' };
    p.inventory.map_piece! -= 3;
    const loot: Inventory = { wood: 10, stone: 8, fruit: 6, fiber: 6, golden_idol: 1 };
    for (const [item, count] of Object.entries(loot)) {
      p.inventory[item as keyof Inventory] = (p.inventory[item as keyof Inventory] ?? 0) + (count as number);
    }
    const n = this.world.treasureSpots.length;
    this.db.world!.treasureIndex = (this.db.world!.treasureIndex + 1 + Math.floor(Math.random() * (n - 1))) % n;
    this.saveNow();
    this.pushChat({ from: t.system.sender, text: t.system.treasureUnearthed(this.me ?? ''), ts: Date.now() });
    const q = this.questState();
    this.emit('quest', q);
    return { ok: true, loot, inventory: { ...p.inventory }, quest: q };
  }

  // ------------------------------------------------------------ v2: the Seal

  /** overall progress 0..100 across the four quotas */
  private sealPercent(): number {
    const s = this.db.world!.seal!;
    const q = this.sealTargets();
    let done = 0;
    let total = 0;
    for (const res of SEAL_RESOURCES) {
      done += Math.min(s.contributed[res], q[res]);
      total += q[res];
    }
    return (done / total) * 100;
  }

  async contributeSeal(): Promise<ContributeSealResult> {
    await this.lag();
    const seal = this.db.world!.seal!;
    const p = this.me ? this.db.players[this.me] : null;
    if (seal.broken) return { ok: false, reason: 'ALREADY_BROKEN' };
    if (!p) return { ok: false, reason: 'NOTHING_TO_GIVE' };
    const before = this.sealPercent();
    const q = this.sealTargets();
    const taken: Inventory = {};
    for (const res of SEAL_RESOURCES) {
      const need = Math.max(0, q[res] - seal.contributed[res]);
      const give = Math.min(p.inventory[res] ?? 0, need); // an overshoot takes only what is needed
      if (give > 0) {
        p.inventory[res]! -= give;
        seal.contributed[res] += give;
        taken[res] = give;
      }
    }
    if (Object.keys(taken).length === 0) return { ok: false, reason: 'NOTHING_TO_GIVE' };
    const after = this.sealPercent();
    for (const milestone of [25, 50, 75]) {
      if (before < milestone && after >= milestone && after < 100) {
        this.pushChat({ from: t.system.sender, text: t.system.sealWeakens(milestone), ts: Date.now() });
      }
    }
    if (SEAL_RESOURCES.every((res) => seal.contributed[res] >= q[res])) {
      seal.broken = true; // once, forever
      this.pushChat({
        from: t.system.sender,
        text: t.system.sealBroken,
        ts: Date.now(),
      });
      this.emit('sealBroken');
    }
    this.saveNow();
    this.emit('sealChanged', this.sealState());
    return { ok: true, taken, inventory: { ...p.inventory }, seal: this.sealState() };
  }

  // ------------------------------------------------------------ A3: the Village (ADR-0010)

  async contributeVillage(amounts?: Inventory): Promise<ContributeVillageResult> {
    await this.lag();
    const v = (this.db.world!.village ??= emptyVillage());
    const p = this.me ? this.db.players[this.me] : null;
    if (!v.hall) return { ok: false, reason: 'NO_HALL' };
    if (!p) return { ok: false, reason: 'NOTHING_TO_GIVE' };
    // the pool stops at the next tier's threshold until its milestone stands —
    // refused at cap, nothing deducted (the no-loss contract)
    const room = villagePoolCap(v.tier) - v.pool;
    const { taken, points } = villageContribution(p.inventory, amounts, Math.max(0, room));
    if (points <= 0) return { ok: false, reason: room <= 0 ? 'POOL_FULL' : 'NOTHING_TO_GIVE' };
    for (const [item, n] of Object.entries(taken)) {
      p.inventory[item as ItemId] = (p.inventory[item as ItemId] ?? 0) - n;
      if ((p.inventory[item as ItemId] ?? 0) <= 0) delete p.inventory[item as ItemId];
    }
    const before = v.tier;
    v.pool += points; // additive, permanent — never decays
    v.tier = recomputeTier(v).tier;
    if (v.tier > before) {
      this.pushChat({ from: t.system.sender, text: t.system.villageGrew(t.village.tierName(v.tier)), ts: Date.now() });
    }
    this.saveNow();
    this.emit('villageChanged', this.villageState());
    return { ok: true, taken: taken as Inventory, inventory: { ...p.inventory }, village: this.villageState(), gained: points };
  }

  async tradeMarket(giveItem: ItemId, giveCount: number, getItem: ItemId): Promise<TradeResult> {
    await this.lag();
    const v = (this.db.world!.village ??= emptyVillage());
    const p = this.me ? this.db.players[this.me] : null;
    if (!p || v.tier < 3) return { ok: false, reason: 'NO_MARKET' };
    if (!TRADEABLE.includes(giveItem) || !TRADEABLE.includes(getItem)) return { ok: false, reason: 'NOT_TRADEABLE' };
    const want = Math.max(0, Math.floor(giveCount));
    if (want <= 0 || (p.inventory[giveItem] ?? 0) < want) return { ok: false, reason: 'INSUFFICIENT' };
    const got = tradeYield(giveItem, want, getItem, v.tier);
    if (got <= 0) return { ok: false, reason: 'NO_YIELD' };
    p.inventory[giveItem] = (p.inventory[giveItem] ?? 0) - want;
    if ((p.inventory[giveItem] ?? 0) <= 0) delete p.inventory[giveItem];
    p.inventory[getItem] = (p.inventory[getItem] ?? 0) + got;
    this.saveNow();
    return { ok: true, gave: { item: giveItem, count: want }, got: { item: getItem, count: got }, inventory: { ...p.inventory } };
  }

  async wishFountain(count: number): Promise<WishResult> {
    await this.lag();
    const v = (this.db.world!.village ??= emptyVillage());
    const p = this.me ? this.db.players[this.me] : null;
    const item = FOUNTAIN_WISH_ITEM as ItemId;
    if (!p || !v.hall) return { ok: false, reason: 'NO_FOUNTAIN' };
    if (festivalActive(v, Date.now())) return { ok: false, reason: 'FESTIVAL_ACTIVE' };
    const want = Math.max(0, Math.floor(count));
    if (want <= 0 || (p.inventory[item] ?? 0) < want) return { ok: false, reason: 'INSUFFICIENT' };
    p.inventory[item] = (p.inventory[item] ?? 0) - want;
    if ((p.inventory[item] ?? 0) <= 0) delete p.inventory[item];
    v.wishes = (v.wishes ?? 0) + want;
    let festivalStarted = false;
    if (v.wishes >= FOUNTAIN_WISH_THRESHOLD) {
      v.wishes = 0;
      v.festivalUntil = Date.now() + FESTIVAL_MS;
      festivalStarted = true;
      this.pushChat({ from: t.system.sender, text: t.system.festivalStarted, ts: Date.now() });
    }
    this.saveNow();
    this.emit('villageChanged', this.villageState());
    return { ok: true, inventory: { ...p.inventory }, village: this.villageState(), festivalStarted };
  }

  async setVillageName(name: string, crest: number): Promise<{ village: VillageRecord }> {
    await this.lag();
    const v = (this.db.world!.village ??= emptyVillage());
    v.name = name.slice(0, 24);
    v.crest = crest;
    this.saveNow();
    this.emit('villageChanged', this.villageState());
    return { village: this.villageState() };
  }

  async addVillageNote(text: string): Promise<{ village: VillageRecord }> {
    await this.lag();
    const v = (this.db.world!.village ??= emptyVillage());
    v.chronicle = [...(v.chronicle ?? []), `${this.me ?? '?'}: ${text.slice(0, 60)}`];
    this.saveNow();
    this.emit('villageChanged', this.villageState());
    return { village: this.villageState() };
  }

  // ------------------------------------------------------------ v2: the Guardian

  /**
   * Lazy end-of-fight reconciliation (ADR-0001: no tick loop). Two deadlines,
   * whichever applies: a DORMANT Guardian re-slumbers if unstruck within
   * DORMANT_TIMEOUT_MS of the summon; an ENGAGED one re-slumbers, unbeaten, at
   * engagedAt + GUARDIAN_AWAKE_MS. Either way the totem is spent (never
   * refunded) — the fight row is simply discarded, resetting HP. Materializes
   * whenever state is next touched (or via the one-shot check below).
   */
  private reconcileGuardian(): void {
    const f = this.db.world!.fight;
    if (!f) return;
    const now = Date.now();
    const wardenName = f.warden ? t.warden.name(f.warden) : null;
    if (f.engagedAt === null) {
      if (now < f.summonedAt + DORMANT_TIMEOUT_MS) return;
      this.db.world!.fight = null;
      this.saveNow();
      this.pushChat({
        from: t.system.sender,
        text: wardenName ? t.system.wardenNoStrike(wardenName) : t.system.guardianNoStrike,
        ts: now,
      });
      this.emit('guardianSlumber');
      return;
    }
    // engaged: re-slumber unbeaten at the awake-window deadline OR early once the
    // arena has emptied (whole roster Exhausted — ADR-0004 wipe), whichever first
    const emptied = f.emptySlumberAt !== null && now >= f.emptySlumberAt;
    if (f.hp > 0 && (emptied || now >= f.engagedAt + GUARDIAN_AWAKE_MS)) {
      this.db.world!.fight = null; // HP resets by discarding the fight
      this.saveNow();
      this.pushChat({
        from: t.system.sender,
        text: wardenName ? t.system.wardenUnbeaten(wardenName) : t.system.guardianUnbeaten,
        ts: now,
      });
      this.emit('guardianSlumber');
    }
  }

  /** mock nicety: fire the slumber broadcast at the deadline, not on next touch */
  private scheduleSlumberCheck(): void {
    if (this.slumberTimer !== null) {
      window.clearTimeout(this.slumberTimer);
      this.slumberTimer = null;
    }
    const f = this.db.world!.fight;
    if (!f) return;
    // dormant → the 90s grace deadline; engaged → the awake-window deadline, or
    // sooner if the arena has emptied (whole roster Exhausted — ADR-0004 wipe)
    let deadline = f.engagedAt === null ? f.summonedAt + DORMANT_TIMEOUT_MS : f.engagedAt + GUARDIAN_AWAKE_MS;
    if (f.emptySlumberAt !== null) deadline = Math.min(deadline, f.emptySlumberAt);
    this.slumberTimer = window.setTimeout(() => {
      this.slumberTimer = null;
      this.reconcileGuardian();
    }, Math.max(0, deadline - Date.now()) + 80);
  }

  async summonGuardian(): Promise<SummonResult> {
    await this.lag();
    this.reconcileGuardian();
    const p = this.me ? this.db.players[this.me] : null;
    if (!this.db.world!.seal!.broken) return { ok: false, reason: 'SEAL_INTACT' };
    if (this.db.world!.fight) return { ok: false, reason: 'FIGHT_IN_PROGRESS' };
    if (!p || (p.inventory.summon_totem ?? 0) < 1) return { ok: false, reason: 'NO_TOTEM' };
    p.inventory.summon_totem! -= 1; // spent now — never refunded, even on timeout/loss (ADR-0004)
    // DORMANT: the Guardian wakes but roams harmlessly — no roster, HP unfixed,
    // no danger schedule — until the FIRST STRIKE engages it (hitGuardian).
    const fight: DbFight = {
      summonedAt: Date.now(),
      engagedAt: null,
      roster: [],
      hp: 0,
      maxHp: 0,
      participants: [],
      knockdowns: {},
      lastKnockdownWave: {},
      emptySlumberAt: null,
    };
    this.db.world!.fight = fight;
    this.saveNow();
    // schedule the ~90s dormant re-slumber (setTimeout via DORMANT_TIMEOUT_MS);
    // the first strike reschedules this to the awake-window deadline instead
    this.scheduleSlumberCheck();
    this.pushChat({ from: t.system.sender, text: t.system.guardianStirs(this.me ?? ''), ts: Date.now() });
    const pub = this.fightState()!;
    this.emit('guardianSummoned', pub);
    return { ok: true, fight: pub, inventory: { ...p.inventory } };
  }

  // ---------------------------------------------------------------- the Wardens (ADR-0017)

  /** lay every carried demanded good at the Warden's altar (the Seal pattern per rung) */
  async contributeWardenAltar(wardenId: string): Promise<ContributeWardenResult> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    if (!p) return { ok: false, reason: 'NOTHING_TO_GIVE' };
    const wardens = (this.db.world!.wardens ??= {});
    const w = (wardens[wardenId] ??= { altar: { broken: false, contributed: {} }, gateOpen: false });
    if (w.altar.broken) return { ok: false, reason: 'ALREADY_BROKEN' };
    const quotas = wardenAltarQuotas(wardenId, 1);
    const taken: Inventory = {};
    for (const [item, quota] of Object.entries(quotas)) {
      const need = Math.max(0, quota - (w.altar.contributed[item] ?? 0));
      const give = Math.min(p.inventory[item as ItemId] ?? 0, need);
      if (give > 0) {
        p.inventory[item as ItemId] = (p.inventory[item as ItemId] ?? 0) - give;
        w.altar.contributed[item] = (w.altar.contributed[item] ?? 0) + give;
        taken[item as ItemId] = give;
      }
    }
    if (Object.keys(taken).length === 0) return { ok: false, reason: 'NOTHING_TO_GIVE' };
    w.altar.broken = Object.entries(quotas).every(([item, quota]) => (w.altar.contributed[item] ?? 0) >= quota);
    this.saveNow();
    const altar = this.wardenState(wardenId).altar;
    this.emit('wardenAltarChanged', wardenId, altar);
    if (w.altar.broken) {
      this.pushChat({ from: t.system.sender, text: t.system.wardenAltarComplete(t.warden.name(wardenId)), ts: Date.now() });
    }
    return { ok: true, taken, inventory: { ...p.inventory }, altar };
  }

  /** consume the Warden's Totem and wake it — refused while ANY fight runs (the mutex) */
  async summonWarden(wardenId: string): Promise<SummonResult> {
    await this.lag();
    this.reconcileGuardian();
    const def = wardenDef(wardenId);
    const p = this.me ? this.db.players[this.me] : null;
    if (!def || !p) return { ok: false, reason: 'NO_TOTEM' };
    if (!this.db.world!.wardens?.[wardenId]?.altar.broken) return { ok: false, reason: 'ALTAR_INTACT' };
    if (this.db.world!.fight) return { ok: false, reason: 'FIGHT_IN_PROGRESS' };
    if ((p.inventory[def.totem] ?? 0) < 1) return { ok: false, reason: 'NO_TOTEM' };
    p.inventory[def.totem]! -= 1; // spent now — never refunded (the Guardian's rule)
    const fight: DbFight = {
      warden: wardenId,
      summonedAt: Date.now(),
      engagedAt: null,
      roster: [],
      hp: 0,
      maxHp: 0,
      participants: [],
      knockdowns: {},
      lastKnockdownWave: {},
      emptySlumberAt: null,
    };
    this.db.world!.fight = fight;
    this.saveNow();
    this.scheduleSlumberCheck();
    this.pushChat({ from: t.system.sender, text: t.system.wardenStirs(t.warden.name(wardenId), this.me ?? ''), ts: Date.now() });
    const pub = this.fightState()!;
    this.emit('guardianSummoned', pub); // the ONE fight slot rides the guardian* events
    return { ok: true, fight: pub, inventory: { ...p.inventory } };
  }

  /** turn the gate key at the Realm arch — one-time, forever (the Delve-shaft pattern) */
  async openRealmGate(wardenId: string): Promise<OpenRealmResult> {
    await this.lag();
    const wardens = (this.db.world!.wardens ??= {});
    const w = (wardens[wardenId] ??= { altar: { broken: false, contributed: {} }, gateOpen: false });
    if (w.gateOpen) return { ok: false, reason: 'ALREADY_OPEN' };
    w.gateOpen = true;
    this.saveNow();
    this.emit('realmOpened', wardenId);
    this.pushChat({ from: t.system.sender, text: t.system.realmOpened(t.warden.realmName(wardenId), this.me ?? ''), ts: Date.now() });
    return { ok: true, wardenId };
  }

  // ---------------------------------------------------------------- the Echoes (ADR-0017 rung 2)

  /** record a movement shade — spends a Chime Charm, quantised like the server */
  async recordEcho(ghostId: string, samples: EchoSample[], periodMs: number): Promise<{ ghost: Ghost; inventory: Inventory } | null> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    if (!p || !ghostId || samples.length < 2 || samples.length > 400) return null;
    if ((p.inventory.chime_charm ?? 0) < 1) return null;
    p.inventory.chime_charm = (p.inventory.chime_charm ?? 0) - 1; // spend the charm (§7 sink)
    const recordedAt = quantizeStart(Date.now(), periodMs);
    const echoes = (this.db.echoes ??= {});
    echoes[ghostId] = { who: this.me ?? '', recordedAt, periodMs, samples };
    this.saveNow();
    return { ghost: { ghostId, who: this.me ?? '', recordedAt, periodMs, samples }, inventory: { ...p.inventory } };
  }

  /** list every shade in this World (RPC-read parity — never presence) */
  async listEchoes(): Promise<Ghost[]> {
    await this.lag();
    return Object.entries(this.db.echoes ?? {}).map(([ghostId, g]) => ({
      ghostId,
      who: g.who,
      recordedAt: g.recordedAt,
      periodMs: g.periodMs,
      samples: g.samples,
      kind: g.kind ?? 'echo',
    }));
  }

  /** leave a permanent, named greeting shade (mastery mark; one per Player) */
  async leaveGreeting(samples: EchoSample[], periodMs: number): Promise<Ghost | null> {
    await this.lag();
    if (!this.me || samples.length < 2 || samples.length > 400) return null;
    const recordedAt = quantizeStart(Date.now(), periodMs);
    const ghostId = `${this.me}@greet`;
    const echoes = (this.db.echoes ??= {});
    echoes[ghostId] = { who: this.me, recordedAt, periodMs, samples, kind: 'greeting' };
    this.saveNow();
    return { ghostId, who: this.me, recordedAt, periodMs, samples, kind: 'greeting' };
  }

  /** clear one shade (no orphaned recordings) */
  async forgetEcho(ghostId: string): Promise<void> {
    await this.lag();
    if (this.db.echoes) delete this.db.echoes[ghostId];
    this.saveNow();
  }

  /** summon the Reverberant by solving the puzzle — no altar/totem, keeps the mutex */
  async summonReverberant(): Promise<SummonResult> {
    await this.lag();
    this.reconcileGuardian();
    const p = this.me ? this.db.players[this.me] : null;
    if (!p) return { ok: false, reason: 'NO_TOTEM' };
    if (this.db.world!.fight) return { ok: false, reason: 'FIGHT_IN_PROGRESS' };
    const fight: DbFight = {
      warden: 'reverb',
      summonedAt: Date.now(),
      engagedAt: null,
      roster: [],
      hp: 0,
      maxHp: 0,
      participants: [],
      knockdowns: {},
      lastKnockdownWave: {},
      emptySlumberAt: null,
    };
    this.db.world!.fight = fight;
    this.saveNow();
    this.scheduleSlumberCheck();
    this.pushChat({ from: t.system.sender, text: t.system.reverbRises(this.me ?? ''), ts: Date.now() });
    const pub = this.fightState()!;
    this.emit('guardianSummoned', pub);
    return { ok: true, fight: pub, inventory: { ...p.inventory } };
  }

  /** the Reverberant's defeat reward — epic helm + reliquary (first-ever) + weekly sigil/resources */
  async claimReverb(week: number): Promise<{ ok: boolean; inventory?: Inventory; firstEver?: boolean; weekly?: boolean }> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    if (!p) return { ok: false };
    const trophies = (this.db.reverbTrophies ??= []);
    const firstEver = !trophies.includes(this.me ?? '');
    if (firstEver) {
      trophies.push(this.me ?? '');
      p.inventory.hushsteel_helm_epic = (p.inventory.hushsteel_helm_epic ?? 0) + 1;
      p.inventory.hushdark_reliquary = (p.inventory.hushdark_reliquary ?? 0) + 1;
    }
    const clears = (this.db.reverbClears ??= {});
    const key = `${this.me}#${week}`;
    const weekly = !clears[key];
    if (weekly) {
      clears[key] = true;
      p.inventory.echo_sigil = (p.inventory.echo_sigil ?? 0) + 1;
      p.inventory.echo_crystal = (p.inventory.echo_crystal ?? 0) + 8;
      p.inventory.hushsteel = (p.inventory.hushsteel ?? 0) + 2;
    }
    this.saveNow();
    return { ok: true, inventory: { ...p.inventory }, firstEver, weekly };
  }

  // ---------------------------------------------------------------- the Delve (ADR-0007)

  async openDelve(): Promise<OpenDelveResult> {
    await this.lag();
    if (this.db.world!.delveOpen) return { ok: false, reason: 'ALREADY_OPEN' };
    this.db.world!.delveOpen = true;
    this.saveNow();
    this.emit('delveOpened');
    this.pushChat({ from: t.system.sender, text: t.system.delveOpened(this.me ?? ''), ts: Date.now() });
    this.emit('quest', this.questState());
    return { ok: true, delveOpen: true };
  }

  async claimDelveLoot(loot: Inventory, record?: DepthRecordWrite): Promise<{ inventory: Inventory }> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    if (!p) return { inventory: {} };
    // the run's only persisted write (ADR-0007 §8) — mob HP never touches the DB
    for (const [k, v] of Object.entries(loot)) p.inventory[k as ItemId] = (p.inventory[k as ItemId] ?? 0) + (v as number);
    // ADR-0015: the Depth Record rides the same write — mirror of migration 0011.
    // Both upserts only ever RAISE a depth (append/upsert-only, never pruned).
    if (record && this.me) {
      const rec = (this.db.world!.depthRecords ??= { descents: {}, bests: {} });
      const d = rec.descents[record.descentId];
      if (!d || d.depth < record.depth) {
        rec.descents[record.descentId] = { depth: record.depth, roster: [...record.roster], at: Date.now() };
      }
      const b = rec.bests[this.me];
      if (!b || b.depth < record.depth) rec.bests[this.me] = { depth: record.depth, at: Date.now() };
    }
    this.saveNow();
    return { inventory: { ...p.inventory } };
  }

  /** the World's Depth Records (ADR-0015): deepest-first, ties by earliest set */
  async getDepthRecords(): Promise<DepthRecords> {
    await this.lag();
    const rec = this.db.world?.depthRecords ?? { descents: {}, bests: {} };
    const descents = Object.entries(rec.descents)
      .map(([descentId, d]) => ({ descentId, depth: d.depth, roster: [...d.roster], achievedAt: d.at }))
      .sort((a, b) => b.depth - a.depth || a.achievedAt - b.achievedAt)
      .slice(0, 50);
    const bests = Object.entries(rec.bests)
      .map(([name, b]) => ({ name, depth: b.depth, achievedAt: b.at }))
      .sort((a, b) => b.depth - a.depth || a.achievedAt - b.achievedAt)
      .slice(0, 50);
    return { descents, bests };
  }

  /** single-player: the lone Player is always the host, so nothing is on the wire */
  sendDungeon(_msg: DungeonMsg): void {
    /* no peers to broadcast to in the Mock world */
  }

  /** ADR-0012: the creature-host election roster — just the lone real Player (bots
   *  are sim flavor, never host candidates), so the Mock Player is always the host */
  creatureRoster(): string[] {
    return this.me ? [this.me] : [];
  }

  /** single-player: the lone Player is the creature host — nothing goes on the wire */
  sendCreatures(_msg: CreatureMsg): void {
    /* no peers in the Mock world */
  }

  async hitGuardian(withTool?: ToolId): Promise<GuardianHitResult> {
    await this.lag();
    this.reconcileGuardian();
    const f = this.db.world!.fight;
    const p = this.me ? this.db.players[this.me] : null;
    if (!f || !p) return { ok: false, reason: 'NO_FIGHT' };
    const me = this.me!;
    const now = Date.now();
    if (f.engagedAt === null) {
      // FIRST STRIKE — engage: anchor the clock, lock the roster (Players inside
      // the arena rect right now), fix HP = HP_PER_HEAD × roster size (?fight
      // stays a trivial fixed pool), then apply THIS hit WITHOUT an Eye gate —
      // no schedule exists yet to gate against (ADR-0004).
      f.engagedAt = now;
      const roster = this.playersInArena(f.warden);
      if (!roster.includes(me)) roster.push(me); // the striker is always in the fight
      f.roster = roster;
      f.maxHp = DEV_FIGHT || DEV_WARDEN_FIGHT || DEV_VERDANT_FIGHT ? DEV_FIGHT_HP : HP_PER_HEAD * roster.length;
      f.hp = f.maxHp;
      this.scheduleSlumberCheck(); // switch from the dormant grace to the awake window
      this.emit('guardianEngaged', this.fightState()!); // clients re-anchor to engagedAt + raise the Ward
    } else {
      // roster is locked: only Players sealed inside the Ward at the first
      // strike may damage the Guardian — outsiders deflect off it
      if (!f.roster.includes(me)) {
        return { ok: true, hp: f.hp, victory: false, inventory: { ...p.inventory }, deflected: true, damage: 0, crit: false };
      }
      // later hits are adjudicated from engagedAt + SERVER elapsed time, exactly
      // like knockdowns: they land only inside an Eye Window — of the ACTIVE
      // fight's kit (ADR-0017: a Warden fight derives from its own schedule)
      const elapsed = now - f.engagedAt;
      if (!eyeOpenWithin(elapsed, GUARDIAN_AWAKE_MS, ADJUDICATION_SLACK_MS, kitOf(f.warden))) {
        return { ok: true, hp: f.hp, victory: false, inventory: { ...p.inventory }, deflected: true, damage: 0, crit: false };
      }
    }
    // trust the claimed in-hand Tool only if owned; the SERVER rolls the weapon
    // band + crit (ADR-0006 §2/§3), supplying Math.random as the rng. The worn
    // Helm's flat band raise rides in like the Village crit buff (ADR-0017 §3).
    const owned = withTool && gearOwns(p.inventory, p.equipped, withTool) ? withTool : undefined;
    const { damage: dmg, crit } = rollGuardianDamage(owned, Math.random, villageBuff(this.villageState().tier).critChance, armorBuff(p.equipped));
    f.hp = Math.max(0, f.hp - dmg);
    if (!f.participants.includes(me)) f.participants.push(me);
    this.emit('guardianHit', f.hp, me);
    if (f.hp === 0) {
      // victory: every participant with ≥1 hit is owed the full drop set — but the
      // Scales are no longer poured straight into the pack. Each fighter takes them
      // out of the client-side Spoils window (claimDelveLoot). Mirrors the Supabase
      // path (p_scale_drop: 0) so both backends grant boss loot the same way.
      const participants = [...f.participants];
      const wardenId = f.warden;
      this.db.world!.fight = null;
      this.saveNow();
      this.scheduleSlumberCheck();
      this.pushChat({
        from: t.system.sender,
        text: wardenId
          ? t.system.wardenBested(t.warden.name(wardenId), participants.join(', '))
          : t.system.guardianBested(participants.join(', '), GUARDIAN_SCALE_DROP),
        ts: Date.now(),
      });
      this.emit('guardianVictory', participants);
      return { ok: true, hp: 0, victory: true, inventory: { ...p.inventory }, deflected: false, damage: dmg, crit };
    }
    this.saveSoon();
    return { ok: true, hp: f.hp, victory: false, inventory: { ...p.inventory }, deflected: false, damage: dmg, crit };
  }

  async reportKnockdown(tx: number, ty: number): Promise<KnockdownResult> {
    await this.lag();
    this.reconcileGuardian();
    const f = this.db.world!.fight;
    const p = this.me ? this.db.players[this.me] : null;
    if (!f || !p) return { ok: false, reason: 'NO_FIGHT' };
    const me = this.me!;
    // A dormant Guardian has no danger schedule; and only roster members who are
    // NOT already Exhausted (< 3 knockdowns, hard removal — ADR-0004) can be
    // knocked down. Outsiders and the Exhausted are rejected outright.
    if (f.engagedAt === null || !f.roster.includes(me) || (f.knockdowns[me] ?? 0) >= EXHAUSTION_KNOCKDOWNS) {
      return { ok: false, reason: 'NOT_IN_DANGER' };
    }
    // validate against SERVER time and the pure schedule, re-anchored to
    // engagedAt (ADR-0002 amended); wave 0's danger is the entrance (Ward slam).
    // The schedule is the ACTIVE fight's kit (ADR-0017).
    const kit = kitOf(f.warden);
    const an = this.arenaAnatomy(f.warden);
    const elapsed = Date.now() - f.engagedAt;
    const ax = tx - an.arena.x;
    const ay = ty - an.arena.y;
    // danger is a slam/lunge tile OR the authored melee danger-ring hugging the
    // boss's live footprint (ADR-0006 §7) — both pure functions of the schedule +
    // position, adjudicated against SERVER time with the same slack, in ITS arena
    const inSlam = isDangerousAt(elapsed, ax, ay, GUARDIAN_AWAKE_MS, ADJUDICATION_SLACK_MS, this.entranceSpot(f.warden), kit);
    const inRing = inMeleeRingDangerAt(elapsed, ax, ay, GUARDIAN_AWAKE_MS, this.homeSpot(f.warden), ADJUDICATION_SLACK_MS, kit);
    if (!inSlam && !inRing) {
      return { ok: false, reason: 'NOT_IN_DANGER' };
    }
    // Exhaustion wakes a Player at the Village Hall, else the World spawn
    // (ADR-0010 §4 as amended — the Hammock rung is retired)
    const atVillage = !!this.db.world!.village?.hall;
    const wake = this.wakeTileFor(p);
    // the slam window (incl. slack) never crosses a wave boundary, so the
    // wave at the report's server time is the wave that hit
    const wave = waveInfoAt(elapsed, GUARDIAN_AWAKE_MS, kit).index;
    if (f.lastKnockdownWave[me] === wave) {
      // duplicate report for the same slam — count it once
      return { ok: true, knockdowns: f.knockdowns[me] ?? 0, exhausted: false, wake, atVillage };
    }
    f.lastKnockdownWave[me] = wave;
    f.knockdowns[me] = (f.knockdowns[me] ?? 0) + 1;
    const knockdowns = f.knockdowns[me];
    const exhausted = knockdowns >= EXHAUSTION_KNOCKDOWNS;
    if (exhausted) {
      // HARD Exhaustion (ADR-0004): OUT for the rest of this fight. The counter
      // is NOT reset — it stays ≥ EXHAUSTION_KNOCKDOWNS so the guard above bars
      // further knockdowns and the Ward bars re-entry. Wake at the wake point,
      // inventory intact; hits already landed keep loot eligibility.
      p.x = (wake.tx + 0.5) * TILE;
      p.y = (wake.ty + 0.5) * TILE;
      this.pushChat({
        from: t.system.sender,
        text: t.system.exhaustionCollapse(me, atVillage),
        ts: Date.now(),
      });
      // this Player is now Exhausted + teleported out; if that empties the arena
      // of live roster members, start the ~5 s re-slumber grace (B2 — subsumes
      // the all-Exhausted wipe and any who had already stepped out)
      this.evaluateArenaOccupancy();
    }
    this.saveSoon();
    return { ok: true, knockdowns, exhausted, wake, atVillage };
  }

  // ------------------------------------------------------------ v2: fishing & cooking

  async cook(): Promise<CookResult> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    if (!p || (p.inventory.fish ?? 0) < 1) return { ok: false, reason: 'NO_FISH' };
    p.inventory.fish! -= 1;
    p.inventory.cooked_fish = (p.inventory.cooked_fish ?? 0) + 1;
    this.saveNow();
    return { ok: true, inventory: { ...p.inventory } };
  }

  async eatCookedFish(): Promise<EatResult> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    if (!p || (p.inventory.cooked_fish ?? 0) < 1) return { ok: false, reason: 'NOTHING_TO_EAT' };
    p.inventory.cooked_fish! -= 1;
    this.saveNow();
    return { ok: true, inventory: { ...p.inventory }, buffMs: SPEED_BUFF_MS };
  }

  async eatCookedMeat(): Promise<EatResult> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    if (!p || (p.inventory.cooked_meat ?? 0) < 1) return { ok: false, reason: 'NOTHING_TO_EAT' };
    p.inventory.cooked_meat! -= 1;
    this.saveNow();
    return { ok: true, inventory: { ...p.inventory }, buffMs: SPEED_BUFF_MS };
  }

  async eatGrasweaveRation(): Promise<EatResult> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    if (!p || (p.inventory.grasweave_ration ?? 0) < 1) return { ok: false, reason: 'NOTHING_TO_EAT' };
    p.inventory.grasweave_ration! -= 1;
    this.saveNow();
    return { ok: true, inventory: { ...p.inventory }, buffMs: SPEED_BUFF_MS };
  }

  async dropItem(item: ItemId, count: number): Promise<DropResult> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    const held = p ? (p.inventory[item] ?? 0) : 0;
    if (!p || held < 1) return { ok: false, reason: 'NOT_OWNED' };
    p.inventory[item] = held - Math.max(1, Math.min(count, held));
    this.saveNow();
    return { ok: true, inventory: { ...p.inventory } };
  }

  // ------------------------------------------------------------ v2: intro story

  async markIntroSeen(): Promise<void> {
    const p = this.me ? this.db.players[this.me] : null;
    if (p && !p.introSeen) {
      p.introSeen = true;
      this.saveNow();
    }
  }

  /** dev/testing helper — not part of the Backend interface */
  debugGrant(items: Inventory): Inventory | null {
    const p = this.me ? this.db.players[this.me] : null;
    if (!p) return null;
    for (const [k, v] of Object.entries(items)) {
      p.inventory[k as keyof Inventory] = (p.inventory[k as keyof Inventory] ?? 0) + (v as number);
    }
    this.saveNow();
    return { ...p.inventory };
  }

  // ---------------------------------------------------------------- bots

  private botPos(b: Bot): PlayerPos {
    return { name: b.name, appearance: b.appearance, x: b.x, y: b.y, dir: b.dir, moving: b.moving };
  }

  private startBots(): void {
    if (this.botTimer !== null) return;
    const now = Date.now();
    this.bots = BOT_DEFS.map((d, i) => ({
      name: d.name,
      appearance: d.appearance,
      x: (this.world.spawn.tx + 3 + i * 3) * TILE,
      y: (this.world.spawn.ty + 2 + i) * TILE,
      dir: 'down' as Dir,
      moving: false,
      mode: 'idle' as const,
      targetX: 0,
      targetY: 0,
      targetNode: null,
      idleUntil: now + rand(1000, 3000),
      nextChatAt: now + rand(6000, 15000),
      nextHitAt: 0,
      lines: d.lines,
    }));
    this.emit('presence', this.bots.map((b) => this.botPos(b)));
    let lastEmit = 0;
    let last = performance.now();
    this.botTimer = window.setInterval(() => {
      const nowMs = performance.now();
      const dt = Math.min(0.25, (nowMs - last) / 1000);
      last = nowMs;
      for (const b of this.bots) this.tickBot(b, dt);
      if (nowMs - lastEmit > 120) {
        lastEmit = nowMs;
        for (const b of this.bots) this.emit('position', this.botPos(b));
      }
    }, 60);
  }

  private tickBot(b: Bot, dt: number): void {
    const now = Date.now();
    if (now >= b.nextChatAt) {
      b.nextChatAt = now + rand(25000, 50000);
      this.pushChat({ from: b.name, text: b.lines[Math.floor(Math.random() * b.lines.length)], ts: now });
    }
    if (b.mode === 'idle') {
      b.moving = false;
      if (now < b.idleUntil) return;
      // sometimes go harvest a nearby node, otherwise wander
      if (Math.random() < 0.4) {
        const node = this.findBotNode(b);
        if (node) {
          b.targetNode = node;
          b.targetX = (node.tx + 0.5) * TILE;
          b.targetY = (node.ty + 1.2) * TILE;
          b.mode = 'walk';
          return;
        }
      }
      for (let i = 0; i < 10; i++) {
        const tx = Math.round(b.x / TILE) + Math.floor(rand(-8, 8));
        const ty = Math.round(b.y / TILE) + Math.floor(rand(-8, 8));
        if (this.isWalkableTile(tx, ty)) {
          b.targetX = (tx + 0.5) * TILE;
          b.targetY = (ty + 0.5) * TILE;
          b.targetNode = null;
          b.mode = 'walk';
          return;
        }
      }
      b.idleUntil = now + 1500;
    } else if (b.mode === 'walk') {
      const dx = b.targetX - b.x;
      const dy = b.targetY - b.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 4) {
        b.mode = b.targetNode ? 'harvest' : 'idle';
        b.idleUntil = now + rand(800, 2500);
        b.nextHitAt = now + 500;
        b.moving = false;
        return;
      }
      const speed = 70;
      const nx = b.x + (dx / dist) * speed * dt;
      const ny = b.y + (dy / dist) * speed * dt;
      // don't glide over water/solids
      if (!this.isWalkableTile(Math.floor(nx / TILE), Math.floor(ny / TILE))) {
        b.mode = 'idle';
        b.idleUntil = now + 1000;
        b.targetNode = null;
        b.moving = false;
        return;
      }
      b.x = nx;
      b.y = ny;
      b.moving = true;
      b.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    } else if (b.mode === 'harvest') {
      b.moving = false;
      if (!b.targetNode) {
        b.mode = 'idle';
        return;
      }
      if (now >= b.nextHitAt) {
        b.nextHitAt = now + 800;
        const result = this.doHit(b.targetNode.id, null);
        if (!result.ok || result.finishing) {
          b.targetNode = null;
          b.mode = 'idle';
          b.idleUntil = now + rand(1500, 4000);
        }
      }
    }
  }

  private findBotNode(b: Bot): StaticNode | null {
    const btx = Math.round(b.x / TILE);
    const bty = Math.round(b.y / TILE);
    let best: StaticNode | null = null;
    let bestDist = Infinity;
    for (const n of this.world.nodes) {
      const t = NODE_TYPES[n.type];
      if (t.requiredTool) continue; // bots carry no machete
      const d = Math.abs(n.tx - btx) + Math.abs(n.ty - bty);
      if (d < bestDist && d > 1 && d < 18 && this.nodeState(n).hp > 0) {
        bestDist = d;
        best = n;
      }
    }
    return best;
  }
}
