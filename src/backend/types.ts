import type { ItemId, StructureId, ToolId } from '../content/items';
import type { NodeTypeId } from '../content/nodeTypes';
import type { VillageRecord } from '../content/village';
import type { EquippedArmor } from '../content/armor';
import type { EchoSample, Ghost } from '../content/echoes';

/** legacy tint-preset id — only survives in pre-update Player rows for migration */
export type AvatarId = 0 | 1 | 2 | 3;
export type Dir = 'down' | 'up' | 'left' | 'right';

/**
 * A Player's Avatar: four palette indices (curated swatches — see
 * src/avatars.ts). Chosen at first join, editable at every join, synced
 * through the backend so every client composes the same look.
 */
export interface Appearance {
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
}

export interface PlayerPos {
  name: string;
  appearance: Appearance;
  x: number;
  y: number;
  dir: Dir;
  moving: boolean;
  /** the Player's in-hand Loadout item (Realtime-broadcast); null when empty */
  held?: ItemId;
  /**
   * Count of this Player's swings this session — a monotone counter, NOT a
   * timestamp. It piggybacks on the existing position stream (no extra packet,
   * no cadence change) so peers can echo the swing pose + Tool arc on the
   * sender's remote body: a receiver plays ONE swing when the value has
   * increased since its last packet — no clock semantics, so skew is
   * irrelevant and redelivery dedupes itself. The 10Hz stream vs the ~300ms
   * swing cadence means jumps of 1–2 per packet are normal (still one echo).
   * Optional: older clients and the Mock's bots never send it and render
   * exactly as before.
   */
  swings?: number;
  /**
   * The Armor this Player wears (ADR-0017 §4), riding the position broadcast +
   * presence snapshot exactly like `held`/`swings` — no extra packet, no
   * cadence change. Peers fold it into the avatar recompose key so an equip
   * re-dresses the remote body. Optional: bots and older clients never send it.
   */
  armor?: EquippedArmor;
}

export type Inventory = Partial<Record<ItemId, number>>;

export interface NodeState {
  id: string;
  type: NodeTypeId;
  tx: number;
  ty: number;
  hp: number;
  harvestedAt: number | null;
}

export interface Structure {
  id: string;
  type: StructureId;
  tx: number;
  ty: number;
  placedBy: string;
  placedAt: number;
  /** signposts only: the Player-written line, length-capped, visible to all */
  text?: string;
}

export interface ChatMsg {
  from: string;
  text: string;
  ts: number;
}

/** the Journey's sequential objectives, in display order (see content/journey.ts) */
export type JourneyStepId =
  | 'gather_wood'
  | 'craft_axe'
  | 'harvest_stone'
  | 'place_campfire'
  | 'read_tablet'
  | 'visit_seal'
  | 'first_offering';

/**
 * Per-Player onboarding state, persisted like `introSeen` (a Supabase
 * implementation stores both records as jsonb columns on the player row).
 */
export interface JourneyState {
  /** displayed sequentially; completes from evidence, so order is not enforced */
  steps: Partial<Record<JourneyStepId, boolean>>;
  /** successful uses per contextual hint — a hint retires after a few uses */
  hintUses: Record<string, number>;
}

export type JoinResult =
  | {
      ok: true;
      name: string;
      appearance: Appearance;
      x: number;
      y: number;
      inventory: Inventory;
      isNew: boolean;
      /** false until the intro story has been shown to this Player once */
      introSeen: boolean;
      journey: JourneyState;
      /**
       * fog-of-war: chunk indices this Player has explored, persisted like
       * `journey` (a Supabase implementation stores an int[] on the player row)
       */
      explored: number[];
      /**
       * the Armor worn last session (ADR-0017 §4), persisted like `wake_point`
       * (a jsonb column on the player row) and re-validated against the
       * inventory on load — equipment never survives losing the piece
       */
      equipped: EquippedArmor;
    }
  | { ok: false; reason: 'WRONG_PIN' | 'BAD_NAME' | 'BAD_PIN' };

export interface QuestState {
  tabletsRead: string[];
  /** total lore tablets in the World — derived from world data, never hardcoded */
  tabletsTotal: number;
  mapPieces: number;
  gateOpen: boolean;
  /** revealed only once 3+ map pieces are held */
  treasureLocation: { tx: number; ty: number } | null;
  /**
   * the rubble-sealed Delve mine shaft: broken once, forever, by harvesting it
   * with an Ancient Pickaxe (ADR-0007). A world flag like `gateOpen`; once true
   * the shaft is freely re-enterable by anyone.
   */
  delveOpen: boolean;
}

/** the four Resources the Seal demands */
export type SealResourceId = 'wood' | 'stone' | 'fiber' | 'fruit';

export interface SealState {
  /** breaks once, forever (world flag, like gateOpen) */
  broken: boolean;
  /** collective totals — no individual contribution tracking, ever */
  contributed: Record<SealResourceId, number>;
  /** the live per-person target: per-head quota × Players online (see config.sealQuotas) */
  quotas: Record<SealResourceId, number>;
}

/**
 * A live Guardian fight. Until the first strike the Guardian is DORMANT
 * (`engagedAt === null`): it roams harmlessly, the arena is open, and there are
 * no danger zones or Eye Windows. The first landed hit sets `engagedAt`, locks
 * the `roster` (Players inside the arena at that instant), and fixes HP; from
 * then on everything clients render derives from `engagedAt` (ADR-0002 as
 * amended by ADR-0004). `fight === null` means the Guardian slumbers.
 */
export interface FightState {
  /**
   * WHICH colossus this fight is (ADR-0017 §5): a WardenDef id ('mire', …), or
   * null/absent for the Guardian (rung 0). One fight slot per World — the
   * mutex: summoning anything while any fight runs is refused. Every schedule
   * derivation (client render AND server adjudication) picks its kit off this.
   */
  warden?: string | null;
  /** server timestamp of the summon (dormant start) */
  summonedAt: number;
  /** server timestamp of the first strike; null while dormant */
  engagedAt: number | null;
  /** the party sealed inside the Ward at the first strike — only they may damage it */
  roster: string[];
  /** 0 while dormant; fixed to HP_PER_HEAD × roster.length at engage */
  hp: number;
  maxHp: number;
  /** Players who landed ≥1 hit — each receives the full drop set on victory */
  participants: string[];
  /**
   * Set once the whole roster is Exhausted (the arena has emptied): the server
   * timestamp at which the Guardian re-slumbers, unbeaten. null while any roster
   * member can still fight. Lets a wiped fight end promptly instead of running
   * the full awake window (ADR-0004 wipe).
   */
  emptySlumberAt: number | null;
}

/**
 * The Village (ADR-0010): one collective, group-founded meta-loop per World.
 * Server-ordered, additive, and tile-INDEPENDENT — the tier/pool belong to the
 * group, never the Hall's tile, so moving or dismantling the Hall never resets
 * progress. Identical shape to the content-side VillageRecord.
 */
export type VillageState = VillageRecord;

/**
 * One Warden's altar (ADR-0017): the Seal pattern re-instanced per rung —
 * communal pooled quotas with visible bars, broken once, forever; then each
 * summon costs a crafted Warden Totem.
 */
export interface WardenAltarState {
  broken: boolean;
  /** collective totals — no individual tracking, like the Seal */
  contributed: Record<string, number>;
  /** the live per-head-scaled target (config.wardenAltarQuotas) */
  quotas: Record<string, number>;
}

/** one Warden's per-World progress: its altar + whether its Realm gate stands open */
export interface WardenWorldState {
  altar: WardenAltarState;
  /** flipped once, forever, by any Player with the gate key in hand (Delve-shaft pattern) */
  gateOpen: boolean;
}

export interface WorldSnapshot {
  nodes: NodeState[];
  structures: Structure[];
  chatLog: ChatMsg[];
  players: PlayerPos[];
  quest: QuestState;
  seal: SealState;
  fight: FightState | null;
  village: VillageState;
  /** ADR-0017: per-Warden altar/gate progress, keyed by WardenDef id */
  wardens: Record<string, WardenWorldState>;
}

export type OfferResult =
  | { ok: false; reason: 'INSUFFICIENT' | 'ALREADY_OPEN' }
  | { ok: true; inventory: Inventory; quest: QuestState };

export type DigResult =
  | { ok: false; reason: 'NO_MAP' | 'NOT_HERE' }
  | { ok: true; loot: Inventory; inventory: Inventory; quest: QuestState };

export type HitResult =
  | { ok: false; reason: 'DEPLETED' | 'TOOL_REQUIRED' | 'UNKNOWN_NODE'; requiredTool?: string }
  | { ok: true; node: NodeState; finishing: boolean; gained?: Inventory; inventory?: Inventory };

export type CraftResult =
  | { ok: false; reason: 'INSUFFICIENT' | 'TOOL_REQUIRED' | 'UNKNOWN_RECIPE' }
  | { ok: true; crafted: ItemId; inventory: Inventory };

export type PlaceResult =
  | { ok: false; reason: 'OCCUPIED' | 'INVALID' | 'NOT_IN_INVENTORY' }
  | { ok: true; structure: Structure; inventory: Inventory };

/**
 * Dismantling a Structure (ADR-0008): any Player may remove any Structure — no
 * ownership, like the crate — reclaiming its FULL crafting cost to the
 * dismantler. Server-ordered; the footprint frees for reuse. `refund` is what
 * the dismantler's inventory gained (empty for an uncraftable Structure).
 */
export type DismantleResult =
  | { ok: false; reason: 'NO_STRUCTURE' }
  | { ok: true; removed: string; refund: Inventory; inventory: Inventory };

export type ContributeSealResult =
  | { ok: false; reason: 'ALREADY_BROKEN' | 'NOTHING_TO_GIVE' }
  | { ok: true; taken: Inventory; inventory: Inventory; seal: SealState };

/**
 * Give every carried qualifying Resource/loot into the Village's communal pool
 * at the Hall (ADR-0010 §2) — additive and permanent. `gained` is the points
 * this deposit added; `village` is the record after any tier advancement.
 */
export type ContributeVillageResult =
  | { ok: false; reason: 'NO_HALL' | 'NOTHING_TO_GIVE' }
  | { ok: true; taken: Inventory; inventory: Inventory; village: VillageState; gained: number };

/**
 * The market_square Trade Post (ADR-0013): swap a surplus tradeable Resource for
 * another at a tier-scaled tax. The client computes the yield (deterministic);
 * the backend validates the give and applies the swap.
 */
export type TradeResult =
  | { ok: false; reason: 'NO_MARKET' | 'NOT_TRADEABLE' | 'INSUFFICIENT' | 'NO_YIELD' }
  | { ok: true; gave: { item: ItemId; count: number }; got: { item: ItemId; count: number }; inventory: Inventory };

/**
 * The fountain Wishing Well (ADR-0013): toss fruit toward a shared meter; when it
 * fills, a village-wide Dorffest starts. `festivalStarted` is true only on the
 * throw that crossed the threshold. The festival window lives in `village`.
 */
export type WishResult =
  | { ok: false; reason: 'NO_FOUNTAIN' | 'INSUFFICIENT' | 'FESTIVAL_ACTIVE' }
  | { ok: true; inventory: Inventory; village: VillageState; festivalStarted: boolean };

export type SummonResult =
  | { ok: false; reason: 'SEAL_INTACT' | 'ALTAR_INTACT' | 'FIGHT_IN_PROGRESS' | 'NO_TOTEM' }
  | { ok: true; fight: FightState; inventory: Inventory };

/** laying the previous tier's goods at a Warden's altar (the Seal-Offering shape) */
export type ContributeWardenResult =
  | { ok: false; reason: 'ALREADY_BROKEN' | 'NOTHING_TO_GIVE' }
  | { ok: true; taken: Inventory; inventory: Inventory; altar: WardenAltarState };

/** turning the gate key at a Realm's arch — a one-time, forever world flag */
export type OpenRealmResult =
  | { ok: false; reason: 'ALREADY_OPEN' | 'NO_KEY' }
  | { ok: true; wardenId: string };

export type GuardianHitResult =
  | { ok: false; reason: 'NO_FIGHT' }
  | {
      ok: true;
      hp: number;
      victory: boolean;
      inventory: Inventory;
      /** true when the eye was closed at server time — 0 damage, no participation */
      deflected: boolean;
      /** damage this hit dealt to the pool, base units (0 on a deflect) — the client floats it, scaled */
      damage: number;
      /** did this hit crit? (a passive bigger-number pop; false on a deflect) — display only */
      crit: boolean;
    };

export type KnockdownResult =
  | { ok: false; reason: 'NO_FIGHT' | 'NOT_IN_DANGER' }
  | {
      ok: true;
      knockdowns: number;
      exhausted: boolean;
      /** where Exhaustion wakes this Player: their Hammock, else World spawn */
      wake: { tx: number; ty: number };
      atHammock: boolean;
    };

/** shared crate storage: current contents + the caller's inventory after the op */
export type CrateResult =
  | { ok: false; reason: 'NO_CRATE' | 'NOTHING' }
  | { ok: true; contents: Inventory; inventory: Inventory };

/** a Sawmill's lazily-computed state — derived from timestamps, never ticked */
export interface SawmillState {
  /** wood still queued for milling */
  wood: number;
  /** planks finished and waiting to be collected */
  ready: number;
  /** ms until the next plank finishes; null when nothing is milling */
  nextPlankMs: number | null;
}

export type SawmillResult =
  | { ok: false; reason: 'NO_SAWMILL' | 'NOTHING' }
  | { ok: true; state: SawmillState; inventory: Inventory };

/**
 * Tuning for one Refiner family (ADR-0017 §6) — the client passes it on every
 * call and the backend is the generic executor (the jw_contribute_village
 * pattern). The Sawmill predates the kernel and keeps its own legacy path.
 */
export interface RefinerConfig {
  /** the raw Resource a deposit takes from the pack */
  inputItem: ItemId;
  /** the refined Resource a collect pays out */
  outputItem: ItemId;
  /** real time to refine ONE unit — lazy timestamps, never a tick (ADR-0001) */
  msPerUnit: number;
  /** most raw input the Refiner holds unrefined; deposits clamp to it */
  cap: number;
}

/** a Refiner's lazily-computed state — the SawmillState shape, generalized */
export interface RefinerState {
  /** raw input still refining */
  input: number;
  /** refined output finished and waiting to be collected */
  ready: number;
  /** ms until the next unit finishes; null when nothing is refining */
  nextMs: number | null;
}

export type RefinerResult =
  | { ok: false; reason: 'NO_REFINER' | 'NOTHING' | 'BAD_CONFIG' }
  | { ok: true; state: RefinerState; inventory: Inventory };

export type CookResult =
  | { ok: false; reason: 'NO_FISH' }
  | { ok: true; inventory: Inventory };

/**
 * Equipping Armor (ADR-0017 §4): the client sends the full desired slot→item
 * mapping; the backend keeps only owned, slot-matching pieces and returns what
 * actually stuck (the server-sanitized record). Never fails outright — an
 * unowned piece simply drops out.
 */
export type EquipResult = { equipped: EquippedArmor };

export type EatResult =
  | { ok: false; reason: 'NOTHING_TO_EAT' }
  | { ok: true; inventory: Inventory; buffMs: number };

export type OpenDelveResult =
  | { ok: false; reason: 'ALREADY_OPEN' }
  | { ok: true; delveOpen: true };

/**
 * The Depth Record write that rides a Stage's participation-loot claim
 * (ADR-0015 §5): the Descent id (= the Stage-1 runId carried through the
 * chain), the Depth just cleared, and the participation-loot roster. Sent only
 * by clients that landed ≥1 hit — credit is exactly the participation set.
 */
export interface DepthRecordWrite {
  descentId: string;
  depth: number;
  roster: string[];
}

/** one engraved Descent: how deep it got, who cleared that deepest Stage, when */
export interface DepthDescentRecord {
  descentId: string;
  depth: number;
  roster: string[];
  achievedAt: number;
}

/** one Player's personal best — the deepest Stage they helped clear */
export interface DepthBestRecord {
  name: string;
  depth: number;
  achievedAt: number;
}

/** the World's Depth Records (ADR-0015): append/upsert-only, never pruned —
 *  the board displays a top slice; both lists arrive deepest-first, ties by
 *  earliest achievedAt */
export interface DepthRecords {
  descents: DepthDescentRecord[];
  bests: DepthBestRecord[];
}

/**
 * A live mob as the host broadcasts it (ADR-0007 §2/§10). Mob HP lives ONLY in
 * host memory and on the wire — never a DB row. Peers render straight from these
 * snapshots; the host is the sole simulator/authority for the run.
 */
export interface MobSnap {
  id: string;
  kind: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  st: string;
  ax: number;
  ay: number;
  phase: number;
  /** the Forgeborn's oversized radius-strike is live (ADR-0011) — peers render/adjudicate the big zone */
  erupt?: boolean;
  /** the Bulwark's guard is up (ADR-0016) — peers render the lit rune ring (hits bounce host-side) */
  guard?: boolean;
}
export interface ProjSnap {
  id: string;
  x: number;
  y: number;
}

/**
 * The Delve's peer-host-authority transport (ADR-0007 §3), carried on the
 * existing Realtime channel as a distinct broadcast event. The host emits
 * `start`/`snap`/`end`; peers emit `join`/`pos`/`hit`/`down`. In single-player
 * (MockBackend) nothing is on the wire — the lone player IS the host and drives
 * the run locally. `runId` scopes every message to one instance.
 *
 * ADR-0011/0015 (chained Stages, endless): `start` carries the Stage's Depth
 * NUMBER (1 = the Delve, 2 = the Deep, 3+ = the generated Depths — guests
 * rebuild the whole generated Stage from this number alone; no seed on the
 * wire). A descent is just a fresh `start` with the next number and a new
 * `runId`, accepted by at-the-door party-mates (the relaxed join-guard).
 * EVERY boss fall is `stagecleared` — pay that run's loot and open the next
 * door, never tearing the instance down (ADR-0015 retires "the Forgeborn ends
 * the descent"; only wipe, leaving, or declining the door ends a Descent).
 * `participants` on `end` is the participation-loot set — the roster the Depth
 * Record credits.
 */
export type DungeonMsg =
  | { t: 'start'; runId: string; host: string; heads: number; roster: string[]; stage?: number }
  | { t: 'snap'; runId: string; mobs: MobSnap[]; projectiles: ProjSnap[] }
  | { t: 'end'; runId: string; reason: 'victory' | 'wipe' | 'hostleft' | 'stagecleared'; loot?: Inventory; participants?: string[] }
  | { t: 'join'; runId: string; name: string }
  | { t: 'pos'; runId: string; name: string; x: number; y: number }
  | { t: 'hit'; runId: string; mobId: string; by: string; tool?: ItemId }
  | { t: 'down'; runId: string; name: string; out: boolean };

/**
 * The open-world Wildlife transport (ADR-0012), carried on the same `jw-world`
 * channel as a distinct broadcast event. The elected creature host emits ONE
 * batched `sync` per tick (all live creatures, spatially culled to near online
 * Players) so bandwidth is ~one stream regardless of count — under the realtime
 * cap the position stream already respects. Non-host clients render from `sync`.
 * Guests emit `hit`/`forage` to the host on a Player action (occasional, not
 * per-tick); the host emits `felled` back so the hunter claims their own loot.
 * In single-player (MockBackend) nothing is on the wire — the lone Player is the
 * host and simulates locally (mirrors the Delve's peer-host split, ADR-0007).
 */
export type CreatureMsg =
  | { t: 'sync'; host: string; mobs: MobSnap[] }
  | { t: 'hit'; id: string; by: string; tool?: ItemId }
  | { t: 'forage'; id: string; by: string }
  | { t: 'felled'; id: string; by: string; loot: Inventory };

export interface BackendEvents {
  position: (pos: PlayerPos) => void;
  presence: (players: PlayerPos[]) => void;
  chat: (msg: ChatMsg) => void;
  nodeChanged: (node: NodeState) => void;
  structurePlaced: (s: Structure) => void;
  /** a Structure was dismantled (removed) by any Player — server-ordered (ADR-0008) */
  structureRemoved: (id: string) => void;
  /** a crate's shared contents changed (deposit/withdraw by any Player) */
  crateChanged: (crateId: string, contents: Inventory) => void;
  quest: (q: QuestState) => void;
  gateOpened: () => void;
  sealChanged: (seal: SealState) => void;
  /** the one-time, forever moment — arena opens for everyone */
  sealBroken: () => void;
  /** the Village record changed — founded, contributed to, advanced a tier, or the Hall moved/removed (ADR-0010) */
  villageChanged: (village: VillageState) => void;
  /** a Warden altar's pooled Offering moved (or broke) — ADR-0017 */
  wardenAltarChanged: (wardenId: string, altar: WardenAltarState) => void;
  /** a Realm gate opened — one-time, forever (ADR-0017; the delveOpened shape) */
  realmOpened: (wardenId: string) => void;
  guardianSummoned: (fight: FightState) => void;
  /** the first strike landed: the clock re-anchors to `engagedAt`, roster + HP lock, the Ward rises */
  guardianEngaged: (fight: FightState) => void;
  guardianHit: (hp: number, by: string) => void;
  guardianVictory: (participants: string[]) => void;
  /** the slumber timer ran out — HP reset, no loot */
  guardianSlumber: () => void;
  /** the rubble cleared — the Delve mine shaft opens for everyone, forever */
  delveOpened: () => void;
  /** a peer-host-authority Delve message arrived from another client (ADR-0007) */
  dungeon: (msg: DungeonMsg) => void;
  /** an open-world Wildlife message arrived from another client (ADR-0012) */
  creatures: (msg: CreatureMsg) => void;
}

/**
 * Everything the game needs from a server. ADR-0001 maps this 1:1 onto
 * Supabase: `join`/RPC-shaped mutations become Postgres functions,
 * `sendPosition`/`sendChat`/events become Realtime broadcast + presence.
 * Game code must only ever talk to this interface so a SupabaseBackend
 * can be swapped in without touching scenes or UI.
 */
export interface Backend {
  /** Load world data + start internal machinery. Call once before join. */
  init(): Promise<void>;
  /**
   * Join a World (ADR-0014). `world` is the world-id slug the Player typed on the
   * join screen — an unknown slug creates that World, a known one joins it; blank
   * resolves to the `default` World. The sent Appearance becomes the Player's
   * look, editable at every join.
   */
  join(name: string, pin: string, appearance: Appearance, world: string): Promise<JoinResult>;
  loadWorld(): Promise<WorldSnapshot>;
  /**
   * fire-and-forget, like a Realtime broadcast; `held` is the in-hand Loadout
   * item, `swings` the session swing counter riding along (see PlayerPos.swings)
   */
  sendPosition(x: number, y: number, dir: Dir, moving: boolean, held?: ItemId, swings?: number): void;
  sendChat(text: string): Promise<void>;
  /** `withTool` is the in-hand Tool the client struck with; the server honours it only if owned */
  hitNode(nodeId: string, withTool?: ToolId): Promise<HitResult>;
  craft(recipeId: string): Promise<CraftResult>;
  /** `text` is the signpost line (length-capped server-side) */
  placeStructure(item: StructureId, tx: number, ty: number, text?: string): Promise<PlaceResult>;
  /**
   * Dismantle (remove) any Structure for the caller's full refund — no
   * ownership, server-ordered (ADR-0008). Emits `structureRemoved` to all.
   */
  dismantleStructure(id: string): Promise<DismantleResult>;
  /** shared crate storage — mutations are server-ordered like all World mutations */
  crateOpen(crateId: string): Promise<CrateResult>;
  crateDeposit(crateId: string, item: ItemId, count: number): Promise<CrateResult>;
  crateWithdraw(crateId: string, item: ItemId, count: number): Promise<CrateResult>;
  /** the Sawmill refinery — lazy-timestamp milling, no tick loop (ADR-0001) */
  sawmillOpen(sawmillId: string): Promise<SawmillResult>;
  /** deposit carried wood (up to the mill's cap) */
  sawmillDeposit(sawmillId: string): Promise<SawmillResult>;
  /** collect finished planks; collecting early yields only what is done */
  sawmillCollect(sawmillId: string): Promise<SawmillResult>;
  /** the generic Refiner kernel (ADR-0017 §6) — any input→output, lazy timestamps */
  refinerOpen(refinerId: string, config: RefinerConfig): Promise<RefinerResult>;
  /** deposit the carried input Resource (clamped to the Refiner's cap) */
  refinerDeposit(refinerId: string, config: RefinerConfig): Promise<RefinerResult>;
  /** collect finished output; collecting early yields only what is done */
  refinerCollect(refinerId: string, config: RefinerConfig): Promise<RefinerResult>;
  /** mark a lore tablet as read */
  readTablet(id: string): Promise<QuestState>;
  /** offer 2 fruit + 2 fiber at the grove altar to open the vine gate */
  offerAltar(): Promise<OfferResult>;
  /** dig at the revealed treasure spot (needs 3 map pieces, must stand there) */
  dig(): Promise<DigResult>;
  /**
   * give every carried wood/stone/fiber/fruit into the Seal's communal pool
   * at the monument — clamped so an overshooting quota takes only what it needs
   */
  contributeSeal(): Promise<ContributeSealResult>;
  /**
   * give carried qualifying Resource/loot into the Village's communal pool at the
   * Hall (ADR-0010) — additive, permanent, server-ordered. Crossing a tier
   * threshold with its milestone built advances the whole Village. `amounts`
   * caps how much of each item to give (the per-resource slider choice); each is
   * clamped to what is held. Omit it to pour in everything qualifying.
   */
  contributeVillage(amounts?: Inventory): Promise<ContributeVillageResult>;
  /** market_square resource exchange (ADR-0013): swap a surplus raw for another at a tier-scaled tax */
  tradeMarket(giveItem: ItemId, giveCount: number, getItem: ItemId): Promise<TradeResult>;
  /** fountain Wishing Well (ADR-0013): toss fruit toward the shared meter; fills → a Dorffest starts */
  wishFountain(count: number): Promise<WishResult>;
  /** the Banner names the Village + picks a crest hue (ADR-0013) */
  setVillageName(name: string, crest: number): Promise<{ village: VillageState }>;
  /** the Well's chronicle: append a short player-written line (ADR-0013) */
  addVillageNote(text: string): Promise<{ village: VillageState }>;
  /** consume a Summoning Totem at the arena altar and wake the Guardian */
  summonGuardian(): Promise<SummonResult>;
  /**
   * consume the Warden's Totem at its altar and wake it (ADR-0017 §1/§5):
   * refused while ANY fight runs (the one-fight mutex) or while its altar's
   * Offering is incomplete. The fight rides the same guardian* events with
   * `fight.warden` naming the kit.
   */
  summonWarden(wardenId: string): Promise<SummonResult>;
  /**
   * lay every carried demanded good at a Warden's altar (the Seal-Offering
   * pattern re-instanced per rung, ADR-0017): communal, clamped, breaks once
   */
  contributeWardenAltar(wardenId: string): Promise<ContributeWardenResult>;
  /**
   * turn the carried gate key at a Realm's arch — flips the one-time
   * `gateOpen` world flag for everyone, forever (the Delve-shaft pattern).
   * The client has already checked the key is carried.
   */
  openRealmGate(wardenId: string): Promise<OpenRealmResult>;
  /**
   * the Echoes (ADR-0017 rung 2): record a shade of your movement — a captured
   * path that loops forever, PERSISTED and SHARED so absent friends' shades can be
   * layered on a vault's pedestals (async co-op). Spends one Chime Charm (§7 sink).
   * The server quantises the start to `serverNow mod periodMs` so loop phases align;
   * the client passes the period. Returns the stored shade + the charged inventory,
   * or null if rejected (no charm, too short).
   */
  recordEcho(ghostId: string, samples: EchoSample[], periodMs: number): Promise<{ ghost: Ghost; inventory: Inventory } | null>;
  /** list every shade in this World (an RPC read — never presence, the rate-limit gotcha) */
  listEchoes(): Promise<Ghost[]>;
  /** clear one of your own shades (no orphaned recordings; frees a pedestal) */
  forgetEcho(ghostId: string): Promise<void>;
  /**
   * leave a PERMANENT, named greeting shade (ADR-0017 rung 2 — the mastery mark):
   * one per Player ("<who>@greet"), never cycled out, that everyone finds walking
   * the Hushdark. The client gates it behind opening the deep vault.
   */
  leaveGreeting(samples: EchoSample[], periodMs: number): Promise<Ghost | null>;
  /**
   * summon the Reverberant (ADR-0017 rung 2) by SOLVING the pedestal puzzle — no
   * altar, no totem; the one-fight mutex still applies. The fight rides the same
   * world.fight slot + guardian* events, kit-keyed on warden 'reverb'.
   */
  summonReverberant(): Promise<SummonResult>;
  /**
   * claim the Reverberant's participation reward on its defeat (server-guarded,
   * idempotent): the epic Reverberant Helm + Echo Reliquary on the Player's
   * FIRST-ever clear, and an Echo Sigil + resources once per `week` thereafter.
   */
  claimReverb(week: number): Promise<{ ok: boolean; inventory?: Inventory; firstEver?: boolean; weekly?: boolean }>;
  /**
   * clear the rubble sealing the Delve mine shaft — a one-time, server-ordered
   * world flag (like the vine gate). The client has already checked an Ancient
   * Pickaxe is in hand; the server flips `delveOpen` and emits `delveOpened`.
   */
  openDelve(): Promise<OpenDelveResult>;
  /**
   * grant this Player their Delve participation loot at run completion — the run's
   * ONLY DB write (ADR-0007 §8). Mob HP never persists; only this does. Merged
   * into the caller's own inventory (each client claims for itself).
   * ADR-0015 widens the same write: when `record` rides along, the backend also
   * upserts the Descent's Depth Record (board entry + the caller's personal
   * best) in that one call — no second bookkeeping.
   */
  claimDelveLoot(loot: Inventory, record?: DepthRecordWrite): Promise<{ inventory: Inventory }>;
  /**
   * read this World's Depth Records (ADR-0015): the deepest-Descents board and
   * per-Player bests, deepest-first (ties by earliest achievedAt), top slice.
   */
  getDepthRecords(): Promise<DepthRecords>;
  /**
   * fire-and-forget a peer-host-authority Delve message over the Realtime channel
   * (ADR-0007 §3). No-op in single-player (MockBackend) — the lone host is local.
   */
  sendDungeon(msg: DungeonMsg): void;
  /**
   * the real online Player roster (self + peers, EXCLUDING sim bots) — the
   * deterministic creature-host election set (ADR-0012). The lowest-sorting name
   * is the elected host; every client computes the same. MockBackend returns just
   * the lone Player (trivially the host); SupabaseBackend returns its presence view.
   */
  creatureRoster(): string[];
  /**
   * fire-and-forget an open-world Wildlife message over the Realtime channel
   * (ADR-0012). No-op in single-player (MockBackend) — the lone host is local.
   */
  sendCreatures(msg: CreatureMsg): void;
  /**
   * land one hit on the Guardian (server-ordered, participation recorded); the
   * backend rolls the damage + crit from `withTool`'s weapon band with an
   * injected rng and returns `{ damage, crit }`. `withTool` is the in-hand Tool,
   * honoured only if actually owned (else it rolls the bare-hands band).
   */
  hitGuardian(withTool?: ToolId): Promise<GuardianHitResult>;
  /**
   * report being caught by a danger zone at world tile (tx, ty); the server
   * re-derives the schedule from engagedAt and validates against SERVER time
   * (ADR-0002 amended) — the 3rd knockdown ends this fight for the Player
   * (hard Exhaustion), and the Ward bars re-entry
   */
  reportKnockdown(tx: number, ty: number): Promise<KnockdownResult>;
  /**
   * wear/unwear Armor (ADR-0017 §4): persists as `players.equipped` and rides
   * the position/presence payload from then on. The backend re-validates
   * ownership; the returned record is the truth the client adopts.
   */
  equip(equipped: EquippedArmor): Promise<EquipResult>;
  /** turn one carried fish into a cooked fish (client checks campfire proximity) */
  cook(): Promise<CookResult>;
  /** consume one cooked fish; the speed buff itself is client-side (ADR-0001) */
  eatCookedFish(): Promise<EatResult>;
  /**
   * consume one cooked MEAT for the SAME move buff (ADR-0012 — a new ingredient,
   * NOT a new buff). Reuses the generic craft path server-side (no new RPC).
   */
  eatCookedMeat(): Promise<EatResult>;
  /**
   * consume one Grasweave Ration for the SAME move buff (ADR-0017 rung 3 — the
   * repeatable wildgrain/verdant-fibre sink, NOT a new buff). Reuses the generic
   * craft path server-side (no new RPC), exactly like eatCookedMeat.
   */
  eatGrasweaveRation(): Promise<EatResult>;
  /** remember that this Player has seen the intro story */
  markIntroSeen(): Promise<void>;
  /** tick one Journey objective for this Player (idempotent) */
  completeJourneyStep(step: JourneyStepId): Promise<JourneyState>;
  /** fog-of-war: persist newly explored chunk indices for this Player (idempotent) */
  markExplored(chunks: number[]): Promise<void>;
  /** count one successful use of a contextual key hint (hints retire after a few) */
  bumpHint(hintId: string): Promise<JourneyState>;
  on<K extends keyof BackendEvents>(event: K, cb: BackendEvents[K]): void;
  off<K extends keyof BackendEvents>(event: K, cb: BackendEvents[K]): void;
}
