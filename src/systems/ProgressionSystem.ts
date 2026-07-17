/**
 * ProgressionSystem (ADR-0018 #11): the Journey onboarding tracker + contextual
 * key hints, the lore layer (Welcome Stone intro + Ancient Tablets), and the
 * secrets chain — grove altar Offering, vine gate, map pieces and the treasure
 * dig. Owns the quest/gateOpened backend listeners.
 */
import Phaser from 'phaser';
import type { JourneyState, JourneyStepId, QuestState } from '../backend/types';
import { INTERACT_RANGE, TILE } from '../config';
import { ITEMS, type ItemId } from '../content/items';
import { hintRetired, journeyComplete, type HintId } from '../content/journey';
import { TABLETS } from '../content/lore';
import { NODE_TYPES } from '../content/nodeTypes';
import type { GameScene } from '../scenes/GameScene';
import { showIntro } from '../ui/intro';
import { t } from '../i18n';
import type { GameContext } from './context';
import type { HarvestSystem } from './HarvestSystem';
import { addBlockerBody, addShadow, floatText, objImage } from './sceneFx';
import type { EAction, GameSystem, NodeView } from './types';

export class ProgressionSystem implements GameSystem {
  // ---- v3: the Journey (onboarding tracker + contextual hints)
  journey: JourneyState = { steps: {}, hintUses: {} };
  private hintText: Phaser.GameObjects.Text | null = null;
  // ---- secrets
  quest: QuestState | null = null;
  private tabletSpots: { id: string; x: number; y: number }[] = [];
  private altarPos = { x: 0, y: 0 };
  private gateParts: { sprite: Phaser.GameObjects.Image; body: Phaser.GameObjects.Rectangle }[] = [];
  private digMarker: Phaser.GameObjects.Text | null = null;
  private welcomeStonePos = { x: 0, y: 0 };
  /** wired by GameScene (the gather hint scans the live nodes) */
  harvest!: HarvestSystem;
  private onQuest = (q: QuestState): void => this.applyQuest(q);
  private onGateOpened = (): void => this.openGateVisual();

  constructor(
    private ctx: GameContext,
    private host: GameScene,
  ) {}

  /** world dressing (tablets, grove altar, Welcome Stone) + journey init + hint text */
  create(): void {
    const scene = this.ctx.scene;
    const world = this.ctx.world;
    // lore tablets (E to read)
    for (const tab of world.tablets) {
      const x = (tab.tx + 0.5) * TILE;
      const y = (tab.ty + 1) * TILE;
      objImage(scene, x, y, 'tablet')?.setScale(0.55);
      this.tabletSpots.push({ id: tab.id, x, y });
    }
    // grove altar (E with an offering)
    {
      const a = world.altar;
      const x = (a.tx + 1) * TILE;
      const y = (a.ty + 1) * TILE;
      objImage(scene, x, y, 'altar');
      addBlockerBody(scene, this.host.blockersGroup, a.tx, a.ty);
      addBlockerBody(scene, this.host.blockersGroup, a.tx + 1, a.ty);
      this.altarPos = { x, y };
    }
    // Welcome Stone beside the spawn (E to re-read the intro story)
    {
      const w = world.welcomeStone;
      const x = (w.tx + 0.5) * TILE;
      const y = (w.ty + 1) * TILE;
      objImage(scene, x, y, 'welcome_stone')?.setScale(0.7);
      addBlockerBody(scene, this.host.blockersGroup, w.tx, w.ty);
      addShadow(scene, x, y - 1, 18);
      this.welcomeStonePos = { x, y };
    }
    this.journey = { steps: { ...this.ctx.me.journey.steps }, hintUses: { ...this.ctx.me.journey.hintUses } };
    this.hintText = scene.add
      .text(0, 0, '', { fontSize: '9px', color: '#ffd166', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setResolution(4)
      .setDepth(999_998)
      .setVisible(false);
    scene.tweens.add({ targets: this.hintText, alpha: { from: 1, to: 0.55 }, duration: 700, yoyo: true, repeat: -1 });
    this.ctx.backend.on('quest', this.onQuest);
    this.ctx.backend.on('gateOpened', this.onGateOpened);
  }

  update(_time?: number, _dt?: number): void {}

  destroy(): void {
    this.ctx.backend.off('quest', this.onQuest);
    this.ctx.backend.off('gateOpened', this.onGateOpened);
  }

  // ------------------------------------------------------------ v3: the Journey

  /** tick one Journey objective (idempotent; optimistic local + backend persist) */
  tickJourney(step: JourneyStepId): void {
    if (this.journey.steps[step]) return;
    this.journey.steps[step] = true;
    this.ctx.bus.emit('journey', this.journey);
    if (journeyComplete(this.journey)) {
      this.ctx.bus.emit('toast', t.toast.journeyComplete, 'good');
    }
    void this.ctx.backend.completeJourneyStep(step).then((j) => {
      this.journey = j;
      this.ctx.bus.emit('journey', j);
    });
  }

  /** count a successful use of a contextual hint; it retires after a few */
  useHint(hint: HintId): void {
    if (hintRetired(this.journey, hint)) return;
    this.journey.hintUses[hint] = (this.journey.hintUses[hint] ?? 0) + 1;
    this.ctx.bus.emit('journey', this.journey);
    void this.ctx.backend.bumpHint(hint);
  }

  /**
   * Contextual key hints float at the moment of relevance ("E — gather" by
   * the first harvestable Resource Nodes, "E — read" at the Welcome Stone and
   * tablets). Runs on the coarse checkZone cadence, not every frame.
   */
  updateHints(): void {
    if (!this.hintText) return;
    const player = this.ctx.player;
    const px = player.x;
    const py = player.y - 4;
    let text = '';
    let x = 0;
    let y = 0;
    if (!hintRetired(this.journey, 'read')) {
      if (Phaser.Math.Distance.Between(px, py, this.welcomeStonePos.x, this.welcomeStonePos.y - 8) < INTERACT_RANGE) {
        text = t.hint.read;
        x = this.welcomeStonePos.x;
        y = this.welcomeStonePos.y - 26;
      } else {
        for (const spot of this.tabletSpots) {
          if (Phaser.Math.Distance.Between(px, py, spot.x, spot.y - 8) < INTERACT_RANGE) {
            text = t.hint.read;
            x = spot.x;
            y = spot.y - 22;
            break;
          }
        }
      }
    }
    if (!text && !hintRetired(this.journey, 'gather')) {
      let best: NodeView | null = null;
      let bestDist = INTERACT_RANGE;
      for (const view of this.harvest.nodes.values()) {
        if (view.depletedShown) continue;
        const nt = NODE_TYPES[view.state.type];
        if (nt.requiredTool && (this.ctx.inventory[nt.requiredTool] ?? 0) <= 0) continue; // only nodes the Player can harvest teach
        const d = Phaser.Math.Distance.Between(px, py, view.sprite.x, view.sprite.y - TILE / 2);
        if (d < bestDist) {
          bestDist = d;
          best = view;
        }
      }
      if (best) {
        text = t.hint.gather;
        x = best.sprite.x;
        y = best.sprite.y - best.sprite.displayHeight - 4;
      }
    }
    if (text) this.hintText.setText(text).setPosition(x, y).setVisible(true);
    else this.hintText.setVisible(false);
  }

  // ------------------------------------------------------------ secrets

  applyQuest(q: QuestState): void {
    this.quest = q;
    this.ctx.bus.emit('quest', q);
    this.host.refreshDelveEntrance(this.host.delveOpenNow());
    if (q.treasureLocation) {
      const x = (q.treasureLocation.tx + 0.5) * TILE;
      const y = (q.treasureLocation.ty + 0.5) * TILE;
      if (!this.digMarker) {
        this.digMarker = this.ctx.scene.add
          .text(x, y, '✕', { fontSize: '12px', color: '#ff5544', stroke: '#000000', strokeThickness: 3 })
          .setOrigin(0.5)
          .setResolution(4);
      }
      this.digMarker.setPosition(x, y).setDepth(y);
    } else {
      this.digMarker?.destroy();
      this.digMarker = null;
    }
  }

  buildGate(): void {
    const scene = this.ctx.scene;
    for (const g of this.ctx.world.gate) {
      const x = (g.tx + 0.5) * TILE;
      const y = (g.ty + 1) * TILE;
      const sprite = objImage(scene, x, y, 'fiber_vine');
      if (!sprite) continue;
      sprite.setTint(0x8fdc78);
      const body = addBlockerBody(scene, this.host.blockersGroup, g.tx, g.ty);
      this.gateParts.push({ sprite, body });
    }
  }

  private openGateVisual(): void {
    for (const part of this.gateParts) {
      this.ctx.scene.tweens.add({
        targets: part.sprite,
        alpha: 0,
        y: part.sprite.y - 8,
        duration: 700,
        onComplete: () => part.sprite.destroy(),
      });
      part.body.destroy();
    }
    this.gateParts = [];
  }

  // ------------------------------------------------------------ E-chain entries

  /** E at the Welcome Stone: re-read the intro story */
  welcomeStoneAction(px: number, py: number): EAction | null {
    if (Phaser.Math.Distance.Between(px, py, this.welcomeStonePos.x, this.welcomeStonePos.y - 8) >= INTERACT_RANGE) return null;
    const scene = this.ctx.scene;
    return {
      swing: false,
      run: () => {
        this.ctx.sfx('blip', 0.4);
        this.useHint('read');
        scene.input.keyboard!.enabled = false;
        void showIntro().then(() => {
          scene.input.keyboard!.enabled = true;
          scene.input.keyboard!.resetKeys();
        });
      },
    };
  }

  /** E at an Ancient Tablet: read it (quest progress + lore panel) */
  tabletAction(px: number, py: number): EAction | null {
    for (const spot of this.tabletSpots) {
      if (Phaser.Math.Distance.Between(px, py, spot.x, spot.y - 8) < INTERACT_RANGE) {
        return {
          swing: false,
          run: () => {
            void this.ctx.backend.readTablet(spot.id);
            const tab = TABLETS[spot.id];
            this.ctx.bus.emit('lore', tab?.title ?? t.lore.tabletFallbackTitle, tab?.text ?? t.lore.tabletFallbackText);
            this.ctx.sfx('blip', 0.4);
            this.useHint('read');
            this.tickJourney('read_tablet');
          },
        };
      }
    }
    return null;
  }

  /** E at the grove altar: lay the 2 fruit + 2 fiber Offering (opens the vine gate) */
  groveAltarAction(px: number, py: number): EAction | null {
    if (Phaser.Math.Distance.Between(px, py, this.altarPos.x, this.altarPos.y - 8) >= INTERACT_RANGE + 8) return null;
    return {
      swing: false,
      run: () => {
        if (this.quest?.gateOpen) {
          this.ctx.bus.emit('toast', t.toast.groveOpen, 'info');
        } else {
          void this.ctx.backend.offerAltar().then((res) => {
            if (res.ok) {
              this.ctx.setInventory(res.inventory);
              this.ctx.bus.emit('toast', t.toast.offeringAccepted, 'good');
              this.ctx.sfx('craft', 0.6);
            } else if (res.reason === 'INSUFFICIENT') {
              this.ctx.bus.emit('toast', t.toast.altarAsks2, 'bad');
            }
          });
        }
      },
    };
  }

  /** E at the revealed treasure spot: dig */
  digAction(px: number, py: number): EAction | null {
    if (!this.quest?.treasureLocation) return null;
    const spot = this.quest.treasureLocation;
    const dx = (spot.tx + 0.5) * TILE;
    const dy = (spot.ty + 0.5) * TILE;
    if (Phaser.Math.Distance.Between(px, py, dx, dy) >= INTERACT_RANGE) return null;
    return {
      swing: false,
      run: () => {
        void this.ctx.backend.dig().then((res) => {
          if (res.ok) {
            this.ctx.setInventory(res.inventory);
            const text = Object.entries(res.loot)
              .map(([item, n]) => `+${n} ${ITEMS[item as ItemId]?.name ?? item}`)
              .join('  ');
            floatText(this.ctx.scene, dx, dy - 8, text, '#ffd166');
            this.ctx.bus.emit('toast', t.toast.unearthedTreasure, 'good');
            this.ctx.sfx('craft', 0.7);
          } else if (res.reason === 'NOT_HERE') {
            this.ctx.bus.emit('toast', t.toast.digCloser, 'bad');
          }
        });
      },
    };
  }
}
