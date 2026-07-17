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

  startFishing(view: NodeView): void {
    const now = Date.now();
    this.fishing = {
      nodeId: view.state.id,
      x: view.sprite.x,
      y: view.sprite.y,
      biteAt: now + 1000 + Math.random() * 3000, // 1–4 s — client-side flavor only
      until: 0,
      bit: false,
      marker: null,
    };
    this.ctx.bus.emit('toast', t.toast.castLine, 'info');
  }

  cancelFishing(reason?: string): void {
    if (!this.fishing) return;
    this.fishing.marker?.destroy();
    this.fishing = null;
    if (reason) this.ctx.bus.emit('toast', reason, 'bad');
  }

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
        this.ctx.setInventory(result.inventory);
      }
    });
  }

  cookAction(): EAction | null {
    const inv = this.ctx.inventory;
    const hasFish = (inv.fish ?? 0) > 0;
    // ADR-0012: the cooked-meat campfire recipe (2 meat) — a new INGREDIENT feeding
    // the EXISTING move-speed buff (cooked_meat eats identically to a cooked fish).
    const hasMeat = (inv.meat ?? 0) >= 2;
    if (!hasFish && !hasMeat) return null;
    const campfire = this.host.nearbyStructure(['campfire']);
    if (!campfire) return null;
    return {
      swing: false,
      run: () => {
        if (hasFish) {
          void this.ctx.backend.cook().then((res) => {
            if (!res.ok) return;
            this.ctx.setInventory(res.inventory);
            this.ctx.bus.emit('toast', t.toast.cookFish, 'good');
            this.ctx.sfx('craft', 0.5);
          });
        } else {
          // roast meat via the generic craft path (jw_craft — no new RPC)
          void this.ctx.backend.craft('cooked_meat').then((res) => {
            if (!res.ok) return;
            this.ctx.setInventory(res.inventory);
            this.ctx.bus.emit('toast', t.toast.cookMeat, 'good');
            this.ctx.sfx('craft', 0.5);
          });
        }
      },
    };
  }
}
