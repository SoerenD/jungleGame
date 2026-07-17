/**
 * Shared scene-FX helpers (ADR-0018): the small render/physics primitives every
 * system leans on, as free functions taking the scene (never scene state).
 * Moved verbatim from GameScene — behavior identical.
 */
import Phaser from 'phaser';
import { OBJECTS } from '../assetConfig';
import type { Dir } from '../backend/types';
import type { ItemId } from '../content/items';
import { TILE } from '../config';

/**
 * Where the in-hand item sits relative to the Player's feet origin, per facing.
 * `flip` mirrors the sprite for the left profile; `behind` draws it behind the
 * body when the Player faces away.
 */
export const HELD_HAND: Record<Dir, { x: number; y: number; flip: boolean; behind: boolean }> = {
  down: { x: 6, y: -9, flip: false, behind: false },
  right: { x: 7, y: -10, flip: false, behind: false },
  left: { x: -7, y: -10, flip: true, behind: false },
  up: { x: -6, y: -11, flip: false, behind: true },
};

/** warm, deep flame-orange cast by a held Hand Torch (dim — a small flame, not a floodlight) */
export const TORCH_TINT = 0xff5a0a;

/** point a held-item Image at the in-hand Tool's texture, or hide it when nothing is held */
export function setHeldTexture(scene: Phaser.Scene, img: Phaser.GameObjects.Image, id: ItemId | null): void {
  const key = id ? `held-${id}` : null;
  if (key && scene.textures.exists(key)) img.setTexture(key).setVisible(true);
  else img.setVisible(false);
}

/**
 * Place a held-item Image at the character's hand for the given facing.
 * Writes position/flip/depth ONLY — never angle or origin — so the per-frame
 * placement composes with the transient swing-arc rotation (playSwingFx).
 */
export function positionHeld(img: Phaser.GameObjects.Image, px: number, py: number, dir: Dir): void {
  const h = HELD_HAND[dir];
  img.setPosition(px + h.x, py + h.y);
  img.setFlipX(h.flip);
  img.setDepth(py + (h.behind ? -1 : 1));
}

/** soft ground shadow — drawn in a low depth band above the floor, below all sprites */
export function addShadow(scene: Phaser.Scene, x: number, y: number, width: number): Phaser.GameObjects.Image {
  const sh = scene.add.image(x, y, 'shadow');
  sh.setDisplaySize(width, width * 0.45);
  sh.setDepth(2);
  return sh;
}

/** create a depth-sorted image for an object kind (respects spritesheet frames) */
export function objImage(scene: Phaser.Scene, x: number, y: number, kind: string): Phaser.GameObjects.Image | null {
  if (!scene.textures.exists(kind)) return null;
  const img = scene.add.image(x, y, kind, OBJECTS[kind]?.frame);
  img.setOrigin(0.5, 1);
  img.setDepth(y);
  return img;
}

export function setObjTexture(scene: Phaser.Scene, img: Phaser.GameObjects.Image, kind: string): void {
  if (scene.textures.exists(kind)) img.setTexture(kind, OBJECTS[kind]?.frame);
}

/** an invisible static collision body on one tile, registered in the shared blockers group */
export function addBlockerBody(
  scene: Phaser.Scene,
  group: Phaser.Physics.Arcade.StaticGroup,
  tx: number,
  ty: number,
): Phaser.GameObjects.Rectangle {
  const rect = scene.add.rectangle((tx + 0.5) * TILE, (ty + 0.5) * TILE, TILE - 2, TILE - 4);
  rect.setVisible(false);
  group.add(rect);
  return rect;
}

export function floatText(scene: Phaser.Scene, x: number, y: number, text: string, color: string, sizePx = 10): void {
  const t = scene.add.text(x, y, text, { fontSize: `${sizePx}px`, color, stroke: '#000', strokeThickness: 3 });
  t.setOrigin(0.5, 1);
  t.setResolution(4);
  t.setDepth(999999);
  scene.tweens.add({ targets: t, y: y - 18, alpha: { from: 1, to: 0 }, duration: 1200, onComplete: () => t.destroy() });
}

/** the host's per-mob render objects (drawn on the high-depth Delve overlay) */
export interface MobView {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  tele: Phaser.GameObjects.Graphics;
  bar: Phaser.GameObjects.Rectangle;
}

/**
 * J4 death-beat tuning — the Guardian's death throes (shatterGuardian: blown-out
 * tintFill flash, then the heavy settle) replayed as a ~300ms miniature on every
 * felled Husk and hunted predator, so a kill's payoff frame is a death, not a
 * despawn blink. Pure client presentation: by the time the beat runs the kill is
 * fully adjudicated and the loot paid.
 */
const DEATH_FLASH_MS = 60; // blown-out white payoff frame
const DEATH_SQUASH_MS = 250; // squash-into-the-ground fade that follows it
const DEATH_SETTLE_PX = 5; // slight downward settle riding the squash
const DEATH_SNUFF_TINT = 0x4a4650; // the flash snuffs to the Guardian's dead-stone grey
const DEATH_PUFF_COUNT = 6; // tiny tinted squares of the shared 'poof' texture
export const DEATH_PUFF_TINT_DELVE = 0xcfc8e0; // pale ruin-dust for Husks
export const DEATH_PUFF_TINT_WILD = 0xd8c9a2; // dry earth for Wildlife
/** one sweep destroys every beat object; must outlast the longest tween
 *  (flash 60 + squash 250; the last puff ends ≈ 320 + 5·30 = 470ms) */
const DEATH_FX_TTL_MS = 620;

/**
 * J4 — deaths, not despawns: flash-squash-poof for a felled mob/creature.
 * The caller has already DETACHED the view from its synced map (mobViews /
 * wildViews), so the render-sync sweep — which destroys any view whose
 * MobState vanished — can no longer erase it mid-tween; from here the orphan
 * animates frozen at the death spot. ~60ms blown-out tintFill flash, then a
 * 250ms squash (scaleY→0 onto the feet origin) with a slight downward settle,
 * plus a small burst of tinted puffs from the shared 'poof' texture (tweened
 * images — no per-death emitter or texture allocation). Attached decals leave
 * with the body: telegraph/HP bar hide instantly, the shadow fades under it.
 * One TTL sweep destroys every piece and drops the registry entry; the
 * registry lets teardown (leaveDelve, creature-host change) reap a mid-beat
 * orphan, so nothing leaks. Purely visual — adjudication, loot, participation
 * and the wire are all settled before this runs (ADR-0005/0007 untouched).
 */
export function playDeathBeat(
  scene: Phaser.Scene,
  v: MobView,
  puffTint: number,
  registry: Set<Phaser.GameObjects.GameObject[]>,
): void {
  const spr = v.sprite;
  if (!spr.scene) return; // already torn down — nothing to animate
  v.tele.clear();
  v.tele.setVisible(false);
  v.bar.setVisible(false);
  spr.anims.stop();
  spr.setTintFill(0xffffff); // the blown-out payoff flash
  const objs: Phaser.GameObjects.GameObject[] = [spr, v.shadow, v.tele, v.bar];
  // the poof: a handful of tinted squares drifting out and gently up from the
  // body's centre (the sprite origin sits at the feet, so step up from there)
  const cx = spr.x;
  const cy = spr.y - spr.displayHeight * 0.35;
  for (let i = 0; i < DEATH_PUFF_COUNT; i++) {
    const ang = (Math.PI * 2 * i) / DEATH_PUFF_COUNT + (i % 2) * 0.5;
    const puff = scene.add
      .image(cx + Math.cos(ang) * 3, cy + Math.sin(ang) * 2, 'poof')
      .setTint(puffTint)
      .setAlpha(0.9)
      .setDepth(spr.depth + 2);
    objs.push(puff);
    scene.tweens.add({
      targets: puff,
      x: cx + Math.cos(ang) * (10 + (i % 3) * 5),
      y: cy + Math.sin(ang) * 6 - 7,
      alpha: 0,
      scale: 2.4,
      duration: 320 + i * 30,
      ease: 'Quad.out',
    });
  }
  registry.add(objs);
  // flash → squash: the white blows out for a beat, snuffs to dead grey, and
  // the body collapses onto its own shadow
  scene.time.delayedCall(DEATH_FLASH_MS, () => {
    if (!spr.scene) return; // reaped mid-flash (teardown raced the timer)
    spr.setTint(DEATH_SNUFF_TINT);
    scene.tweens.add({
      targets: spr,
      scaleY: 0,
      scaleX: spr.scaleX * 1.3, // squash: widen as it flattens
      alpha: 0,
      y: spr.y + DEATH_SETTLE_PX,
      duration: DEATH_SQUASH_MS,
      ease: 'Quad.in',
    });
    scene.tweens.add({ targets: v.shadow, alpha: 0, duration: DEATH_SQUASH_MS, ease: 'Quad.in' });
  });
  // one sweep ends the beat — destroy() is idempotent, so racing a teardown
  // reap (or the delveObjects sweep, which also holds these) is harmless
  scene.time.delayedCall(DEATH_FX_TTL_MS, () => {
    for (const o of objs) o.destroy();
    registry.delete(objs);
  });
}

/** J4: reap every death-beat orphan still animating — teardown mid-beat must not leak */
export function clearDeathFx(scene: Phaser.Scene, registry: Set<Phaser.GameObjects.GameObject[]>): void {
  for (const objs of registry) {
    for (const o of objs) {
      scene.tweens.killTweensOf(o);
      o.destroy();
    }
  }
  registry.clear();
}
