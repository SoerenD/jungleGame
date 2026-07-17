/**
 * SealSystem (ADR-0018 #8): the communal Seal — monument landmark, live state,
 * the vine barrier across the arena gate, the one-time epic break, and the
 * E-contribution at the monument. Owns its backend listeners (sealChanged /
 * sealBroken) and detaches them in destroy().
 */
import Phaser from 'phaser';
import type { SealState } from '../backend/types';
import { INTERACT_RANGE, TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { t } from '../i18n';
import type { GameContext } from './context';
import { addBlockerBody, addShadow, floatText, objImage } from './sceneFx';
import type { EAction, GameSystem } from './types';

export class SealSystem implements GameSystem {
  seal: SealState | null = null;
  monumentPos = { x: 0, y: 0 };
  private sealBarrierParts: { sprite: Phaser.GameObjects.Image; body: Phaser.GameObjects.Rectangle }[] = [];
  private onSealChanged = (s: SealState): void => this.applySeal(s);
  private onSealBroken = (): void => this.epicSealBreak();

  constructor(
    private ctx: GameContext,
    private host: GameScene,
  ) {}

  /** build the monument landmark (E to contribute Offerings) + wire backend events */
  create(): void {
    const scene = this.ctx.scene;
    const m = this.ctx.world.sealMonument;
    const x = (m.tx + 1) * TILE;
    const y = (m.ty + 1) * TILE;
    objImage(scene, x, y, 'seal_monument');
    addBlockerBody(scene, this.host.blockersGroup, m.tx, m.ty);
    addBlockerBody(scene, this.host.blockersGroup, m.tx + 1, m.ty);
    addShadow(scene, x, y - 1, 28);
    this.monumentPos = { x, y };
    this.ctx.backend.on('sealChanged', this.onSealChanged);
    this.ctx.backend.on('sealBroken', this.onSealBroken);
  }

  update(_time?: number, _dt?: number): void {}

  destroy(): void {
    this.ctx.backend.off('sealChanged', this.onSealChanged);
    this.ctx.backend.off('sealBroken', this.onSealBroken);
  }

  applySeal(seal: SealState): void {
    this.seal = seal;
    this.ctx.bus.emit('seal', seal);
    // The Seal breaks once, forever — a Player joining after the break can never
    // lay an Offering (contributeSeal is toast-only then), which would deadlock
    // the Journey's last step and the tracker handover. The World's broken Seal
    // counts as this Player's Offering; tickJourney is idempotent.
    if (seal.broken) this.host.tickJourney('first_offering');
  }

  buildSealBarrier(): void {
    const scene = this.ctx.scene;
    for (const g of this.ctx.world.sealGate) {
      const x = (g.tx + 0.5) * TILE;
      const y = (g.ty + 1) * TILE;
      const sprite = scene.add.image(x, y, 'seal-barrier');
      sprite.setOrigin(0.5, 1);
      sprite.setDepth(y);
      sprite.setAlpha(0.85);
      scene.tweens.add({ targets: sprite, alpha: 0.6, duration: 900, yoyo: true, repeat: -1, ease: 'sine.inout' });
      const body = addBlockerBody(scene, this.host.blockersGroup, g.tx, g.ty);
      this.sealBarrierParts.push({ sprite, body });
    }
  }

  /** the one-time, forever moment */
  private epicSealBreak(): void {
    const scene = this.ctx.scene;
    this.ctx.sfx('seal_gong', 0.8);
    scene.cameras.main.shake(600, 0.008);
    scene.cameras.main.flash(500, 180, 140, 255);
    for (const part of this.sealBarrierParts) {
      scene.tweens.killTweensOf(part.sprite);
      scene.add
        .particles(part.sprite.x, part.sprite.y - 12, 'glow', {
          scale: { start: 0.14, end: 0 },
          tint: 0xb478ff,
          blendMode: 'ADD',
          speed: { min: 20, max: 70 },
          lifespan: 900,
          quantity: 14,
          emitting: false,
        })
        .explode(14);
      scene.tweens.add({
        targets: part.sprite,
        alpha: 0,
        y: part.sprite.y - 14,
        duration: 900,
        onComplete: () => part.sprite.destroy(),
      });
      part.body.destroy();
    }
    this.sealBarrierParts = [];
    this.ctx.bus.emit('toast', t.toast.sealBroken, 'good');
  }

  contributeSealAction(): EAction | null {
    const player = this.ctx.player;
    const d = Phaser.Math.Distance.Between(player.x, player.y - 4, this.monumentPos.x, this.monumentPos.y - 8);
    if (d > INTERACT_RANGE + 8) return null;
    if (this.seal?.broken) {
      return { swing: false, run: () => this.ctx.bus.emit('toast', t.toast.sealBrokenArenaOpen, 'info') };
    }
    return {
      swing: false,
      run: () => {
        void this.ctx.backend.contributeSeal().then((res) => {
          if (res.ok) {
            this.ctx.setInventory(res.inventory);
            const text = Object.entries(res.taken)
              .map(([item, n]) => `-${n} ${item}`)
              .join('  ');
            floatText(this.ctx.scene, this.monumentPos.x, this.monumentPos.y - 20, text, '#b478ff');
            this.ctx.bus.emit('toast', t.toast.laidOfferings, 'good');
            this.ctx.sfx('place', 0.6);
            this.host.tickJourney('first_offering');
          } else if (res.reason === 'NOTHING_TO_GIVE') {
            this.ctx.bus.emit('toast', t.toast.offerNothingNeeded, 'bad');
          }
        });
      },
    };
  }
}
