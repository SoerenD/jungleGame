import type { ItemId, StructureId } from '../content/items';
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

/** the four Resources the Seal demands, with fixed per-resource quotas */
export type SealResourceId = 'wood' | 'stone' | 'fiber' | 'fruit';

export interface SealState {
  /** breaks once, forever (world flag, like gateOpen) */
  broken: boolean;
  /** collective totals — no individual contribution tracking, ever */
  contributed: Record<SealResourceId, number>;
  quotas: Record<SealResourceId, number>;
}

/**
 * A live Guardian fight. Everything clients render (danger zones, timer)
 * derives from `summonedAt` (ADR-0002); null means the Guardian slumbers.
 */
export interface FightState {
  /** server timestamp of the summon */
  summonedAt: number;
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
  | { ok: true; hp: number; victory: boolean; inventory: Inventory };

export type KnockdownResult =
  | { ok: false; reason: 'NO_FIGHT' | 'NOT_IN_DANGER' }
  | { ok: true; knockdowns: number; exhausted: boolean; spawn: { tx: number; ty: number } };

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
  quest: (q: QuestState) => void;
  gateOpened: () => void;
  sealChanged: (seal: SealState) => void;
  /** the one-time, forever moment — arena opens for everyone */
  sealBroken: () => void;
  guardianSummoned: (fight: FightState) => void;
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
  /** fire-and-forget, like a Realtime broadcast */
  sendPosition(x: number, y: number, dir: Dir, moving: boolean): void;
  sendChat(text: string): Promise<void>;
  hitNode(nodeId: string): Promise<HitResult>;
  craft(recipeId: string): Promise<CraftResult>;
  placeStructure(item: StructureId, tx: number, ty: number): Promise<PlaceResult>;
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
  /** land one hit on the Guardian (server-ordered, participation recorded) */
  hitGuardian(): Promise<GuardianHitResult>;
  /**
   * report being caught by a danger zone at world tile (tx, ty); the server
   * re-derives the schedule from summonedAt and validates against SERVER time
   * (ADR-0002) — the 3rd knockdown in one fight is Exhaustion
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
  /** count one successful use of a contextual key hint (hints retire after a few) */
  bumpHint(hintId: string): Promise<JourneyState>;
  on<K extends keyof BackendEvents>(event: K, cb: BackendEvents[K]): void;
  off<K extends keyof BackendEvents>(event: K, cb: BackendEvents[K]): void;
}
