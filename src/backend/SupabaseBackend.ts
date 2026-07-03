import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import {
  DEV_FIGHT,
  DEV_FIGHT_HP,
  DORMANT_TIMEOUT_MS,
  EXHAUSTION_KNOCKDOWNS,
  GUARDIAN_AWAKE_MS,
  GUARDIAN_SCALE_DROP,
  HP_PER_HEAD,
  MAP_PIECE_DROP_CHANCE,
  MAP_W,
  MAP_H,
  SAWMILL_PLANK_MS,
  SAWMILL_WOOD_CAP,
  sealQuotas,
  SPEED_BUFF_MS,
  TILE,
} from '../config';
import { ADJUDICATION_SLACK_MS, eyeOpenWithin, guardianDamage, waveInfoAt } from '../content/guardian';
import { ITEMS, type ItemId, type StructureId, type ToolId } from '../content/items';
import { NODE_TYPES, toolSatisfies, type NodeTypeId } from '../content/nodeTypes';
import { RECIPES } from '../content/recipes';
import { sanitizeAppearance } from '../avatars';
import { asset } from '../paths';
import type {
  Appearance,
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

/** the fields of world-data.json this backend needs (a superset lives in GameScene) */
interface WorldData {
  spawn: { tx: number; ty: number };
  arena: { x: number; y: number; w: number; h: number };
  nodes: StaticNode[];
  blocked: number[];
  tablets: { id: string; tx: number; ty: number }[];
  treasureSpots: { tx: number; ty: number }[];
}

/** what a Player broadcasts about themselves (presence + position stream) */
type SelfPos = { name: string; appearance: Appearance; x: number; y: number; dir: Dir; moving: boolean; held?: ItemId };

const POS_BROADCAST_MS = 80; // cap the position stream (matches MockBackend's ~120ms feel)
const PRESENCE_REFRESH_MS = 1500; // keep the presence snapshot fresh for late joiners

/**
 * The real backend (ADR-0001): Supabase Realtime for presence/positions/events
 * and Postgres `jw_*` RPCs for every atomic mutation. It mirrors MockBackend's
 * event contract exactly — the acting client emits locally AND broadcasts to
 * peers, who emit on receipt — so GameScene/HUD need no changes.
 */
export class SupabaseBackend implements Backend {
  private supa: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  private wd!: WorldData;
  private me: string | null = null;
  private appearance: Appearance = { skin: 1, hair: 1, shirt: 1, pants: 0 };

  private listeners = new Map<string, Set<(...args: any[]) => void>>();
  private nodesById = new Map<string, StaticNode>();

  // local mirrors, kept fresh from RPC results + realtime events
  private inv: Inventory = {};
  private tablets: string[] = [];
  private gateOpen = false;
  private treasureIndex = 0;
  private fightState: FightState | null = null;
  // the Seal scales per-head: how many Players are online (from presence) and
  // the last raw seal row, so a join/leave can re-emit the bar with the new target
  private onlineCount = 1;
  private lastSeal: { broken?: boolean; contributed?: Record<string, number> } | null = null;

  // position tracking for presence + arena roster
  private lastLocal: SelfPos | null = null;
  private positions = new Map<string, SelfPos>();
  private lastPosSent = 0;
  private lastPresence = 0;

  private slumberTimer: number | null = null;

  constructor(url: string, anonKey: string) {
    this.supa = createClient(url, anonKey, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }

  async init(): Promise<void> {
    const res = await fetch(asset('/map/world-data.json'));
    this.wd = (await res.json()) as WorldData;
    for (const n of this.wd.nodes) this.nodesById.set(n.id, n);
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

  /** update the local fight mirror for a guardian event, then emit it locally */
  private dispatch(event: string, args: any[]): void {
    switch (event) {
      case 'guardianSummoned':
      case 'guardianEngaged':
        this.fightState = args[0] as FightState;
        this.scheduleSlumberCheck();
        break;
      case 'guardianHit':
        if (this.fightState) this.fightState = { ...this.fightState, hp: args[0] as number };
        break;
      case 'guardianVictory':
      case 'guardianSlumber':
        this.fightState = null;
        this.clearSlumberCheck();
        break;
    }
    this.emit(event as keyof BackendEvents, ...args);
  }

  /** emit locally (dispatch) AND broadcast to peers, who dispatch on receipt */
  private relay(event: string, ...args: any[]): void {
    this.dispatch(event, args);
    void this.channel?.send({ type: 'broadcast', event: 'evt', payload: { event, args } });
  }

  private async rpc<T = any>(fn: string, args: Record<string, unknown>): Promise<T | null> {
    const { data, error } = await this.supa.rpc(fn, args);
    if (error) {
      console.error(`[jw] rpc ${fn} failed:`, error.message);
      return null;
    }
    return data as T;
  }

  private pushChat(from: string, text: string): void {
    const msg: ChatMsg = { from, text, ts: Date.now() };
    void this.rpc('jw_send_chat', { p_from: from, p_text: msg.text, p_ts: msg.ts });
    this.relay('chat', msg);
  }

  // ---------------------------------------------------------------- join / realtime

  async join(name: string, pin: string, appearance: Appearance): Promise<JoinResult> {
    name = name.trim();
    if (!/^[\w :-]{2,16}$/.test(name)) return { ok: false, reason: 'BAD_NAME' };
    if (!/^\d{4}$/.test(pin)) return { ok: false, reason: 'BAD_PIN' };
    const appr = sanitizeAppearance(appearance);
    const spawnX = (this.wd.spawn.tx + 0.5) * TILE;
    const spawnY = (this.wd.spawn.ty + 0.5) * TILE;
    const res = await this.rpc<any>('jw_join', {
      p_name: name,
      p_pin: pin,
      p_appearance: appr,
      p_spawn_x: spawnX,
      p_spawn_y: spawnY,
    });
    if (!res) return { ok: false, reason: 'BAD_NAME' };
    if (res.ok === false) return { ok: false, reason: res.reason };

    this.me = name;
    this.appearance = appr;
    this.inv = (res.inventory ?? {}) as Inventory;
    this.tablets = (res.tablets ?? []) as string[];

    const wp = res.wakePoint as { tx: number; ty: number } | null;
    const x = wp ? (wp.tx + 0.5) * TILE : (res.x as number);
    const y = wp ? (wp.ty + 0.5) * TILE : (res.y as number);
    this.lastLocal = { name, appearance: appr, x, y, dir: 'down', moving: false };

    await this.connectRealtime(x, y);

    return {
      ok: true,
      name,
      appearance: appr,
      x,
      y,
      inventory: { ...this.inv },
      isNew: !!res.isNew,
      introSeen: !!res.introSeen,
      journey: (res.journey ?? { steps: {}, hintUses: {} }) as JourneyState,
      explored: (res.explored ?? []) as number[],
    };
  }

  private async connectRealtime(x: number, y: number): Promise<void> {
    const ch = this.supa.channel('jw-world', {
      config: { broadcast: { self: false }, presence: { key: this.me! } },
    });
    ch.on('broadcast', { event: 'evt' }, ({ payload }) => this.dispatch(payload.event, payload.args));
    ch.on('broadcast', { event: 'pos' }, ({ payload }) => this.onRemotePos(payload as SelfPos));
    ch.on('presence', { event: 'sync' }, () => this.onPresenceSync());
    ch.on('presence', { event: 'join' }, () => this.broadcastPos(true)); // re-announce so new joiners see me
    this.channel = ch;
    await new Promise<void>((resolve) => {
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void ch.track({ name: this.me, appearance: this.appearance, x, y, dir: 'down', moving: false });
          resolve();
        }
      });
    });
  }

  private onRemotePos(p: SelfPos): void {
    if (!p || p.name === this.me) return;
    this.positions.set(p.name, p);
    this.emit('position', this.toPlayerPos(p));
  }

  private onPresenceSync(): void {
    if (!this.channel) return;
    const state = this.channel.presenceState<SelfPos>();
    const players: PlayerPos[] = [];
    for (const key of Object.keys(state)) {
      const metas = state[key];
      const meta = metas[metas.length - 1];
      if (!meta || !meta.name) continue;
      if (meta.name !== this.me) this.positions.set(meta.name, meta);
      players.push(this.toPlayerPos(meta));
    }
    // drop peers no longer present so GameScene can prune their sprites
    const live = new Set(players.map((p) => p.name));
    for (const name of [...this.positions.keys()]) if (!live.has(name)) this.positions.delete(name);
    this.emit('presence', players);
    // the Seal target scales with the head count — refresh the bar live on
    // join/leave (local-only: every client recomputes from its own presence view)
    const heads = players.length || 1;
    if (heads !== this.onlineCount) {
      this.onlineCount = heads;
      if (this.lastSeal && !this.lastSeal.broken) this.emit('sealChanged', this.sealState(this.lastSeal));
    }
  }

  private toPlayerPos(p: SelfPos): PlayerPos {
    return {
      name: p.name,
      appearance: p.appearance,
      x: p.x,
      y: p.y,
      dir: p.dir ?? 'down',
      moving: !!p.moving,
      held: p.held,
    };
  }

  // ---------------------------------------------------------------- realtime-ish position

  sendPosition(x: number, y: number, dir: Dir, moving: boolean, held?: ItemId): void {
    this.lastLocal = { name: this.me!, appearance: this.appearance, x, y, dir, moving, held };
    this.broadcastPos(false);
  }

  private broadcastPos(force: boolean): void {
    if (!this.channel || !this.lastLocal) return;
    const now = Date.now();
    if (!force && now - this.lastPosSent < POS_BROADCAST_MS) return;
    this.lastPosSent = now;
    void this.channel.send({ type: 'broadcast', event: 'pos', payload: this.lastLocal });
    if (now - this.lastPresence > PRESENCE_REFRESH_MS) {
      this.lastPresence = now;
      void this.channel.track(this.lastLocal); // refresh snapshot for future joiners
    }
  }

  async sendChat(text: string): Promise<void> {
    if (!this.me) return;
    this.pushChat(this.me, text.slice(0, 200));
  }

  // ---------------------------------------------------------------- world snapshot

  async loadWorld(): Promise<WorldSnapshot> {
    // reconcile a fight that timed out while no one was around (mirrors Mock)
    await this.rpc('jw_guardian_reconcile', { p_awake_ms: GUARDIAN_AWAKE_MS, p_dormant_ms: DORMANT_TIMEOUT_MS });

    const [nodesR, structR, chatR, worldR, meR] = await Promise.all([
      this.supa.from('nodes').select('id,type,tx,ty,hp,harvested_at'),
      this.supa.from('structures').select('id,type,tx,ty,placed_by,placed_at,text'),
      this.supa.from('chat').select('from_name,text,ts').order('ts', { ascending: false }).limit(50),
      this.supa.from('world').select('gate_open,treasure_index,seal,fight').eq('id', 1).single(),
      this.me ? this.supa.from('players').select('inventory,tablets').eq('name', this.me).single() : Promise.resolve({ data: null } as any),
    ]);

    if (meR?.data) {
      this.inv = (meR.data.inventory ?? {}) as Inventory;
      this.tablets = (meR.data.tablets ?? []) as string[];
    }
    const world = worldR.data as any;
    this.gateOpen = !!world?.gate_open;
    this.treasureIndex = world?.treasure_index ?? 0;
    this.fightState = this.fightPublic(world?.fight);

    // overlay touched nodes onto the full static list, applying lazy regrow
    const now = Date.now();
    const touched = new Map<string, { hp: number; harvested_at: number | null }>();
    for (const r of (nodesR.data ?? []) as any[]) touched.set(r.id, { hp: r.hp, harvested_at: r.harvested_at });
    const nodes: NodeState[] = this.wd.nodes.map((sn) => {
      const t = NODE_TYPES[sn.type];
      const dyn = touched.get(sn.id);
      if (dyn && !(dyn.harvested_at !== null && now >= dyn.harvested_at + t.regrowMs)) {
        return { id: sn.id, type: sn.type, tx: sn.tx, ty: sn.ty, hp: dyn.hp, harvestedAt: dyn.harvested_at };
      }
      return { id: sn.id, type: sn.type, tx: sn.tx, ty: sn.ty, hp: t.maxHp, harvestedAt: null };
    });

    const structures: Structure[] = ((structR.data ?? []) as any[])
      .filter((s) => ITEMS[s.type as ItemId])
      .map((s) => ({
        id: s.id,
        type: s.type,
        tx: s.tx,
        ty: s.ty,
        placedBy: s.placed_by,
        placedAt: s.placed_at,
        ...(s.text != null ? { text: s.text } : {}),
      }));

    const chatLog: ChatMsg[] = ((chatR.data ?? []) as any[])
      .map((c) => ({ from: c.from_name, text: c.text, ts: c.ts }))
      .reverse();

    return {
      nodes,
      structures,
      chatLog,
      players: [], // populated live via presence
      quest: this.questState(),
      seal: this.sealState(world?.seal),
      fight: this.fightState,
    };
  }

  private questState(): QuestState {
    const pieces = this.inv.map_piece ?? 0;
    return {
      tabletsRead: [...this.tablets],
      tabletsTotal: this.wd.tablets.length,
      mapPieces: pieces,
      gateOpen: this.gateOpen,
      treasureLocation: pieces >= 3 ? { ...this.wd.treasureSpots[this.treasureIndex] } : null,
    };
  }

  /** the live Seal target: per-head quota × Players online right now (min 1) */
  private sealTargets(): Record<'wood' | 'stone' | 'fiber' | 'fruit', number> {
    return sealQuotas(this.onlineCount);
  }

  private sealState(seal: any): SealState {
    const s = seal ?? { broken: false, contributed: { wood: 0, stone: 0, fiber: 0, fruit: 0 } };
    this.lastSeal = s; // cache so a presence change can re-emit the bar with the new head count
    return { broken: !!s.broken, contributed: { ...s.contributed }, quotas: this.sealTargets() };
  }

  private fightPublic(f: any): FightState | null {
    if (!f) return null;
    return {
      summonedAt: f.summonedAt,
      engagedAt: f.engagedAt ?? null,
      roster: f.roster ?? [],
      hp: f.hp ?? 0,
      maxHp: f.maxHp ?? 0,
      participants: f.participants ?? [],
    };
  }

  // ---------------------------------------------------------------- gathering / crafting

  async hitNode(nodeId: string, withTool?: ToolId): Promise<HitResult> {
    const sn = this.nodesById.get(nodeId);
    if (!sn) return { ok: false, reason: 'UNKNOWN_NODE' };
    const t = NODE_TYPES[sn.type];
    const owned = withTool && (this.inv[withTool] ?? 0) > 0 ? withTool : undefined;
    if (t.requiredTool && !toolSatisfies(owned, t.requiredTool)) {
      return { ok: false, reason: 'TOOL_REQUIRED', requiredTool: t.requiredTool };
    }
    const dmg = toolSatisfies(owned, t.bonusTool) ? 2 : 1;
    const mapPiece = Math.random() < MAP_PIECE_DROP_CHANCE;
    const res = await this.rpc<any>('jw_hit_node', {
      p_id: nodeId,
      p_type: sn.type,
      p_tx: sn.tx,
      p_ty: sn.ty,
      p_max_hp: t.maxHp,
      p_regrow_ms: t.regrowMs,
      p_dmg: dmg,
      p_yield: t.yield,
      p_map_piece: mapPiece,
      p_who: this.me,
    });
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'DEPLETED' };
    const node = this.nodeFromJson(res.node);
    this.relay('nodeChanged', node);
    if (res.finishing && res.inventory) this.inv = res.inventory as Inventory;
    if (res.finishing && res.gained?.map_piece) this.emit('quest', this.questState());
    return {
      ok: true,
      node,
      finishing: !!res.finishing,
      gained: (res.gained ?? undefined) as Inventory | undefined,
      inventory: (res.inventory ?? undefined) as Inventory | undefined,
    };
  }

  private nodeFromJson(n: any): NodeState {
    return { id: n.id, type: n.type, tx: n.tx, ty: n.ty, hp: n.hp, harvestedAt: n.harvestedAt ?? null };
  }

  async craft(recipeId: string): Promise<CraftResult> {
    const recipe = RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return { ok: false, reason: 'UNKNOWN_RECIPE' };
    const res = await this.rpc<any>('jw_craft', {
      p_who: this.me,
      p_cost: recipe.cost,
      p_output: recipe.output,
      p_count: recipe.count,
      p_requires_tool: recipe.requiresTool ?? null,
    });
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'INSUFFICIENT' };
    this.inv = res.inventory as Inventory;
    return { ok: true, crafted: res.crafted as ItemId, inventory: { ...this.inv } };
  }

  async placeStructure(item: StructureId, tx: number, ty: number, text?: string): Promise<PlaceResult> {
    // static validity is client-side (bounds, water/land, on a Node); the server owns OCCUPIED
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return { ok: false, reason: 'INVALID' };
    if (this.wd.nodes.some((n) => n.tx === tx && n.ty === ty)) return { ok: false, reason: 'INVALID' };
    const b = this.wd.blocked[ty * MAP_W + tx];
    if (ITEMS[item].onWater ? b !== 1 : b !== 0) return { ok: false, reason: 'INVALID' };

    const id = `s${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const txt = item === 'signpost' ? (text ?? '').trim().slice(0, 40) : null;
    const res = await this.rpc<any>('jw_place_structure', {
      p_who: this.me,
      p_item: item,
      p_tx: tx,
      p_ty: ty,
      p_text: txt,
      p_id: id,
      p_is_hammock: item === 'hammock',
    });
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'INVALID' };
    this.inv = res.inventory as Inventory;
    const structure = res.structure as Structure;
    this.relay('structurePlaced', structure);
    return { ok: true, structure, inventory: { ...this.inv } };
  }

  // ---------------------------------------------------------------- crates / sawmill

  async crateOpen(crateId: string): Promise<CrateResult> {
    const res = await this.rpc<any>('jw_crate_open', { p_crate_id: crateId, p_who: this.me });
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'NO_CRATE' };
    this.inv = res.inventory as Inventory;
    return { ok: true, contents: res.contents as Inventory, inventory: { ...this.inv } };
  }

  async crateDeposit(crateId: string, item: ItemId, count: number): Promise<CrateResult> {
    const res = await this.rpc<any>('jw_crate_deposit', { p_crate_id: crateId, p_item: item, p_count: count, p_who: this.me });
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'NOTHING' };
    this.inv = res.inventory as Inventory;
    this.relay('crateChanged', crateId, res.contents);
    return { ok: true, contents: res.contents as Inventory, inventory: { ...this.inv } };
  }

  async crateWithdraw(crateId: string, item: ItemId, count: number): Promise<CrateResult> {
    const res = await this.rpc<any>('jw_crate_withdraw', { p_crate_id: crateId, p_item: item, p_count: count, p_who: this.me });
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'NOTHING' };
    this.inv = res.inventory as Inventory;
    this.relay('crateChanged', crateId, res.contents);
    return { ok: true, contents: res.contents as Inventory, inventory: { ...this.inv } };
  }

  async sawmillOpen(sawmillId: string): Promise<SawmillResult> {
    const res = await this.rpc<any>('jw_sawmill_open', { p_id: sawmillId, p_who: this.me, p_plank_ms: SAWMILL_PLANK_MS });
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'NO_SAWMILL' };
    this.inv = res.inventory as Inventory;
    return { ok: true, state: res.state, inventory: { ...this.inv } };
  }

  async sawmillDeposit(sawmillId: string): Promise<SawmillResult> {
    const res = await this.rpc<any>('jw_sawmill_deposit', {
      p_id: sawmillId, p_who: this.me, p_cap: SAWMILL_WOOD_CAP, p_plank_ms: SAWMILL_PLANK_MS,
    });
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'NOTHING' };
    this.inv = res.inventory as Inventory;
    return { ok: true, state: res.state, inventory: { ...this.inv } };
  }

  async sawmillCollect(sawmillId: string): Promise<SawmillResult> {
    const res = await this.rpc<any>('jw_sawmill_collect', { p_id: sawmillId, p_who: this.me, p_plank_ms: SAWMILL_PLANK_MS });
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'NOTHING' };
    this.inv = res.inventory as Inventory;
    return { ok: true, state: res.state, inventory: { ...this.inv } };
  }

  // ---------------------------------------------------------------- quest / seal

  async readTablet(id: string): Promise<QuestState> {
    const res = await this.rpc<any>('jw_read_tablet', { p_who: this.me, p_id: id, p_total: this.wd.tablets.length });
    if (res) {
      this.tablets = res.tablets as string[];
      if (res.allRead) this.pushChat('🌿 Jungle', `${this.me} has read all the ancient tablets!`);
    }
    const q = this.questState();
    this.emit('quest', q);
    return q;
  }

  async offerAltar(): Promise<OfferResult> {
    const res = await this.rpc<any>('jw_offer_altar', { p_who: this.me });
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'INSUFFICIENT' };
    this.inv = res.inventory as Inventory;
    this.gateOpen = true;
    this.relay('gateOpened');
    this.pushChat('🌿 Jungle', `the vines part — ${this.me} has opened the Hidden Grove!`);
    const q = this.questState();
    this.emit('quest', q);
    return { ok: true, inventory: { ...this.inv }, quest: q };
  }

  async dig(): Promise<DigResult> {
    const ptx = Math.floor((this.lastLocal?.x ?? 0) / TILE);
    const pty = Math.floor((this.lastLocal?.y ?? 0) / TILE);
    const res = await this.rpc<any>('jw_dig', { p_who: this.me, p_ptx: ptx, p_pty: pty, p_spots: this.wd.treasureSpots });
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'NO_MAP' };
    this.inv = res.inventory as Inventory;
    // the dig spot rotates server-side; refresh from the world row next loadWorld
    this.pushChat('🌿 Jungle', `${this.me} unearthed a buried treasure!`);
    const q = this.questState();
    this.emit('quest', q);
    return { ok: true, loot: res.loot as Inventory, inventory: { ...this.inv }, quest: q };
  }

  async contributeSeal(): Promise<ContributeSealResult> {
    const res = await this.rpc<any>('jw_contribute_seal', { p_who: this.me, p_quotas: this.sealTargets() });
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'NOTHING_TO_GIVE' };
    this.inv = res.inventory as Inventory;
    const seal = this.sealState(res.seal);
    this.relay('sealChanged', seal);
    for (const m of [25, 50, 75]) {
      if (res.beforePct < m && res.afterPct >= m && res.afterPct < 100) {
        this.pushChat('🌿 Jungle', `the Seal weakens — ${m}% of the offerings are gathered!`);
      }
    }
    if (res.broken) {
      this.pushChat('🌿 Jungle', '⚡ THE SEAL IS BROKEN! The arena at the Ruins stands open — the Guardian awaits whoever dares bring an Offering to its altar.');
      this.relay('sealBroken');
    }
    return { ok: true, taken: res.taken as Inventory, inventory: { ...this.inv }, seal };
  }

  // ---------------------------------------------------------------- Guardian

  async summonGuardian(): Promise<SummonResult> {
    const res = await this.rpc<any>('jw_summon', { p_who: this.me, p_awake_ms: GUARDIAN_AWAKE_MS, p_dormant_ms: DORMANT_TIMEOUT_MS });
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'NO_TOTEM' };
    this.inv = res.inventory as Inventory;
    const fight = this.fightPublic(res.fight)!;
    this.pushChat('🌿 Jungle', `${this.me} laid an Offering on the altar — the Guardian STIRS! Gather at the arena and strike to begin.`);
    this.relay('guardianSummoned', fight);
    return { ok: true, fight, inventory: { ...this.inv } };
  }

  async hitGuardian(withTool?: ToolId): Promise<GuardianHitResult> {
    const f = this.fightState;
    if (!f) return { ok: false, reason: 'NO_FIGHT' };
    const owned = withTool && (this.inv[withTool] ?? 0) > 0 ? withTool : undefined;
    const dmg = guardianDamage(owned);
    const engaging = f.engagedAt === null;
    let roster = f.roster;
    let maxHp = f.maxHp;
    let eyeOpen = true;
    if (engaging) {
      roster = this.playersInArena();
      maxHp = DEV_FIGHT ? DEV_FIGHT_HP : HP_PER_HEAD * Math.max(1, roster.length);
    } else {
      eyeOpen = eyeOpenWithin(Date.now() - (f.engagedAt as number), GUARDIAN_AWAKE_MS, ADJUDICATION_SLACK_MS);
    }
    const res = await this.rpc<any>('jw_guardian_hit', {
      p_who: this.me,
      p_dmg: dmg,
      p_roster: roster,
      p_max_hp: maxHp,
      p_eye_open: eyeOpen,
      p_scale_drop: GUARDIAN_SCALE_DROP,
      p_awake_ms: GUARDIAN_AWAKE_MS,
      p_dormant_ms: DORMANT_TIMEOUT_MS,
    });
    if (!res || res.ok === false) return { ok: false, reason: 'NO_FIGHT' };
    if (res.deflected) {
      return { ok: true, hp: res.hp, victory: false, inventory: { ...this.inv }, deflected: true };
    }
    this.inv = (res.inventory ?? this.inv) as Inventory;
    if (res.engaged) {
      const pub = this.fightPublic(res.fight) ?? f;
      this.relay('guardianEngaged', { ...pub, hp: maxHp }); // engage shows the full pool, then the hit lands
    }
    if (res.victory) {
      this.relay('guardianVictory', (res.participants ?? []) as string[]);
      return { ok: true, hp: 0, victory: true, inventory: { ...this.inv }, deflected: false };
    }
    this.relay('guardianHit', res.hp, this.me);
    return { ok: true, hp: res.hp, victory: false, inventory: { ...this.inv }, deflected: false };
  }

  async reportKnockdown(tx: number, ty: number): Promise<KnockdownResult> {
    const f = this.fightState;
    if (!f || f.engagedAt === null) return { ok: false, reason: 'NO_FIGHT' };
    const wave = waveInfoAt(Date.now() - f.engagedAt, GUARDIAN_AWAKE_MS).index;
    const res = await this.rpc<any>('jw_knockdown', {
      p_who: this.me,
      p_wave: wave,
      p_exhaustion_n: EXHAUSTION_KNOCKDOWNS,
      p_spawn: { tx: this.wd.spawn.tx, ty: this.wd.spawn.ty },
      p_tile: TILE,
      p_awake_ms: GUARDIAN_AWAKE_MS,
      p_dormant_ms: DORMANT_TIMEOUT_MS,
    });
    void tx;
    void ty;
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'NOT_IN_DANGER' };
    if (res.exhausted) {
      this.pushChat('🌿 Jungle', `${this.me} collapses from Exhaustion — out for this fight, waking ${res.atHammock ? 'in their Hammock' : 'at the spawn'}. Hits already landed still count toward the loot.`);
    }
    return { ok: true, knockdowns: res.knockdowns, exhausted: res.exhausted, wake: res.wake, atHammock: res.atHammock };
  }

  private playersInArena(): string[] {
    const a = this.wd.arena;
    const inRect = (x: number, y: number) => {
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      return tx >= a.x && tx < a.x + a.w && ty >= a.y && ty < a.y + a.h;
    };
    const names: string[] = [];
    if (this.me && this.lastLocal && inRect(this.lastLocal.x, this.lastLocal.y)) names.push(this.me);
    for (const [name, p] of this.positions) if (name !== this.me && inRect(p.x, p.y)) names.push(name);
    return names;
  }

  private scheduleSlumberCheck(): void {
    this.clearSlumberCheck();
    const f = this.fightState;
    if (!f) return;
    const deadline = f.engagedAt === null ? f.summonedAt + DORMANT_TIMEOUT_MS : f.engagedAt + GUARDIAN_AWAKE_MS;
    this.slumberTimer = window.setTimeout(() => {
      this.slumberTimer = null;
      void this.rpc<any>('jw_guardian_reconcile', { p_awake_ms: GUARDIAN_AWAKE_MS, p_dormant_ms: DORMANT_TIMEOUT_MS }).then((res) => {
        if (res?.slumbered) {
          this.pushChat(
            '🌿 Jungle',
            res.reason === 'dormant'
              ? 'no one struck in time — the Guardian loses interest and sinks back into slumber. The totem is spent.'
              : 'the Guardian returns to slumber, unbeaten. The arena falls silent — another Offering will wake it.',
          );
          this.relay('guardianSlumber');
        }
      });
    }, Math.max(0, deadline - Date.now()) + 150);
  }

  private clearSlumberCheck(): void {
    if (this.slumberTimer !== null) {
      window.clearTimeout(this.slumberTimer);
      this.slumberTimer = null;
    }
  }

  // ---------------------------------------------------------------- cooking / onboarding

  async cook(): Promise<CookResult> {
    const res = await this.rpc<any>('jw_cook', { p_who: this.me });
    if (!res || res.ok === false) return { ok: false, reason: 'NO_FISH' };
    this.inv = res.inventory as Inventory;
    return { ok: true, inventory: { ...this.inv } };
  }

  async eatCookedFish(): Promise<EatResult> {
    const res = await this.rpc<any>('jw_eat', { p_who: this.me });
    if (!res || res.ok === false) return { ok: false, reason: 'NOTHING_TO_EAT' };
    this.inv = res.inventory as Inventory;
    return { ok: true, inventory: { ...this.inv }, buffMs: SPEED_BUFF_MS };
  }

  async markIntroSeen(): Promise<void> {
    await this.rpc('jw_mark_intro_seen', { p_who: this.me });
  }

  async completeJourneyStep(step: JourneyStepId): Promise<JourneyState> {
    const res = await this.rpc<JourneyState>('jw_complete_journey_step', { p_who: this.me, p_step: step });
    return res ?? { steps: {}, hintUses: {} };
  }

  async bumpHint(hintId: string): Promise<JourneyState> {
    const res = await this.rpc<JourneyState>('jw_bump_hint', { p_who: this.me, p_hint: hintId });
    return res ?? { steps: {}, hintUses: {} };
  }

  async markExplored(chunks: number[]): Promise<void> {
    await this.rpc('jw_mark_explored', { p_who: this.me, p_chunks: chunks });
  }
}
