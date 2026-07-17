/**
 * Shared system-layer types (ADR-0018): the two-mode FSM, the system contract,
 * and the world-JSON shape every system reads through `ctx.world`.
 */
import type { JoinResult } from '../backend/types';
import type { NODE_TYPES } from '../content/nodeTypes';

/**
 * The runtime FSM (ADR-0018 §3): `delve` mirrors the old `inDelve` early-return —
 * in that mode ONLY DelveSystem (and HUD glue) ticks; every overworld system is
 * skipped entirely. The Guardian fight is NOT a mode (overworld systems keep
 * ticking mid-fight) — it stays FightSystem-internal state.
 */
export type Mode = 'overworld' | 'delve';

/**
 * One gameplay concern as a plain TS class (ADR-0018 §1): constructed with
 * `(ctx, deps?)`, no Phaser subclassing — the scene is reached via ctx for
 * factory access only. GameScene calls these in its documented, ordered
 * dispatch; `destroy()` MUST detach every bus listener the system attached
 * (scene restart on world-switch would otherwise double-subscribe).
 */
export interface GameSystem {
  create(): void;
  update(time: number, dt: number): void;
  destroy(): void;
}

/** the successful join record — the Player's own backend row (`ctx.me`) */
export type OkJoin = Extract<JoinResult, { ok: true }>;

export interface WorldData {
  spawn: { tx: number; ty: number };
  /** ADR-0012: `dangerous` flags the frontier wilds where predators may spawn */
  zones: { name: string; x: number; y: number; w: number; h: number; dangerous?: boolean }[];
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
  /** faux-elevation regions (ADR-0009) — omitted on pre-frontier maps */
  elevation?: { regions: ElevationRegion[] };
  /** Realm districts (ADR-0017 §2) — omitted on pre-Realm maps */
  districts?: DistrictDef[];
  /**
   * Per-Warden arenas in the World (ADR-0017 §1), keyed by WardenDef id. Rung 0's
   * Guardian keeps the top-level arena/guardianHome/guardianAltar/sealMonument
   * fields; every further Warden's court lives here with the same anatomy.
   */
  wardenArenas?: Record<string, WardenArena>;
  /** the Hushdark's pedestal-vaults (ADR-0017 rung 2) — omitted outside that Realm */
  hushdarkVaults?: HushdarkVault[];
  /** the memorial plinth where a master leaves a permanent named greeting shade */
  hushdarkMemorial?: { tx: number; ty: number } | null;
}

/** one Hushdark vault: pedestals to cover with overlaid shades + a claim door */
export interface HushdarkVault {
  id: string;
  pedestals: { tx: number; ty: number }[];
  door: { tx: number; ty: number };
  /** the DEEP vault — sealed until the first (shallow) vault is opened that week */
  deep?: boolean;
}

/** one Warden's authored court in the World: the Guardian-arena anatomy, per rung */
export interface WardenArena {
  arena: { x: number; y: number; w: number; h: number };
  home: { tx: number; ty: number };
  altar: { tx: number; ty: number };
  monument: { tx: number; ty: number };
  sealGate: { tx: number; ty: number }[];
}

/**
 * A Realm district (ADR-0017 §2): presented as its own small map, implemented
 * as a far-edge rect on the one grid, sealed in void cliff and entered only
 * through its paired teleport gates. Plain persistent map space — builds,
 * nodes and fog work inside unchanged (deliberately NOT the Delve's instanced
 * overlay). `name` is the English display id, localized like a Zone name.
 */
export interface DistrictDef {
  id: string;
  name: string;
  rect: { x: number; y: number; w: number; h: number };
  /** the world-side arch and its district-side twin */
  gate: { worldTx: number; worldTy: number; districtTx: number; districtTy: number };
}

/** a faux-elevation terrace (ADR-0009): plateau + cliff faces + ramp + a fog-lifting vista */
export interface ElevationRegion {
  name: string;
  /** terrace level (1 = first plateau, 2 = a plateau stacked on it, …); defaults to 1 */
  level?: number;
  bounds: { x: number; y: number; w: number; h: number };
  plateau: [number, number][];
  faces: [number, number][];
  ramp: [number, number][];
  vista: { tx: number; ty: number };
  vistaChunkRadius: number;
}
