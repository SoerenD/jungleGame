import type { ItemId, StructureId, ToolId } from '../content/items';
import type { NodeTypeId } from '../content/nodeTypes';

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
}

export interface WorldSnapshot {
  nodes: NodeState[];
  structures: Structure[];
  chatLog: ChatMsg[];
  players: PlayerPos[];
  quest: QuestState;
  seal: SealState;
  fight: FightState | null;
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

export type ContributeSealResult =
  | { ok: false; reason: 'ALREADY_BROKEN' | 'NOTHING_TO_GIVE' }
  | { ok: true; taken: Inventory; inventory: Inventory; seal: SealState };

export type SummonResult =
  | { ok: false; reason: 'SEAL_INTACT' | 'FIGHT_IN_PROGRESS' | 'NO_TOTEM' }
  | { ok: true; fight: FightState; inventory: Inventory };

export type GuardianHitResult =
  | { ok: false; reason: 'NO_FIGHT' }
  | {
      ok: true;
      hp: number;
      victory: boolean;
      inventory: Inventory;
      /** true when the eye was closed at server time — 0 damage, no participation */
      deflected: boolean;
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

export type CookResult =
  | { ok: false; reason: 'NO_FISH' }
  | { ok: true; inventory: Inventory };

export type EatResult =
  | { ok: false; reason: 'NOTHING_TO_EAT' }
  | { ok: true; inventory: Inventory; buffMs: number };

export interface BackendEvents {
  position: (pos: PlayerPos) => void;
  presence: (players: PlayerPos[]) => void;
  chat: (msg: ChatMsg) => void;
  nodeChanged: (node: NodeState) => void;
  structurePlaced: (s: Structure) => void;
  /** a crate's shared contents changed (deposit/withdraw by any Player) */
  crateChanged: (crateId: string, contents: Inventory) => void;
  quest: (q: QuestState) => void;
  gateOpened: () => void;
  sealChanged: (seal: SealState) => void;
  /** the one-time, forever moment — arena opens for everyone */
  sealBroken: () => void;
  guardianSummoned: (fight: FightState) => void;
  /** the first strike landed: the clock re-anchors to `engagedAt`, roster + HP lock, the Ward rises */
  guardianEngaged: (fight: FightState) => void;
  guardianHit: (hp: number, by: string) => void;
  guardianVictory: (participants: string[]) => void;
  /** the slumber timer ran out — HP reset, no loot */
  guardianSlumber: () => void;
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
  /** the sent Appearance becomes the Player's look — editable at every join */
  join(name: string, pin: string, appearance: Appearance): Promise<JoinResult>;
  loadWorld(): Promise<WorldSnapshot>;
  /** fire-and-forget, like a Realtime broadcast; `held` is the in-hand Loadout item */
  sendPosition(x: number, y: number, dir: Dir, moving: boolean, held?: ItemId): void;
  sendChat(text: string): Promise<void>;
  /** `withTool` is the in-hand Tool the client struck with; the server honours it only if owned */
  hitNode(nodeId: string, withTool?: ToolId): Promise<HitResult>;
  craft(recipeId: string): Promise<CraftResult>;
  /** `text` is the signpost line (length-capped server-side) */
  placeStructure(item: StructureId, tx: number, ty: number, text?: string): Promise<PlaceResult>;
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
  /** consume a Summoning Totem at the arena altar and wake the Guardian */
  summonGuardian(): Promise<SummonResult>;
  /**
   * land one hit on the Guardian (server-ordered, participation recorded);
   * `withTool` is the in-hand Tool (axe/pickaxe → 3, bow → 2), honoured only if owned
   */
  hitGuardian(withTool?: ToolId): Promise<GuardianHitResult>;
  /**
   * report being caught by a danger zone at world tile (tx, ty); the server
   * re-derives the schedule from engagedAt and validates against SERVER time
   * (ADR-0002 amended) — the 3rd knockdown ends this fight for the Player
   * (hard Exhaustion), and the Ward bars re-entry
   */
  reportKnockdown(tx: number, ty: number): Promise<KnockdownResult>;
  /** turn one carried fish into a cooked fish (client checks campfire proximity) */
  cook(): Promise<CookResult>;
  /** consume one cooked fish; the speed buff itself is client-side (ADR-0001) */
  eatCookedFish(): Promise<EatResult>;
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
