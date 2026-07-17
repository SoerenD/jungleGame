/**
 * StationsSystem (ADR-0018 #5): the functional-station glue — the HUD craft/
 * eat/drop requests, shared crate storage, the Sawmill (open/deposit/collect +
 * the spinning-blade/sawdust tick, §8 step 3) and the generic Refiner kernel
 * (ADR-0017 §6). Owns all its bus handlers and detaches them in destroy().
 */
import type Phaser from 'phaser';
import type { Inventory, RefinerConfig, SawmillState } from '../backend/types';
import { SAWMILL_PLANK_MS } from '../config';
import { ITEMS, type ItemId } from '../content/items';
import { RECIPES } from '../content/recipes';
import type { GameScene } from '../scenes/GameScene';
import { t } from '../i18n';
import type { BuildSystem } from './BuildSystem';
import type { GameContext } from './context';
import type { FogSystem } from './FogSystem';
import type { RefinerTarget } from '../ui/bus';
import type { GameSystem } from './types';

export class StationsSystem implements GameSystem {
  /** Sawmill blade sprites (v3): spun + puffing while the mill is working —
   *  entries are seated/removed by the structure builder */
  sawmillBlades = new Map<string, { blade: Phaser.GameObjects.Image; x: number; y: number; baseY: number; nextPuff: number }>();
  /** per-Sawmill "milling until" timestamp — derived from its last observed state */
  sawmillMillingUntil = new Map<string, number>();
  /** wired by GameScene (the craft handler's Forge gate reads it) */
  fog!: FogSystem;
  /** wired by GameScene (emitSawmillBuilt scans the placed structures) */
  build!: BuildSystem;
  /** canvas drag listeners for the ground-drop (discard) gesture — kept so
   *  destroy() can detach them (a world-switch restart re-wires otherwise) */
  private groundOver?: (e: DragEvent) => void;
  private groundDrop?: (e: DragEvent) => void;

  private onCraft = (recipeId: string): void => {
    // backstop the Forge gate (the HUD already hides these cards away from a
    // Forge): the heavy forged gear can only be made beside a Forge Structure
    const recipe = RECIPES.find((r) => r.id === recipeId);
    if (recipe?.requiresForge && !this.fog.nearForge) {
      this.ctx.bus.emit('toast', t.toast.forgeRequired, 'bad');
      return;
    }
    void this.ctx.backend.craft(recipeId).then((result) => {
      if (result.ok) {
        this.ctx.setInventory(result.inventory);
        this.ctx.bus.emit('toast', t.toast.crafted(ITEMS[result.crafted].name), 'good');
        this.ctx.sfx('craft', 0.5);
        if (result.crafted === 'axe' || result.crafted === 'ancient_axe') this.host.tickJourney('craft_axe');
      } else if (result.reason === 'INSUFFICIENT') {
        this.ctx.bus.emit('toast', t.toast.notEnoughResources, 'bad');
      } else if (result.reason === 'TOOL_REQUIRED') {
        this.ctx.bus.emit('toast', t.toast.missingTool, 'bad');
      }
    });
  };

  private onEat = (id?: ItemId): void => {
    // cooked meat, cooked fish and the Grasweave Ration grant the SAME move buff
    // (ADR-0012 — a new ingredient, NOT a new buff; ADR-0017 rung 3 wildgrain sink)
    const eat =
      id === 'cooked_meat'
        ? this.ctx.backend.eatCookedMeat()
        : id === 'grasweave_ration'
          ? this.ctx.backend.eatGrasweaveRation()
          : this.ctx.backend.eatCookedFish();
    void eat.then((res) => {
      if (!res.ok) return;
      this.ctx.setInventory(res.inventory);
      this.host.buffUntil = Date.now() + res.buffMs;
      this.ctx.bus.emit('buff', this.host.buffUntil);
      this.ctx.bus.emit('toast', t.toast.warmHearty, 'good');
      this.ctx.sfx('munch', 0.6);
    });
  };

  private onDropItem = (id: ItemId, count: number): void => {
    void this.ctx.backend.dropItem(id, count).then((res) => {
      if (!res.ok) return;
      this.ctx.setInventory(res.inventory);
      this.ctx.bus.emit('toast', t.toast.dropped(ITEMS[id].name, count), 'info');
    });
  };

  private onCrateDeposit = (crateId: string, item: ItemId, count: number): void => {
    void this.ctx.backend.crateDeposit(crateId, item, count).then((res) => {
      if (!res.ok) return;
      this.ctx.setInventory(res.inventory);
      this.ctx.bus.emit('crate-open', crateId, res.contents);
    });
  };

  private onCrateWithdraw = (crateId: string, item: ItemId, count: number): void => {
    void this.ctx.backend.crateWithdraw(crateId, item, count).then((res) => {
      if (!res.ok) {
        if (res.reason === 'NOTHING') this.ctx.bus.emit('toast', t.toast.crateGone, 'bad');
        return;
      }
      this.ctx.setInventory(res.inventory);
      this.ctx.bus.emit('crate-open', crateId, res.contents);
    });
  };

  private onSawmillDeposit = (sawmillId: string): void => {
    void this.ctx.backend.sawmillDeposit(sawmillId).then((res) => {
      if (!res.ok) {
        if (res.reason === 'NOTHING') this.ctx.bus.emit('toast', t.toast.millFullOrNoWood, 'bad');
        return;
      }
      this.ctx.setInventory(res.inventory);
      this.noteSawmillState(sawmillId, res.state);
      this.ctx.bus.emit('sawmill-open', sawmillId, res.state);
      this.ctx.sfx('place', 0.5);
    });
  };

  private onSawmillRefresh = (sawmillId: string): void => this.openSawmill(sawmillId);

  private onSawmillCollect = (sawmillId: string): void => {
    void this.ctx.backend.sawmillCollect(sawmillId).then((res) => {
      if (!res.ok) {
        if (res.reason === 'NOTHING') this.ctx.bus.emit('toast', t.toast.noPlankYet, 'bad');
        return;
      }
      this.ctx.setInventory(res.inventory);
      this.noteSawmillState(sawmillId, res.state);
      this.ctx.bus.emit('sawmill-open', sawmillId, res.state);
      this.ctx.bus.emit('toast', t.toast.collectPlanks, 'good');
      this.ctx.sfx('harvest', 0.6);
    });
  };

  // the generic Refiner panel (ADR-0017 §6): ONE wiring for every Refiner
  // family — the HUD echoes back the {id, cfg, name} target it was opened with
  private onRefinerDeposit = (o: RefinerTarget): void => {
    void this.ctx.backend.refinerDeposit(o.id, o.cfg).then((res) => {
      if (!res.ok) {
        if (res.reason === 'NOTHING') this.ctx.bus.emit('toast', t.toast.refinerFullOrEmpty(ITEMS[o.cfg.inputItem].name), 'bad');
        return;
      }
      this.ctx.setInventory(res.inventory);
      this.ctx.bus.emit('refiner-open', o, res.state);
      this.ctx.sfx('place', 0.5);
    });
  };

  private onRefinerRefresh = (o: RefinerTarget): void => this.openRefiner(o.id, o.cfg, o.name);

  private onRefinerCollect = (o: RefinerTarget): void => {
    void this.ctx.backend.refinerCollect(o.id, o.cfg).then((res) => {
      if (!res.ok) {
        if (res.reason === 'NOTHING') this.ctx.bus.emit('toast', t.toast.refinerNotReady, 'bad');
        return;
      }
      this.ctx.setInventory(res.inventory);
      this.ctx.bus.emit('refiner-open', o, res.state);
      this.ctx.bus.emit('toast', t.toast.refinerCollected(ITEMS[o.cfg.outputItem].name), 'good');
      this.ctx.sfx('harvest', 0.6);
    });
  };

  constructor(
    private ctx: GameContext,
    private host: GameScene,
  ) {}

  create(): void {
    const bus = this.ctx.bus;
    bus.on('craft', this.onCraft);
    bus.on('eat', this.onEat);
    bus.on('drop-item', this.onDropItem);
    bus.on('crate-deposit', this.onCrateDeposit);
    bus.on('crate-withdraw', this.onCrateWithdraw);
    bus.on('sawmill-deposit', this.onSawmillDeposit);
    bus.on('sawmill-refresh', this.onSawmillRefresh);
    bus.on('sawmill-collect', this.onSawmillCollect);
    bus.on('refiner-deposit', this.onRefinerDeposit);
    bus.on('refiner-refresh', this.onRefinerRefresh);
    bus.on('refiner-collect', this.onRefinerCollect);
    this.wireGroundDrop();
  }

  /**
   * Drag-to-ground: dropping a pack item onto the game canvas asks the HUD to
   * open the discard modal (drop 'means' throw away — there is no ground pickup,
   * ADR-0001). Structures fall through to BuildSystem's drag-place handler on
   * the same canvas; every other kind carries `application/x-jw-item` here.
   */
  private wireGroundDrop(): void {
    const canvas = this.ctx.scene.game.canvas;
    const TYPE = 'application/x-jw-item';
    this.groundOver = (e: DragEvent): void => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes(TYPE)) e.preventDefault();
    };
    this.groundDrop = (e: DragEvent): void => {
      const id = e.dataTransfer?.getData(TYPE) as ItemId;
      if (!id || !ITEMS[id]) return;
      if (ITEMS[id].kind === 'structure') return; // a Structure places instead (BuildSystem)
      e.preventDefault();
      this.ctx.bus.emit('ground-drop-request', id);
    };
    canvas.addEventListener('dragover', this.groundOver);
    canvas.addEventListener('drop', this.groundDrop);
  }

  /** §8 step 3 (v3 #3): a working Sawmill spins its blade and coughs sawdust. "Working"
   *  is the client's last-known milling window; a mill we've never opened sits idle. */
  update(time: number, delta: number): void {
    if (this.sawmillBlades.size === 0) return;
    const dt = delta / 1000;
    const now = Date.now();
    for (const [id, v] of this.sawmillBlades) {
      const working = now < (this.sawmillMillingUntil.get(id) ?? 0);
      if (!working) {
        if (v.blade.visible) v.blade.setVisible(false);
        continue;
      }
      if (!v.blade.visible) v.blade.setVisible(true);
      v.blade.rotation += dt * 9; // a brisk spin reads as cutting
      // a small sawdust puff drifts off the blade every ~0.35 s
      if (time >= v.nextPuff) {
        v.nextPuff = time + 320 + Math.random() * 120;
        const puff = this.ctx.scene.add
          .rectangle(v.x + (Math.random() - 0.5) * 8, v.y + 4, 2, 2, 0xd9b98a)
          .setDepth(v.baseY + 2);
        this.ctx.scene.tweens.add({
          targets: puff,
          x: puff.x + (Math.random() - 0.5) * 10,
          y: puff.y + 8 + Math.random() * 6,
          alpha: 0,
          duration: 620,
          ease: 'quad.out',
          onComplete: () => puff.destroy(),
        });
      }
    }
  }

  destroy(): void {
    const bus = this.ctx.bus;
    bus.off('craft', this.onCraft);
    bus.off('eat', this.onEat);
    bus.off('drop-item', this.onDropItem);
    bus.off('crate-deposit', this.onCrateDeposit);
    bus.off('crate-withdraw', this.onCrateWithdraw);
    bus.off('sawmill-deposit', this.onSawmillDeposit);
    bus.off('sawmill-refresh', this.onSawmillRefresh);
    bus.off('sawmill-collect', this.onSawmillCollect);
    bus.off('refiner-deposit', this.onRefinerDeposit);
    bus.off('refiner-refresh', this.onRefinerRefresh);
    bus.off('refiner-collect', this.onRefinerCollect);
    const canvas = this.ctx.scene.game.canvas;
    if (this.groundOver) canvas.removeEventListener('dragover', this.groundOver);
    if (this.groundDrop) canvas.removeEventListener('drop', this.groundDrop);
  }

  openCrate(crateId: string): void {
    void this.ctx.backend.crateOpen(crateId).then((res) => {
      if (!res.ok) return;
      this.ctx.setInventory(res.inventory);
      this.ctx.bus.emit('crate-open', crateId, res.contents);
      this.ctx.sfx('blip', 0.4);
    });
  }

  openSawmill(sawmillId: string): void {
    void this.ctx.backend.sawmillOpen(sawmillId).then((res) => {
      if (!res.ok) return;
      this.ctx.setInventory(res.inventory);
      this.noteSawmillState(sawmillId, res.state);
      this.ctx.bus.emit('sawmill-open', sawmillId, res.state);
      this.ctx.sfx('blip', 0.4);
    });
  }

  /** record when a Sawmill will finish milling everything it holds, from its last
   *  observed state (wood still milling × plank time + the current plank's remainder).
   *  update() spins the blade + puffs sawdust while `now` is before it. */
  noteSawmillState(id: string, state: SawmillState): void {
    if (state.wood > 0 && state.nextPlankMs != null) {
      this.sawmillMillingUntil.set(id, Date.now() + state.nextPlankMs + (state.wood - 1) * SAWMILL_PLANK_MS);
    } else {
      this.sawmillMillingUntil.set(id, 0);
    }
  }

  /** the Into-the-Delve "Build a Sawmill" step: does any Sawmill stand in the World? */
  emitSawmillBuilt(): void {
    let built = false;
    for (const s of this.build.structuresByTile.values()) {
      if (s.type === 'sawmill') { built = true; break; }
    }
    this.ctx.bus.emit('sawmill-built', built);
  }

  /** open the generic Refiner panel on a station, run on the passed tuning (ADR-0017 §6) */
  openRefiner(refinerId: string, cfg: RefinerConfig, name: string): void {
    void this.ctx.backend.refinerOpen(refinerId, cfg).then((res) => {
      if (!res.ok) return;
      this.ctx.setInventory(res.inventory);
      this.ctx.bus.emit('refiner-open', { id: refinerId, cfg, name }, res.state);
      this.ctx.sfx('blip', 0.4);
    });
  }

}
