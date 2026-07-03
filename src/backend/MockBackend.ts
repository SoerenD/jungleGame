import {
  DEV_FIGHT,
  GUARDIAN_AWAKE_MS,
  GUARDIAN_MAX_HP,
  GUARDIAN_SCALE_DROP,
  EXHAUSTION_KNOCKDOWNS,
  LATENCY_MAX,
  LATENCY_MIN,
  MAP_H,
  MAP_PIECE_DROP_CHANCE,
  MAP_W,
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
import { ITEMS, type StructureId } from '../content/items';
import { NODE_TYPES, holdsBonusTool, type NodeTypeId } from '../content/nodeTypes';
import { RECIPES } from '../content/recipes';
import { legacyAppearance, sanitizeAppearance } from '../avatars';
import type {
  Appearance,
  AvatarId,
  Backend,
  BackendEvents,
  ChatMsg,
  ContributeSealResult,
  CookResult,
  CraftResult,
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
}

/** a live fight; the private fields never leave the server */
interface DbFight {
  summonedAt: number;
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
      'gonna build a fence around camp later',
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
    const res = await fetch('/map/world-data.json');
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
    if (s && ITEMS[s.type].blocks) return false;
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
    };
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
    return { summonedAt: f.summonedAt, hp: f.hp, maxHp: f.maxHp, participants: [...f.participants] };
  }

  private emitQuest(): void {
    this.emit('quest', this.questState());
  }

  // ---------------------------------------------------------------- realtime-ish

  sendPosition(x: number, y: number, _dir: Dir, _moving: boolean): void {
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

  async hitNode(nodeId: string): Promise<HitResult> {
    await this.lag();
    return this.doHit(nodeId, this.me);
  }

  /** Shared mutation path for the local player and bots — server-ordered by JS single-threading. */
  private doHit(nodeId: string, who: string | null): HitResult {
    const sn = this.nodesById.get(nodeId);
    if (!sn) return { ok: false, reason: 'UNKNOWN_NODE' };
    const t = NODE_TYPES[sn.type];
    const state = this.nodeState(sn);
    if (state.hp <= 0) return { ok: false, reason: 'DEPLETED' };
    const inv = who ? this.db.players[who]?.inventory ?? {} : {};
    if (t.requiredTool && !(who && (inv[t.requiredTool] ?? 0) > 0)) {
      return { ok: false, reason: 'TOOL_REQUIRED', requiredTool: t.requiredTool };
    }
    const dmg = who && holdsBonusTool(inv, t.bonusTool) ? 2 : 1;
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

  async placeStructure(item: StructureId, tx: number, ty: number): Promise<PlaceResult> {
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
    this.db.structures[key] = structure;
    this.saveNow();
    this.emit('structurePlaced', structure);
    return { ok: true, structure, inventory: { ...p.inventory } };
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
   * Lazy end-of-fight reconciliation (ADR-0001: no tick loop). Everything
   * derives from summonedAt; this just materializes "the timer ran out"
   * whenever state is next touched (or via the one-shot check below).
   */
  private reconcileGuardian(): void {
    const f = this.db.world!.fight;
    if (f && Date.now() >= f.summonedAt + GUARDIAN_AWAKE_MS && f.hp > 0) {
      this.db.world!.fight = null; // HP resets by discarding the fight
      this.saveNow();
      this.pushChat({
        from: '🌿 Jungle',
        text: 'the Guardian returns to slumber, unbeaten. The arena falls silent — another Offering will wake it.',
        ts: Date.now(),
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
    const remaining = f.summonedAt + GUARDIAN_AWAKE_MS - Date.now();
    this.slumberTimer = window.setTimeout(() => {
      this.slumberTimer = null;
      this.reconcileGuardian();
    }, Math.max(0, remaining) + 80);
  }

  async summonGuardian(): Promise<SummonResult> {
    await this.lag();
    this.reconcileGuardian();
    const p = this.me ? this.db.players[this.me] : null;
    if (!this.db.world!.seal!.broken) return { ok: false, reason: 'SEAL_INTACT' };
    if (this.db.world!.fight) return { ok: false, reason: 'FIGHT_IN_PROGRESS' };
    if (!p || (p.inventory.summon_totem ?? 0) < 1) return { ok: false, reason: 'NO_TOTEM' };
    p.inventory.summon_totem! -= 1;
    const fight: DbFight = {
      summonedAt: Date.now(),
      hp: GUARDIAN_MAX_HP,
      maxHp: GUARDIAN_MAX_HP,
      participants: [],
      knockdowns: {},
      lastKnockdownWave: {},
    };
    this.db.world!.fight = fight;
    this.saveNow();
    this.scheduleSlumberCheck();
    this.pushChat({ from: '🌿 Jungle', text: `${this.me} laid an Offering on the altar — the Guardian WAKES! To the arena!`, ts: Date.now() });
    const pub = this.fightState()!;
    this.emit('guardianSummoned', pub);
    return { ok: true, fight: pub, inventory: { ...p.inventory } };
  }

  async hitGuardian(): Promise<GuardianHitResult> {
    await this.lag();
    this.reconcileGuardian();
    const f = this.db.world!.fight;
    const p = this.me ? this.db.players[this.me] : null;
    if (!f || !p) return { ok: false, reason: 'NO_FIGHT' };
    // damage validity is adjudicated from summonedAt + SERVER elapsed time,
    // exactly like knockdowns: hits land only inside an Eye Window
    const elapsed = Date.now() - f.summonedAt;
    if (!eyeOpenWithin(elapsed, GUARDIAN_AWAKE_MS, ADJUDICATION_SLACK_MS)) {
      return { ok: true, hp: f.hp, victory: false, inventory: { ...p.inventory }, deflected: true };
    }
    const dmg = guardianDamage(p.inventory);
    f.hp = Math.max(0, f.hp - dmg);
    if (!f.participants.includes(this.me!)) f.participants.push(this.me!);
    this.emit('guardianHit', f.hp, this.me!);
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
    // validate against SERVER time and the pure schedule (ADR-0002)
    const elapsed = Date.now() - f.summonedAt;
    const ax = tx - this.world.arena.x;
    const ay = ty - this.world.arena.y;
    if (!isDangerousAt(elapsed, ax, ay, GUARDIAN_AWAKE_MS, ADJUDICATION_SLACK_MS)) {
      return { ok: false, reason: 'NOT_IN_DANGER' };
    }
    const spawn = { ...this.world.spawn };
    // the slam window (incl. slack) never crosses a wave boundary, so the
    // wave at the report's server time is the wave that hit
    const wave = waveInfoAt(elapsed, GUARDIAN_AWAKE_MS).index;
    const me = this.me!;
    if (f.lastKnockdownWave[me] === wave) {
      // duplicate report for the same slam — count it once
      return { ok: true, knockdowns: f.knockdowns[me] ?? 0, exhausted: false, spawn };
    }
    f.lastKnockdownWave[me] = wave;
    f.knockdowns[me] = (f.knockdowns[me] ?? 0) + 1;
    const knockdowns = f.knockdowns[me];
    const exhausted = knockdowns >= EXHAUSTION_KNOCKDOWNS;
    if (exhausted) {
      // Exhaustion: wake at the World spawn, inventory intact, counter refreshed
      f.knockdowns[me] = 0;
      p.x = (spawn.tx + 0.5) * TILE;
      p.y = (spawn.ty + 0.5) * TILE;
      this.pushChat({ from: '🌿 Jungle', text: `${me} collapses from Exhaustion and wakes at the spawn — hits already landed still count!`, ts: Date.now() });
    }
    this.saveSoon();
    return { ok: true, knockdowns, exhausted, spawn };
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
