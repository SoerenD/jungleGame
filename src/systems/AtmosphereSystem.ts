/**
 * AtmosphereSystem (ADR-0018 #14): the real-clock day/night cycle, dusk/night
 * overlays, the Realm veils (Mire stagnant air + Tide sheen, Hushdark dark,
 * Verdant wash), the night glow pool, fireflies + falling leaves, the audio
 * mix (mute + per-channel volumes + sfx), the ambient/waterfall beds, and the
 * faux-elevation + waterfall world dressing (ADR-0009).
 *
 * update() is the §8 step-4 chunk; updateAudio() is the step-6 waterfall lerp,
 * called separately by GameScene so the documented order holds.
 */
import Phaser from 'phaser';
import {
  AMBIENT_BASE_VOLUME,
  DAY_CYCLE_MS,
  FIGHT_MUSIC_BASE_VOLUME,
  FORCE_NIGHT,
  MAP_H,
  MAP_W,
  MUTE_KEY,
  TIDE_PERIOD_MS,
  TILE,
  VOLUME_KEY,
  WATERFALL_BASE_VOLUME,
  WATERFALL_FAR_RADIUS,
  WATERFALL_NEAR_RADIUS,
  loadVolumes,
  type AudioChannel,
} from '../config';
import { tideHeight } from '../content/tide';
import type { GameScene } from '../scenes/GameScene';
import type { GameContext } from './context';
import type { DistrictSystem } from './DistrictSystem';
import type { FogSystem } from './FogSystem';
import { addShadow, objImage } from './sceneFx';
import type { ElevationRegion, GameSystem } from './types';

/** an entity on a plateau adds this to its depth so it sorts above ANY base entity
 *  (bigger than the whole map's y-range, so overlaps at the cliff edge sort right) */
export const ELEV_DEPTH_BONUS = MAP_H * TILE;

export class AtmosphereSystem implements GameSystem {
  muted = false;
  /** per-channel 0..1 volume mix, editable from the settings menu */
  volumes: Record<AudioChannel, number> = { master: 1, ambience: 1, music: 1, sfx: 1 };
  /** the looping jungle bed — kept so its volume can track the mix live */
  private ambientSound: Phaser.Sound.BaseSound | null = null;
  /** the waterfall proximity bed. The falls are a tall COLUMN, not a point, so
   *  the bed fades with distance to the nearest point on that vertical line —
   *  a circular audible zone around the whole drop, heard equally from any side. */
  private waterfallSound: Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound | null = null;
  private waterfallSrc = { x: 0, yTop: 0, yBottom: 0 };
  private nightOverlay!: Phaser.GameObjects.Rectangle;
  private duskOverlay!: Phaser.GameObjects.Rectangle;
  /** the Sunken Mire's ambience: veil + mist banks, 0..1 blend (update()) */
  private mireVeil!: Phaser.GameObjects.Rectangle;
  private mirePuffs: Phaser.GameObjects.Image[] = [];
  private mireAmbience = 0;
  /** ADR-0017 rung 1: the Tide's rising-water sheen — alpha tracks tideHeight */
  private tideVeil!: Phaser.GameObjects.Rectangle;
  /** ADR-0017 rung 2: the Hushdark's cold, muffled dark — a blue-black veil, 0..1 blend */
  private hushVeil!: Phaser.GameObjects.Rectangle;
  private hushAmbience = 0;
  /** ADR-0017 rung 3: the Green Terraces' warm daylit gold-green wash, 0..1 blend */
  private verdantVeil!: Phaser.GameObjects.Rectangle;
  private verdantAmbience = 0;
  private fireflies!: Phaser.GameObjects.Particles.ParticleEmitter;
  private leaves!: Phaser.GameObjects.Particles.ParticleEmitter;
  private lastFireflyAt = 0;
  private lastLeafAt = 0;
  /** every night-driven glow in the World: builders (structures, gates, wardens)
   *  push entries; the update loop breathes them by nightness */
  glows: { img: Phaser.GameObjects.Image; base: number; x: number; y: number }[] = [];
  // ---- faux-elevation (ADR-0009): each raised tile → its terrace level (1, 2, …)
  highGround = new Map<string, number>();
  vistaRegions: ElevationRegion[] = [];
  /** wired by GameScene after FogSystem is constructed (leaves gating reads it) */
  fog!: FogSystem;
  /** wired by GameScene right after DistrictSystem is constructed (veil targets read it) */
  district!: DistrictSystem;
  private onToggleMute = (): void => {
    this.muted = !this.muted;
    this.ctx.scene.sound.mute = this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    this.ctx.bus.emit('mute', this.muted);
  };
  private onSetVolume = (channel: AudioChannel, value: number): void => {
    this.volumes[channel] = Math.max(0, Math.min(1, value));
    localStorage.setItem(VOLUME_KEY, JSON.stringify(this.volumes));
    this.applyMusicVolumes();
  };

  constructor(
    private ctx: GameContext,
    private host: GameScene,
  ) {
    this.muted = localStorage.getItem(MUTE_KEY) === '1';
    this.volumes = loadVolumes();
  }

  create(): void {
    const scene = this.ctx.scene;
    scene.sound.mute = this.muted;

    const startAmbient = () => {
      if (scene.cache.audio.exists('ambient')) {
        this.ambientSound = scene.sound.add('ambient', {
          loop: true,
          volume: AMBIENT_BASE_VOLUME * this.volumes.ambience * this.volumes.master,
        });
        this.ambientSound.play();
      }
      // the waterfall bed loops silently and swells with proximity (see updateAudio())
      if (scene.cache.audio.exists('waterfall')) {
        this.waterfallSound = scene.sound.add('waterfall', { loop: true, volume: 0 }) as typeof this.waterfallSound;
        this.waterfallSound?.play();
      }
    };
    if (scene.sound.locked) scene.sound.once('unlocked', startAmbient);
    else startAmbient();

    // ---- atmosphere: day/night overlays, player glow, fireflies, leaves
    this.duskOverlay = scene.add.rectangle(0, 0, 10, 10, 0xff7b39).setAlpha(0).setDepth(899_998);
    this.nightOverlay = scene.add.rectangle(0, 0, 10, 10, 0x0a1433).setAlpha(0).setDepth(899_999);
    // the Sunken Mire's stagnant air (ADR-0017): a cold teal veil plus slow
    // mist banks, faded in while the Player stands inside that district.
    // Both sit UNDER the fog overlay so the unexplored dark stays black.
    this.mireVeil = scene.add.rectangle(0, 0, 10, 10, 0x0e2622).setAlpha(0).setDepth(899_985);
    // the Tide's rising-water sheen: a teal wash over the district that swells and
    // ebbs with the clock (ADR-0017 rung 1). Sits just over the stagnant veil.
    this.tideVeil = scene.add.rectangle(0, 0, 10, 10, 0x2f8f74).setAlpha(0).setDepth(899_986);
    // the Hushdark's cold, muffled dark (ADR-0017 rung 2): a deep blue-black veil
    // over the district, faded in on gate crossing exactly like the Mire's veil.
    this.hushVeil = scene.add.rectangle(0, 0, 10, 10, 0x0a1020).setAlpha(0).setDepth(899_985);
    // the Green Terraces' warm daylit wash (ADR-0017 rung 3): a soft gold-green tint
    // over the district — the opposite of the Hushdark's dark, faded in on gate crossing.
    this.verdantVeil = scene.add.rectangle(0, 0, 10, 10, 0x9ac46a).setAlpha(0).setDepth(899_985);
    for (let i = 0; i < 7; i++) {
      this.mirePuffs.push(
        scene.add
          .image(0, 0, 'glow')
          .setTint(0xa8c4b8)
          .setAlpha(0)
          .setDepth(899_986)
          .setScale(3.2 + (i % 3) * 1.7, 1.5 + (i % 2) * 0.8),
      );
    }
    // both ambient emitters stay parked at (0,0) forever and are fed with
    // emitParticleAt — moving a Phaser 3.60+ emitter drags every live
    // particle with it, which used to fill the night screen with fast dots
    this.fireflies = scene.add
      .particles(0, 0, 'glow', {
        scale: { start: 0.06, end: 0.015 },
        alpha: { start: 0.9, end: 0 },
        tint: 0xd8ff8a,
        blendMode: 'ADD',
        lifespan: 4200,
        speed: { min: 4, max: 16 },
        emitting: false,
      })
      .setDepth(895_000);
    this.leaves = scene.add
      .particles(0, 0, 'leaf', {
        angle: { min: 80, max: 100 },
        speed: { min: 18, max: 34 },
        rotate: { min: -180, max: 180 },
        alpha: { start: 0.9, end: 0.4 },
        lifespan: 6000,
        emitting: false,
      })
      .setDepth(894_000);

    this.buildElevation();
    this.buildWaterfall();

    this.ctx.bus.on('toggle-mute', this.onToggleMute);
    this.ctx.bus.on('set-volume', this.onSetVolume);
  }

  /** §8 step 4: overlays, veils (+ the Hushdark's echo-ambience call), glow pool, fireflies, leaves */
  update(time: number, delta: number): void {
    const ctx = this.ctx;
    const host = this.host;
    const cam = ctx.scene.cameras.main;
    const night = this.nightness();
    this.nightOverlay
      .setPosition(cam.midPoint.x, cam.midPoint.y)
      .setSize(cam.displayWidth + 8, cam.displayHeight + 8)
      .setAlpha(Math.pow(night, 1.6) * 0.5);
    this.duskOverlay
      .setPosition(cam.midPoint.x, cam.midPoint.y)
      .setSize(cam.displayWidth + 8, cam.displayHeight + 8)
      .setAlpha(Math.max(0, 1 - Math.abs(night - 0.5) * 4) * 0.12);
    // the Mire's stagnant air fades in over ~a second as the Player crosses
    // the gate (and back out again) — no hard cut on teleport
    const mireTarget = this.district.activeDistrict?.id === 'sunken_mire' ? 1 : 0;
    this.mireAmbience += (mireTarget - this.mireAmbience) * Math.min(1, delta / 450);
    if (this.mireAmbience > 0.005) {
      // the veil yields to the night overlay — stacked full-strength they
      // drown the bog in unreadable black
      this.mireVeil
        .setPosition(cam.midPoint.x, cam.midPoint.y)
        .setSize(cam.displayWidth + 8, cam.displayHeight + 8)
        .setAlpha(this.mireAmbience * 0.2 * (1 - Math.pow(night, 1.6) * 0.7));
      const v = cam.worldView;
      for (let i = 0; i < this.mirePuffs.length; i++) {
        const p = this.mirePuffs[i];
        const span = v.width + 260;
        const drift = (i * 197 + time * 0.011 * (1 + i * 0.17)) % span;
        p.setPosition(v.x - 130 + drift, v.y + ((i * 131 + Math.sin(time / 2400 + i * 1.7) * 26) % Math.max(1, v.height)));
        p.setAlpha(this.mireAmbience * (0.055 + 0.03 * Math.sin(time / 900 + i * 2.3)));
      }
      // the Tide's rising-water sheen swells with the clock (ADR-0017 rung 1):
      // faint at low ebb, a stronger teal wash at flood, fading in/out on gate
      // crossing exactly like the veil (mireAmbience) so teleport never hard-cuts
      const h = tideHeight(Date.now(), TIDE_PERIOD_MS);
      this.tideVeil
        .setPosition(cam.midPoint.x, cam.midPoint.y)
        .setSize(cam.displayWidth + 8, cam.displayHeight + 8)
        .setAlpha(this.mireAmbience * (0.05 + 0.20 * h) * (1 - Math.pow(night, 1.6) * 0.6));
    } else {
      this.mireVeil.setAlpha(0);
      this.tideVeil.setAlpha(0);
      for (const p of this.mirePuffs) p.setAlpha(0);
    }
    // ADR-0017 rung 2: the Hushdark's cold muffled dark — fades in over ~a second
    // on gate crossing, deepest where the night overlay hasn't already blacked it out
    const hushTarget = this.district.activeDistrict?.id === 'the_hushdark' ? 1 : 0;
    this.hushAmbience += (hushTarget - this.hushAmbience) * Math.min(1, delta / 450);
    this.hushVeil
      .setPosition(cam.midPoint.x, cam.midPoint.y)
      .setSize(cam.displayWidth + 8, cam.displayHeight + 8)
      .setAlpha(this.hushAmbience * 0.34 * (1 - Math.pow(night, 1.6) * 0.6));
    // the Echoes mechanic runs only inside the Hushdark (recording + shade replay + vaults)
    if (hushTarget || this.hushAmbience > 0.01) host.updateEchoes(time, delta);
    // ADR-0017 rung 3: the Green Terraces' warm daylit gold-green wash — fades in over
    // ~a second on gate crossing like the other veils, gentle by day and yielding to night
    const verdantTarget = this.district.activeDistrict?.id === 'green_terraces' ? 1 : 0;
    this.verdantAmbience += (verdantTarget - this.verdantAmbience) * Math.min(1, delta / 450);
    this.verdantVeil
      .setPosition(cam.midPoint.x, cam.midPoint.y)
      .setSize(cam.displayWidth + 8, cam.displayHeight + 8)
      .setAlpha(this.verdantAmbience * 0.14 * (1 - Math.pow(night, 1.6) * 0.8));
    for (let i = 0; i < this.glows.length; i++) {
      const g = this.glows[i];
      g.img.setAlpha(night * (g.base + 0.12 * Math.sin(time / 90 + i * 2.1)));
    }
    if (night > 0.5 && time - this.lastFireflyAt > 260) {
      this.lastFireflyAt = time;
      const v = cam.worldView;
      this.fireflies.emitParticleAt(v.x + Math.random() * v.width, v.y + Math.random() * v.height);
    }
    if (this.fog.leavesActive && time - this.lastLeafAt > 320) {
      this.lastLeafAt = time;
      const v = cam.worldView;
      this.leaves.emitParticleAt(v.x + Math.random() * v.width, v.y - 6);
    }
  }

  /**
   * §8 step 6: waterfall proximity bed — silent afar, swelling as the Player
   * nears the plunge pool. `prox²` keeps it faint at the edge and ramps up
   * close; the lerp smooths the crossing and any live mix change. `dt` seconds.
   */
  updateAudio(dt: number): void {
    if (!this.waterfallSound) return;
    const player = this.ctx.player;
    // nearest point on the falls' vertical line → a circular audible zone
    // around the whole column, so the sides are as loud as standing below it
    const wy = Phaser.Math.Clamp(player.y, this.waterfallSrc.yTop, this.waterfallSrc.yBottom);
    const wd = Phaser.Math.Distance.Between(player.x, player.y, this.waterfallSrc.x, wy);
    const prox = Phaser.Math.Clamp(
      (WATERFALL_FAR_RADIUS - wd) / (WATERFALL_FAR_RADIUS - WATERFALL_NEAR_RADIUS),
      0,
      1,
    );
    const target = prox * prox * WATERFALL_BASE_VOLUME * this.volumes.ambience * this.volumes.master;
    const cur = this.waterfallSound.volume;
    this.waterfallSound.setVolume(cur + (target - cur) * Math.min(1, dt * 4));
  }

  /** the Delve overlay hides the World: zero every overworld overlay/veil each frame */
  hideForDelve(): void {
    this.nightOverlay.setAlpha(0);
    this.duskOverlay.setAlpha(0);
    this.mireVeil.setAlpha(0);
    this.tideVeil.setAlpha(0);
    this.hushVeil.setAlpha(0);
    this.verdantVeil.setAlpha(0);
    for (const p of this.mirePuffs) p.setAlpha(0);
  }

  destroy(): void {
    this.ctx.bus.off('toggle-mute', this.onToggleMute);
    this.ctx.bus.off('set-volume', this.onSetVolume);
  }

  // ------------------------------------------------------------ audio helpers

  sfx(key: string, volume: number): void {
    const scene = this.ctx.scene;
    if (scene.cache.audio.exists(key)) {
      scene.sound.play(key, { volume: volume * this.volumes.sfx * this.volumes.master });
    }
  }

  /** push the current mix onto the two live looping beds (SFX read it per-play) */
  applyMusicVolumes(): void {
    const setVol = (s: Phaser.Sound.BaseSound | null, base: number, ch: AudioChannel) => {
      // BaseSound has no setVolume in its type; the concrete web/HTML5 sounds do
      (s as Phaser.Sound.WebAudioSound | null)?.setVolume?.(base * this.volumes[ch] * this.volumes.master);
    };
    setVol(this.ambientSound, AMBIENT_BASE_VOLUME, 'ambience');
    setVol(this.host.fightMusic, FIGHT_MUSIC_BASE_VOLUME, 'music');
  }

  /** 0 = noon, 1 = midnight — derived from the real clock, no tick state */
  nightness(): number {
    if (FORCE_NIGHT) return 1;
    const phase = (Date.now() % DAY_CYCLE_MS) / DAY_CYCLE_MS;
    return 1 - (0.5 + 0.5 * Math.cos(phase * Math.PI * 2));
  }

  // ------------------------------------------------------------ faux-elevation (ADR-0009)

  /**
   * The reusable elevation primitive (faux-3D, ADR-0009): for each raised region
   * draw a base shadow, tall drawn CLIFF FACES hung below every front-facing edge
   * (real height, not a flat band), and a landmark on the peak so occlusion sells
   * the raise; record the plateau tiles so entities on top get the depth bump.
   */
  private buildElevation(): void {
    const scene = this.ctx.scene;
    const world = this.ctx.world;
    const groundLayer = this.host.groundLayer;
    const regions = world.elevation?.regions ?? [];
    // pass 1: record each tile's terrace level (higher wins) and grass over the top
    for (const r of regions) {
      const lvl = r.level ?? 1;
      for (const [tx, ty] of r.plateau) {
        const key = `${tx},${ty}`;
        if (lvl > (this.highGround.get(key) ?? 0)) this.highGround.set(key, lvl);
        // a GRASSY terrace, not a stone court — this is what stops it reading as an
        // arena. Purely visual (walkability is unchanged); no map regen.
        const g = (tx * 7 + ty * 13) % 6;
        groundLayer.putTileAt(g === 0 ? 10 : g === 1 ? 11 : 1, tx, ty);
      }
    }
    const levelAt = (tx: number, ty: number) => this.highGround.get(`${tx},${ty}`) ?? 0;
    const maxLevel = regions.reduce((m, r) => Math.max(m, r.level ?? 1), 1);
    // pass 2: per terrace — base shadow, cliff faces on drops, summit stones, vista
    for (const r of regions) {
      const lvl = r.level ?? 1;
      const cx = (r.bounds.x + r.bounds.w / 2) * TILE;
      const cy = (r.bounds.y + r.bounds.h) * TILE;
      const shadow = scene.add.image(cx, cy + 2, 'shadow');
      shadow.setDisplaySize(r.bounds.w * TILE * 1.15, r.bounds.h * TILE * 0.7);
      shadow.setAlpha(0.34);
      shadow.setDepth(-4); // above the ground/decor layers, below world objects
      // tall cliff faces only where the south neighbour is walkable AND lower (a real
      // drop): the front edge of each terrace — never over its own top or a side wall
      for (const [tx, ty] of r.faces) {
        if (world.blocked[(ty + 1) * MAP_W + tx] === 2) continue; // south is cliff — no drop
        if (levelAt(tx, ty + 1) >= lvl) continue; // south is same/higher terrain — no drop
        this.drawCliffFace((tx + 0.5) * TILE, (ty + 1) * TILE);
      }
      // a ring of standing stones on the SUMMIT (highest terrace) — a highland cairn,
      // clearly decorative, not harvestable. The depth bump puts a Player up top
      // behind-and-above them, and that occlusion is what reads as height.
      if (lvl === maxLevel) {
        for (const [dx, dy] of [[0, 0], [-2, -1], [2, -1], [-1, 1], [1, 1]] as [number, number][]) {
          const stx = r.vista.tx + dx;
          const sty = r.vista.ty + dy;
          if (levelAt(stx, sty) < lvl) continue; // keep them on the summit top
          const sx = (stx + 0.5) * TILE;
          const sy = (sty + 1) * TILE;
          const mark = objImage(scene, sx, sy, 'ruin_pillar');
          if (mark) {
            mark.setScale(dx === 0 && dy === 0 ? 1 : 0.8);
            mark.setDepth(sy + lvl * ELEV_DEPTH_BONUS);
            addShadow(scene, sx, sy - 1, 13).setDepth(lvl * ELEV_DEPTH_BONUS + 1);
          }
        }
      }
      this.vistaRegions.push(r);
    }
  }

  /** a tall drawn cliff face hung DOWN from a raised edge at screen-y `topY`;
   *  sorts at the drop line so anything to its south (in front) draws over it */
  private drawCliffFace(px: number, topY: number): void {
    const face = this.ctx.scene.add.image(px, topY, 'cliff_face');
    face.setOrigin(0.5, 0);
    face.setDepth(topY);
  }

  /**
   * The northern cliff range gets drawn faces; the Thundering Falls itself is a
   * side-on animated waterfall (user-supplied `user-falls.png`, frames 0-3). The
   * source river above the crest is painted over with the band's stone tile so the
   * falls appear to burst straight out of the cliff, then two scaled columns of the
   * animation fill the drop from the lip down to the plunge pool, with rising mist.
   * NOTE: the falls sheet's provenance is unconfirmed — see assetConfig / CREDITS.md.
   */
  private buildWaterfall(): void {
    const scene = this.ctx.scene;
    const world = this.ctx.world;
    const groundLayer = this.host.groundLayer;
    const band = 6;
    const cliffBottomY = band * TILE;
    // the authored water column (generate-map fillRect 96,0,9,22): the waterfall
    // ART covers this stretch, so skip the procedural cliff faces across it (+margin)
    const colX0 = 96;
    const colW = 9;
    const midX = (colX0 + colW / 2) * TILE;
    const skipLo = colX0 - 3;
    const skipHi = colX0 + colW + 3;
    for (let tx = 0; tx < MAP_W; tx++) {
      if (tx >= skipLo && tx < skipHi) continue; // the waterfall art frames this stretch
      const above = world.blocked[(band - 1) * MAP_W + tx];
      const at = world.blocked[band * MAP_W + tx];
      if (above === 2 && at !== 2) this.drawCliffFace((tx + 0.5) * TILE, cliffBottomY);
    }
    // the source river above the crest is hidden: paint the band's stone tile
    // (index 6) over the water column so the falls burst straight out of the cliff.
    for (let ty = 0; ty < band; ty++) {
      for (let tx = colX0; tx < colX0 + colW; tx++) {
        groundLayer.putTileAt(6, tx, ty)?.setCollision(true);
      }
    }
    // the falls: the user-supplied side-on animation (user-falls.png). The sheet
    // is a 6×2 grid of 96×193 cells; frames 0-3 are the four phases of a full
    // crest→pool drop. Two columns, scaled to fill the 9-wide water column from
    // the cliff lip down to the plunge pool (~ty24).
    const T2 = TILE * 2; // the drop reaches the pool in `rows` two-tile steps
    const rows = 9;
    const dropTop = band * TILE; // crest at the cliff lip
    const dropBottom = dropTop + rows * T2; // reaches the plunge pool
    if (!scene.anims.exists('waterfall')) {
      scene.anims.create({ key: 'waterfall', frames: scene.anims.generateFrameNumbers('waterfall_anim', { frames: [0, 1, 2, 3] }), frameRate: 8, repeat: -1 });
    }
    for (const [i, dx] of [-36, 36].entries()) {
      const sp = scene.add.sprite(midX + dx, (dropTop + dropBottom) / 2, 'waterfall_anim', 0);
      sp.setDisplaySize(108, dropBottom - dropTop);
      sp.setDepth(dropBottom - 14); // over terrain, under entities near the pool
      sp.play({ key: 'waterfall', startFrame: (i * 2) % 4 }); // stagger the two columns
    }
    // rising mist at the plunge pool
    scene.add
      .particles(midX, band * TILE + rows * T2 - T2, 'glow', {
        tint: 0xdff2ff, blendMode: 'ADD', scale: { start: 0.14, end: 0 }, alpha: { start: 0.4, end: 0 },
        speed: { min: 8, max: 26 }, angle: { min: 245, max: 295 }, lifespan: 900, frequency: 80, quantity: 1,
      })
      .setDepth(band * TILE + rows * T2 + 1);
    // the falls span a tall column (crest → pool); the bed measures distance to
    // this vertical line, so it's heard equally from any side — not just below.
    this.waterfallSrc = { x: midX, yTop: dropTop, yBottom: dropBottom };
  }

  /** depth added to an entity on a raised terrace — level × bonus (0 at the base),
   *  so a Player on the summit sorts above one on the terrace above one at the base */
  elevationBonus(x: number, y: number): number {
    if (this.highGround.size === 0) return 0;
    const tx = Math.floor(x / TILE);
    const ty = Math.floor((y - 4) / TILE);
    return (this.highGround.get(`${tx},${ty}`) ?? 0) * ELEV_DEPTH_BONUS;
  }
}
