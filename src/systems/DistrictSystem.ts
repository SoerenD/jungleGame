/**
 * DistrictSystem (ADR-0018 #12): the Realm districts (ADR-0017 §2) — the
 * "separate small map" presentation. districtOf/activeDistrict, the positional
 * camera-region clamp, the paired megalith Realm gates (build/re-dress/action)
 * and the gate-step teleport.
 */
import Phaser from 'phaser';
import { DEV_REALM_TEST, INTERACT_RANGE, TILE, WORLD_VIEW_H, WORLD_VIEW_W } from '../config';
import { wardenForRealm } from '../content/wardens';
import type { GameScene } from '../scenes/GameScene';
import { t, zoneName } from '../i18n';
import type { AtmosphereSystem } from './AtmosphereSystem';
import type { GameContext } from './context';
import { addBlockerBody, addShadow } from './sceneFx';
import type { DistrictDef, EAction, GameSystem } from './types';

export class DistrictSystem implements GameSystem {
  /** the district the Player stands in (camera clamp + minimap crop + dot filter); null = the World */
  activeDistrict: DistrictDef | null = null;
  /** both arches of every Realm gate, for the E-interaction scan */
  private realmGates: {
    d: DistrictDef;
    side: 'world' | 'district';
    x: number;
    y: number;
    /** everything this arch placed (container, blocker, shadow) — destroyable for a re-dress */
    objs: Phaser.GameObjects.GameObject[];
    glow?: Phaser.GameObjects.Image;
  }[] = [];

  constructor(
    private ctx: GameContext,
    private host: GameScene,
    private atmosphere: AtmosphereSystem,
  ) {}

  create(): void {
    this.buildRealmGates();
  }

  update(_time?: number, _dt?: number): void {}

  destroy(): void {}

  /**
   * The Realm district containing tile (tx,ty), or null in the World proper.
   * Every district reserves its OWN 1-tile cliff ring inside its outer rect
   * (the void-filler cliff the generator never overwrites — tools/generate-map.ts
   * fills each district's interior at rect+1..rect+size-2, generate-map.ts:947/
   * 1091/1171); that ring is still solid wall, not the room. Checking the outer
   * rect inclusively meant a Player walking up to the World's south edge and
   * getting stopped by that very wall (their tile position resting exactly on
   * the rect's boundary row/col) still counted as "inside" — the camera would
   * immediately snap to the district's bounds and reveal the whole interior
   * through the wall (the "I can see the hidden Hushdark" clipping report).
   * The inset below excludes the ring, matching the carved interior exactly.
   */
  districtOf(tx: number, ty: number): DistrictDef | null {
    for (const d of this.ctx.world.districts ?? []) {
      const r = d.rect;
      if (tx > r.x && tx < r.x + r.w - 1 && ty > r.y && ty < r.y + r.h - 1) return d;
    }
    return null;
  }

  /**
   * Clamp the camera to the region the Player is standing in — a district's
   * rect inside a Realm, the pinned pre-Realm World otherwise (the void band
   * and other districts must never scroll into view). Derived POSITIONALLY on
   * the checkZone tick rather than in the gate interaction, so every
   * cross-region reposition — Exhaustion wake, Victory Arch recall, login
   * inside a district, dev teleports — re-clamps without touching a call site.
   * (The Delve owns the camera while inside; checkZone pauses then.)
   */
  applyCameraRegion(force = false): void {
    const player = this.ctx.player;
    const d = this.districtOf(Math.floor(player.x / TILE), Math.floor(player.y / TILE));
    if (!force && d === this.activeDistrict) return;
    this.activeDistrict = d;
    const cam = this.ctx.scene.cameras.main;
    if (d) cam.setBounds(d.rect.x * TILE, d.rect.y * TILE, d.rect.w * TILE, d.rect.h * TILE);
    else cam.setBounds(0, 0, WORLD_VIEW_W * TILE, WORLD_VIEW_H * TILE);
  }

  /** is this Realm's gate open? The Warden-defeat gate-key world flag (T4) —
   *  or the ?realmtest dev override that predates it (T2) */
  private realmGateOpen(d: DistrictDef): boolean {
    if (DEV_REALM_TEST) return true;
    const w = wardenForRealm(d.id);
    return !!w && !!this.host.wardens[w.id]?.gateOpen;
  }

  /** both arches of every Realm gate: a standing stone arch in the World and
   *  its twin inside the district. E teleports through (Delve-shaft interaction
   *  pattern, but NO instancing/roster/overlay — plain persistent map space). */
  private buildRealmGates(): void {
    for (const d of this.ctx.world.districts ?? []) {
      this.buildRealmGate(d, 'world', d.gate.worldTx, d.gate.worldTy);
      this.buildRealmGate(d, 'district', d.gate.districtTx, d.gate.districtTy);
    }
  }

  private buildRealmGate(d: DistrictDef, side: 'world' | 'district', tx: number, ty: number): void {
    const scene = this.ctx.scene;
    const x = (tx + 0.5) * TILE;
    const y = (ty + 0.5) * TILE;
    const open = this.realmGateOpen(d);
    const c = scene.add.container(x, y);
    // the Realm Arch: a weathered megalith gate — two pillars of stacked,
    // slightly off-line stones under a cracked lintel and capstone, moss on
    // every shelf, vines off the ends, and carved glyphs across the lintel
    // that wake teal once the way stands open. The passage is a black void
    // while dormant; open, it breathes with a slow shimmer.
    const portal = scene.add.rectangle(0, -6, 16, 26, open ? 0x123830 : 0x07090c).setStrokeStyle(1, 0x05070a);
    const shimmer = scene.add.rectangle(0, -6, 16, 26, 0x2a7a62).setAlpha(0);
    const parts: Phaser.GameObjects.GameObject[] = [portal, shimmer];
    const stone = (sx: number, sy: number, w: number, h: number, fill: number) => {
      parts.push(scene.add.rectangle(sx, sy, w, h, fill).setStrokeStyle(1, 0x2c332c));
    };
    // pillars — three weathered blocks each, brighter toward the sky
    stone(-11, 3, 8, 10, 0x59635a);
    stone(11, 3, 8, 10, 0x555f56);
    stone(-10, -5, 7, 8, 0x646e5f);
    stone(10, -5, 7, 8, 0x606a5b);
    stone(-11, -13, 8, 8, 0x6d7766);
    stone(11, -13, 8, 8, 0x69735f);
    // the lintel and its capstone
    stone(0, -20, 34, 7, 0x717b68);
    stone(0, -25, 18, 5, 0x7a8470);
    // moss claims every shelf; two drips run down the stones
    const moss = (mx: number, my: number, w: number, h: number, tone = 0x4a5230) => {
      parts.push(scene.add.rectangle(mx, my, w, h, tone));
    };
    moss(-12, -17, 6, 2);
    moss(10, -17, 5, 2);
    moss(-2, -27, 7, 2, 0x53603a);
    moss(-13, -9, 2, 5);
    moss(12, 0, 2, 6);
    moss(-9, 7, 3, 2, 0x424a2b);
    // carved glyphs across the lintel — dead grey, or smoldering teal
    const glyphs: Phaser.GameObjects.Rectangle[] = [];
    for (const gx of [-11, -5, 1, 7]) {
      const gl = scene.add.rectangle(gx, -20, 2, 3, open ? 0x63e0b8 : 0x3d463f);
      glyphs.push(gl);
      parts.push(gl);
    }
    // hanging vines off the lintel ends
    for (const [vx, vlen] of [[-16, 9], [16, 7]] as const) {
      const vine = scene.add.rectangle(vx, -17, 2, vlen, 0x435030).setOrigin(0.5, 0);
      parts.push(vine, scene.add.rectangle(vx, -17 + vlen, 2, 2, 0x53603a).setOrigin(0.5, 0));
    }
    const label = scene.add
      .text(0, -32, side === 'district' ? t.realm.return : open ? t.realm.gateTo(zoneName(d.name)) : t.realm.dormant, {
        fontSize: '8px',
        color: open || side === 'district' ? '#9fe0c9' : '#8a938c',
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setResolution(4);
    parts.push(label);
    c.add(parts);
    c.setDepth((ty + 1) * TILE);
    if (open || side === 'district') {
      scene.tweens.add({ targets: shimmer, alpha: { from: 0.12, to: 0.38 }, duration: 1700, yoyo: true, repeat: -1, ease: 'sine.inout' });
      for (const gl of glyphs) {
        scene.tweens.add({ targets: gl, alpha: { from: 0.65, to: 1 }, duration: 1100 + 200 * glyphs.indexOf(gl), yoyo: true, repeat: -1, ease: 'sine.inout' });
      }
    }
    const blocker = addBlockerBody(scene, this.host.blockersGroup, tx, ty);
    const shadow = addShadow(scene, x, y + 8, 30);
    let glowImg: Phaser.GameObjects.Image | undefined;
    if (open || side === 'district') {
      const glow = scene.add
        .image(x, y - 4, 'glow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0x4fd8a8)
        .setScale(0.9)
        .setAlpha(0)
        .setDepth(890_000);
      this.atmosphere.glows.push({ img: glow, base: 0.35, x, y: y - 4 });
      glowImg = glow;
    }
    this.realmGates.push({ d, side, x, y, objs: [c, blocker, shadow], glow: glowImg });
  }

  /**
   * Tear down and re-raise every Realm arch — a gate's open/dormant dressing
   * (portal shimmer, glyphs, label, glow) is baked at build time, so the
   * one-time gate opening (realmOpened) re-dresses by rebuilding, the same
   * way refreshDelveEntrance re-dresses the shaft.
   */
  rebuildRealmGates(): void {
    for (const g of this.realmGates) {
      for (const o of g.objs) o.destroy();
      if (g.glow) {
        const i = this.atmosphere.glows.findIndex((e) => e.img === g.glow);
        if (i >= 0) this.atmosphere.glows.splice(i, 1);
        g.glow.destroy();
      }
    }
    this.realmGates = [];
    this.buildRealmGates();
  }

  /** E at a Realm gate: step through (open), or explain the dormant arch.
   *  Leaving a district is NEVER gated — the way back always works. */
  realmGateAction(px: number, py: number): EAction | null {
    for (const g of this.realmGates) {
      if (Phaser.Math.Distance.Between(px, py, g.x, g.y) > INTERACT_RANGE + 10) continue;
      if (g.side === 'district') return { swing: false, run: () => this.leaveDistrict(g.d) };
      if (this.realmGateOpen(g.d)) return { swing: false, run: () => this.enterDistrict(g.d) };
      // dormant — but a carried gate key turns it (once, for everyone, forever)
      const w = wardenForRealm(g.d.id);
      if (w && (this.ctx.inventory[w.gateKey] ?? 0) > 0) {
        return { swing: false, run: () => void this.ctx.backend.openRealmGate(w.id) };
      }
      return { swing: false, run: () => this.ctx.bus.emit('toast', t.toast.realmGateDormant, 'info') };
    }
    return null;
  }

  /** step through the world-side arch into the Realm */
  private enterDistrict(d: DistrictDef): void {
    this.teleportThroughGate((d.gate.districtTx + 0.5) * TILE, (d.gate.districtTy + 1.5) * TILE);
    this.ctx.bus.emit('toast', t.toast.realmEntered(zoneName(d.name)), 'good');
  }

  /** step back through the district-side arch, out beside the world gate */
  private leaveDistrict(d: DistrictDef): void {
    this.teleportThroughGate((d.gate.worldTx + 0.5) * TILE, (d.gate.worldTy + 1.5) * TILE);
    this.ctx.bus.emit('toast', t.toast.realmLeft, 'info');
  }

  /** the shared gate-step: reposition, re-clamp, broadcast, banner — no
   *  instancing, no roster; the district is ordinary persistent World space */
  private teleportThroughGate(x: number, y: number): void {
    const ctx = this.ctx;
    const host = this.host;
    if (host.placing) host.exitPlaceMode();
    ctx.player.setPosition(x, y);
    ctx.player.setVelocity(0, 0);
    ctx.scene.cameras.main.flash(300, 8, 14, 11);
    ctx.sfx('blip', 0.5);
    ctx.backend.sendPosition(ctx.player.x, ctx.player.y, ctx.held.lastDir, false, ctx.held.item ?? undefined, host.swingCount);
    // immediate re-derive: camera clamp, zone banner and the minimap's district
    // view all update on this one pass instead of waiting for the 300 ms tick
    host.checkZone();
  }
}
