import Phaser from 'phaser';
import { AUDIO, OBJECTS, TILESET } from '../assetConfig';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.load.tilemapTiledJSON('jungle-map', '/map/jungle-map.json');
    this.load.json('worldData', '/map/world-data.json');
    // loaded under a -src key: create() copies it into a canvas texture so the
    // water tile can be animated by repainting its pixels
    this.load.image(`${TILESET.key}-src`, TILESET.url);
    this.load.image('water-frames', '/assets/tiles/water-frames.png');
    for (const [key, def] of Object.entries(OBJECTS)) {
      if (def.frameWidth) {
        this.load.spritesheet(key, def.url, { frameWidth: def.frameWidth, frameHeight: def.frameHeight! });
      } else {
        this.load.image(key, def.url);
      }
    }
    for (const [key, url] of Object.entries(AUDIO)) {
      this.load.audio(key, url);
    }

    const progress = this.add.text(this.scale.width / 2, this.scale.height / 2, 'Loading jungle... 0%', {
      color: '#8ce99a',
      fontSize: '18px',
    });
    progress.setOrigin(0.5);
    this.load.on('progress', (v: number) => progress.setText(`Loading jungle... ${Math.round(v * 100)}%`));
  }

  create(): void {
    const src = this.textures.get(`${TILESET.key}-src`).getSourceImage() as HTMLImageElement;
    const canvasTex = this.textures.createCanvas(TILESET.key, src.width, src.height)!;
    canvasTex.draw(0, 0, src);

    // generated FX textures: radial glow (lights, fireflies) and a tiny leaf
    const glow = this.textures.createCanvas('glow', 64, 64)!;
    const gctx = glow.context;
    const grad = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 64, 64);
    glow.refresh();
    const leaf = this.textures.createCanvas('leaf', 4, 3)!;
    leaf.context.fillStyle = '#4a9e52';
    leaf.context.fillRect(0, 0, 4, 3);
    leaf.context.fillStyle = '#2c6b35';
    leaf.context.fillRect(0, 2, 4, 1);
    leaf.refresh();
    // soft elliptical drop shadow (fake-3D grounding for every object)
    const shadow = this.textures.createCanvas('shadow', 48, 24)!;
    const sctx = shadow.context;
    sctx.translate(24, 12);
    sctx.scale(1, 0.5);
    const sg = sctx.createRadialGradient(0, 0, 2, 0, 0, 22);
    sg.addColorStop(0, 'rgba(0,0,0,0.5)');
    sg.addColorStop(0.7, 'rgba(0,0,0,0.25)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    sctx.fillStyle = sg;
    sctx.fillRect(-24, -24, 48, 48);
    shadow.refresh();

    // the Seal barrier: a shimmering violet wall segment (generated FX texture)
    const barrier = this.textures.createCanvas('seal-barrier', 16, 32)!;
    const bctx = barrier.context;
    const bg = bctx.createLinearGradient(0, 0, 0, 32);
    bg.addColorStop(0, 'rgba(150, 90, 235, 0.95)');
    bg.addColorStop(0.5, 'rgba(110, 60, 200, 0.75)');
    bg.addColorStop(1, 'rgba(60, 25, 130, 0.55)');
    bctx.fillStyle = bg;
    bctx.fillRect(0, 0, 16, 32);
    bctx.fillStyle = 'rgba(30, 8, 70, 0.55)';
    for (const x of [3, 8, 13]) bctx.fillRect(x, 0, 1, 32);
    bctx.fillStyle = 'rgba(235, 210, 255, 0.9)';
    for (const [x, y] of [[5, 6], [10, 12], [6, 20], [11, 26]]) bctx.fillRect(x, y, 2, 2);
    barrier.refresh();

    // Player walk animations are created per Avatar texture (src/avatars.ts).
    // the Guardian's slow awake idle (frame 0 is its slumber)
    this.anims.create({
      key: 'guardian-idle',
      frames: this.anims.generateFrameNumbers('guardian', { start: 1, end: 2 }),
      frameRate: 2,
      repeat: -1,
    });
    // the Eye Window: the amber eye blazes — the weak-point signal
    this.anims.create({
      key: 'guardian-eye',
      frames: this.anims.generateFrameNumbers('guardian', { start: 3, end: 4 }),
      frameRate: 4,
      repeat: -1,
    });
    this.game.events.emit('assets-ready');
  }
}
