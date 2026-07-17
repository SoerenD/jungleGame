import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import {
  ARENA_EMPTY_SLUMBER_MS,
  DEV_ARMOR,
  DEV_FIGHT,
  DEV_FIGHT_HP,
  DEV_WARDEN_FIGHT,
  DEV_VERDANT_FIGHT,
  DORMANT_TIMEOUT_MS,
  EXHAUSTION_KNOCKDOWNS,
  GUARDIAN_AWAKE_MS,
  HP_PER_HEAD,
  wardenAltarQuotas,
  WARDEN_ALTAR_PER_HEAD,
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
import { footprint, ITEMS, type ItemId, type StructureId, type ToolId } from '../content/items';
import { NODE_TYPES, toolSatisfies, type NodeTypeId } from '../content/nodeTypes';
import { RECIPES } from '../content/recipes';
import {
  emptyVillage,
  festivalActive,
  FESTIVAL_MS,
  FOUNTAIN_WISH_ITEM,
  FOUNTAIN_WISH_THRESHOLD,
  isVillageStructure,
  villageBuff,
  milestoneTierOf,
  TRADEABLE,
  tradeYield,
  VILLAGE_CONTRIB,
  VILLAGE_MAX_TIER,
  VILLAGE_THRESHOLDS,
  VILLAGE_ZONE_RADIUS,
  type VillageRecord,
} from '../content/village';
import { sanitizeAppearance } from '../avatars';
import { armorBuff, ARMOR_BUFFS, armorOnly, gearOwns, sanitizeEquipped, WEAPON_SLOTS, type EquippedArmor, type EquippedGear } from '../content/armor';
import { kitOf, wardenDef } from '../content/wardens';
import type { EchoSample, Ghost } from '../content/echoes';
import { asset } from '../paths';
import { normalizeWorldId, WORLD_ID_DEFAULT } from '../world';
import { t } from '../i18n';
import type {
  Appearance,
  Backend,
  BackendEvents,
  ChatMsg,
  WishResult,
  ContributeSealResult,
  ContributeVillageResult,
  ContributeWardenResult,
  OpenRealmResult,
  TradeResult,
  WardenAltarState,
  WardenWorldState,
  CookResult,
  CraftResult,
  CrateResult,
  CreatureMsg,
  DepthRecords,
  DepthRecordWrite,
  DigResult,
  Dir,
  DismantleResult,
  DungeonMsg,
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
  OfferResult,
  OpenDelveResult,
  PlaceResult,
  PlayerPos,
  QuestState,
  RefinerConfig,
  RefinerResult,
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
  /** ADR-0017 §1: per-Warden arenas — only the rect is needed here (roster checks) */
  wardenArenas?: Record<string, { arena: { x: number; y: number; w: number; h: number } }>;
}

/** what a Player broadcasts about themselves (presence + position stream) */
type SelfPos = { name: string; appearance: Appearance; x: number; y: number; dir: Dir; moving: boolean; held?: ItemId; swings?: number; armor?: EquippedArmor };

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
  /**
   * The World this client is in (ADR-0014). Set from the join-screen field before
   * the first RPC / channel subscribe; scopes every jw_* RPC (injected in `rpc`)
   * and the Realtime channel name. Defaults to the shared `default` World.
   */
  private worldId: string = WORLD_ID_DEFAULT;
  private appearance: Appearance = { skin: 1, hair: 1, shirt: 1, pants: 0 };
  /** the worn Armor (ADR-0017 §4) — injected into every position/presence payload */
  private equipped: EquippedGear = {};

  private listeners = new Map<string, Set<(...args: any[]) => void>>();
  private nodesById = new Map<string, StaticNode>();
  /** placed Structures by id — kept fresh so a dismantle knows the type + footprint (ADR-0008) */
  private structures = new Map<string, Structure>();

  // local mirrors, kept fresh from RPC results + realtime events
  private inv: Inventory = {};
  private tablets: string[] = [];
  private gateOpen = false;
  private delveOpen = false;
  private treasureIndex = 0;
  /** set after a dig whose rotated spot we can't yet know (pre-0016) — suppresses
   *  the stale ✕ until the next join re-reads world.treasure_index */
  private treasureDugPending = false;
  private fightState: FightState | null = null;
  /** local mirror of the communal Village (ADR-0010), kept fresh from RPCs + events */
  private village: VillageRecord = emptyVillage();
  /** local mirror of the per-Warden altar/gate state (ADR-0017), raw jsonb shape */
  private wardens: Record<string, { altar: { broken: boolean; contributed: Record<string, number> }; gateOpen: boolean }> = {};
  // the Seal scales per-head: how many Players are online (from presence) and
  // the last raw seal row, so a join/leave can re-emit the bar with the new target
  private onlineCount = 1;
  private lastSeal: { broken?: boolean; contributed?: Record<string, number> } | null = null;
  /** ADR-0012: the last presence roster (self + peers) — the creature-host election set */
  private creatureRosterNames: string[] = [];

  // position tracking for presence + arena roster
  private lastLocal: SelfPos | null = null;
  private positions = new Map<string, SelfPos>();
  private lastPosSent = 0;
  private lastPresence = 0;

  private slumberTimer: number | null = null;
  private visibilityHooked = false;
  /** last reported arena-emptiness during an engaged fight — only report transitions (B2) */
  private lastArenaEmpty: boolean | null = null;

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
      case 'structurePlaced':
        this.structures.set((args[0] as Structure).id, args[0] as Structure);
        break;
      case 'structureRemoved':
        this.structures.delete(args[0] as string);
        break;
      case 'villageChanged':
        this.village = args[0] as VillageRecord;
        break;
      case 'wardenAltarChanged': {
        const [id, altar] = args as [string, WardenAltarState];
        const w = (this.wardens[id] ??= { altar: { broken: false, contributed: {} }, gateOpen: false });
        w.altar = { broken: altar.broken, contributed: { ...altar.contributed } };
        break;
      }
      case 'realmOpened': {
        const w = (this.wardens[args[0] as string] ??= { altar: { broken: false, contributed: {} }, gateOpen: false });
        w.gateOpen = true;
        break;
      }
      case 'guardianSummoned':
      case 'guardianEngaged':
        this.fightState = args[0] as FightState;
        this.lastArenaEmpty = null; // fresh fight → re-arm the empty-arena transition tracker (B2)
        this.scheduleSlumberCheck();
        break;
      case 'guardianHit':
        if (this.fightState) this.fightState = { ...this.fightState, hp: args[0] as number };
        break;
      case 'guardianVictory':
      case 'guardianSlumber':
        this.fightState = null;
        this.lastArenaEmpty = null;
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
    // every jw_* gameplay function is World-scoped (ADR-0014): inject the current
    // world-id as p_world so no call site has to thread it. The pure helpers
    // (jw_num/jw_add/…) are never called from here, so there is no clash.
    const { data, error } = await this.supa.rpc(fn, { p_world: this.worldId, ...args });
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

  async join(name: string, pin: string, appearance: Appearance, world: string): Promise<JoinResult> {
    name = name.trim();
    if (!/^[\w :-]{2,16}$/.test(name)) return { ok: false, reason: 'BAD_NAME' };
    if (!/^\d{4}$/.test(pin)) return { ok: false, reason: 'BAD_PIN' };
    // fix the World before any RPC or channel subscribe — everything below is
    // scoped to it (rpc() injects p_world, the channel name carries the slug)
    this.worldId = normalizeWorldId(world);
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

    if (DEV_ARMOR) {
      // ?armor (T3 dev grant): hand over the three pieces through the generic
      // zero-cost craft path — no new RPC, works against the live 0010 schema
      for (const id of Object.keys(ARMOR_BUFFS)) {
        if ((this.inv[id as ItemId] ?? 0) > 0) continue;
        const granted = await this.rpc<any>('jw_craft', { p_who: name, p_cost: {}, p_output: id, p_count: 1, p_requires_tool: null });
        if (granted?.inventory) this.inv = granted.inventory as Inventory;
      }
    }
    if (DEV_WARDEN_FIGHT) {
      // ?wardenfight (T4 dev arc): the Mire totem + altar goods, same path
      const grants: Record<string, number> = { mire_totem: 1 };
      for (const [item, per] of Object.entries(WARDEN_ALTAR_PER_HEAD.mire ?? {})) grants[item] = per * 2;
      for (const [id, n] of Object.entries(grants)) {
        if ((this.inv[id as ItemId] ?? 0) >= n) continue;
        const granted = await this.rpc<any>('jw_craft', {
          p_who: name, p_cost: {}, p_output: id, p_count: n - (this.inv[id as ItemId] ?? 0), p_requires_tool: null,
        });
        if (granted?.inventory) this.inv = granted.inventory as Inventory;
      }
    }
    // Armor is worn by MOVING the piece out of the bag; keep every shape-valid
    // worn slot (its own proof of ownership). A legacy save with the piece worn
    // AND still in the pack is normalized server-side by migration 0016's one-time
    // UPDATE; here the client only keeps the worn set.
    // (res.equipped is absent until migration 0013 is live; that degrades to bare.)
    this.equipped = sanitizeEquipped(res.equipped);

    this.village = this.villageFromJson(res.village);
    // appear point (ADR-0010 §4 as amended — the Hammock rung is retired):
    // Village Hall > server-returned spot. Any legacy players.wake_point the old
    // server still returns is deliberately ignored (migration 0019 nulls it).
    const hallTile = this.village.hall ? this.hallWakeTile(this.village.hall) : null;
    const x = hallTile ? (hallTile.tx + 0.5) * TILE : (res.x as number);
    const y = hallTile ? (hallTile.ty + 0.5) * TILE : (res.y as number);
    this.lastLocal = { name, appearance: appr, x, y, dir: 'down', moving: false, armor: armorOnly(this.equipped) };

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
      // absent until migration 0017 (fog stride) is live — the client then assumes
      // the legacy pre-Realm stride and remaps for a stripe-free restore.
      exploredStride: typeof res.exploredStride === 'number' ? res.exploredStride : undefined,
      equipped: { ...this.equipped },
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
    // one channel per World (ADR-0014): presence, the position stream, the chat
    // relay, and the Delve/Wildlife peer-host traffic are all isolated per World
    // for free — a client only ever sees its own World's peers and events.
    const ch = this.supa.channel(`jw-world-${this.worldId}`, {
      config: { broadcast: { self: false }, presence: { key: this.me! } },
    });
    ch.on('broadcast', { event: 'evt' }, ({ payload }) => this.dispatch(payload.event, payload.args));
    ch.on('broadcast', { event: 'pos' }, ({ payload }) => this.onRemotePos(payload as SelfPos));
    // the Delve's peer-host-authority stream (ADR-0007) — mob snapshots, hits,
    // positions; delivered straight to whoever is in the run (self:false already
    // stops the sender hearing its own frame)
    ch.on('broadcast', { event: 'delve' }, ({ payload }) => this.emit('dungeon', payload as DungeonMsg));
    // the open-world Wildlife stream (ADR-0012) — the host's batched creature
    // snapshots + guest hit/forage actions; delivered to whoever is in the World
    ch.on('broadcast', { event: 'creatures' }, ({ payload }) => this.emit('creatures', payload as CreatureMsg));
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
    // B2: a peer stepping out of / into the arena can start or cancel the grace
    if (this.fightState?.engagedAt != null) this.evaluateArenaOccupancy();
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
    // ADR-0012: the real online roster feeds the deterministic creature-host election
    this.creatureRosterNames = players.map((p) => p.name);
    this.emit('presence', players);
    // B2: a roster member going offline can empty the arena mid-fight
    if (this.fightState?.engagedAt != null) this.evaluateArenaOccupancy();
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
      swings: p.swings,
      armor: p.armor,
    };
  }

  // ---------------------------------------------------------------- realtime-ish position

  sendPosition(x: number, y: number, dir: Dir, moving: boolean, held?: ItemId, swings?: number): void {
    // `swings` and the worn `armor` ride the SAME broadcast payload (and the
    // rare presence snapshot lastLocal already feeds) — no new channel, packet,
    // or cadence; the backend injects armor itself so no call site threads it
    this.lastLocal = { name: this.me!, appearance: this.appearance, x, y, dir, moving, held, swings, armor: armorOnly(this.equipped) };
    this.broadcastPos(false);
    // B2: my own step out of / into the arena may start/cancel the grace
    if (this.fightState?.engagedAt != null) this.evaluateArenaOccupancy();
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

    // every read is scoped to this World (ADR-0014); the world row is keyed by slug
    const [nodesR, structR, chatR, worldR, meR] = await Promise.all([
      this.supa.from('nodes').select('id,type,tx,ty,hp,harvested_at').eq('world_id', this.worldId),
      this.supa.from('structures').select('id,type,tx,ty,placed_by,placed_at,text').eq('world_id', this.worldId),
      this.supa.from('chat').select('from_name,text,ts').eq('world_id', this.worldId).order('ts', { ascending: false }).limit(50),
      this.supa.from('world').select('gate_open,delve_open,treasure_index,seal,fight,village,wardens').eq('id', this.worldId).maybeSingle(),
      this.me ? this.supa.from('players').select('inventory,tablets').eq('world_id', this.worldId).eq('name', this.me).single() : Promise.resolve({ data: null } as any),
    ]);

    if (meR?.data) {
      this.inv = (meR.data.inventory ?? {}) as Inventory;
      this.tablets = (meR.data.tablets ?? []) as string[];
    }
    const world = worldR.data as any;
    this.gateOpen = !!world?.gate_open;
    this.delveOpen = !!world?.delve_open;
    this.treasureIndex = world?.treasure_index ?? 0;
    this.treasureDugPending = false; // the fresh world row is authoritative again
    this.fightState = this.fightPublic(world?.fight);
    this.village = this.villageFromJson(world?.village);
    this.wardensFromJson(world?.wardens);

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

    // Keep EVERY row — including a retired/unknown type (e.g. hut_wall): it still
    // claims its tiles server-side (structure_tiles), so the client must know
    // about it or placement lies (ghost green, server says OCCUPIED). GameScene
    // reserves its tiles and skips rendering; dismantle removes it by id.
    const structures: Structure[] = ((structR.data ?? []) as any[]).map((s) => ({
      id: s.id,
      type: s.type,
      tx: s.tx,
      ty: s.ty,
      placedBy: s.placed_by,
      placedAt: s.placed_at,
      ...(s.text != null ? { text: s.text } : {}),
    }));
    // keep the id→Structure mirror in sync so a dismantle knows the type/footprint
    this.structures = new Map(structures.map((s) => [s.id, s]));

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
      village: { ...this.village, hall: this.village.hall ? { ...this.village.hall } : null },
      wardens: this.wardensState(),
    };
  }

  /** normalise a stored Village jsonb (or a null column) into a VillageRecord */
  private villageFromJson(v: any): VillageRecord {
    if (!v || typeof v !== 'object') return emptyVillage();
    const hall = v.hall && typeof v.hall === 'object' ? { tx: v.hall.tx, ty: v.hall.ty } : null;
    return {
      tier: (v.tier ?? 0) as VillageRecord['tier'],
      pool: v.pool ?? 0,
      hall,
      milestonesBuilt: (v.milestonesBuilt ?? 0) as VillageRecord['milestonesBuilt'],
      name: typeof v.name === 'string' ? v.name : undefined,
      crest: typeof v.crest === 'number' ? v.crest : undefined,
      chronicle: Array.isArray(v.chronicle) ? v.chronicle.filter((x: any) => typeof x === 'string') : undefined,
      wishes: typeof v.wishes === 'number' ? v.wishes : undefined,
      festivalUntil: typeof v.festivalUntil === 'number' ? v.festivalUntil : undefined,
    };
  }

  /** the walkable tile a Player wakes on for a founded Hall: just south of its footprint */
  private hallWakeTile(hall: { tx: number; ty: number }): { tx: number; ty: number } {
    return { tx: hall.tx, ty: hall.ty + footprint('village_hall').h };
  }

  private questState(): QuestState {
    const pieces = this.inv.map_piece ?? 0;
    return {
      tabletsRead: [...this.tablets],
      tabletsTotal: this.wd.tablets.length,
      mapPieces: pieces,
      gateOpen: this.gateOpen,
      // hide the ✕ after a dig whose new spot we can't yet know (pre-0016 jw_dig
      // did not return the rotated index); it re-reveals from the world row on
      // the next join. With 0016 live, `treasureIndex` updates and this stays false.
      treasureLocation: pieces >= 3 && !this.treasureDugPending ? { ...this.wd.treasureSpots[this.treasureIndex] } : null,
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
      warden: f.warden ?? null,
      summonedAt: f.summonedAt,
      engagedAt: f.engagedAt ?? null,
      roster: f.roster ?? [],
      hp: f.hp ?? 0,
      maxHp: f.maxHp ?? 0,
      participants: f.participants ?? [],
      emptySlumberAt: f.emptySlumberAt ?? null,
    };
  }

  /** normalise the stored per-Warden jsonb into the local mirror shape */
  private wardensFromJson(w: any): void {
    this.wardens = {};
    if (!w || typeof w !== 'object') return;
    for (const [id, rec] of Object.entries(w as Record<string, any>)) {
      this.wardens[id] = {
        altar: {
          broken: !!rec?.altar?.broken,
          contributed: { ...(rec?.altar?.contributed ?? {}) },
        },
        gateOpen: !!rec?.gateOpen,
      };
    }
  }

  /** one Warden's public state — the altar bars carry the live per-head quotas */
  private wardenState(id: string): WardenWorldState {
    const w = this.wardens[id];
    return {
      altar: {
        broken: !!w?.altar.broken,
        contributed: { ...(w?.altar.contributed ?? {}) },
        quotas: wardenAltarQuotas(id, this.onlineCount),
      },
      gateOpen: !!w?.gateOpen,
    };
  }

  private wardensState(): Record<string, WardenWorldState> {
    const out: Record<string, WardenWorldState> = {};
    for (const id of new Set([...Object.keys(WARDEN_ALTAR_PER_HEAD), ...Object.keys(this.wardens)])) {
      out[id] = this.wardenState(id);
    }
    return out;
  }

  // ---------------------------------------------------------------- gathering / crafting

  async hitNode(nodeId: string, withTool?: ToolId): Promise<HitResult> {
    const sn = this.nodesById.get(nodeId);
    if (!sn) return { ok: false, reason: 'UNKNOWN_NODE' };
    const t = NODE_TYPES[sn.type];
    const owned = withTool && gearOwns(this.inv, this.equipped, withTool) ? withTool : undefined;
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
    // static validity is client-side across the WHOLE footprint (bounds,
    // water/land, on a Node); the server owns OCCUPIED (ADR-0008 footprint-claim)
    const { w, h } = footprint(item);
    const onWater = !!ITEMS[item].onWater;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const fx = tx + dx;
        const fy = ty + dy;
        if (fx < 0 || fy < 0 || fx >= MAP_W || fy >= MAP_H) return { ok: false, reason: 'INVALID' };
        if (this.wd.nodes.some((n) => n.tx === fx && n.ty === fy)) return { ok: false, reason: 'INVALID' };
        const b = this.wd.blocked[fy * MAP_W + fx];
        if (onWater ? b !== 1 : b !== 0) return { ok: false, reason: 'INVALID' };
      }
    }

    const id = `s${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const txt = item === 'signpost' ? (text ?? '').trim().slice(0, 40) : null;
    const base = {
      p_who: this.me,
      p_item: item,
      p_tx: tx,
      p_ty: ty,
      p_text: txt,
      p_id: id,
      // hammocks are retired; the live RPC signature still requires the param
      p_is_hammock: false,
    };
    // pass the footprint; fall back to the pre-footprint signature if the
    // migration (0004) isn't deployed yet, so the live world keeps building
    let res = await this.rpc<any>('jw_place_structure', { ...base, p_w: w, p_h: h });
    if (!res) res = await this.rpc<any>('jw_place_structure', base);
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'INVALID' };
    this.inv = res.inventory as Inventory;
    const structure = res.structure as Structure;
    this.structures.set(structure.id, structure);
    this.relay('structurePlaced', structure);
    // A3 (ADR-0010): the Hall founds/relocates the Village; a milestone Building
    // raised in-zone advances the tier. A second, server-ordered RPC keeps
    // jw_place_structure generic; decor (target 0) never touches the Village.
    if (isVillageStructure(item)) {
      const target = milestoneTierOf(item);
      if (target > 0) {
        const nres = await this.rpc<any>('jw_village_note_build', {
          p_who: this.me,
          p_target_tier: target,
          p_tx: tx,
          p_ty: ty,
          p_radius: VILLAGE_ZONE_RADIUS,
          p_thresholds: VILLAGE_THRESHOLDS,
          p_max: VILLAGE_MAX_TIER,
        });
        if (nres?.changed && nres.village) {
          const v = this.villageFromJson(nres.village);
          if (nres.founded) this.pushChat(t.system.sender, t.system.villageFounded(this.me ?? ''));
          else if (v.tier > (nres.tierBefore ?? v.tier)) this.pushChat(t.system.sender, t.system.villageGrew(t.village.tierName(v.tier)));
          this.relay('villageChanged', v);
        }
      }
    }
    return { ok: true, structure, inventory: { ...this.inv } };
  }

  async dismantleStructure(id: string): Promise<DismantleResult> {
    const s = this.structures.get(id);
    if (!s) return { ok: false, reason: 'NO_STRUCTURE' };
    // the FULL refund is the crafting cost (client knows RECIPES); the server
    // applies it atomically + deletes the row so the op stays server-ordered
    const recipe = RECIPES.find((r) => r.output === s.type);
    const refund: Inventory = {};
    if (recipe) for (const [res_, c] of Object.entries(recipe.cost)) refund[res_ as keyof Inventory] = c as number;
    const res = await this.rpc<any>('jw_dismantle_structure', { p_who: this.me, p_id: id, p_refund: refund });
    // degrade gracefully if the migration (0004) isn't deployed: remove + refund
    // optimistically (the row re-materialises on the next loadWorld until it lands)
    if (res?.inventory) this.inv = res.inventory as Inventory;
    else for (const [k, v] of Object.entries(refund)) this.inv[k as ItemId] = (this.inv[k as ItemId] ?? 0) + (v as number);
    this.structures.delete(id);
    this.relay('structureRemoved', id);
    // A3 (ADR-0010): dismantling THE Hall un-homes the Village (spawn falls back
    // to World spawn) but preserves the tier/pool — the RPC returns the record.
    if (s.type === 'village_hall' && res?.village) {
      this.relay('villageChanged', this.villageFromJson(res.village));
    }
    return { ok: true, removed: id, refund, inventory: { ...this.inv } };
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

  // the generic Refiner kernel (ADR-0017 §6, migration 0012): the client passes
  // the tuning, SQL is the generic executor — the Sawmill stays on its legacy path
  private refinerArgs(refinerId: string, cfg: RefinerConfig): Record<string, unknown> {
    return {
      p_id: refinerId, p_who: this.me,
      p_input_item: cfg.inputItem, p_output_item: cfg.outputItem, p_ms: cfg.msPerUnit, p_cap: cfg.cap,
    };
  }

  async refinerOpen(refinerId: string, cfg: RefinerConfig): Promise<RefinerResult> {
    const res = await this.rpc<any>('jw_refiner_open', this.refinerArgs(refinerId, cfg));
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'NO_REFINER' };
    this.inv = res.inventory as Inventory;
    return { ok: true, state: res.state, inventory: { ...this.inv } };
  }

  async refinerDeposit(refinerId: string, cfg: RefinerConfig): Promise<RefinerResult> {
    const res = await this.rpc<any>('jw_refiner_deposit', this.refinerArgs(refinerId, cfg));
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'NOTHING' };
    this.inv = res.inventory as Inventory;
    return { ok: true, state: res.state, inventory: { ...this.inv } };
  }

  async refinerCollect(refinerId: string, cfg: RefinerConfig): Promise<RefinerResult> {
    const res = await this.rpc<any>('jw_refiner_collect', this.refinerArgs(refinerId, cfg));
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
    // the dig spot rotates server-side. With migration 0016 live, jw_dig returns
    // the new index and we relocate the ✕ correctly; without it, we can't know the
    // new spot, so hide the ✕ until the next join re-reads world.treasure_index.
    if (typeof res.treasure_index === 'number') {
      this.treasureIndex = res.treasure_index;
      this.treasureDugPending = false;
    } else {
      this.treasureDugPending = true;
    }
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

  // ---------------------------------------------------------------- A3: the Village (ADR-0010)

  async contributeVillage(amounts?: Inventory): Promise<ContributeVillageResult> {
    const res = await this.rpc<any>('jw_contribute_village', {
      p_who: this.me,
      p_values: VILLAGE_CONTRIB,
      p_thresholds: VILLAGE_THRESHOLDS,
      p_max: VILLAGE_MAX_TIER,
      // per-resource caps (ADR-0010): the server clamps each to what is held.
      // null pours in everything qualifying (migration 0006's 5-arg overload).
      p_amounts: amounts ?? null,
    });
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'NOTHING_TO_GIVE' };
    this.inv = res.inventory as Inventory;
    const before = this.village.tier;
    const village = this.villageFromJson(res.village);
    this.relay('villageChanged', village); // dispatch updates this.village + broadcasts
    if (village.tier > before) this.pushChat(t.system.sender, t.system.villageGrew(t.village.tierName(village.tier)));
    return { ok: true, taken: res.taken as Inventory, inventory: { ...this.inv }, village, gained: res.gained ?? 0 };
  }

  async tradeMarket(giveItem: ItemId, giveCount: number, getItem: ItemId): Promise<TradeResult> {
    if (!TRADEABLE.includes(giveItem) || !TRADEABLE.includes(getItem)) return { ok: false, reason: 'NOT_TRADEABLE' };
    const want = Math.max(0, Math.floor(giveCount));
    const got = tradeYield(giveItem, want, getItem, this.village.tier);
    if (got <= 0) return { ok: false, reason: want <= 0 ? 'INSUFFICIENT' : 'NO_YIELD' };
    const res = await this.rpc<any>('jw_village_trade', {
      p_who: this.me,
      p_give: giveItem,
      p_give_n: want,
      p_get: getItem,
      p_get_n: got,
    });
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'INSUFFICIENT' };
    this.inv = res.inventory as Inventory;
    return { ok: true, gave: { item: giveItem, count: want }, got: { item: getItem, count: got }, inventory: { ...this.inv } };
  }

  async wishFountain(count: number): Promise<WishResult> {
    const item = FOUNTAIN_WISH_ITEM as ItemId;
    if (festivalActive(this.village, Date.now())) return { ok: false, reason: 'FESTIVAL_ACTIVE' };
    const want = Math.max(0, Math.floor(count));
    if (want <= 0 || (this.inv[item] ?? 0) < want) return { ok: false, reason: 'INSUFFICIENT' };
    const res = await this.rpc<any>('jw_village_wish', { p_who: this.me, p_n: want });
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'INSUFFICIENT' };
    this.inv = res.inventory as Inventory;
    const village = this.villageFromJson(res.village);
    this.village = village;
    this.relay('villageChanged', village);
    return { ok: true, inventory: { ...this.inv }, village, festivalStarted: !!res.festivalStarted };
  }

  async setVillageName(name: string, crest: number): Promise<{ village: VillageRecord }> {
    const res = await this.rpc<any>('jw_village_set_name', { p_name: name.slice(0, 24), p_crest: crest });
    const village = this.villageFromJson(res?.village);
    this.relay('villageChanged', village);
    return { village };
  }

  async addVillageNote(text: string): Promise<{ village: VillageRecord }> {
    const res = await this.rpc<any>('jw_village_add_note', { p_who: this.me, p_text: text.slice(0, 60) });
    const village = this.villageFromJson(res?.village);
    this.relay('villageChanged', village);
    return { village };
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

  // ---------------------------------------------------------------- the Wardens (ADR-0017)

  /** lay every carried demanded good at the Warden's altar (the Seal pattern per rung) */
  async contributeWardenAltar(wardenId: string): Promise<ContributeWardenResult> {
    const res = await this.rpc<any>('jw_contribute_warden', {
      p_who: this.me,
      p_warden: wardenId,
      p_quotas: wardenAltarQuotas(wardenId, this.onlineCount),
    });
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'NOTHING_TO_GIVE' };
    this.inv = res.inventory as Inventory;
    const altar: WardenAltarState = {
      broken: !!res.altar?.broken,
      contributed: { ...(res.altar?.contributed ?? {}) },
      quotas: wardenAltarQuotas(wardenId, this.onlineCount),
    };
    this.relay('wardenAltarChanged', wardenId, altar); // dispatch updates the mirror + broadcasts
    if (res.broken) this.pushChat(t.system.sender, t.system.wardenAltarComplete(t.warden.name(wardenId)));
    return { ok: true, taken: res.taken as Inventory, inventory: { ...this.inv }, altar };
  }

  /** consume the Warden's Totem at its altar — refused while ANY fight runs (the mutex) */
  async summonWarden(wardenId: string): Promise<SummonResult> {
    const def = wardenDef(wardenId);
    if (!def) return { ok: false, reason: 'NO_TOTEM' };
    const res = await this.rpc<any>('jw_summon_warden', {
      p_who: this.me,
      p_warden: wardenId,
      p_totem: def.totem,
      p_awake_ms: GUARDIAN_AWAKE_MS,
      p_dormant_ms: DORMANT_TIMEOUT_MS,
    });
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'NO_TOTEM' };
    this.inv = res.inventory as Inventory;
    const fight = this.fightPublic(res.fight)!;
    this.pushChat(t.system.sender, t.system.wardenStirs(t.warden.name(wardenId), this.me ?? ''));
    this.relay('guardianSummoned', fight); // the ONE fight slot rides the guardian* events
    return { ok: true, fight, inventory: { ...this.inv } };
  }

  /** turn the gate key at the Realm arch — one-time, forever (the Delve-shaft pattern) */
  async openRealmGate(wardenId: string): Promise<OpenRealmResult> {
    if (this.wardens[wardenId]?.gateOpen) return { ok: false, reason: 'ALREADY_OPEN' };
    const res = await this.rpc<any>('jw_open_realm_gate', { p_who: this.me, p_warden: wardenId });
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'ALREADY_OPEN' };
    this.relay('realmOpened', wardenId);
    this.pushChat(t.system.sender, t.system.realmOpened(t.warden.realmName(wardenId), this.me ?? ''));
    return { ok: true, wardenId };
  }

  // ---------------------------------------------------------------- the Echoes (ADR-0017 rung 2)

  /** record a movement shade — spends a Chime Charm; the server quantises the start */
  async recordEcho(ghostId: string, samples: EchoSample[], periodMs: number): Promise<{ ghost: Ghost; inventory: Inventory } | null> {
    const res = await this.rpc<any>('jw_echo_record', {
      p_who: this.me,
      p_ghost: ghostId,
      p_period: periodMs,
      p_samples: samples,
    });
    if (!res || res.ok === false) return null;
    if (res.inventory) this.inv = res.inventory as Inventory;
    const g = res.ghost;
    return {
      ghost: { ghostId: g.ghostId, who: g.who, recordedAt: g.recordedAt, periodMs: g.periodMs, samples: g.samples },
      inventory: { ...this.inv },
    };
  }

  /** list every shade in this World (an RPC read — never presence, the rate-limit gotcha) */
  async listEchoes(): Promise<Ghost[]> {
    const res = await this.rpc<any[]>('jw_echo_list', {});
    if (!res || !Array.isArray(res)) return [];
    return res.map((g) => ({ ghostId: g.ghostId, who: g.who, recordedAt: g.recordedAt, periodMs: g.periodMs, samples: g.samples, kind: g.kind ?? 'echo' }));
  }

  /** leave a permanent, named greeting shade (mastery mark; one per Player) */
  async leaveGreeting(samples: EchoSample[], periodMs: number): Promise<Ghost | null> {
    const res = await this.rpc<any>('jw_echo_greet', { p_who: this.me, p_period: periodMs, p_samples: samples });
    if (!res || res.ok === false) return null;
    const g = res.ghost;
    return { ghostId: g.ghostId, who: g.who, recordedAt: g.recordedAt, periodMs: g.periodMs, samples: g.samples, kind: 'greeting' };
  }

  /** clear one of your own shades */
  async forgetEcho(ghostId: string): Promise<void> {
    await this.rpc('jw_echo_forget', { p_who: this.me, p_ghost: ghostId });
  }

  /** summon the Reverberant by solving the puzzle — no altar/totem, keeps the mutex */
  async summonReverberant(): Promise<SummonResult> {
    const res = await this.rpc<any>('jw_summon_reverb', {
      p_who: this.me,
      p_awake_ms: GUARDIAN_AWAKE_MS,
      p_dormant_ms: DORMANT_TIMEOUT_MS,
    });
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'FIGHT_IN_PROGRESS' };
    const fight = this.fightPublic(res.fight)!;
    this.pushChat(t.system.sender, t.system.reverbRises(this.me ?? ''));
    this.relay('guardianSummoned', fight);
    return { ok: true, fight, inventory: { ...this.inv } };
  }

  /** the Reverberant's defeat reward — server-guarded (idempotent) epic helm + weekly sigil */
  async claimReverb(week: number): Promise<{ ok: boolean; inventory?: Inventory; firstEver?: boolean; weekly?: boolean }> {
    const res = await this.rpc<any>('jw_reverb_claim', { p_who: this.me, p_week: week });
    if (!res || res.ok === false) return { ok: false };
    if (res.inventory) this.inv = res.inventory as Inventory;
    return { ok: true, inventory: { ...this.inv }, firstEver: !!res.firstEver, weekly: !!res.weekly };
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

  async claimDelveLoot(loot: Inventory, record?: DepthRecordWrite): Promise<{ inventory: Inventory }> {
    // the run's ONLY DB write (ADR-0007 §8): grant the participation drop set to
    // this Player's own inventory. jw_claim_delve_loot returns the merged
    // inventory; if it isn't deployed, merge into the local mirror optimistically.
    // ADR-0015 (migration 0011): the Depth Record rides the same RPC — the
    // Descent's board row + this Player's personal best upsert in the one call.
    // The record params are sent only when a record rides along, so plain loot
    // claims still match the pre-0011 3-arg signature (deploy order safety).
    const args: Record<string, unknown> = { p_who: this.me, p_loot: loot };
    if (record) {
      args.p_descent = record.descentId;
      args.p_depth = record.depth;
      args.p_roster = record.roster;
    }
    const res = await this.rpc<any>('jw_claim_delve_loot', args);
    if (res?.inventory) this.inv = res.inventory as Inventory;
    else for (const [k, v] of Object.entries(loot)) this.inv[k as ItemId] = (this.inv[k as ItemId] ?? 0) + (v as number);
    return { inventory: { ...this.inv } };
  }

  /** the World's Depth Records (ADR-0015): top slice, deepest-first, ties by earliest */
  async getDepthRecords(): Promise<DepthRecords> {
    const [dR, bR] = await Promise.all([
      this.supa
        .from('depth_records')
        .select('descent_id,depth,roster,achieved_at')
        .eq('world_id', this.worldId)
        .order('depth', { ascending: false })
        .order('achieved_at', { ascending: true })
        .limit(50),
      this.supa
        .from('depth_bests')
        .select('name,depth,achieved_at')
        .eq('world_id', this.worldId)
        .order('depth', { ascending: false })
        .order('achieved_at', { ascending: true })
        .limit(50),
    ]);
    // pre-migration (table missing) both selects error → data null → empty board
    const descents = ((dR.data ?? []) as any[]).map((r) => ({
      descentId: r.descent_id as string,
      depth: r.depth as number,
      roster: (r.roster ?? []) as string[],
      achievedAt: new Date(r.achieved_at as string).getTime(),
    }));
    const bests = ((bR.data ?? []) as any[]).map((r) => ({
      name: r.name as string,
      depth: r.depth as number,
      achievedAt: new Date(r.achieved_at as string).getTime(),
    }));
    return { descents, bests };
  }

  sendDungeon(msg: DungeonMsg): void {
    void this.channel?.send({ type: 'broadcast', event: 'delve', payload: msg });
  }

  /** ADR-0012: the real online roster (self + peers), from the last presence sync */
  creatureRoster(): string[] {
    return this.creatureRosterNames.length ? [...this.creatureRosterNames] : this.me ? [this.me] : [];
  }

  /** the elected host's ONE batched per-tick creature broadcast (or a guest action) */
  sendCreatures(msg: CreatureMsg): void {
    void this.channel?.send({ type: 'broadcast', event: 'creatures', payload: msg });
  }

  async hitGuardian(withTool?: ToolId): Promise<GuardianHitResult> {
    const f = this.fightState;
    if (!f) return { ok: false, reason: 'NO_FIGHT' };
    // roll the weapon band + crit here (the Backend is the server boundary,
    // ADR-0006 §3): the authoritative pool subtraction still happens in the
    // server-ordered jw_guardian_hit RPC, which just applies this p_dmg
    const owned = withTool && gearOwns(this.inv, this.equipped, withTool) ? withTool : undefined;
    // the worn Helm's flat band raise rides in like the Village crit buff (ADR-0017 §3)
    const { damage: dmg, crit } = rollGuardianDamage(owned, Math.random, villageBuff(this.village.tier).critChance, armorBuff(this.equipped));
    const engaging = f.engagedAt === null;
    let roster = f.roster;
    let maxHp = f.maxHp;
    let eyeOpen = true;
    if (engaging) {
      roster = this.playersInArena(f.warden);
      maxHp = DEV_FIGHT || DEV_WARDEN_FIGHT || DEV_VERDANT_FIGHT ? DEV_FIGHT_HP : HP_PER_HEAD * Math.max(1, roster.length);
    } else {
      // the Eye Window of the ACTIVE fight's kit (ADR-0017)
      eyeOpen = eyeOpenWithin(Date.now() - (f.engagedAt as number), GUARDIAN_AWAKE_MS, ADJUDICATION_SLACK_MS, kitOf(f.warden));
    }
    const res = await this.rpc<any>('jw_guardian_hit', {
      p_who: this.me,
      p_dmg: dmg,
      p_roster: roster,
      p_max_hp: maxHp,
      p_eye_open: eyeOpen,
      // 0 — the server no longer auto-grants Scales; each fighter takes theirs out of
      // the client-side Spoils window (claimDelveLoot), matching the Delve's claim model.
      // Keeps the existing RPC (jw_add(...,0) is a no-op) so there is no migration.
      p_scale_drop: 0,
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
    const wave = waveInfoAt(Date.now() - f.engagedAt, GUARDIAN_AWAKE_MS, kitOf(f.warden)).index;
    // Wake priority Village Hall > World spawn is enforced HERE (p_spawn is the
    // server's fallback wake tile): the live jw_knockdown only knows the legacy
    // players.wake_point else p_spawn, so passing the Hall tile fixes the
    // "respawn below the waterfall" bug against the old server too. Migration
    // 0019 nulls the legacy wake_points so p_spawn always wins.
    const hallTile = this.village.hall ? this.hallWakeTile(this.village.hall) : null;
    const res = await this.rpc<any>('jw_knockdown', {
      p_who: this.me,
      p_wave: wave,
      p_exhaustion_n: EXHAUSTION_KNOCKDOWNS,
      p_spawn: hallTile ?? { tx: this.wd.spawn.tx, ty: this.wd.spawn.ty },
      p_tile: TILE,
      p_awake_ms: GUARDIAN_AWAKE_MS,
      p_dormant_ms: DORMANT_TIMEOUT_MS,
      p_empty_ms: ARENA_EMPTY_SLUMBER_MS,
    });
    void tx;
    void ty;
    if (!res || res.ok === false) return { ok: false, reason: res?.reason ?? 'NOT_IN_DANGER' };
    // atHammock on the wire means the OLD server honoured a legacy wake_point
    // (hammocks are retired and invisible now) — with a founded Hall, override
    // locally so every wake lands at the Village. The stale x/y the old server
    // wrote is harmless: peers follow the live position stream, and login
    // repositions at the Hall anyway. Migration 0019 retires wake_point for good.
    const atVillage = !!hallTile;
    const wake = atVillage && res.atHammock ? hallTile! : (res.wake as { tx: number; ty: number });
    if (res.exhausted) {
      this.pushChat(t.system.sender, t.system.exhaustionCollapse(this.me ?? '', atVillage));
    }
    // the RPC returns emptySlumberAt when this knockdown emptied the arena (whole
    // roster Exhausted): re-anchor the local slumber timer so the wiped fight ends
    // ~5s later instead of running the full awake window (ADR-0004 wipe)
    if (res.emptySlumberAt != null && this.fightState && this.fightState.emptySlumberAt == null) {
      this.fightState = { ...this.fightState, emptySlumberAt: res.emptySlumberAt as number };
      this.scheduleSlumberCheck();
    }
    // B2: being Exhausted teleports me out — re-evaluate whether the arena is now
    // empty of live roster members (covers the case jw_knockdown's own wipe check
    // misses, e.g. others already stepped out)
    if (res.exhausted && this.fightState?.engagedAt != null) this.evaluateArenaOccupancy();
    return { ok: true, knockdowns: res.knockdowns, exhausted: res.exhausted, wake, atVillage };
  }

  /** the arena rect the active fight belongs to (ADR-0017 §1): a Warden fights in
   *  its own court; the Guardian keeps the top-level arena */
  private arenaRectOf(warden: string | null | undefined): { x: number; y: number; w: number; h: number } {
    return (warden && this.wd.wardenArenas?.[warden]?.arena) || this.wd.arena;
  }

  private playersInArena(warden: string | null | undefined): string[] {
    const a = this.arenaRectOf(warden);
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

  /**
   * Roster members who are LIVE inside the arena: present (online, via presence
   * positions) and standing in the rect. Exhausted fighters are teleported to
   * their wake point, so a position check excludes them; offline peers are
   * pruned from `positions`, so they aren't counted either.
   */
  private liveRosterInArena(f: FightState): number {
    const a = this.arenaRectOf(f.warden);
    const inRect = (x: number, y: number) => {
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      return tx >= a.x && tx < a.x + a.w && ty >= a.y && ty < a.y + a.h;
    };
    let n = 0;
    for (const name of f.roster) {
      const pos = name === this.me ? this.lastLocal : this.positions.get(name);
      if (pos && inRect(pos.x, pos.y)) n++;
    }
    return n;
  }

  /**
   * B2 (ADR-0004): when an engaged arena holds zero live roster members, ask the
   * server (idempotent, ordered) to arm the ~5 s re-slumber; a return within the
   * grace disarms it. Only fired on the 0↔>0 transition. Degrades quietly if the
   * migration (0004) isn't deployed — the all-Exhausted wipe path still ends the
   * fight via jw_knockdown, and everything else falls back to the awake window.
   */
  private evaluateArenaOccupancy(): void {
    const f = this.fightState;
    if (!f || f.engagedAt === null || f.hp <= 0) {
      this.lastArenaEmpty = null;
      return;
    }
    const empty = this.liveRosterInArena(f) === 0;
    if (this.lastArenaEmpty === empty) return; // no transition — nothing to report
    this.lastArenaEmpty = empty;
    void this.rpc<any>('jw_guardian_arena_occupancy', {
      p_who: this.me,
      p_live: empty ? 0 : 1,
      p_empty_ms: ARENA_EMPTY_SLUMBER_MS,
    }).then((res) => {
      if (!res) return; // RPC not deployed — leave the server's emptySlumberAt untouched
      const at = (res.emptySlumberAt ?? null) as number | null;
      if (this.fightState && this.fightState.engagedAt !== null) {
        this.fightState = { ...this.fightState, emptySlumberAt: at };
        this.scheduleSlumberCheck();
      }
    });
  }

  private scheduleSlumberCheck(): void {
    this.clearSlumberCheck();
    const f = this.fightState;
    if (!f) return;
    let deadline = f.engagedAt === null ? f.summonedAt + DORMANT_TIMEOUT_MS : f.engagedAt + GUARDIAN_AWAKE_MS;
    // once the arena has emptied (whole roster Exhausted — ADR-0004 wipe) the
    // fight ends sooner; fire the reconcile then instead of at the awake window
    if (f.emptySlumberAt !== null) deadline = Math.min(deadline, f.emptySlumberAt);
    // capture the identity now — the reconcile RPC nulls the fight server-side
    const wardenName = f.warden ? t.warden.name(f.warden) : null;
    this.slumberTimer = window.setTimeout(() => {
      this.slumberTimer = null;
      void this.rpc<any>('jw_guardian_reconcile', { p_awake_ms: GUARDIAN_AWAKE_MS, p_dormant_ms: DORMANT_TIMEOUT_MS }).then((res) => {
        if (res?.slumbered) {
          this.pushChat(
            t.system.sender,
            res.reason === 'dormant'
              ? wardenName ? t.system.wardenNoStrike(wardenName) : t.system.guardianNoStrike
              : wardenName ? t.system.wardenUnbeaten(wardenName) : t.system.guardianUnbeaten,
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

  async eatCookedMeat(): Promise<EatResult> {
    // consume 1 cooked_meat through the generic craft RPC (count 0 output = a pure
    // consume: jw_afford checks it, cost is deducted, nothing is produced) — the
    // +20% move buff is applied client-side (ADR-0001), so NO new RPC is needed.
    const res = await this.rpc<any>('jw_craft', {
      p_who: this.me,
      p_cost: { cooked_meat: 1 },
      p_output: 'cooked_meat',
      p_count: 0,
      p_requires_tool: null,
    });
    if (!res || res.ok === false) return { ok: false, reason: 'NOTHING_TO_EAT' };
    this.inv = res.inventory as Inventory;
    return { ok: true, inventory: { ...this.inv }, buffMs: SPEED_BUFF_MS };
  }

  async eatGrasweaveRation(): Promise<EatResult> {
    // consume 1 grasweave_ration through the generic craft RPC (count 0 output = a
    // pure consume, exactly like eatCookedMeat) — the +20% move buff is applied
    // client-side (ADR-0001), so NO new RPC/migration is needed (ADR-0017 rung 3).
    const res = await this.rpc<any>('jw_craft', {
      p_who: this.me,
      p_cost: { grasweave_ration: 1 },
      p_output: 'grasweave_ration',
      p_count: 0,
      p_requires_tool: null,
    });
    if (!res || res.ok === false) return { ok: false, reason: 'NOTHING_TO_EAT' };
    this.inv = res.inventory as Inventory;
    return { ok: true, inventory: { ...this.inv }, buffMs: SPEED_BUFF_MS };
  }

  /**
   * Wear/unwear gear (ADR-0017 §4, migrations 0013 → 0016 → 0021). jw_equip
   * MOVES the piece between the bag and the slot server-side (0016) and returns
   * the mutated inventory; 0021 widens the slot whitelist to the two weapon
   * slots. The armor look rides the position stream + a fresh presence snapshot
   * so peers recompose at once (weapon slots stay off the wire). Old-server
   * ladder: pre-0013 returns null → local non-persisted equip; pre-0016 returns
   * no `inventory` → keep the old bag; pre-0021 silently DROPS weapon keys →
   * keep them client-side in REFERENCE mode (no bag move happened server-side,
   * so the copy is still in the bag and gearOwns falls back to it).
   */
  async equip(equipped: EquippedGear): Promise<EquipResult> {
    const wanted = sanitizeEquipped(equipped);
    const res = await this.rpc<any>('jw_equip', { p_who: this.me, p_equipped: wanted });
    const next = res?.equipped ? sanitizeEquipped(res.equipped) : wanted;
    if (res?.equipped && !WEAPON_SLOTS.some((s) => next[s])) {
      // the server echoed a record without ANY weapon slot we sent — the old
      // whitelist ate them; carry the client's weapon picks in reference mode.
      // ONLY when the bag still accounts for the copy: a post-0021 server
      // produces the same shape when it LEGITIMATELY refuses an unowned weapon
      // (the piece "simply drops out"), and resurrecting that one would arm a
      // phantom. On the old server the bag was never decremented, so the check
      // always passes there.
      for (const s of WEAPON_SLOTS) {
        const w = wanted[s];
        if (w && (this.inv[w] ?? 0) > 0) next[s] = w;
      }
    }
    this.equipped = next;
    if (res?.inventory) this.inv = res.inventory as Inventory; // 0016: the bag moved
    if (this.lastLocal) {
      this.lastLocal = { ...this.lastLocal, armor: armorOnly(this.equipped) };
      this.broadcastPos(true);
      // refresh the tracked snapshot too so LATE joiners see the new armor —
      // a single re-track per equip stays far under the presence rate limit
      if ((this.channel?.state as string) === 'joined') {
        this.lastPresence = Date.now();
        void this.channel!.track(this.lastLocal);
      }
    }
    return { equipped: { ...this.equipped }, inventory: { ...this.inv } };
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

  async markExplored(chunks: number[], _stride: number): Promise<void> {
    // The RPC stays 3-arg (p_chunks only) so the live world never breaks if the
    // client ships before migration 0017. That migration does the one-time
    // stride remap + stamps `players.fog_stride`, and jw_join returns it as
    // `exploredStride`; from then on the store and fresh chunks share one stride.
    await this.rpc('jw_mark_explored', { p_who: this.me, p_chunks: chunks });
  }
}
