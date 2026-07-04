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
import { ADJUDICATION_SLACK_MS, eyeOpenWithin, rollGuardianDamage, waveInfoAt } from '../content/guardian';
import { ITEMS, type ItemId, type StructureId, type ToolId } from '../content/items';
import { NODE_TYPES, toolSatisfies, type NodeTypeId } from '../content/nodeTypes';
import { RECIPES } from '../content/recipes';
import { sanitizeAppearance } from '../avatars';
import { asset } from '../paths';
import { t } from '../i18n';
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
  DungeonMsg,
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
  OpenDelveResult,
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

const POS_BROADCAST_MS = 150; // cap the position stream; ~7/player-s keeps an 8-player shared channel under the realtime msg/s cap (remote sprites interpolate, so it stays smooth)
// Presence refresh: keep the tracked snapshot from going totally stale for
// late joiners. Rarely matters (a presence `join` makes every peer re-announce
// within ~150ms) and the server enforces a strict per-client presence rate
// limit — at 1.5s the server answered "Client presence rate limit exceeded"
// and CLOSED the channel ~8s after every join, for every Player. Keep this
// interval high; presence needs no keep-alive, it lives with the channel.
const PRESENCE_REFRESH_MS = 30_000;

// A server-initiated phx_close is TERMINAL in realtime-js: the channel object
// is detached from the client and never rejoins on its own (only socket-level
// drops self-heal via Phoenix). We must rebuild the channel ourselves — with
// backoff, so a server that insta-closes (rate limit, restart loop) gets a
// slower and slower knock instead of a join storm.
const RESUBSCRIBE_MIN_MS = 1_000;
const RESUBSCRIBE_MAX_MS = 30_000;
const STABLE_SUBSCRIBE_MS = 60_000; // held a subscription this long → next close restarts the backoff

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
  private delveOpen = false;
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
  private visibilityHooked = false;

  // recovery from server-initiated channel closes (see scheduleResubscribe)
  private resubscribeTimer: ReturnType<typeof setTimeout> | null = null;
  private resubscribeDelayMs = RESUBSCRIBE_MIN_MS;
  private lastSubscribedAt = 0;
  private channelWasSubscribed = false; // did the CURRENT channel generation ever reach SUBSCRIBED?

  constructor(url: string, anonKey: string) {
    this.supa = createClient(url, anonKey, {
      auth: { persistSession: false },
      realtime: {
        // Run heartbeats on a Web Worker so a busy Phaser frame or a
        // backgrounded tab can't starve the main-thread timer. A missed
        // heartbeat tears the socket down; once that happens canPush() is
        // false and every broadcast silently falls back to the REST endpoint,
        // so peers freeze until a full page reload — the bug this fixes.
        worker: true,
        heartbeatIntervalMs: 15000,
        // belt-and-suspenders: if a heartbeat still fails, force the socket up
        heartbeatCallback: (status) => {
          if (status === 'disconnected' || status === 'timeout' || status === 'error') {
            void this.supa.realtime.connect();
          }
        },
      },
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
    const ch = this.buildChannel();
    this.channel = ch;
    this.hookVisibility();
    // Settle on the FIRST status either way: SUBSCRIBED means we're live, and
    // a failure (CLOSED/CHANNEL_ERROR/TIMED_OUT) must not strand the Player on
    // the join screen — the World is playable meanwhile (broadcasts fall back
    // to REST) and recovery continues in the background (scheduleResubscribe
    // for closes, Phoenix's own rejoin for errors/timeouts).
    await new Promise<void>((resolve) => this.subscribeChannel(ch, x, y, resolve));
  }

  /** every world-channel binding in one place, so a rebuilt channel is identical */
  private buildChannel(): RealtimeChannel {
    const ch = this.supa.channel('jw-world', {
      config: { broadcast: { self: false }, presence: { key: this.me! } },
    });
    ch.on('broadcast', { event: 'evt' }, ({ payload }) => this.dispatch(payload.event, payload.args));
    ch.on('broadcast', { event: 'pos' }, ({ payload }) => this.onRemotePos(payload as SelfPos));
    // the Delve's peer-host-authority stream (ADR-0007) — mob snapshots, hits,
    // positions; delivered straight to whoever is in the run (self:false already
    // stops the sender hearing its own frame)
    ch.on('broadcast', { event: 'delve' }, ({ payload }) => this.emit('dungeon', payload as DungeonMsg));
    ch.on('presence', { event: 'sync' }, () => this.onPresenceSync());
    ch.on('presence', { event: 'join' }, () => this.broadcastPos(true)); // re-announce so new joiners see me
    // the server explains itself (rate limit, restart, auth…) via a `system`
    // message right before it errors/closes a channel — log it so a production
    // close is diagnosable from the browser console alone
    ch.on('system', {}, (payload: unknown) => console.warn('[jw] realtime system:', JSON.stringify(payload)));
    return ch;
  }

  /**
   * Subscribe a world channel. Re-announces presence on EVERY (re)subscribe,
   * not just the first: Phoenix auto-rejoins the channel after a socket drop
   * and re-fires this callback, but presence track() is a SEPARATE push that
   * is not part of the rejoin — without re-tracking here a reconnected client
   * stays invisible and frozen to peers until a page reload.
   */
  private subscribeChannel(ch: RealtimeChannel, x: number, y: number, onFirstStatus?: () => void): void {
    ch.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        this.lastSubscribedAt = Date.now();
        this.channelWasSubscribed = true;
        const pos: SelfPos =
          this.lastLocal ?? { name: this.me!, appearance: this.appearance, x, y, dir: 'down', moving: false };
        void ch.track(pos);
        this.lastPresence = Date.now();
        this.broadcastPos(true); // push our spot to peers now (lastPresence just set → no double-track)
      } else if (status === 'CLOSED') {
        this.scheduleResubscribe();
      } else {
        // CHANNEL_ERROR / TIMED_OUT: Phoenix retries these itself while the
        // socket is up — log only
        console.warn('[jw] realtime channel status:', status, err ?? '');
      }
      if (onFirstStatus) {
        const settle = onFirstStatus;
        onFirstStatus = undefined;
        settle();
      }
    });
  }

  /**
   * Recover from a server-initiated channel close (phx_close). realtime-js
   * treats that as final — the channel is already detached from the client, so
   * `subscribe()` on it again would throw. Rebuild the replacement channel
   * SYNCHRONOUSLY: registering it immediately cancels the client's "no
   * channels left → disconnect the socket" timer, which would otherwise race
   * our delayed re-join and could win (stranding the game offline until the
   * next visibilitychange). Only the join itself waits out the backoff, so a
   * server that insta-closes (rate limit, restart loop) gets a slower and
   * slower knock; only a subscription that actually held for
   * STABLE_SUBSCRIBE_MS resets the backoff — a close that lands before
   * SUBSCRIBED keeps doubling. Peers keep (roughly) seeing us in the gap
   * because broadcast send() falls back to REST.
   */
  private scheduleResubscribe(): void {
    if (this.resubscribeTimer !== null) return;
    const wasStable = this.channelWasSubscribed && Date.now() - this.lastSubscribedAt >= STABLE_SUBSCRIBE_MS;
    this.resubscribeDelayMs = wasStable
      ? RESUBSCRIBE_MIN_MS
      : Math.min(this.resubscribeDelayMs * 2, RESUBSCRIBE_MAX_MS);
    this.channel?.teardown(); // frees timers/bindings without re-firing close callbacks
    this.channelWasSubscribed = false; // the replacement must re-earn "stable"
    this.channel = this.buildChannel();
    console.warn(`[jw] realtime channel closed by server — resubscribing in ${this.resubscribeDelayMs}ms`);
    this.resubscribeTimer = setTimeout(() => {
      this.resubscribeTimer = null;
      const p = this.lastLocal;
      if (this.channel) this.subscribeChannel(this.channel, p?.x ?? 0, p?.y ?? 0);
    }, this.resubscribeDelayMs);
  }

  /**
   * Phoenix refuses to reconnect a dropped socket while the tab is hidden and
   * only retries on return-to-visible (and only if the close was unclean). When
   * the tab comes back, explicitly nudge the socket up; the ensuing rejoin
   * re-fires subscribe()'s SUBSCRIBED branch, which re-tracks our presence — so
   * a game left open behind other windows recovers without a reload. Wired once.
   */
  private hookVisibility(): void {
    if (this.visibilityHooked || typeof document === 'undefined') return;
    this.visibilityHooked = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.supa.realtime.connect();
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
    // presence track() (unlike broadcast send()) has no REST fallback and
    // throws on an unjoined channel — skip it while a resubscribe is pending
    if (now - this.lastPresence > PRESENCE_REFRESH_MS && (this.channel.state as string) === 'joined') {
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
      this.supa.from('world').select('gate_open,delve_open,treasure_index,seal,fight').eq('id', 1).single(),
      this.me ? this.supa.from('players').select('inventory,tablets').eq('name', this.me).single() : Promise.resolve({ data: null } as any),
    ]);

    if (meR?.data) {
      this.inv = (meR.data.inventory ?? {}) as Inventory;
      this.tablets = (meR.data.tablets ?? []) as string[];
    }
    const world = worldR.data as any;
    this.gateOpen = !!world?.gate_open;
    this.delveOpen = !!world?.delve_open;
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
      delveOpen: this.delveOpen,
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
      if (res.allRead) this.pushChat(t.system.sender, t.system.tabletsAllRead(this.me ?? ''));
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
    this.pushChat(t.system.sender, t.system.groveOpened(this.me ?? ''));
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
    this.pushChat(t.system.sender, t.system.treasureUnearthed(this.me ?? ''));
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
        this.pushChat(t.system.sender, t.system.sealWeakens(m));
      }
    }
    if (res.broken) {
      this.pushChat(t.system.sender, t.system.sealBroken);
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
    this.pushChat(t.system.sender, t.system.guardianStirs(this.me ?? ''));
    this.relay('guardianSummoned', fight);
    return { ok: true, fight, inventory: { ...this.inv } };
  }

  // ---------------------------------------------------------------- the Delve (ADR-0007)

  async openDelve(): Promise<OpenDelveResult> {
    if (this.delveOpen) return { ok: false, reason: 'ALREADY_OPEN' };
    // jw_open_delve flips the `delve_open` world flag once, forever. If the RPC
    // isn't deployed yet the call returns null; degrade gracefully so the session
    // still opens the shaft (it re-seals on reload until the migration lands).
    await this.rpc('jw_open_delve', { p_who: this.me });
    this.delveOpen = true;
    this.relay('delveOpened');
    this.pushChat(t.system.sender, t.system.delveOpened(this.me ?? ''));
    this.emit('quest', this.questState());
    return { ok: true, delveOpen: true };
  }

  async claimDelveLoot(loot: Inventory): Promise<{ inventory: Inventory }> {
    // the run's ONLY DB write (ADR-0007 §8): grant the participation drop set to
    // this Player's own inventory. jw_claim_delve_loot returns the merged
    // inventory; if it isn't deployed, merge into the local mirror optimistically.
    const res = await this.rpc<any>('jw_claim_delve_loot', { p_who: this.me, p_loot: loot });
    if (res?.inventory) this.inv = res.inventory as Inventory;
    else for (const [k, v] of Object.entries(loot)) this.inv[k as ItemId] = (this.inv[k as ItemId] ?? 0) + (v as number);
    return { inventory: { ...this.inv } };
  }

  sendDungeon(msg: DungeonMsg): void {
    void this.channel?.send({ type: 'broadcast', event: 'delve', payload: msg });
  }

  async hitGuardian(withTool?: ToolId): Promise<GuardianHitResult> {
    const f = this.fightState;
    if (!f) return { ok: false, reason: 'NO_FIGHT' };
    // roll the weapon band + crit here (the Backend is the server boundary,
    // ADR-0006 §3): the authoritative pool subtraction still happens in the
    // server-ordered jw_guardian_hit RPC, which just applies this p_dmg
    const owned = withTool && (this.inv[withTool] ?? 0) > 0 ? withTool : undefined;
    const { damage: dmg, crit } = rollGuardianDamage(owned, Math.random);
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
      return { ok: true, hp: res.hp, victory: false, inventory: { ...this.inv }, deflected: true, damage: 0, crit: false };
    }
    this.inv = (res.inventory ?? this.inv) as Inventory;
    if (res.engaged) {
      const pub = this.fightPublic(res.fight) ?? f;
      this.relay('guardianEngaged', { ...pub, hp: maxHp }); // engage shows the full pool, then the hit lands
    }
    if (res.victory) {
      this.relay('guardianVictory', (res.participants ?? []) as string[]);
      return { ok: true, hp: 0, victory: true, inventory: { ...this.inv }, deflected: false, damage: dmg, crit };
    }
    this.relay('guardianHit', res.hp, this.me);
    return { ok: true, hp: res.hp, victory: false, inventory: { ...this.inv }, deflected: false, damage: dmg, crit };
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
      this.pushChat(t.system.sender, t.system.exhaustionCollapse(this.me ?? '', res.atHammock));
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
            t.system.sender,
            res.reason === 'dormant' ? t.system.guardianNoStrike : t.system.guardianUnbeaten,
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
