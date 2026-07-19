/**
 * ProjectileSystem (ADR-0018 #7): the Bow — mouse-aimed arrows that fly until
 * off-screen (Delve walls stop them), first body on the ray takes the hit:
 * the active boss (Eye-Window rule via FightSystem), a Delve Husk, or ANY
 * wild creature. Targets are reached via explicit refs (plan §3).
 */
import Phaser from 'phaser';
import { AVATAR_H } from '../avatars';
import type { Dir } from '../backend/types';
import { TILE } from '../config';
import { profileOf } from '../content/dungeon';
import { weaponCombat } from '../content/guardian';
import { isWildKind } from '../content/wildlife';
import type { GameScene } from '../scenes/GameScene';
import type { GameContext } from './context';
import type { DelveSystem } from './DelveSystem';
import type { FightSystem } from './FightSystem';
import { rayExitPx } from './projectileGeom';
import type { GameSystem, EAction } from './types';
import type { WildlifeSystem } from './WildlifeSystem';

export class ProjectileSystem implements GameSystem {
  /** cross-system refs, wired by GameScene (ADR-0018 §3) */
  fight!: FightSystem;
  delve!: DelveSystem;
  wildlife!: WildlifeSystem;

  constructor(
    private ctx: GameContext,
    private host: GameScene,
  ) {}

  create(): void {}

  update(_time?: number, _dt?: number): void {}

  destroy(): void {}

  /** the mouse-aimed unit vector from the player's chest (the arrow's origin) */
  private aimDir(): { x: number; y: number } {
    const p = this.ctx.scene.input.activePointer;
    p.updateWorldPoint(this.ctx.scene.cameras.main); // fresh even if the mouse hasn't moved since a camera scroll
    const dx = p.worldX - this.ctx.player.x;
    const dy = p.worldY - (this.ctx.player.y - AVATAR_H / 2);
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  /** fly the arrow sprite along the aimed ray at constant speed; `onLand` fires
   *  where the ray met a body (null = a miss — full range, despawn, no call) */
  private looseArrowRay(dirX: number, dirY: number, distPx: number, onLand: (() => void) | null): void {
    const ox = this.ctx.player.x;
    const oy = this.ctx.player.y - AVATAR_H / 2;
    const arrow = this.ctx.scene.add.image(ox, oy, 'arrow');
    arrow.setDepth(999_990);
    arrow.setRotation(Math.atan2(dirY, dirX));
    this.ctx.sfx('blip', 0.4); // bowstring twang
    this.ctx.scene.tweens.add({
      targets: arrow,
      x: ox + dirX * distPx,
      y: oy + dirY * distPx,
      duration: Math.max(60, distPx / 0.9), // ~0.9 px/ms ≈ the old boss arrow's 240 ms at 8 tiles
      onComplete: () => {
        arrow.destroy();
        onLand?.();
      },
    });
  }

  /** distance along the aimed segment where it first meets the circle, or null */
  private rayHitPx(ox: number, oy: number, dx: number, dy: number, maxPx: number, cx: number, cy: number, rPx: number): number | null {
    const t = Phaser.Math.Clamp((cx - ox) * dx + (cy - oy) * dy, 0, maxPx);
    return Math.hypot(ox + dx * t - cx, oy + dy * t - cy) <= rPx + 4 ? t : null; // +4px forgiveness
  }

  /**
   * How far an arrow flies (2026-07 batch: "out of the screen", not a fixed
   * reach): the distance the aim ray travels before it EXITS the camera view,
   * measured from the arrow's own origin (`ox`,`oy` = the player's chest) + a
   * margin. The old half-diagonal cap was a player-CENTRED radius that only
   * reached the far edge when the player sat dead-centre; the follow-lerp and
   * the district/arena camera clamp routinely leave the player off-centre, so a
   * boss plainly on screen sat beyond the cap and the arrow fizzled short. The
   * ray-exit reach covers the whole visible rect from wherever the player is, at
   * every zoom. In the Delve the first wall tile on the ray stops it instead (no
   * through-wall sniping); the overworld ray stays unobstructed — arrows arc
   * over the undergrowth like the swing echo always has.
   */
  private arrowRangePx(ox: number, oy: number, dirX: number, dirY: number): number {
    const v = this.ctx.scene.cameras.main.worldView;
    const maxPx = rayExitPx(ox, oy, dirX, dirY, { x: v.x, y: v.y, right: v.right, bottom: v.bottom }) + TILE * 2;
    if (!this.host.inDelve) return maxPx;
    const S = this.delve.stageDef();
    // march from the FEET (the tile the body actually stands in — the chest row
    // sits a full tile higher and overlaps the wall art when pressed against a
    // wall from below, which would clamp every shot to a 4px fizzle), and never
    // clamp inside the origin tile itself
    const fx = this.ctx.player.x;
    const fy = this.ctx.player.y - 4;
    const otx = Math.floor(fx / TILE);
    const oty = Math.floor(fy / TILE);
    const step = TILE / 4;
    for (let d = step; d <= maxPx; d += step) {
      const tx = Math.floor((fx + dirX * d) / TILE);
      const ty = Math.floor((fy + dirY * d) / TILE);
      if (tx === otx && ty === oty) continue;
      if (S.isBlocked(tx, ty)) return Math.max(step, d - step);
    }
    return maxPx;
  }

  /**
   * The one bow verb for every context (the 2026-07 batch): the arrow flies
   * toward the MOUSE, and the first body on the ray takes the hit when it lands
   * — the active boss (Eye-Window rule intact via fireGuardianHit), a Delve
   * Husk, or ANY wild creature, peaceful ones included (a survivor enrages and
   * charges its shooter; melee-reach foraging still catches them unharmed).
   * Nothing on the ray → the arrow flies clean off the screen and despawns: a
   * miss, the cadence still spent. Damage attribution is unchanged — the same
   * host-/server-authoritative messages as melee. Arrows stay a local cosmetic
   * (peers see the swing echo), the status quo.
   */
  fireBow(): void {
    const ctx = this.ctx;
    const dir = this.aimDir();
    const ox = ctx.player.x;
    const oy = ctx.player.y - AVATAR_H / 2;
    const maxPx = this.arrowRangePx(ox, oy, dir.x, dir.y); // off-screen, or the first Delve wall
    // re-face the shot so the pose matches the aim, not the last walk direction
    // (playSwingFx kill-restarts safely; markSwing already fired the first one)
    const d: Dir = Math.abs(dir.x) > Math.abs(dir.y) ? (dir.x > 0 ? 'right' : 'left') : dir.y > 0 ? 'down' : 'up';
    if (d !== ctx.held.lastDir) {
      ctx.held.lastDir = d;
      this.host.playSwingFx(ctx.player, this.host.heldSprite, d);
    }
    const tool = this.host.heldTool();
    let bestT: number | null = null;
    let onLand: (() => void) | null = null;
    const consider = (t: number | null, land: () => void): void => {
      if (t !== null && (bestT === null || t < bestT)) {
        bestT = t;
        onLand = land;
      }
    };
    if (this.host.inDelve) {
      for (const m of this.delve.mobs.values()) {
        if (m.st === 'dead') continue;
        const t0 = this.rayHitPx(ox, oy, dir.x, dir.y, maxPx, m.x * TILE, m.y * TILE, profileOf(m.kind).radius * TILE);
        consider(t0, () => {
          // landing-time re-check: applyDelveHit guards dead/missing mobs
          if (this.delve.isDelveHost) this.delve.applyDelveHit(m.id, tool, ctx.me.name);
          else if (this.delve.delveRunId) {
            ctx.backend.sendDungeon({ t: 'hit', runId: this.delve.delveRunId, mobId: m.id, by: ctx.me.name, tool });
            this.delve.delveHitLanded = true;
          }
        });
      }
    } else {
      if (this.fight.fight && this.fight.playerInArena()) {
        const spr = this.fight.activeBoss().sprite;
        // the colossus body: a generous 3x3-tile circle at its lower mass. The
        // reach is the same off-screen range as any other shot — the exposure
        // gate is standing inside the arena (ADR-0002), checked above; a snipe
        // from beyond the wall never reaches this branch at all, so "safe but
        // weaker" can't collapse into "perfectly safe" participation loot.
        const t0 = this.rayHitPx(ox, oy, dir.x, dir.y, maxPx, spr.x, spr.y - TILE * 1.5, TILE * 1.8);
        consider(t0, () => this.fight.fireGuardianHit(tool, spr.x, spr.y - TILE * 3));
      }
      for (const m of this.wildlife.wildMobs.values()) {
        if (m.st === 'dead') continue;
        if (!isWildKind(m.kind)) continue; // every creature is fair game — peaceful too
        const t0 = this.rayHitPx(ox, oy, dir.x, dir.y, maxPx, m.x * TILE, m.y * TILE, profileOf(m.kind).radius * TILE);
        consider(t0, () => {
          if (this.wildlife.isWildHost) this.wildlife.applyWildHit(m.id, tool, ctx.me.name);
          else ctx.backend.sendCreatures({ t: 'hit', id: m.id, by: ctx.me.name, tool });
        });
      }
    }
    this.looseArrowRay(dir.x, dir.y, bestT ?? maxPx, onLand);
  }

  /** LMB/E with a bow and nothing else in reach still shoots toward the cursor
   *  (placed LAST in resolveEAction so every other verb keeps priority) */
  bowFallbackAction(): EAction | null {
    if (!this.host.isBow()) return null;
    return { swing: true, cadenceMs: this.host.atkCadence(weaponCombat(this.host.heldTool()).attackMs), run: () => this.fireBow() };
  }
}
