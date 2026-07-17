/**
 * Static world dressing built once in GameScene.create() (ADR-0018): the
 * decorative foliage (solid, depth-sorted), the deterministic parallax cloud
 * layer, and the animated water tile repaint inside the shared canvas tileset.
 * Pure bootstrap presentation — no game state, no listeners.
 */
import Phaser from 'phaser';
import { TILESET } from '../assetConfig';
import { MAP_H, MAP_W, TILE } from '../config';
import { addBlockerBody, addShadow, objImage } from '../systems/sceneFx';
import type { WorldData } from '../systems/types';

export function buildWorldDressing(scene: Phaser.Scene, world: WorldData, blockersGroup: Phaser.Physics.Arcade.StaticGroup): void {
  // decorative foliage (ruin pillars etc.) — solid, depth-sorted
  for (const f of world.foliage) {
    const x = (f.tx + 0.5) * TILE;
    const y = (f.ty + 1) * TILE;
    if (objImage(scene, x, y, f.kind)) {
      addBlockerBody(scene, blockersGroup, f.tx, f.ty);
      addShadow(scene, x, y - 1, 16);
    }
  }

  // parallax clouds drifting ABOVE the world, scrolling slightly faster
  // than the ground — fake-3D depth between layers. Deterministic spread
  // so every client sees the same sky.
  for (let i = 0; i < 18; i++) {
    const px = (i * 733 + 217) % (MAP_W * TILE);
    const py = (i * 1291 + 401) % (MAP_H * TILE);
    const c = scene.add.image(px, py, `cloud${i % 3}`);
    c.setScale(1.5 + (i % 4) * 0.55);
    c.setAlpha(0.4 + (i % 3) * 0.06);
    c.setScrollFactor(1.22);
    c.setDepth(700_000);
    scene.tweens.add({
      targets: c,
      x: px + 90 + (i % 5) * 35,
      duration: 26_000 + (i % 7) * 6_000,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inout',
    });
  }

  // animated water: repaint the water tile inside the shared canvas tileset
  const tilesTex = scene.textures.get(TILESET.key);
  if (tilesTex instanceof Phaser.Textures.CanvasTexture && scene.textures.exists('water-frames')) {
    const frames = scene.textures.get('water-frames').getSourceImage() as HTMLImageElement;
    let waterFrame = 0;
    scene.time.addEvent({
      delay: 550,
      loop: true,
      callback: () => {
        waterFrame = (waterFrame + 1) % 3;
        tilesTex.context.clearRect(16, 0, 16, 16);
        tilesTex.context.drawImage(frames, waterFrame * 16, 0, 16, 16, 16, 0, 16, 16);
        // the Mire's black water breathes on the same clock — the frame is
        // drowned under dark teal so it barely glints (tile id 14, x=224)
        const mx = 14 * 16;
        tilesTex.context.clearRect(mx, 0, 16, 16);
        tilesTex.context.drawImage(frames, waterFrame * 16, 0, 16, 16, mx, 0, 16, 16);
        tilesTex.context.save();
        tilesTex.context.globalCompositeOperation = 'source-atop';
        tilesTex.context.fillStyle = 'rgba(10, 30, 29, 0.82)';
        tilesTex.context.fillRect(mx, 0, 16, 16);
        tilesTex.context.restore();
        tilesTex.refresh();
      },
    });
  }
}
