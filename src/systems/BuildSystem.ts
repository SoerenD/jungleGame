/**
 * BuildSystem (ADR-0018 #4): Structures — place-mode + footprint ghost with
 * per-tile validity cells, the forgiving anchor snap, drag-to-place, the
 * server-ordered add/remove of structure views (sprites, collision, glows,
 * signpost text, sawmill blade seat), and X-dismantle with the second-press
 * confirm. update() is the §8 step-16 ghost refresh. Owns the structurePlaced/
 * structureRemoved backend listeners and the request-place bus handler.
 */
import Phaser from 'phaser';
import type { Structure } from '../backend/types';
import { MAP_H, MAP_W, TILE } from '../config';
import { footprint, isBuilding, ITEMS, type ItemId, type StructureId } from '../content/items';
import { NODE_TYPES } from '../content/nodeTypes';
import { VILLAGE_MAX_TIER } from '../content/village';
import type { GameScene } from '../scenes/GameScene';
import { t } from '../i18n';
import type { AtmosphereSystem } from './AtmosphereSystem';
import type { GameContext } from './context';
import type { HarvestSystem } from './HarvestSystem';
import type { ProgressionSystem } from './ProgressionSystem';
import { addBlockerBody, addShadow, objImage } from './sceneFx';
import { REFINER_FX_SPEC, type StationsSystem } from './StationsSystem';
import type { GameSystem } from './types';
import type { VillageSystem } from './VillageSystem';

export class BuildSystem implements GameSystem {
  structuresByTile = new Map<string, Structure>();
  private structureIds = new Set<string>();
  /** per-structure display + collision objects, kept so a dismantle can tear them down */
  private structureViews = new Map<string, { objects: Phaser.GameObjects.GameObject[]; bodies: Phaser.GameObjects.Rectangle[]; glowImg: Phaser.GameObjects.Image | null }>();
  placing: StructureId | null = null;
  private ghost: Phaser.GameObjects.Image | null = null;
  /** per-tile green/red footprint overlay while placing — shows WHICH tile blocks */
  private ghostCells: Phaser.GameObjects.Graphics | null = null;
  /** id of a Building someone else placed, armed for a confirming second X-press */
  private dismantleArmed: { id: string; until: number } | null = null;
  /** cross-system refs, wired by GameScene (ADR-0018 §3) */
  village!: VillageSystem;
  atmosphere!: AtmosphereSystem;
  stations!: StationsSystem;
  progression!: ProgressionSystem;
  harvest!: HarvestSystem;
  private onRequestPlace = (item: StructureId): void => this.enterPlaceMode(item);
  private onStructurePlaced = (s: Structure): void => {
    this.addStructure(s);
    // guarded like addStructure: an old client can still place a retired type
    // (hammock/table/obsidian_path) during a rollout window
    if (s.placedBy !== this.ctx.me.name) this.ctx.bus.emit('toast', t.builtBy(s.placedBy, ITEMS[s.type]?.name ?? s.type), 'info');
    if (s.type === 'sawmill') this.stations.emitSawmillBuilt();
  };
  private onStructureRemoved = (id: string): void => {
    this.removeStructure(id);
    this.stations.emitSawmillBuilt(); // the last Sawmill may have just come down
  };

  constructor(
    private ctx: GameContext,
    private host: GameScene,
  ) {}

  create(): void {
    this.ctx.bus.on('request-place', this.onRequestPlace);
    this.ctx.backend.on('structurePlaced', this.onStructurePlaced);
    this.ctx.backend.on('structureRemoved', this.onStructureRemoved);
    this.wireDragPlace();
  }

  /** §8 step 16: the placement ghost — centred over the whole footprint (ADR-0008).
   *  Uses bestAnchorNear so the preview shows the SAME spot confirmPlace will use,
   *  including a snap to the nearest valid footprint for Buildings. */
  update(_time?: number, _dt?: number): void {
    if (!(this.placing && this.ghost)) return;
    const { tx, ty } = this.bestAnchorNear(this.placing);
    const { w, h } = footprint(this.placing);
    this.ghost.setPosition((tx + w / 2) * TILE, (ty + h) * TILE);
    this.ghost.setTint(this.canPlaceLocal(this.placing, tx, ty) ? 0x88ff88 : 0xff6666);
    // per-tile overlay: paint each footprint cell green (clear) or red (blocked)
    // so the exact bush/tile that refuses the build is visible, not just a hunch
    if (this.ghostCells) {
      this.ghostCells.clear();
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const clear = this.tileBlockReason(this.placing, tx + dx, ty + dy) === null;
          this.ghostCells.fillStyle(clear ? 0x33dd55 : 0xdd3333, 0.35);
          this.ghostCells.lineStyle(1, clear ? 0x33dd55 : 0xdd3333, 0.9);
          const px = (tx + dx) * TILE;
          const py = (ty + dy) * TILE;
          this.ghostCells.fillRect(px, py, TILE, TILE);
          this.ghostCells.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
        }
      }
    }
  }

  destroy(): void {
    this.ctx.bus.off('request-place', this.onRequestPlace);
    this.ctx.backend.off('structurePlaced', this.onStructurePlaced);
    this.ctx.backend.off('structureRemoved', this.onStructureRemoved);
  }

  // ------------------------------------------------------------ structures

  /** the first structure of one of `types` on the 3x3 of tiles around the Player */
  nearbyStructure(types: StructureId[]): Structure | null {
    const player = this.ctx.player;
    const ptx = Math.floor(player.x / TILE);
    const pty = Math.floor((player.y - 4) / TILE);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const s = this.structuresByTile.get(`${ptx + dx},${pty + dy}`);
        if (s && types.includes(s.type)) return s;
      }
    }
    return null;
  }

  addStructure(s: Structure): void {
    if (this.structureIds.has(s.id)) return;
    this.structureIds.add(s.id);
    const scene = this.ctx.scene;
    // ADR-0008 footprint: a Building spans w×h tiles anchored at (tx,ty) toward
    // +x/+y; a Prop is 1×1. RESERVE those tiles first, unconditionally — even a
    // type we can no longer render (the retired fence/hut_wall) still claims its
    // tiles on the server (structure_tiles). Skipping the reservation makes the
    // client think that ground is free: the ghost shows green and the snap aims
    // there, but the server rejects it (OCCUPIED). Reserve, then render.
    const { w, h } = footprint(s.type);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) this.structuresByTile.set(`${s.tx + dx},${s.ty + dy}`, s);
    }
    // only a known type gets sprites/collision/glow; an unknown one is
    // reserved-but-invisible (future-proofs removals without crashing).
    const def = ITEMS[s.type];
    if (!def) return;
    const key =
      s.type === 'village_hall'
        ? `st_village_hall_${Math.max(1, Math.min(VILLAGE_MAX_TIER, this.village.village.tier))}`
        : `st_${s.type}`;
    const x = (s.tx + w / 2) * TILE;
    const baseY = (s.ty + h) * TILE;
    const img = objImage(scene, x, baseY, key);
    if (!img) {
      // no art loaded, but the claim still stands — record an empty view so the
      // footprint frees correctly on dismantle
      this.structureViews.set(s.id, { objects: [], bodies: [], glowImg: null });
      return;
    }
    const objects: Phaser.GameObjects.GameObject[] = [img];
    if (s.type === 'village_hall') this.village.hallImg = img;
    const bodies: Phaser.GameObjects.Rectangle[] = [];
    let glowImg: Phaser.GameObjects.Image | null = null;
    if (s.type === 'bridge') {
      img.setDepth(-2); // floor
    } else {
      img.setDepth(baseY);
    }
    // the signpost's line is rendered in-world, readable by everyone
    if (s.type === 'signpost' && s.text?.trim()) {
      const label = scene.add.text(x, baseY - 16, s.text, {
        fontSize: '7px',
        color: '#ffe9c9',
        stroke: '#3a2a18',
        strokeThickness: 2,
      });
      label.setOrigin(0.5, 1);
      label.setResolution(6);
      // ~1/3 the previous on-screen size — a small readable line, not a banner
      label.setScale(0.34);
      label.setDepth(baseY + 1);
      objects.push(label);
    }
    if (def.blocks) {
      // collision spans every footprint tile
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) bodies.push(addBlockerBody(scene, this.host.blockersGroup, s.tx + dx, s.ty + dy));
      }
      objects.push(addShadow(scene, x, baseY - 1, Math.max(15, w * TILE - 2)));
    }
    if (s.type === 'bridge') {
      this.host.groundLayer.getTileAt(s.tx, s.ty)?.setCollision(false, false, false, false);
    }
    // light sources glow at night — the brazier burns bigger than any torch
    const glowDef = {
      campfire: { scale: 2.0, base: 0.7 },
      torch: { scale: 1.4, base: 0.6 },
      golden_idol: { scale: 1.6, base: 0.5 },
      brazier: { scale: 2.8, base: 0.8 },
      forge: { scale: 2.2, base: 0.7 }, // the furnace mouth burns warm into the night
    }[s.type as string];
    if (glowDef) {
      glowImg = scene.add
        .image(x, baseY - 8, 'glow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(s.type === 'golden_idol' ? 0xffe27a : 0xffab52)
        .setScale(glowDef.scale)
        .setAlpha(0)
        .setDepth(890_001);
      this.atmosphere.glows.push({ img: glowImg, base: glowDef.base, x, y: baseY });
    }
    this.structureViews.set(s.id, { objects, bodies, glowImg });
    // v3: a working Sawmill spins a saw blade. Seat it near the top-centre of the
    // mill sprite, above it in depth, hidden until the mill is milling (StationsSystem.update).
    if (s.type === 'sawmill') {
      const by = baseY - TILE * 1.15;
      const blade = scene.add.image(x, by, 'sawblade').setDepth(baseY + 1).setVisible(false);
      objects.push(blade);
      this.stations.sawmillBlades.set(s.id, { blade, x, y: by, baseY, nextPuff: 0 });
    }
    // ADR-0017 §6: a working Refiner (Brine/Chime Kiln, Verdant Loom) runs a
    // three-effect animation. Seat the additive mouth glow over its furnace mouth
    // here — hidden until refining; StationsSystem.update drives all three effects.
    const fxSpec = REFINER_FX_SPEC[s.type];
    if (fxSpec) {
      const glow = scene.add
        .image(x, baseY - 16, 'glow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(fxSpec.glow)
        .setScale(1.3)
        .setAlpha(0)
        .setDepth(890_001);
      objects.push(glow);
      this.stations.refinerFx.set(s.id, { glow, x, baseY, spec: fxSpec, nextWisp: 0, nextSpark: 0 });
    }
  }

  /**
   * Tear down a dismantled Structure locally (server-ordered via the
   * `structureRemoved` event, ADR-0008): destroy its sprites + collision bodies
   * and free every footprint tile it claimed.
   */
  removeStructure(id: string): void {
    if (!this.structureIds.has(id)) return;
    // find the Structure record (any of its footprint tiles points to it)
    let s: Structure | null = null;
    for (const st of this.structuresByTile.values()) {
      if (st.id === id) { s = st; break; }
    }
    const view = this.structureViews.get(id);
    if (view) {
      for (const o of view.objects) o.destroy();
      for (const b of view.bodies) b.destroy();
      if (view.glowImg) this.atmosphere.glows = this.atmosphere.glows.filter((g) => g.img !== view.glowImg);
      this.structureViews.delete(id);
    }
    // the blade + refiner-glow sprites are destroyed with view.objects above; drop
    // their bookkeeping (a dismantle can hit a Sawmill or any Refiner)
    this.stations.sawmillBlades.delete(id);
    this.stations.sawmillMillingUntil.delete(id);
    this.stations.refinerFx.delete(id);
    this.stations.refinerBusyUntil.delete(id);
    if (s) {
      const { w, h } = footprint(s.type);
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const k = `${s.tx + dx},${s.ty + dy}`;
          if (this.structuresByTile.get(k)?.id === id) this.structuresByTile.delete(k);
        }
      }
      // a dismantled bridge restores the water tile's collision underfoot
      if (s.type === 'bridge') this.host.groundLayer.getTileAt(s.tx, s.ty)?.setCollision(true, true, true, true);
    }
    this.structureIds.delete(id);
  }

  // ------------------------------------------------------------ placement

  enterPlaceMode(item: StructureId): void {
    if (this.host.inDelve) return; // no building inside the ephemeral Delve
    if ((this.ctx.inventory[item] ?? 0) <= 0) return;
    if (item === 'village_hall' && !this.village.canFoundHall()) return; // only one Hall stands at a time (ADR-0010)
    this.placing = item;
    this.ghost?.destroy();
    this.ghost = objImage(this.ctx.scene, 0, 0, `st_${item}`);
    this.ghost?.setAlpha(0.6).setDepth(99999);
    this.ghostCells?.destroy();
    this.ghostCells = this.ctx.scene.add.graphics().setDepth(99998);
    this.ctx.bus.emit('place-mode', true);
    this.ctx.bus.emit('toast', t.toast.placing(ITEMS[item].name), 'info');
  }

  exitPlaceMode(): void {
    this.placing = null;
    this.ghost?.destroy();
    this.ghost = null;
    this.ghostCells?.destroy();
    this.ghostCells = null;
    this.ctx.bus.emit('place-mode', false);
  }

  /**
   * Top-left placement anchor for `item`, positioned so the whole footprint
   * sits DIRECTLY AHEAD of the Player in the faced direction — adjacent to the
   * Player, centred on the perpendicular axis, never on the Player's own tile.
   * The stored footprint still anchors top-left and grows +x/+y (ADR-0008);
   * this only decides WHERE that top-left lands. A 1×1 Prop reduces to the
   * single tile the Player faces (unchanged from the old facingTile flow).
   */
  private footprintAnchor(item: StructureId): { tx: number; ty: number } {
    const player = this.ctx.player;
    const px = Math.floor(player.x / TILE);
    const py = Math.floor((player.y - 4) / TILE);
    const { w, h } = footprint(item);
    const offX = Math.floor((w - 1) / 2); // centre the width across the Player when facing up/down
    const offY = Math.floor((h - 1) / 2); // centre the height when facing left/right
    switch (this.ctx.held.lastDir) {
      case 'up':    return { tx: px - offX, ty: py - h };
      case 'down':  return { tx: px - offX, ty: py + 1 };
      case 'left':  return { tx: px - w,    ty: py - offY };
      case 'right': return { tx: px + 1,    ty: py - offY };
      default:      return { tx: px - offX, ty: py + 1 };
    }
  }

  /**
   * Forgiving placement anchor: start from where the Player is aiming
   * (footprintAnchor); if that footprint is blocked, snap to the NEAREST valid
   * footprint within a small radius so a Building "just works" near clutter or
   * a shoreline instead of demanding pixel-perfect aim. Only Buildings snap —
   * a 1×1 Prop stays exactly on the faced tile (precise decor placement).
   * `snapped` lets the ghost show it moved.
   */
  private bestAnchorNear(item: StructureId): { tx: number; ty: number; snapped: boolean } {
    const base = this.footprintAnchor(item);
    if (!isBuilding(item) || this.canPlaceLocal(item, base.tx, base.ty)) {
      return { ...base, snapped: false };
    }
    const R = 3; // a few tiles — stays within the Player's reach
    let best: { tx: number; ty: number } | null = null;
    let bestD = Infinity;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx === 0 && dy === 0) continue;
        const tx = base.tx + dx;
        const ty = base.ty + dy;
        if (!this.canPlaceLocal(item, tx, ty)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = { tx, ty }; }
      }
    }
    return best ? { ...best, snapped: true } : { ...base, snapped: false };
  }

  /**
   * Why a single tile refuses `item`, or null if it's clear. Shared by the
   * whole-footprint check and the per-tile placement overlay so the ghost's
   * red cells always match what the server would reject.
   */
  private tileBlockReason(item: StructureId, fx: number, fy: number): 'oob' | 'structure' | 'node' | 'terrain' | null {
    if (fx < 0 || fy < 0 || fx >= MAP_W || fy >= MAP_H) return 'oob';
    if (this.structuresByTile.has(`${fx},${fy}`)) return 'structure';
    if (this.harvest.nodesByTile.has(`${fx},${fy}`)) return 'node';
    const b = this.ctx.world.blocked[fy * MAP_W + fx];
    const onWater = !!ITEMS[item].onWater;
    if (onWater ? b !== 1 : b !== 0) return 'terrain';
    return null;
  }

  canPlaceLocal(item: StructureId, tx: number, ty: number): boolean {
    // ADR-0008: a Building claims its whole footprint — EVERY tile must be free,
    // in-bounds, and the right terrain, or the placement is refused (first on the
    // footprint wins). A 1×1 Prop reduces to the old single-tile check.
    const { w, h } = footprint(item);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (this.tileBlockReason(item, tx + dx, ty + dy) !== null) return false;
      }
    }
    return true;
  }

  /** the type name of the first Resource Node inside `item`'s footprint at (tx,ty), or null */
  private blockingNodeName(item: StructureId, tx: number, ty: number): string | null {
    const { w, h } = footprint(item);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const id = this.harvest.nodesByTile.get(`${tx + dx},${ty + dy}`);
        const view = id ? this.harvest.nodes.get(id) : undefined;
        if (view) return NODE_TYPES[view.state.type].name;
      }
    }
    return null;
  }

  /** the nearest placed Structure whose footprint sits within reach of the Player */
  private nearestStructure(): Structure | null {
    const player = this.ctx.player;
    const ptx = Math.floor(player.x / TILE);
    const pty = Math.floor((player.y - 4) / TILE);
    let best: Structure | null = null;
    let bestDist = 3.2; // tiles — a touch beyond the facing tile
    const seen = new Set<string>();
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const s = this.structuresByTile.get(`${ptx + dx},${pty + dy}`);
        if (!s || seen.has(s.id)) continue;
        seen.add(s.id);
        const { w, h } = footprint(s.type);
        // distance to the footprint centre
        const d = Math.hypot(ptx + 0.5 - (s.tx + w / 2), pty + 0.5 - (s.ty + h / 2));
        if (d < bestDist) {
          bestDist = d;
          best = s;
        }
      }
    }
    return best;
  }

  /**
   * X near a Structure dismantles it (ADR-0008): any Player may remove any
   * Structure for the dismantler's FULL refund, server-ordered, no ownership.
   * Friction only: a Building someone else placed needs a confirming second X.
   */
  dismantleFacing(): void {
    const s = this.nearestStructure();
    if (!s) {
      this.dismantleArmed = null;
      return;
    }
    const now = Date.now();
    const mine = s.placedBy === this.ctx.me.name;
    // a retired/unknown type (e.g. hut_wall) has no ITEMS entry — dismantling it
    // is exactly how a Player clears the invisible old build blocking their tiles,
    // so fall back to its raw id for the label instead of crashing on .name
    const sName = ITEMS[s.type]?.name ?? s.type;
    // speed bump: dismantling ANOTHER Player's Building asks for a second press
    if (isBuilding(s.type) && !mine) {
      if (!this.dismantleArmed || this.dismantleArmed.id !== s.id || now > this.dismantleArmed.until) {
        this.dismantleArmed = { id: s.id, until: now + 3000 };
        this.ctx.bus.emit('toast', t.toast.dismantleConfirm(s.placedBy, sName), 'info');
        return;
      }
    }
    this.dismantleArmed = null;
    void this.ctx.backend.dismantleStructure(s.id).then((res) => {
      if (!res.ok) return;
      this.ctx.setInventory(res.inventory);
      this.ctx.sfx('place', 0.5);
      const gained = Object.entries(res.refund)
        .map(([item, n]) => `+${n} ${ITEMS[item as ItemId]?.name ?? item}`)
        .join('  ');
      this.ctx.bus.emit('toast', gained ? t.toast.dismantled(sName, gained) : t.toast.dismantledBare(sName), 'good');
      // the server-ordered `structureRemoved` event tears down the visuals for
      // everyone (incl. us); remove locally too in case we beat the echo
      this.removeStructure(s.id);
    });
  }

  confirmPlace(): void {
    if (!this.placing) return;
    const { tx, ty } = this.bestAnchorNear(this.placing);
    this.placeAtTile(this.placing, tx, ty);
  }

  /** place `item` on a specific tile — signposts prompt for their line first */
  private placeAtTile(item: StructureId, tx: number, ty: number): void {
    if (item === 'village_hall' && !this.village.canFoundHall()) return; // backstop for drag-place (ADR-0010)
    if (item === 'signpost') {
      // the signpost line prompt freezes movement through the same chat-focus
      // wiring as the chat box
      this.ctx.bus.emit('sign-prompt');
      const done = (text: string | null) => {
        this.ctx.bus.off('sign-text', done);
        if (text === null) return; // cancelled
        this.doPlace(item, tx, ty, text);
      };
      this.ctx.bus.on('sign-text', done);
      return;
    }
    this.doPlace(item, tx, ty);
  }

  /**
   * Drag-to-place: dropping an inventory Structure onto the canvas places it on
   * the hovered tile if that tile is valid AND within a few tiles of the
   * Player. The select→face→Enter/E flow still works unchanged.
   */
  private wireDragPlace(): void {
    const canvas = this.ctx.scene.game.canvas;
    const TYPE = 'application/x-jw-structure';
    canvas.addEventListener('dragover', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes(TYPE)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }
    });
    canvas.addEventListener('drop', (e) => {
      const item = e.dataTransfer?.getData(TYPE) as StructureId;
      if (!item) return;
      e.preventDefault();
      this.tryDragPlace(item, e.clientX, e.clientY);
    });
  }

  /** map a client (screen) point to world coordinates via the camera */
  private screenToWorld(clientX: number, clientY: number): Phaser.Math.Vector2 {
    const scene = this.ctx.scene;
    const rect = scene.game.canvas.getBoundingClientRect();
    const cx = (clientX - rect.left) * (scene.scale.gameSize.width / rect.width);
    const cy = (clientY - rect.top) * (scene.scale.gameSize.height / rect.height);
    return scene.cameras.main.getWorldPoint(cx, cy);
  }

  private tryDragPlace(item: StructureId, clientX: number, clientY: number): void {
    const world = this.screenToWorld(clientX, clientY);
    const player = this.ctx.player;
    const tx = Math.floor(world.x / TILE);
    const ty = Math.floor(world.y / TILE);
    const ptx = Math.floor(player.x / TILE);
    const pty = Math.floor((player.y - 4) / TILE);
    const REACH = 4; // a few tiles from the Player
    if (Math.abs(tx - ptx) > REACH || Math.abs(ty - pty) > REACH) {
      this.ctx.bus.emit('toast', t.toast.tooFarDrop, 'bad');
      return;
    }
    if (!this.canPlaceLocal(item, tx, ty)) {
      this.toastPlaceRefused(item, tx, ty);
      return;
    }
    this.placeAtTile(item, tx, ty);
  }

  /**
   * Pick the most helpful "can't build" message by finding the FIRST offending
   * footprint tile and naming its actual reason — a bush/tree, an existing
   * Structure, or unbuildable ground — instead of one catch-all string.
   */
  private toastPlaceRefused(item: StructureId, tx: number, ty: number): void {
    const { w, h } = footprint(item);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const reason = this.tileBlockReason(item, tx + dx, ty + dy);
        if (!reason) continue;
        if (reason === 'node') {
          const node = this.blockingNodeName(item, tx, ty);
          this.ctx.bus.emit('toast', node ? t.toast.blockedByNode(node) : t.toast.cantBuildTile, 'bad');
        } else if (reason === 'structure') {
          this.ctx.bus.emit('toast', t.toast.alreadyBuiltHere, 'bad');
        } else {
          // 'terrain' or 'oob'
          this.ctx.bus.emit('toast', ITEMS[item].onWater ? t.toast.bridgesOnWater : t.toast.cantBuildTile, 'bad');
        }
        return;
      }
    }
    this.ctx.bus.emit('toast', t.toast.cantBuildTile, 'bad');
  }

  private doPlace(item: StructureId, tx: number, ty: number, text?: string): void {
    const foundingHall = item === 'village_hall' && !this.village.village.hall; // first founding for the celebratory toast
    void this.ctx.backend.placeStructure(item, tx, ty, text).then((result) => {
      if (result.ok) {
        this.ctx.setInventory(result.inventory);
        this.ctx.bus.emit('toast', t.toast.placed(ITEMS[item].name), 'good');
        this.ctx.sfx('place', 0.6);
        this.progression.useHint('place');
        if (item === 'campfire') this.progression.tickJourney('place_campfire');
        if (foundingHall) this.ctx.bus.emit('toast', t.toast.villageFoundedYou, 'good');
        this.exitPlaceMode();
      } else if (result.reason === 'OCCUPIED') {
        this.ctx.bus.emit('toast', t.toast.alreadyBuiltHere, 'bad');
      } else if (result.reason === 'INVALID') {
        this.toastPlaceRefused(item, tx, ty);
      } else {
        this.exitPlaceMode();
      }
    });
  }
}
