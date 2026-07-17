/**
 * GameContext (ADR-0018 §2): the ONE shared-state object injected into every
 * system. Hub state lives here; genuine cross-system CALLS are explicit refs
 * wired by GameScene in one visible place — no service locator, no globals.
 * Per-frame cross-system reads use refs, never bus events.
 */
import type Phaser from 'phaser';
import type { Backend, Dir, Inventory, JourneyState } from '../backend/types';
import type { ItemId } from '../content/items';
import type { TypedBus } from '../ui/bus';
import type { Mode, OkJoin, WorldData } from './types';

export interface GameContext {
  /** factory access only (`ctx.scene.add`, physics, tweens) — never game state */
  scene: Phaser.Scene;
  backend: Backend;
  /** the typed singleton (imported, but on ctx for symmetry) */
  bus: TypedBus;
  /** the loaded map JSON */
  world: WorldData;
  /** own backend player record */
  me: OkJoin;
  /** the shared player sprite — set once in GameScene.create() */
  player: Phaser.Physics.Arcade.Sprite;
  /** 'overworld' | 'delve' — only GameScene writes it (via DelveSystem's enter/leave) */
  mode: Mode;
  /** in-hand item + facing: read by many systems, written by PlayerSystem/InputSystem */
  held: { item: ItemId | null; lastDir: Dir };
  /** the live pack — read-only view; mutate ONLY through setInventory() */
  readonly inventory: Inventory;
  /** THE single inventory mutate+emit path (replaces the ~35 assign+emit pairs) */
  setInventory(inv: Inventory): void;
  /** the Journey/onboarding state (ticked via ProgressionSystem) */
  journey: JourneyState;
}
