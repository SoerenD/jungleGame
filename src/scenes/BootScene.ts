import Phaser from 'phaser';
import { AUDIO, MIRE_TILES, OBJECTS, TILESET } from '../assetConfig';
import { asset } from '../paths';
import { GRIDS, PAL } from '../ui/icons';
import { ITEMS, type ItemId } from '../content/items';
import { ensureMobTextures, ensureProjectileTextures } from '../mobSprites';
import { ensureDelvePropTextures } from '../delveProps';
import { t } from '../i18n';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.load.tilemapTiledJSON('jungle-map', asset('/map/jungle-map.json'));
    this.load.json('worldData', asset('/map/world-data.json'));
    // loaded under a -src key: create() copies it into a canvas texture so the
    // water tile can be animated by repainting its pixels
    this.load.image(`${TILESET.key}-src`, asset(TILESET.url));
    this.load.image(`${TILESET.key}-mire-src`, asset(MIRE_TILES.url));
    this.load.image('water-frames', asset('/assets/tiles/water-frames.png'));
    for (const [key, def] of Object.entries(OBJECTS)) {
      if (def.frameWidth) {
        this.load.spritesheet(key, asset(def.url), { frameWidth: def.frameWidth, frameHeight: def.frameHeight! });
      } else {
        this.load.image(key, asset(def.url));
      }
    }
    for (const [key, url] of Object.entries(AUDIO)) {
      this.load.audio(key, asset(url));
    }

    const progress = this.add.text(this.scale.width / 2, this.scale.height / 2, t.boot.loading(0), {
      color: '#8ce99a',
      fontSize: '18px',
    });
    progress.setOrigin(0.5);
    this.load.on('progress', (v: number) => progress.setText(t.boot.loading(Math.round(v * 100))));
  }

  create(): void {
    // the shared tileset canvas: the downloaded terrain strip + the composed
    // Mire strip appended after it (tile ids 11+; jungle-map.json's tileset
    // dims describe this combined strip)
    const src = this.textures.get(`${TILESET.key}-src`).getSourceImage() as HTMLImageElement;
    const mire = this.textures.get(`${TILESET.key}-mire-src`).getSourceImage() as HTMLImageElement;
    const canvasTex = this.textures.createCanvas(TILESET.key, src.width + mire.width, src.height)!;
    canvasTex.draw(0, 0, src);
    canvasTex.draw(src.width, 0, mire);

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
    // a WARM lamp glow: the colour is baked into the gradient (not white) and the
    // core is deliberately < full alpha, so additive blending can't bloom it back
    // to white the way a tinted white texture does — a lantern reads yellow, not
    // hot-white. Used by the Lamp Post (BuildSystem light-source glows).
    const glowWarm = this.textures.createCanvas('glow_warm', 64, 64)!;
    const wctx = glowWarm.context;
    // a lower-opacity core is the key: an additive light blooms to white at its
    // hottest point over already-lit ground, so the peak is kept gentle (0.72) and
    // the hue deepened to a saturated amber that reads yellow, never white.
    const wgrad = wctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    wgrad.addColorStop(0, 'rgba(255,198,78,0.72)');
    wgrad.addColorStop(0.45, 'rgba(255,182,64,0.34)');
    wgrad.addColorStop(1, 'rgba(255,168,48,0)');
    wctx.fillStyle = wgrad;
    wctx.fillRect(0, 0, 64, 64);
    glowWarm.refresh();
    // a small circular saw blade (16×16) — spun on a working Sawmill (v3) so the
    // mill reads as actively milling; a steel disc, dark teeth around the rim, hub
    const blade = this.textures.createCanvas('sawblade', 16, 16)!;
    const bctx = blade.context;
    const cx = 8;
    const cy = 8;
    bctx.fillStyle = '#c7ccd4';
    bctx.beginPath();
    bctx.arc(cx, cy, 6, 0, Math.PI * 2);
    bctx.fill();
    bctx.fillStyle = '#5a616e';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      bctx.fillRect(cx + Math.cos(a) * 6 - 1, cy + Math.sin(a) * 6 - 1, 2, 2);
    }
    bctx.fillStyle = '#8b94a3';
    bctx.beginPath();
    bctx.arc(cx, cy, 3, 0, Math.PI * 2);
    bctx.fill();
    bctx.fillStyle = '#3a3f49';
    bctx.beginPath();
    bctx.arc(cx, cy, 1.2, 0, Math.PI * 2);
    bctx.fill();
    blade.refresh();
    // puffy parallax clouds: three shape variants, sunlit top, blue underside
    const cloudTex = (key: string, w: number, h: number, blobs: [number, number, number][]) => {
      const tex = this.textures.createCanvas(key, w, h)!;
      const ctx = tex.context;
      const pass = (color: string, dy: number, shrink: number) => {
        ctx.fillStyle = color;
        for (const [bx, by, r] of blobs) {
          ctx.beginPath();
          ctx.arc(bx, by + dy, Math.max(1, r - shrink), 0, Math.PI * 2);
          ctx.fill();
        }
      };
      pass('#8fb4de', 3, 0);
      pass('#dcebf9', 0, 1);
      pass('#ffffff', -3, 4);
      tex.refresh();
    };
    cloudTex('cloud0', 88, 44, [
      [20, 28, 13], [38, 21, 16], [58, 25, 14], [71, 30, 9], [30, 31, 12], [50, 31, 12],
    ]);
    cloudTex('cloud1', 64, 36, [
      [14, 22, 10], [30, 17, 13], [46, 22, 10], [24, 25, 9], [38, 25, 9],
    ]);
    cloudTex('cloud2', 112, 48, [
      [18, 31, 12], [36, 23, 16], [58, 19, 18], [80, 25, 15], [95, 32, 10], [48, 33, 13], [70, 33, 13],
    ]);

    const leaf = this.textures.createCanvas('leaf', 4, 3)!;
    leaf.context.fillStyle = '#4a9e52';
    leaf.context.fillRect(0, 0, 4, 3);
    leaf.context.fillStyle = '#2c6b35';
    leaf.context.fillRect(0, 2, 4, 1);
    leaf.refresh();
    // death-beat puff (J4): ONE tiny white square, tinted per burst at use —
    // every felled mob/creature poofs from this shared texture, so a death
    // never allocates a texture or a particle emitter of its own
    const poof = this.textures.createCanvas('poof', 4, 4)!;
    poof.context.fillStyle = '#ffffff';
    poof.context.fillRect(0, 0, 4, 4);
    poof.refresh();
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

    // fog-of-war eraser brush: solid core, feathered rim (1px = 1 tile)
    const brush = this.textures.createCanvas('fog-brush', 24, 24)!;
    const fctx = brush.context;
    const fg = fctx.createRadialGradient(12, 12, 0, 12, 12, 12);
    fg.addColorStop(0, 'rgba(255,255,255,1)');
    fg.addColorStop(0.55, 'rgba(255,255,255,1)');
    fg.addColorStop(1, 'rgba(255,255,255,0)');
    fctx.fillStyle = fg;
    fctx.fillRect(0, 0, 24, 24);
    brush.refresh();

    // the Seal barrier is now an authored rune-stone gate PNG loaded above
    // (assetConfig 'seal-barrier', tools/compose-seal-barrier.ts).

    // v4: the Bow's arrow — short shaft + bright head, pointing +x so a
    // rotation toward the Guardian aims it correctly
    const arrow = this.textures.createCanvas('arrow', 12, 5)!;
    const actx = arrow.context;
    actx.fillStyle = '#e8d8b0'; // fletching
    actx.fillRect(0, 1, 2, 3);
    actx.fillStyle = '#6b4a2a'; // shaft
    actx.fillRect(1, 2, 8, 1);
    actx.fillStyle = '#d7dbe0'; // arrowhead
    actx.beginPath();
    actx.moveTo(12, 2.5);
    actx.lineTo(8, 0.5);
    actx.lineTo(8, 4.5);
    actx.closePath();
    actx.fill();
    arrow.refresh();

    // v4: in-hand held-item sprites — small 12x12 pixel textures built from the
    // same grids as the HUD icons, so a Player's equipped Tool shows in their
    // hand (keyed 'held-<toolId>'). Only Tools are ever held.
    for (const [id, grid] of Object.entries(GRIDS)) {
      if (ITEMS[id as ItemId]?.kind !== 'tool' || !grid) continue;
      const key = `held-${id}`;
      if (this.textures.exists(key)) continue;
      const held = this.textures.createCanvas(key, 12, 12)!;
      const hctx = held.context;
      grid.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const color = PAL[row[x]];
          if (!color) continue;
          hctx.fillStyle = color;
          hctx.fillRect(x, y, 1, 1);
        }
      });
      held.refresh();
    }

    // the Delve's Husks + Deep Guardian — procedural 3-frame sprites (ADR-0007)
    ensureMobTextures(this);
    // the ranged Husks' spat shots — acid glob (Stage 1) / molten cinder (the Deep)
    ensureProjectileTextures(this);
    // the Delve's props (beams, pillars, braziers, rubble, rails, glyphs…)
    ensureDelvePropTextures(this);

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
    // ADR-0017 rung 1: the Mire Warden shares the Guardian's 8-frame boss-sheet
    // contract (0 slumber, 1..2 idle, 3..4 eye), so its idle/eye anims mirror it
    if (this.textures.exists('mire_warden')) {
      this.anims.create({
        key: 'mire-idle',
        frames: this.anims.generateFrameNumbers('mire_warden', { start: 1, end: 2 }),
        frameRate: 2,
        repeat: -1,
      });
      this.anims.create({
        key: 'mire-eye',
        frames: this.anims.generateFrameNumbers('mire_warden', { start: 3, end: 4 }),
        frameRate: 4,
        repeat: -1,
      });
    }
    // ADR-0017 rung 2: the Echo Warden shares the same 8-frame boss-sheet contract
    if (this.textures.exists('echo_warden')) {
      this.anims.create({
        key: 'echo-idle',
        frames: this.anims.generateFrameNumbers('echo_warden', { start: 1, end: 2 }),
        frameRate: 2,
        repeat: -1,
      });
      this.anims.create({
        key: 'echo-eye',
        frames: this.anims.generateFrameNumbers('echo_warden', { start: 3, end: 4 }),
        frameRate: 4,
        repeat: -1,
      });
    }
    // ADR-0017 rung 3: the Verdant Warden shares the same 8-frame boss-sheet contract
    if (this.textures.exists('verdant_warden')) {
      this.anims.create({
        key: 'verdant-idle',
        frames: this.anims.generateFrameNumbers('verdant_warden', { start: 1, end: 2 }),
        frameRate: 2,
        repeat: -1,
      });
      this.anims.create({
        key: 'verdant-eye',
        frames: this.anims.generateFrameNumbers('verdant_warden', { start: 3, end: 4 }),
        frameRate: 4,
        repeat: -1,
      });
    }
    this.game.events.emit('assets-ready');
  }
}
