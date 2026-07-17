# TEMPLATE — a gameplay system

Copied from the two smallest shipped systems: the body/shape from
`src/systems/FishingSystem.ts` (private state, an `update()` step, EAction
provider, backend call via `ctx.setInventory`) and the create/destroy
listener pattern from `src/systems/SealSystem.ts`. Replace names; keep the
structure.

## The shape (FishingSystem.ts, shipped)

```ts
/**
 * FishingSystem (ADR-0018 #10): the client-side bite-and-reel rhythm on a
 * Fishing Spot (the node hit itself stays a server-ordered hitNode), plus the
 * campfire cook interaction. update() is the §8 step-11 bite/timeout check.
 */
import type Phaser from 'phaser';
import { ITEMS, type ItemId } from '../content/items';
import type { GameScene } from '../scenes/GameScene';
import { t } from '../i18n';
import type { GameContext } from './context';
import { floatText } from './sceneFx';
import type { EAction, GameSystem, NodeView } from './types';

interface FishingCast {
  nodeId: string;
  x: number;
  y: number;
  biteAt: number;
  /** the bite window closes at this time — reel in between biteAt and this */
  until: number;
  bit: boolean;
  marker: Phaser.GameObjects.Text | null;
}

export class FishingSystem implements GameSystem {
  private fishing: FishingCast | null = null;

  constructor(
    private ctx: GameContext,
    private host: GameScene,
  ) {}

  /** a cast is out — movement cancels it, E reels it in, X-dismantle is gated off */
  get active(): boolean {
    return this.fishing !== null;
  }

  create(): void {}

  /** §8 step 11: the bite arrives, the window opens, then it gets away */
  update(_time?: number, _dt?: number): void {
    if (!this.fishing) return;
    const f = this.fishing;
    const now = Date.now();
    if (!f.bit && now >= f.biteAt) {
      f.bit = true;
      f.until = now + 900;
      f.marker = this.ctx.scene.add
        .text(f.x, f.y - 14, '!', { fontSize: '12px', color: '#ffd166', stroke: '#000', strokeThickness: 3 })
        .setOrigin(0.5)
        .setResolution(4)
        .setDepth(999_999);
      this.ctx.sfx('blip', 0.6);
    } else if (f.bit && now > f.until) {
      this.cancelFishing('It got away...');
    }
  }

  destroy(): void {}

  /** E pressed while a cast is out */
  reelIn(): void {
    const f = this.fishing!;
    if (!f.bit) {
      this.cancelFishing(t.toast.reelTooSoon);
      return;
    }
    const nodeId = f.nodeId;
    const { x, y } = f;
    this.cancelFishing();
    this.ctx.sfx('splash', 0.6);
    void this.ctx.backend.hitNode(nodeId, this.host.heldTool()).then((result) => {
      if (!result.ok) {
        if (result.reason === 'DEPLETED') this.ctx.bus.emit('toast', t.toast.fishTooLate, 'bad');
        return;
      }
      if (result.finishing && result.gained) {
        const text = Object.entries(result.gained)
          .map(([item, n]) => `+${n} ${ITEMS[item as ItemId]?.name ?? item}`)
          .join('  ');
        floatText(this.ctx.scene, x, y - 10, text, '#8ce9ff');
      }
      if (result.inventory) {
        this.ctx.setInventory(result.inventory);   // ← the ONE mutate+emit path
      }
    });
  }

  /** an interaction verb: return null when not applicable — InputSystem slots
   *  this into the ONE ordered resolveEAction priority chain */
  cookAction(): EAction | null {
    const inv = this.ctx.inventory;                 // ← read-only view
    const hasFish = (inv.fish ?? 0) > 0;
    if (!hasFish) return null;
    const campfire = this.host.nearbyStructure(['campfire']);
    if (!campfire) return null;
    return {
      swing: false,
      run: () => {
        void this.ctx.backend.cook().then((res) => {
          if (!res.ok) return;
          this.ctx.setInventory(res.inventory);
          this.ctx.bus.emit('toast', t.toast.cookFish, 'good');
          this.ctx.sfx('craft', 0.5);
        });
      },
    };
  }
}
```

## Listeners: the create/destroy pair (SealSystem.ts, shipped)

Handlers are **arrow-function fields** so `off()` gets the same reference
`on()` got. Backend and bus listeners both follow this pattern.

```ts
export class SealSystem implements GameSystem {
  seal: SealState | null = null;
  private onSealChanged = (s: SealState): void => this.applySeal(s);
  private onSealBroken = (): void => this.epicSealBreak();

  constructor(
    private ctx: GameContext,
    private host: GameScene,
  ) {}

  /** build the monument landmark (E to contribute Offerings) + wire backend events */
  create(): void {
    // ...build sprites/blockers with the sceneFx helpers...
    this.ctx.backend.on('sealChanged', this.onSealChanged);
    this.ctx.backend.on('sealBroken', this.onSealBroken);
  }

  update(_time?: number, _dt?: number): void {}

  destroy(): void {
    this.ctx.backend.off('sealChanged', this.onSealChanged);
    this.ctx.backend.off('sealBroken', this.onSealBroken);
  }
}
```

Bus listeners use the identical pair on `ctx.bus` (DelveSystem, shipped):

```ts
  private onLootTake = (item: ItemId, count: number): void => this.claimLoot({ [item]: count });
  private onLootTakeAll = (): void => this.claimLoot({ ...this.lootPending });

  create(): void {
    this.ctx.bus.on('loot-take', this.onLootTake);
    this.ctx.bus.on('loot-take-all', this.onLootTakeAll);
  }
  destroy(): void {
    this.ctx.bus.off('loot-take', this.onLootTake);
    this.ctx.bus.off('loot-take-all', this.onLootTakeAll);
  }
```

## Rules embedded in this shape

- Constructor takes `(ctx: GameContext, host: GameScene)` — nothing else.
- Cross-system reads go through **declared wired refs**
  (`fishing!: FishingSystem` style) or `host` accessors — never
  `(this.ctx.scene as GameScene).someSystem`.
- `ctx.inventory` is read-only; **all** mutation via `ctx.setInventory(inv)`.
- `update()` is called by GameScene at a NUMBERED §8 position — see
  TEMPLATE-wiring.md; an idle system still implements the method (empty).
- Every `on()` in create() has its `off()` twin in destroy().
