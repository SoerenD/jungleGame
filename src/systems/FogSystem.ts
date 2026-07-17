/**
 * FogSystem (ADR-0018 #13): per-Player fog of war (RenderTexture + persisted
 * explored chunks), the vista fog-lift (ADR-0009), the world-label scale, and
 * the movement-cadence `checkZone()` HUB — zone banner, camera-region derive,
 * minimap pos stream, proximity panels (Seal/Warden/Village/Forge), fog reveal,
 * vista check and contextual hints all fan out from its 300 ms tick.
 *
 * Transitional: concerns not yet extracted (District camera, Seal/Fight altar
 * positions, Village, structures, hints) are reached through the `host` ref and
 * migrate to system refs as those extractions land.
 */
import Phaser from 'phaser';
import { FOG_CHUNK, FOG_REVEAL_RADIUS, LEGACY_FOG_STRIDE, MAP_H, MAP_W, TILE, ZOOM, loadWorldLabelScale } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { t, zoneName } from '../i18n';
import type { AtmosphereSystem } from './AtmosphereSystem';
import type { GameContext } from './context';
import type { SealSystem } from './SealSystem';
import type { VillageSystem } from './VillageSystem';
import type { ElevationRegion, GameSystem } from './types';

/**
 * Design size for in-world name tags (Node hover tooltips + Player name plates):
 * world-space text is magnified by the camera ZOOM, so this scales it back down
 * to a small tag over the head. The Settings ▸ Name label size slider multiplies
 * this (see `worldLabelScale`), and `labelScale()` counter-scales by the live
 * zoom so a tag stays the SAME readable size on screen at every zoom level.
 */
const WORLD_LABEL_BASE_SCALE = 0.4;

export class FogSystem implements GameSystem {
  private fogRT!: Phaser.GameObjects.RenderTexture;
  private explored = new Set<number>();
  readonly fogChunksW = Math.ceil(MAP_W / FOG_CHUNK);
  readonly fogChunksH = Math.ceil(MAP_H / FOG_CHUNK);
  private vistaLifted = new Set<string>();
  /** player-set multiplier on WORLD_LABEL_BASE_SCALE (Settings ▸ Name label size) */
  private worldLabelScale = loadWorldLabelScale();
  /** the Zone the Player currently stands in (English id; '' until the first tick) */
  currentZone = '';
  /** falling leaves are active in the grove zones — read by the atmosphere block */
  leavesActive = false;
  /** standing beside a Forge: gates crafting the heavy forged gear (read by the craft handler) */
  nearForge = false;
  private nearMonument = false;
  private nearMireAltar = false;
  private nearEchoAltar = false;
  private nearVerdantAltar = false;
  private nearHall = false;
  private zoneTimer: Phaser.Time.TimerEvent | null = null;
  private onLabelScale = (mult: number): void => {
    this.worldLabelScale = mult;
    this.applyWorldLabelScale();
  };

  /** cross-system refs, wired by GameScene right after construction (ADR-0018 §3) */
  seal!: SealSystem;
  village!: VillageSystem;

  constructor(
    private ctx: GameContext,
    private host: GameScene,
    private atmosphere: AtmosphereSystem,
  ) {}

  create(): void {
    this.initFog();
    this.ctx.bus.on('world-label-scale', this.onLabelScale);
    // zone tracking — timestamp-derived, no game tick (the original 300 ms cadence)
    this.zoneTimer = this.ctx.scene.time.addEvent({ delay: 300, loop: true, callback: () => this.checkZone() });
  }

  update(): void {
    // fog/zone work is movement-cadence (the 300 ms timer), not per-frame
  }

  destroy(): void {
    this.ctx.bus.off('world-label-scale', this.onLabelScale);
    this.zoneTimer?.remove();
    this.zoneTimer = null;
  }

  // ------------------------------------------------------------ fog of war

  /**
   * The fog overlay: one RenderTexture pixel per tile, scaled up to cover
   * the World, sitting above every world sprite. Explored chunks are erased
   * with a feathered brush so the frontier fades instead of snapping.
   */
  private initFog(): void {
    const scene = this.ctx.scene;
    this.fogRT = scene.add.renderTexture(0, 0, MAP_W, MAP_H);
    this.fogRT.setOrigin(0, 0);
    this.fogRT.setScale(TILE);
    this.fogRT.setDepth(899_990);
    this.fogRT.fill(0x06120a, 0.96);
    this.fogRT.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    // Explored-chunk indices encode the fog stride (fogChunksW = ceil(MAP_W/4)).
    // Map growth re-strides them (200→300→384): an index saved under the old
    // row-width decodes to a shifted chunk under the new one — the "venetian-
    // blind" stripes on relog. FIX: remap each stored index from its SAVE stride
    // (persisted as exploredStride; a legacy save has none → assume the last
    // pre-Realm stride) to the CURRENT stride. Pinned growth keeps every chunk's
    // (cx,cy), so the remap is lossless — the reveal lands exactly where it was.
    const savedStride = this.ctx.me.exploredStride ?? LEGACY_FOG_STRIDE;
    for (const c of this.ctx.me.explored) {
      if (c < 0) continue;
      const cx = c % savedStride;
      const cy = Math.floor(c / savedStride);
      if (cx >= this.fogChunksW || cy >= this.fogChunksH) continue; // per-axis guard
      this.explored.add(cy * this.fogChunksW + cx); // re-encode at the current stride
    }
    for (const c of this.explored) this.eraseFogChunk(c);
    this.ctx.bus.emit('fog', this.explored, this.fogChunksW, this.fogChunksH);
    this.updateFog();
  }

  private eraseFogChunk(idx: number): void {
    const cx = idx % this.fogChunksW;
    const cy = Math.floor(idx / this.fogChunksW);
    // the 24-tile brush centered on the chunk; overlapping erases keep the
    // interior fully clear while the frontier stays feathered
    this.fogRT.erase('fog-brush', (cx + 0.5) * FOG_CHUNK - 12, (cy + 0.5) * FOG_CHUNK - 12);
  }

  /** reveal chunks around the Player; new ones persist through the Backend */
  private updateFog(): void {
    const player = this.ctx.player;
    const pcx = Math.floor(player.x / TILE / FOG_CHUNK);
    const pcy = Math.floor(player.y / TILE / FOG_CHUNK);
    const r = FOG_REVEAL_RADIUS;
    const fresh: number[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + 1) continue;
        const cx = pcx + dx;
        const cy = pcy + dy;
        if (cx < 0 || cy < 0 || cx >= this.fogChunksW || cy >= this.fogChunksH) continue;
        const idx = cy * this.fogChunksW + cx;
        if (this.explored.has(idx)) continue;
        this.explored.add(idx);
        this.eraseFogChunk(idx);
        fresh.push(idx);
      }
    }
    if (fresh.length) {
      void this.ctx.backend.markExplored(fresh, this.fogChunksW);
      this.ctx.bus.emit('fog', this.explored, this.fogChunksW, this.fogChunksH);
    }
  }

  // ------------------------------------------------------------ vista lift (ADR-0009)

  /** reaching a plateau top lifts fog-of-war around its vista, once (ADR-0009) */
  private checkVista(): void {
    if (this.atmosphere.vistaRegions.length === 0) return;
    const player = this.ctx.player;
    const ptx = Math.floor(player.x / TILE);
    const pty = Math.floor((player.y - 4) / TILE);
    const here = this.atmosphere.highGround.get(`${ptx},${pty}`) ?? 0;
    for (const r of this.atmosphere.vistaRegions) {
      if (this.vistaLifted.has(r.name)) continue;
      if (here < (r.level ?? 1)) continue; // must be up on THIS terrace (or higher)
      this.vistaLifted.add(r.name);
      this.liftVistaFog(r);
      this.ctx.bus.emit('toast', t.toast.vistaRevealed(zoneName(r.name)), 'good');
      this.ctx.sfx('blip', 0.5);
    }
  }

  private liftVistaFog(r: ElevationRegion): void {
    const cx = Math.floor(r.vista.tx / FOG_CHUNK);
    const cy = Math.floor(r.vista.ty / FOG_CHUNK);
    const rad = r.vistaChunkRadius;
    const fresh: number[] = [];
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy > rad * rad + 1) continue;
        const ccx = cx + dx;
        const ccy = cy + dy;
        if (ccx < 0 || ccy < 0 || ccx >= this.fogChunksW || ccy >= this.fogChunksH) continue;
        const idx = ccy * this.fogChunksW + ccx;
        if (this.explored.has(idx)) continue;
        this.explored.add(idx);
        this.eraseFogChunk(idx);
        fresh.push(idx);
      }
    }
    if (fresh.length) {
      void this.ctx.backend.markExplored(fresh, this.fogChunksW);
      this.ctx.bus.emit('fog', this.explored, this.fogChunksW, this.fogChunksH);
    }
  }

  // ------------------------------------------------------------ world labels

  /**
   * On-screen scale for an in-world name tag. World-space text is magnified by
   * the camera zoom, so a fixed scale shrinks to nothing when zoomed out (2×)
   * and balloons when zoomed in (5×). Counter-scaling by `ZOOM / cam.zoom` keeps
   * every tag the SAME readable size on screen at every zoom level — referenced
   * to the default ZOOM so it looks unchanged at the starting zoom. × the
   * player's Name-label-size setting.
   */
  labelScale(): number {
    return (WORLD_LABEL_BASE_SCALE * this.worldLabelScale * ZOOM) / this.ctx.scene.cameras.main.zoom;
  }

  /** re-apply `labelScale()` to every live name tag (after a zoom or setting change) */
  applyWorldLabelScale(): void {
    const s = this.labelScale();
    this.host.nodeHoverLabel?.setScale(s);
    for (const r of this.host.remotes.values()) r.label.setScale(s);
  }

  // ------------------------------------------------------------ the checkZone hub

  checkZone(): void {
    const host = this.host;
    const ctx = this.ctx;
    const player = ctx.player;
    if (host.inDelve) return; // the Delve owns the zone banner while you're inside
    // ADR-0017: positional region derivation — camera clamp per district/World
    host.applyCameraRegion();
    // the minimap 'pos' stream: dots filter BOTH ways by district (a Player in
    // the World never sees Realm dots and vice versa; same-district Players see
    // each other), and the active district rect crops the minimap's view
    const here = host.activeDistrict;
    ctx.bus.emit('pos', {
      x: player.x,
      y: player.y,
      others: [...host.remotes.values()]
        .filter((r) => host.districtOf(Math.floor(r.sprite.x / TILE), Math.floor(r.sprite.y / TILE)) === here)
        .map((r) => ({ x: r.sprite.x, y: r.sprite.y })),
      view: here ? here.rect : undefined,
    });
    const tx = player.x / TILE;
    const ty = player.y / TILE;
    let zone = 'Deep Jungle';
    for (const z of ctx.world.zones) {
      if (tx >= z.x && tx < z.x + z.w && ty >= z.y && ty < z.y + z.h) {
        zone = z.name;
        break;
      }
    }
    if (zone !== this.currentZone) {
      this.currentZone = zone;
      ctx.bus.emit('zone', zone);
    }
    this.leavesActive = zone === 'Dense Grove' || zone === 'Hidden Grove' || zone === 'Deep Jungle';
    // the Seal monument shows its progress on approach
    const nearMon =
      Phaser.Math.Distance.Between(player.x, player.y, this.seal.monumentPos.x, this.seal.monumentPos.y) < TILE * 6;
    if (nearMon !== this.nearMonument) {
      this.nearMonument = nearMon;
      ctx.bus.emit('seal-near', nearMon);
      if (nearMon) host.tickJourney('visit_seal');
    }
    // ADR-0017 rung 1: near the Mire Warden's altar its Offering-bars panel shows
    // (the real authored altar on the Mangrove Coast — no dev flag)
    const nearWarden =
      !!ctx.world.wardenArenas?.mire &&
      Phaser.Math.Distance.Between(player.x, player.y, host.mireAltarPos.x, host.mireAltarPos.y) < TILE * 6;
    if (nearWarden !== this.nearMireAltar) {
      this.nearMireAltar = nearWarden;
      ctx.bus.emit('warden-altar-near', nearWarden ? 'mire' : null);
    }
    // ADR-0017 rung 2: the Echo Warden's altar Offering-bars panel in The Cavern Mouth
    const nearEcho =
      !!ctx.world.wardenArenas?.echo &&
      Phaser.Math.Distance.Between(player.x, player.y, host.echoAltarPos.x, host.echoAltarPos.y) < TILE * 6;
    if (nearEcho !== this.nearEchoAltar) {
      this.nearEchoAltar = nearEcho;
      ctx.bus.emit('warden-altar-near', nearEcho ? 'echo' : null);
    }
    // ADR-0017 rung 3: the Verdant Warden's altar Offering-bars panel in the Green Terraces
    const nearVerdant =
      !!ctx.world.wardenArenas?.verdant &&
      Phaser.Math.Distance.Between(player.x, player.y, host.verdantAltarPos.x, host.verdantAltarPos.y) < TILE * 6;
    if (nearVerdant !== this.nearVerdantAltar) {
      this.nearVerdantAltar = nearVerdant;
      ctx.bus.emit('warden-altar-near', nearVerdant ? 'verdant' : null);
    }
    // the Village Hall shows the tier/pool panel on approach (ADR-0010)
    const hall = this.village.village.hall;
    const nearHall =
      !!hall &&
      Phaser.Math.Distance.Between(player.x, player.y, (hall.tx + 1) * TILE, (hall.ty + 1) * TILE) < TILE * 7;
    if (nearHall !== this.nearHall) {
      this.nearHall = nearHall;
      ctx.bus.emit('village-near', nearHall);
    }
    // beside a Forge, the heavy forged Tools/weapons become craftable (the craft
    // menu re-renders on this flag); a tight 3×3 like cooking at a campfire
    const nearForge = !!host.nearbyStructure(['forge']);
    if (nearForge !== this.nearForge) {
      this.nearForge = nearForge;
      ctx.bus.emit('forge-near', nearForge);
    }
    this.updateFog();
    this.checkVista();
    host.updateHints();
  }
}
