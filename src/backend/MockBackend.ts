import {
  DEV_FIGHT,
  DEV_FIGHT_HP,
  DORMANT_TIMEOUT_MS,
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
  SEAL_QUOTAS,
  SPEED_BUFF_MS,
  STORAGE_KEY,
  TILE,
} from '../config';
import {
  ADJUDICATION_SLACK_MS,
  eyeOpenWithin,
  guardianDamage,
  isDangerousAt,
  waveInfoAt,
} from '../content/guardian';
import { ITEMS, type ItemId, type StructureId, type ToolId } from '../content/items';
import { NODE_TYPES, toolSatisfies, type NodeTypeId } from '../content/nodeTypes';
import { RECIPES } from '../content/recipes';
import { legacyAppearance, sanitizeAppearance } from '../avatars';
import { asset } from '../paths';
import type {
  Appearance,
  AvatarId,
  Backend,
  BackendEvents,
  ChatMsg,
  ContributeSealResult,
  CookResult,
  CraftResult,
  CrateResult,
  DigResult,
  Dir,
  EatResult,
  FightState,
  GuardianHitResult,
  HitResult,
  Inventory,
  JoinResult,
  JourneyState,
  JourneyStepId,
  KnockdownResult,
  NodeState,
  OfferResult,
  PlaceResult,
  PlayerPos,
  QuestState,
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
  /** the Player's Hammock tile — Exhaustion and login wake here (one per Player) */
  wakePoint?: { tx: number; ty: number };
  /** fog-of-war chunk indices this Player has explored (persisted like journey) */
  explored?: number[];
}

/** a live fight; the private fields never leave the server */
interface DbFight {
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
  chatLog: ChatMsg[];
  world?: {
    gateOpen: boolean;
    treasureIndex: number;
    seal?: { broken: boolean; contributed: Record<SealResourceId, number> };
    fight?: DbFight | null;
  };
}

const SEAL_RESOURCES: SealResourceId[] = ['wood', 'stone', 'fiber', 'fruit'];

const BOT_DEFS: { name: string; appearance: Appearance; lines: string[] }[] = [
  {
    name: 'Kiki',
    appearance: { skin: 2, hair: 4, shirt: 1, pants: 3 },
    lines: [
      'the waterfall is thundering today',
      'found a juicy fruit bush near the delta',
      'anyone seen the hidden grove?',
      'chopping some wood, brb',
      'these vines are impossible without a machete',
      'meet me at the ruins!',
    ],
  },
  {
    name: 'Bruno',
    appearance: { skin: 4, hair: 0, shirt: 2, pants: 1 },
    lines: [
      'the swamp smells... interesting',
      'stacking stones like a pro',
      'gonna build a hut wall around camp later',
      'watch out, I take the last hit >:)',
      'this jungle heals fast',
      'who put a crate in the river delta?',
    ],
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
  private me: string | null = null;
  private listeners = new Map<string, Set<(...args: any[]) => void>>();
  private nodesByTile = new Map<string, StaticNode>();
  private nodesById = new Map<string, StaticNode>();
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
    const raw = localStorage.getItem(STORAGE_KEY);
    this.db = raw
      ? (JSON.parse(raw) as Db)
      : { players: {}, nodes: {}, structures: {}, chatLog: [] };
    this.db.world ??= { gateOpen: false, treasureIndex: 0 };
    this.db.world.seal ??= { broken: false, contributed: { wood: 0, stone: 0, fiber: 0, fruit: 0 } };
    this.db.world.fight ??= null;
    this.db.crates ??= {};
    this.db.sawmills ??= {};
    // drop anything whose id is no longer a known item — retired Structures/Tools
    // (e.g. the fence, the Stone Path) vanish for good instead of crashing later
    // lookups in placed structures, player packs, and crate storage
    for (const [key, s] of Object.entries(this.db.structures)) {
      if (!ITEMS[s.type]) delete this.db.structures[key];
    }
    for (const p of Object.values(this.db.players)) {
      for (const k of Object.keys(p.inventory)) {
        if (!ITEMS[k as ItemId]) delete p.inventory[k as ItemId];
      }
    }
    for (const contents of Object.values(this.db.crates ?? {})) {
      for (const k of Object.keys(contents)) {
        if (!ITEMS[k as ItemId]) delete contents[k as ItemId];
      }
    }
    this.saveSoon();
    if (DEV_FIGHT) this.db.world.seal.broken = true; // ?fight — jump straight to the Guardian
    this.scheduleSlumberCheck();
    window.addEventListener('beforeunload', () => this.saveNow());
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

  private saveNow(): void {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
  }

  private saveSoon(): void {
    if (this.saveTimer !== null) return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
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
    const s = this.db.structures[tileKey(tx, ty)];
    if (b === 1) return s?.type === 'bridge';
    if (b !== 0) return false;
    if (s && ITEMS[s.type]?.blocks) return false;
    const n = this.nodesByTile.get(tileKey(tx, ty));
    if (n && NODE_TYPES[n.type].blocks && this.nodeState(n).hp > 0) return false;
    return true;
  }

  // ---------------------------------------------------------------- join / snapshot

  async join(name: string, pin: string, appearance: Appearance): Promise<JoinResult> {
    await this.lag();
    name = name.trim();
    if (!/^[\w :-]{2,16}$/.test(name)) return { ok: false, reason: 'BAD_NAME' };
    if (!/^\d{4}$/.test(pin)) return { ok: false, reason: 'BAD_PIN' };
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
    this.normalizeJourney(name, p);
    this.startBots();
    // login position: the owner's Hammock replaces the World spawn
    if (p.wakePoint) {
      p.x = (p.wakePoint.tx + 0.5) * TILE;
      p.y = (p.wakePoint.ty + 0.5) * TILE;
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
    };
  }

  async markExplored(chunks: number[]): Promise<void> {
    const p = this.me ? this.db.players[this.me] : null;
    if (!p) return;
    const seen = new Set(p.explored ?? []);
    for (const c of chunks) seen.add(c);
    p.explored = [...seen];
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
    };
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
    };
  }

  private sealState(): SealState {
    const s = this.db.world!.seal!;
    return { broken: s.broken, contributed: { ...s.contributed }, quotas: { ...SEAL_QUOTAS } };
  }

  private fightState(): FightState | null {
    const f = this.db.world!.fight;
    if (!f) return null;
    return {
      summonedAt: f.summonedAt,
      engagedAt: f.engagedAt,
      roster: [...f.roster],
      hp: f.hp,
      maxHp: f.maxHp,
      participants: [...f.participants],
    };
  }

  /**
   * Arena-local center spot of the entrance (the sealGate the Ward re-seals).
   * The gate sits just below the arena's bottom row, so the ay is clamped into
   * the arena — the Guardian's wave-0 leap lands in front of the doorway.
   */
  private entranceSpot(): { ax: number; ay: number } {
    const a = this.world.arena;
    const g = this.world.sealGate;
    const mid = g[Math.floor(g.length / 2)] ?? { tx: a.x + Math.floor(a.w / 2), ty: a.y + a.h - 1 };
    return {
      ax: Math.max(0, Math.min(a.w - 1, mid.tx - a.x)),
      ay: Math.max(0, Math.min(a.h - 1, mid.ty - a.y)),
    };
  }

  /**
   * Names of the Players (the local Player + bots) whose tile falls inside the
   * arena rect right now — the roster snapshot taken at the first strike. In a
   * SupabaseBackend this reads live presence; the Mock has one real Player.
   */
  private playersInArena(): string[] {
    const a = this.world.arena;
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

  private emitQuest(): void {
    this.emit('quest', this.questState());
  }

  // ---------------------------------------------------------------- realtime-ish

  sendPosition(x: number, y: number, _dir: Dir, _moving: boolean, _held?: ItemId): void {
    // `_held` is a Realtime-broadcast field in a real backend (a SupabaseBackend
    // relays it to other clients for the overhead icon); the single-client Mock
    // has no peers to echo it to, so it is accepted and dropped.
    const p = this.me ? this.db.players[this.me] : null;
    if (p) {
      p.x = x;
      p.y = y;
      this.saveSoon();
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
    const owned = withTool && (inv[withTool] ?? 0) > 0 ? withTool : undefined;
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
    if (this.db.structures[key]) return { ok: false, reason: 'OCCUPIED' }; // first placement wins
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return { ok: false, reason: 'INVALID' };
    const b = this.world.blocked[ty * MAP_W + tx];
    const def = ITEMS[item];
    if (this.nodesByTile.get(key)) return { ok: false, reason: 'INVALID' }; // never build on a Resource Node's spot (incl. fishing spots)
    if (def.onWater) {
      if (b !== 1) return { ok: false, reason: 'INVALID' };
    } else {
      if (b !== 0) return { ok: false, reason: 'INVALID' };
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
    if (item === 'hammock') {
      // one active Hammock per Player — placing a new one retires the old point
      p.wakePoint = { tx, ty };
    }
    this.db.structures[key] = structure;
    this.saveNow();
    this.emit('structurePlaced', structure);
    return { ok: true, structure, inventory: { ...p.inventory } };
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

  async readTablet(id: string): Promise<QuestState> {
    await this.lag();
    const p = this.me ? this.db.players[this.me] : null;
    if (p && this.world.tablets.some((t) => t.id === id)) {
      p.tablets ??= [];
      if (!p.tablets.includes(id)) {
        p.tablets.push(id);
        this.saveNow();
        if (p.tablets.length === this.world.tablets.length) {
          this.pushChat({ from: '🌿 Jungle', text: `${this.me} has read all the ancient tablets!`, ts: Date.now() });
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
    this.pushChat({ from: '🌿 Jungle', text: `the vines part — ${this.me} has opened the Hidden Grove!`, ts: Date.now() });
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
    this.pushChat({ from: '🌿 Jungle', text: `${this.me} unearthed a buried treasure!`, ts: Date.now() });
    const q = this.questState();
    this.emit('quest', q);
    return { ok: true, loot, inventory: { ...p.inventory }, quest: q };
  }

  // ------------------------------------------------------------ v2: the Seal

  /** overall progress 0..100 across the four quotas */
  private sealPercent(): number {
    const s = this.db.world!.seal!;
    let done = 0;
    let total = 0;
    for (const res of SEAL_RESOURCES) {
      done += Math.min(s.contributed[res], SEAL_QUOTAS[res]);
      total += SEAL_QUOTAS[res];
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
    const taken: Inventory = {};
    for (const res of SEAL_RESOURCES) {
      const need = Math.max(0, SEAL_QUOTAS[res] - seal.contributed[res]);
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
        this.pushChat({ from: '🌿 Jungle', text: `the Seal weakens — ${milestone}% of the offerings are gathered!`, ts: Date.now() });
      }
    }
    if (SEAL_RESOURCES.every((res) => seal.contributed[res] >= SEAL_QUOTAS[res])) {
      seal.broken = true; // once, forever
      this.pushChat({
        from: '🌿 Jungle',
        text: '⚡ THE SEAL IS BROKEN! The arena at the Ruins stands open — the Guardian awaits whoever dares bring an Offering to its altar.',
        ts: Date.now(),
      });
      this.emit('sealBroken');
    }
    this.saveNow();
    this.emit('sealChanged', this.sealState());
    return { ok: true, taken, inventory: { ...p.inventory }, seal: this.sealState() };
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
    if (f.engagedAt === null) {
      if (now < f.summonedAt + DORMANT_TIMEOUT_MS) return;
      this.db.world!.fight = null;
      this.saveNow();
      this.pushChat({
        from: '🌿 Jungle',
        text: 'no one struck in time — the Guardian loses interest and sinks back into slumber. The totem is spent.',
        ts: now,
      });
      this.emit('guardianSlumber');
      return;
    }
    if (now >= f.engagedAt + GUARDIAN_AWAKE_MS && f.hp > 0) {
      this.db.world!.fight = null; // HP resets by discarding the fight
      this.saveNow();
      this.pushChat({
        from: '🌿 Jungle',
        text: 'the Guardian returns to slumber, unbeaten. The arena falls silent — another Offering will wake it.',
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
    // dormant → the 90s grace deadline; engaged → the awake-window deadline
    const deadline = f.engagedAt === null ? f.summonedAt + DORMANT_TIMEOUT_MS : f.engagedAt + GUARDIAN_AWAKE_MS;
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
    };
    this.db.world!.fight = fight;
    this.saveNow();
    // schedule the ~90s dormant re-slumber (setTimeout via DORMANT_TIMEOUT_MS);
    // the first strike reschedules this to the awake-window deadline instead
    this.scheduleSlumberCheck();
    this.pushChat({ from: '🌿 Jungle', text: `${this.me} laid an Offering on the altar — the Guardian STIRS! Gather at the arena and strike to begin.`, ts: Date.now() });
    const pub = this.fightState()!;
    this.emit('guardianSummoned', pub);
    return { ok: true, fight: pub, inventory: { ...p.inventory } };
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
      const roster = this.playersInArena();
      if (!roster.includes(me)) roster.push(me); // the striker is always in the fight
      f.roster = roster;
      f.maxHp = DEV_FIGHT ? DEV_FIGHT_HP : HP_PER_HEAD * roster.length;
      f.hp = f.maxHp;
      this.scheduleSlumberCheck(); // switch from the dormant grace to the awake window
      this.emit('guardianEngaged', this.fightState()!); // clients re-anchor to engagedAt + raise the Ward
    } else {
      // roster is locked: only Players sealed inside the Ward at the first
      // strike may damage the Guardian — outsiders deflect off it
      if (!f.roster.includes(me)) {
        return { ok: true, hp: f.hp, victory: false, inventory: { ...p.inventory }, deflected: true };
      }
      // later hits are adjudicated from engagedAt + SERVER elapsed time, exactly
      // like knockdowns: they land only inside an Eye Window
      const elapsed = now - f.engagedAt;
      if (!eyeOpenWithin(elapsed, GUARDIAN_AWAKE_MS, ADJUDICATION_SLACK_MS)) {
        return { ok: true, hp: f.hp, victory: false, inventory: { ...p.inventory }, deflected: true };
      }
    }
    // trust the claimed in-hand Tool only if owned: axe/pickaxe (or tier-2) → 3,
    // bow or bare → 2 (a flat +1 for the matching Tool, NOT the Node ×2)
    const owned = withTool && (p.inventory[withTool] ?? 0) > 0 ? withTool : undefined;
    const dmg = guardianDamage(owned);
    f.hp = Math.max(0, f.hp - dmg);
    if (!f.participants.includes(me)) f.participants.push(me);
    this.emit('guardianHit', f.hp, me);
    if (f.hp === 0) {
      // victory: every participant with ≥1 hit receives the full drop set
      const participants = [...f.participants];
      for (const name of participants) {
        const pl = this.db.players[name];
        if (pl) pl.inventory.guardian_scale = (pl.inventory.guardian_scale ?? 0) + GUARDIAN_SCALE_DROP;
      }
      this.db.world!.fight = null;
      this.saveNow();
      this.scheduleSlumberCheck();
      this.pushChat({
        from: '🌿 Jungle',
        text: `🏆 THE GUARDIAN IS BESTED! ${participants.join(', ')} carried the day — ${GUARDIAN_SCALE_DROP} Guardian Scales to every fighter. It sinks back into slumber.`,
        ts: Date.now(),
      });
      this.emit('guardianVictory', participants);
      return { ok: true, hp: 0, victory: true, inventory: { ...p.inventory }, deflected: false };
    }
    this.saveSoon();
    return { ok: true, hp: f.hp, victory: false, inventory: { ...p.inventory }, deflected: false };
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
    // engagedAt (ADR-0002 amended); wave 0's danger is the entrance (Ward slam)
    const elapsed = Date.now() - f.engagedAt;
    const ax = tx - this.world.arena.x;
    const ay = ty - this.world.arena.y;
    if (!isDangerousAt(elapsed, ax, ay, GUARDIAN_AWAKE_MS, ADJUDICATION_SLACK_MS, this.entranceSpot())) {
      return { ok: false, reason: 'NOT_IN_DANGER' };
    }
    // Exhaustion wakes a Player at their Hammock, else at the World spawn
    const atHammock = !!p.wakePoint;
    const wake = p.wakePoint ? { ...p.wakePoint } : { ...this.world.spawn };
    // the slam window (incl. slack) never crosses a wave boundary, so the
    // wave at the report's server time is the wave that hit
    const wave = waveInfoAt(elapsed, GUARDIAN_AWAKE_MS).index;
    if (f.lastKnockdownWave[me] === wave) {
      // duplicate report for the same slam — count it once
      return { ok: true, knockdowns: f.knockdowns[me] ?? 0, exhausted: false, wake, atHammock };
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
        from: '🌿 Jungle',
        text: `${me} collapses from Exhaustion — out for this fight, waking ${atHammock ? 'in their Hammock' : 'at the spawn'}. Hits already landed still count toward the loot.`,
        ts: Date.now(),
      });
    }
    this.saveSoon();
    return { ok: true, knockdowns, exhausted, wake, atHammock };
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
