/**
 * StationsSystem (ADR-0018 #5): the functional-station glue — the HUD craft/
 * eat/drop requests, shared crate storage, the Sawmill (open/deposit/collect +
 * the spinning-blade/sawdust tick, §8 step 3) and the generic Refiner kernel
 * (ADR-0017 §6). Owns all its bus handlers and detaches them in destroy().
 */
import type Phaser from 'phaser';
import type { Inventory, RefinerConfig, RefinerState, SawmillState } from '../backend/types';
import { BRINE_KILN, CHIME_KILN, SAWMILL_PLANK_MS, VERDANT_LOOM } from '../config';
import { ITEMS, type ItemId } from '../content/items';
import { RECIPES } from '../content/recipes';
import type { GameScene } from '../scenes/GameScene';
import { t } from '../i18n';
import type { BuildSystem } from './BuildSystem';
import type { GameContext } from './context';
import type { FogSystem } from './FogSystem';
import type { RefinerTarget } from '../ui/bus';
import type { GameSystem } from './types';

/**
 * The three-effect "it's working" animation for one Refiner family (ADR-0017 §6).
 * Every Refiner runs the same generic kernel, so they share ONE animation shape —
 * a pulsing mouth glow, rising wisps, and popping mouth sparks — recoloured to
 * each family's signal palette (Brine teal / Chime hushsteel-blue / Loom green).
 * BuildSystem seats the additive glow from `glow`; StationsSystem.update spawns
 * the wisp/spark particles while the station is refining.
 */
export interface RefinerFxSpec {
  /** additive mouth-glow tint */
  glow: number;
  /** rising-wisp colours — steam / resonance ripple / retting mote */
  wisp: number[];
  /** mouth-spark colours — brine bubble / resonance spark / weft mote */
  spark: number[];
}

/** the RefinerConfig each Refiner Structure type runs on — the twin of
 *  REFINER_FX_SPEC (the InputSystem opens each family with the same config).
 *  BuildSystem stamps it onto every seated refinerFx entry so a load-time
 *  hydrate can re-read the persisted state without an interaction. */
export const REFINER_CFG: Record<string, RefinerConfig> = {
  brine_kiln: BRINE_KILN,
  chime_kiln: CHIME_KILN,
  verdant_loom: VERDANT_LOOM,
};

/** keyed by Refiner Structure type — one entry per family on the generic kernel */
export const REFINER_FX_SPEC: Record<string, RefinerFxSpec> = {
  // the Brine Kiln's furnace mouth glows the Mire's signal teal (icons.ts drawKiln)
  brine_kiln: { glow: 0x63e0b8, wisp: [0x8fb8ad, 0xb8ddd4, 0xc8fbe8], spark: [0x63e0b8, 0xc8fbe8] },
  // the Chime Kiln rings cold hushsteel blue instead of glowing (drawChimeKiln)
  chime_kiln: { glow: 0x93a8c9, wisp: [0x8fa0bd, 0xc2d2ea, 0xd6e4f5], spark: [0x93a8c9, 0xd6e4f5] },
  // the Verdant Loom breathes a green retting shimmer over its warp (drawLoom)
  verdant_loom: { glow: 0x7cc96f, wisp: [0x9fd08a, 0xc8f0b8, 0x7bb069], spark: [0x7cc96f, 0xc8f0b8] },
};

export class StationsSystem implements GameSystem {
  /** Sawmill blade sprites (v3): spun + puffing while the mill is working —
   *  entries are seated/removed by the structure builder */
  sawmillBlades = new Map<string, { blade: Phaser.GameObjects.Image; x: number; y: number; baseY: number; nextPuff: number }>();
  /** per-Sawmill "milling until" timestamp — derived from its last observed state */
  sawmillMillingUntil = new Map<string, number>();
  /** per-Refiner working-animation handles (ADR-0017 §6): the seated additive
   *  mouth glow + its palette + per-effect particle timers. Entries are seated/
   *  removed by the structure builder; update() drives all three effects while
   *  the station is refining. */
  refinerFx = new Map<string, { glow: Phaser.GameObjects.Image; x: number; baseY: number; spec: RefinerFxSpec; cfg: RefinerConfig; nextWisp: number; nextSpark: number }>();
  /** per-Refiner "refining until" timestamp — derived from its last observed state */
  refinerBusyUntil = new Map<string, number>();
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
      this.noteRefinerState(o.id, o.cfg, res.state);
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
      this.noteRefinerState(o.id, o.cfg, res.state);
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
    if (this.sawmillBlades.size === 0 && this.refinerFx.size === 0) return;
    const dt = delta / 1000;
    const now = Date.now();
    this.tickRefiners(time, now);
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

  /** §8 step 3 (ADR-0017 §6): a working Refiner runs its three-effect animation —
   *  the kiln/loom twin of the Sawmill's spinning blade. "Working" is the client's
   *  last-known refining window; a Refiner we've never opened sits idle. */
  private tickRefiners(time: number, now: number): void {
    if (this.refinerFx.size === 0) return;
    const scene = this.ctx.scene;
    for (const [id, fx] of this.refinerFx) {
      const working = now < (this.refinerBusyUntil.get(id) ?? 0);
      if (!working) {
        if (fx.glow.alpha !== 0) fx.glow.setAlpha(0);
        continue;
      }
      // effect 1 — the mouth glow breathes as the charge cooks ("Lively" band)
      fx.glow.setAlpha(0.34 + 0.3 * (0.5 + 0.5 * Math.sin(time / 149)));
      // effect 2 — a wisp of steam / resonance / retting drifts up off the top
      if (time >= fx.nextWisp) {
        fx.nextWisp = time + 280 + Math.random() * 140;
        const c = fx.spec.wisp[(Math.random() * fx.spec.wisp.length) | 0];
        const wx = fx.x + (Math.random() - 0.5) * 12;
        const wy = fx.baseY - 40;
        const wisp = scene.add.rectangle(wx, wy, 2, 3, c).setDepth(fx.baseY + 2).setAlpha(0.8);
        scene.tweens.add({
          targets: wisp,
          x: wx + (Math.random() - 0.5) * 12,
          y: wy - 22 - Math.random() * 10,
          alpha: 0,
          duration: 900 + Math.random() * 250,
          ease: 'sine.out',
          onComplete: () => wisp.destroy(),
        });
      }
      // effect 3 — a bubble / spark / mote pops at the glowing mouth
      if (time >= fx.nextSpark) {
        fx.nextSpark = time + 150 + Math.random() * 110;
        const c = fx.spec.spark[(Math.random() * fx.spec.spark.length) | 0];
        const sx = fx.x + (Math.random() - 0.5) * 10;
        const sy = fx.baseY - 16;
        const spark = scene.add.rectangle(sx, sy, 2, 2, c).setDepth(fx.baseY + 3).setAlpha(0.95);
        scene.tweens.add({
          targets: spark,
          y: sy - 9 - Math.random() * 6,
          alpha: 0,
          duration: 360 + Math.random() * 140,
          ease: 'quad.out',
          onComplete: () => spark.destroy(),
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

  /** record when a Refiner will finish everything it holds, from its last observed
   *  state (input still refining × msPerUnit + the current unit's remainder). The
   *  SawmillState twin, generalized to the kernel's {input, nextMs} (ADR-0017 §6).
   *  tickRefiners() runs its three-effect animation while `now` is before it. */
  noteRefinerState(id: string, cfg: RefinerConfig, state: RefinerState): void {
    if (state.input > 0 && state.nextMs != null) {
      this.refinerBusyUntil.set(id, Date.now() + state.nextMs + (state.input - 1) * cfg.msPerUnit);
    } else {
      this.refinerBusyUntil.set(id, 0);
    }
  }

  /**
   * Seed the milling/refining windows from persisted backend state on load, so a
   * station whose timer is already running animates immediately — not only after
   * the player opens/deposits/collects (the "a mill we've never opened sits idle"
   * gap). Reuses the same read + noteXState path an interaction uses, but SILENT:
   * no `*-open` bus event (that would pop the HUD panel), no setInventory, no sfx.
   * Called by GameScene once the loadWorld structures are seated.
   */
  hydrateStations(): void {
    for (const id of this.sawmillBlades.keys()) {
      void this.ctx.backend.sawmillOpen(id).then((res) => {
        if (res.ok) this.noteSawmillState(id, res.state);
      });
    }
    for (const [id, fx] of this.refinerFx) {
      const cfg = fx.cfg;
      void this.ctx.backend.refinerOpen(id, cfg).then((res) => {
        if (res.ok) this.noteRefinerState(id, cfg, res.state);
      });
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
      this.noteRefinerState(refinerId, cfg, res.state);
      this.ctx.bus.emit('refiner-open', { id: refinerId, cfg, name }, res.state);
      this.ctx.sfx('blip', 0.4);
    });
  }

}
