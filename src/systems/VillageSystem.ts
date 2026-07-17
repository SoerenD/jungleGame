/**
 * VillageSystem (ADR-0018 #9): the communal Village (ADR-0010/0013) — baked
 * Building textures, the mirrored VillageRecord + aura/banner grandeur, the
 * contribution panel flow, and the functional-Building interactions (recall,
 * bell, trade, banner name, chronicle, fountain wishes, flowers). Owns the
 * villageChanged backend listener and its HUD-side bus handlers.
 */
import type Phaser from 'phaser';
import type { Inventory } from '../backend/types';
import { footprint, ITEMS, type ItemId, type StructureId } from '../content/items';
import {
  CHIME_KILN_ART,
  emptyVillage,
  festivalActive,
  FORGE_ART,
  FOUNTAIN_WISH_ITEM,
  FOUNTAIN_WISH_THRESHOLD,
  KILN_ART,
  RELIQUARY_ART,
  VERDANT_LOOM_ART,
  VILLAGE_ART,
  VILLAGE_MAX_TIER,
  VILLAGE_TIERS,
  VILLAGE_ZONE_RADIUS,
  villageContribution,
  villagePoolCap,
  type VillageRecord,
} from '../content/village';
import { WILDLIFE_ART } from '../content/wildlife';
import { TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { drawStructureArt } from '../ui/icons';
import { t } from '../i18n';
import type { GameContext } from './context';
import { floatText } from './sceneFx';

export class VillageSystem {
  /** mirrors the backend record; the aura/banner render grandeur around the Hall */
  village: VillageRecord = emptyVillage();
  private villageAura?: Phaser.GameObjects.Graphics;
  private villageBanner?: Phaser.GameObjects.Text;
  /** the standing Hall's sprite, re-textured to match the Village tier (ADR-0013) —
   *  assigned by the structure builder when the Hall stands */
  hallImg?: Phaser.GameObjects.Image;
  private onVillageChanged = (v: VillageRecord): void => this.applyVillage(v);
  private onVillageGive = (amounts: Inventory): void => this.contributeVillage(amounts);
  private onTradeDo = (o: { give: ItemId; count: number; get: ItemId }): void => this.doTrade(o.give, o.count, o.get);
  private onFountainWish = (count: number): void => this.doWish(count);
  private onVillageNameSet = (o: { name: string; crest: number }): void => this.setVillageName(o.name, o.crest);
  private onVillageNoteAdd = (text: string): void => this.addVillageNote(text);

  constructor(
    private ctx: GameContext,
    private host: GameScene,
  ) {}

  create(): void {
    this.bakeVillageTextures(); // A3: generate the Village Buildings' sprites (no PNG assets)
    this.ctx.backend.on('villageChanged', this.onVillageChanged);
    this.ctx.bus.on('village-give', this.onVillageGive);
    this.ctx.bus.on('trade-do', this.onTradeDo);
    this.ctx.bus.on('fountain-wish', this.onFountainWish);
    this.ctx.bus.on('village-name-set', this.onVillageNameSet);
    this.ctx.bus.on('village-note-add', this.onVillageNoteAdd);
  }

  update(_time?: number, _dt?: number): void {}

  destroy(): void {
    this.ctx.backend.off('villageChanged', this.onVillageChanged);
    this.ctx.bus.off('village-give', this.onVillageGive);
    this.ctx.bus.off('trade-do', this.onTradeDo);
    this.ctx.bus.off('fountain-wish', this.onFountainWish);
    this.ctx.bus.off('village-name-set', this.onVillageNameSet);
    this.ctx.bus.off('village-note-add', this.onVillageNoteAdd);
  }

  /** bake a sprite for every Village Building + Wildlife decor from its art spec — no PNGs */
  private bakeVillageTextures(): void {
    const scene = this.ctx.scene;
    for (const [id, art] of Object.entries({ ...VILLAGE_ART, ...WILDLIFE_ART, ...FORGE_ART, ...KILN_ART, ...CHIME_KILN_ART, ...VERDANT_LOOM_ART, ...RELIQUARY_ART })) {
      if (!art) continue;
      const key = `st_${id}`;
      if (scene.textures.exists(key)) continue;
      const { w, h } = footprint(id as StructureId);
      const W = w * TILE;
      // buildings/monuments stand a tile (or two) taller than their footprint so
      // the roof pokes up like every other object; decor stays low. `rise` overrides
      // (the bell-towered hall rises 3 tiles so it out-scales the houses).
      const extra = art.rise ?? (art.shape === 'monument' ? 2 : 1);
      const H = (h + extra) * TILE;
      const tex = scene.textures.createCanvas(key, W, H);
      if (!tex) continue;
      drawStructureArt(tex.context, W, H, art);
      tex.refresh();
    }
    // ADR-0013: the Hall re-sprites per Village tier (hut → grand bell-tower).
    // Bake one texture per tier at the SAME size as st_village_hall so the
    // standing sprite can be swapped in refreshVillageVisuals without moving.
    const hallArt = VILLAGE_ART.village_hall;
    if (hallArt) {
      const { w, h } = footprint('village_hall');
      const W = w * TILE;
      const H = (h + (hallArt.rise ?? 1)) * TILE;
      for (let tier = 1; tier <= VILLAGE_MAX_TIER; tier++) {
        const key = `st_village_hall_${tier}`;
        if (scene.textures.exists(key)) continue;
        const tex = scene.textures.createCanvas(key, W, H);
        if (!tex) continue;
        drawStructureArt(tex.context, W, H, hallArt, tier);
        tex.refresh();
      }
    }
  }

  applyVillage(v: VillageRecord): void {
    const wasFestival = festivalActive(this.village, Date.now());
    this.village = { ...v, hall: v.hall ? { ...v.hall } : null };
    const nowFestival = festivalActive(this.village, Date.now());
    // a Dorffest can start from anyone's wish — announce the transition + drive the HUD badge
    if (nowFestival && !wasFestival) this.ctx.bus.emit('toast', t.toast.festivalStarted, 'good');
    this.ctx.bus.emit('festival', nowFestival ? this.village.festivalUntil ?? 0 : 0);
    this.ctx.bus.emit('village', this.village);
    this.refreshVillageVisuals();
  }

  /**
   * The Village's automatic grandeur (ADR-0010 §3): a warm aura that grows and
   * brightens each tier around the founded Hall, the fainter ring marking the
   * village zone (where builds advance the tier), and a tier banner overhead.
   */
  private refreshVillageVisuals(): void {
    const scene = this.ctx.scene;
    const hall = this.village.hall;
    if (!hall) {
      this.villageAura?.destroy();
      this.villageAura = undefined;
      this.villageBanner?.destroy();
      this.villageBanner = undefined;
      this.hallImg = undefined;
      return;
    }
    const { w, h } = footprint('village_hall');
    const cx = (hall.tx + w / 2) * TILE;
    const cy = (hall.ty + h / 2) * TILE;
    const tier = Math.max(1, this.village.tier);
    // ADR-0013: the standing Hall re-sprites to match the current tier
    if (this.hallImg?.active) this.hallImg.setTexture(`st_village_hall_${Math.min(VILLAGE_MAX_TIER, tier)}`);
    const warm = 0xffca7a;
    if (!this.villageAura) this.villageAura = scene.add.graphics().setDepth(-3);
    const g = this.villageAura;
    g.clear();
    const radius = (5 + tier * 2.5) * TILE; // grows each tier — visible grandeur
    g.fillStyle(warm, 0.04 + tier * 0.012);
    g.fillCircle(cx, cy, radius);
    g.lineStyle(2, warm, 0.3 + tier * 0.04);
    g.strokeCircle(cx, cy, radius);
    g.lineStyle(1, 0xffe9c9, 0.18); // the village zone: only in-zone builds advance the tier
    g.strokeCircle(cx, cy, VILLAGE_ZONE_RADIUS * TILE);
    const label = `🏛 ${this.village.name?.trim() || t.village.tierName(tier)}`;
    const by = hall.ty * TILE - 6;
    if (!this.villageBanner) {
      this.villageBanner = scene.add
        .text(cx, by, label, { fontSize: '9px', color: '#ffe9c9', stroke: '#3a2a18', strokeThickness: 3 })
        .setOrigin(0.5, 1)
        .setResolution(4)
        .setDepth(890_000);
    } else {
      this.villageBanner.setText(label).setPosition(cx, by);
    }
  }

  /**
   * E at the Hall opens the contribution panel (the HUD builds a slider per
   * qualifying Resource from the current inventory). If nothing carried qualifies
   * there is nothing to choose, so skip straight to the "nothing to give" toast.
   */
  openVillageContribute(): void {
    // the pool stops at the next tier's threshold until the milestone stands —
    // a full pool refuses the panel outright so nothing can be taken
    if (villagePoolCap(this.village.tier) - this.village.pool <= 0) {
      this.ctx.bus.emit('toast', t.toast.villagePoolFull, 'bad');
      return;
    }
    if (villageContribution(this.ctx.inventory).points <= 0) {
      this.ctx.bus.emit('toast', t.toast.villageNothingToGive, 'bad');
      return;
    }
    this.ctx.bus.emit('village-give-open', { ...this.ctx.inventory });
  }

  /**
   * Pour the chosen amounts into the communal pool (the panel's Give button).
   * `amounts` caps each item; omitted means "give it all" (kept for safety).
   */
  private contributeVillage(amounts?: Inventory): void {
    // pre-clamp to the pool's remaining room so even the CURRENT live (cap-less)
    // server can never over-fill — the explicit clamped amounts are what we send
    const room = villagePoolCap(this.village.tier) - this.village.pool;
    const clamped = villageContribution(this.ctx.inventory, amounts, Math.max(0, room));
    if (clamped.points <= 0) {
      this.ctx.bus.emit('toast', room <= 0 ? t.toast.villagePoolFull : t.toast.villageNothingToGive, 'bad');
      this.ctx.bus.emit('village-give-close');
      return;
    }
    void this.ctx.backend.contributeVillage(clamped.taken).then((res) => {
      if (!res.ok) {
        if (res.reason === 'NOTHING_TO_GIVE') this.ctx.bus.emit('toast', t.toast.villageNothingToGive, 'bad');
        if (res.reason === 'POOL_FULL') this.ctx.bus.emit('toast', t.toast.villagePoolFull, 'bad');
        return;
      }
      this.ctx.setInventory(res.inventory);
      const h = this.village.hall;
      if (h) floatText(this.ctx.scene, (h.tx + 1) * TILE, h.ty * TILE - 8, `+${res.gained}`, '#ffca7a');
      this.ctx.bus.emit('toast', t.toast.villageContributed(res.gained), 'good');
      this.ctx.sfx('place', 0.6);
      this.ctx.bus.emit('village-give-close');
    });
  }

  /** true if a Village Hall may be raised now — only one may stand at a time (re-found by dismantling) */
  canFoundHall(): boolean {
    if (this.village.hall) {
      this.ctx.bus.emit('toast', t.toast.hallAlreadyStands, 'bad');
      return false;
    }
    return true;
  }

  /**
   * The Victory Arch recalls the Player to the Village Hall — reuses the wake
   * relocation position-write + a presence broadcast, with a camera fade so it
   * reads as a ritual. Blocked while you are rostered in an ENGAGED Guardian
   * fight, so it is never a combat escape. (The Arch is an overworld Structure
   * and the Delve uses its own interaction resolver, so recall is unreachable
   * from inside a Dungeon.)
   */
  recallHome(): void {
    const ctx = this.ctx;
    const hall = this.village.hall;
    if (!hall) {
      ctx.bus.emit('toast', t.toast.recallNoHome, 'bad');
      return;
    }
    if (this.host.fight?.roster.includes(ctx.me.name)) {
      ctx.bus.emit('toast', t.toast.recallNoFight, 'bad');
      return;
    }
    const { w, h } = footprint('village_hall');
    const tx = hall.tx + Math.floor(w / 2);
    const ty = hall.ty + h; // stand just below the Hall footprint
    const cam = ctx.scene.cameras.main;
    cam.fadeOut(200, 0, 0, 0, (_c: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress < 1) return;
      ctx.player.setVelocity(0, 0);
      ctx.player.setPosition((tx + 0.5) * TILE, (ty + 0.5) * TILE);
      ctx.backend.sendPosition(ctx.player.x, ctx.player.y, ctx.held.lastDir, false, ctx.held.item ?? undefined, this.host.swingCount);
      cam.fadeIn(200, 0, 0, 0);
      ctx.sfx('blip', 0.5);
      ctx.bus.emit('toast', t.toast.recalled, 'good');
    });
  }

  /** the Stone Keep's bell — a broadcast rally to every online Player (reuses chat, ADR-0013) */
  ringBell(): void {
    void this.ctx.backend.sendChat(`🔔 ${this.ctx.me.name} rings the bell — gather at the Village!`);
    this.ctx.sfx('blip', 0.6);
    this.ctx.bus.emit('toast', t.toast.bellRung, 'good');
  }

  /** the Market Square Trade Post (ADR-0013): open the resource-exchange panel */
  openTradePost(): void {
    this.ctx.bus.emit('trade-open', { inventory: { ...this.ctx.inventory }, tier: this.village.tier });
  }

  private doTrade(give: ItemId, count: number, get: ItemId): void {
    void this.ctx.backend.tradeMarket(give, count, get).then((res) => {
      if (!res.ok) {
        this.ctx.bus.emit('toast', t.toast.tradeFailed, 'bad');
        return;
      }
      this.ctx.setInventory(res.inventory);
      this.ctx.bus.emit('toast', t.toast.traded(res.got.count, ITEMS[res.got.item]?.name ?? res.got.item), 'good');
      this.ctx.sfx('craft', 0.6);
      this.ctx.bus.emit('trade-close');
    });
  }

  /** the Banner names the Village + picks a crest hue (ADR-0013) */
  private setVillageName(name: string, crest: number): void {
    void this.ctx.backend.setVillageName(name, crest).then((res) => {
      this.applyVillage(res.village);
      this.ctx.bus.emit('toast', t.toast.villageNamed(res.village.name ?? ''), 'good');
    });
  }

  /** the Well's Chronicle: auto-seeded tier lines (derived) + persisted player notes */
  openChronicle(): void {
    const auto = VILLAGE_TIERS.filter((d) => d.tier >= 1 && d.tier <= this.village.tier).map(
      (d) => t.chron.became(t.village.tierName(d.tier)),
    );
    this.ctx.bus.emit('chronicle-open', { lines: [...auto, ...(this.village.chronicle ?? [])] });
  }

  private addVillageNote(text: string): void {
    if (!text.trim()) return;
    void this.ctx.backend.addVillageNote(text).then((res) => {
      this.applyVillage(res.village);
      this.openChronicle();
    });
  }

  /** the Fountain Wishing Well (ADR-0013): open the Dorffest contribution panel */
  openFountain(): void {
    this.ctx.bus.emit('fountain-open', {
      have: this.ctx.inventory[FOUNTAIN_WISH_ITEM as ItemId] ?? 0,
      wishes: this.village.wishes ?? 0,
      threshold: FOUNTAIN_WISH_THRESHOLD,
      festivalUntil: this.village.festivalUntil ?? 0,
    });
  }

  private doWish(count: number): void {
    void this.ctx.backend.wishFountain(count).then((res) => {
      if (!res.ok) {
        this.ctx.bus.emit('toast', res.reason === 'FESTIVAL_ACTIVE' ? t.toast.festivalRunning : t.toast.wishFailed, 'bad');
        return;
      }
      this.ctx.setInventory(res.inventory);
      this.applyVillage(res.village); // emits the 🎉 toast on the start transition
      this.ctx.sfx('blip', 0.5);
      if (!res.festivalStarted) this.ctx.bus.emit('toast', t.toast.wished(count), 'good');
      this.openFountain(); // refresh the panel with the new meter
    });
  }

  /** the Flower Bed: tend it (cosmetic bloom) */
  tendFlowers(): void {
    this.ctx.sfx('harvest', 0.4);
    this.ctx.bus.emit('toast', t.toast.flowersTended, 'good');
  }
}
