/**
 * PlayerSystem (ADR-0018 #1): the own Player — avatar bake + sprite/physics
 * bootstrap, the Loadout visuals (held sprite, torch glow, shadow) and their
 * §8 step-5 follow, movement + animation (step 14) with the chat/stun halt
 * body (step 13), the swing fx trio (markSwing/playSwingFx/applyAnim), worn
 * gear (equip flow), the food-buff clock (step 12), and the stacked move/
 * attack-speed factors. Owns the held/equip HUD bus handlers.
 */
import Phaser from 'phaser';
import { AVATAR_H, AVATAR_IDLE, AVATAR_SWING, AVATAR_W, ensureAvatarTexture } from '../avatars';
import { armorBuff, armorDef, gearOwns, isWeapon, sanitizeEquipped, type EquippedGear, type WeaponSlot } from '../content/armor';
import type { Dir } from '../backend/types';
import { PLAYER_SPEED, SPEED_BUFF_FACTOR, TIDE_PERIOD_MS, WADE_SLOW_FACTOR } from '../config';
import { FESTIVAL_SPEED_FACTOR, festivalActive, villageBuff } from '../content/village';
import { tideFloods } from '../content/tide';
import { ITEMS, type ItemId, type ToolId } from '../content/items';
import type { GameScene } from '../scenes/GameScene';
import { t } from '../i18n';
import type { AtmosphereSystem } from './AtmosphereSystem';
import type { GameContext } from './context';
import type { DistrictSystem } from './DistrictSystem';
import type { FishingSystem } from './FishingSystem';
import type { InputSystem } from './InputSystem';
import type { PresenceSystem } from './PresenceSystem';
import { HELD_HAND, positionHeld, setHeldTexture, TORCH_TINT } from './sceneFx';
import type { GameSystem } from './types';
import type { VillageSystem } from './VillageSystem';

/**
 * Cosmetic swing echo (playSwingFx): purely visual. Swings are adjudicated
 * solely by the cadence stamps in the two update() paths (SWING_CADENCE_MS /
 * the per-weapon combat cadences of ADR-0006 — both untouched); this merely
 * makes an already-counted swing visible on the body: the avatar flashes its
 * raised-arm frame while the in-hand Tool sweeps a quick arc.
 */
const SWING_POSE_MS = 100; // how long the raised-arm frame outranks walk/idle
const SWING_ARC_MS = 120; // the tool's rotation sweep
const SWING_ARC_FROM_DEG = -60; // cocked back over the shoulder…
const SWING_ARC_TO_DEG = 40; // …swept forward past vertical (mirrored when flipped)
/**
 * Pivot of the arc as a texture-space origin: the handle end of the 12x12
 * held-item art (every Tool grid draws its grip at the bottom-left corner).
 * flipX mirrors the texture inside its frame but NOT the origin point, so the
 * x is mirrored by hand for the left profile. Applied only for the arc's
 * ~120ms and restored to the (0.5, 0.5) rest origin right after — positionHeld
 * and everything else may keep assuming the centered default.
 */
const SWING_GRIP_X = 0.2;
const SWING_GRIP_Y = 0.85;
/** sprite-data keys for the per-entity swing state (data, not fields, so the
 *  same fx runs on a REMOTE Player's sprite/heldSprite pair too) */
const SWING_POSE_KEY = 'swingPoseUntil';
const SWING_TWEEN_KEY = 'swingTween';

export class PlayerSystem implements GameSystem {
  /** the worn gear (ADR-0017 §4) — armor bakes into my sheet; the legacy weapon
   *  slots only ever DRAIN now (the HUD migration returns them to the bag) */
  equipped: EquippedGear = {};
  /** un-sent equip intent (rapid toggles coalesce here) + the send serializer */
  private desiredEquip: EquippedGear | null = null;
  private equipChain: Promise<void> = Promise.resolve();
  buffUntil = 0;
  /**
   * Count of MY swings this session — incremented ONLY at the markSwing stamp
   * site (never by remote-triggered playSwingFx replays) and shipped on the
   * position stream (PlayerPos.swings) so peers can echo my swings.
   */
  swingCount = 0;
  lastSwingAt = 0;
  heldSprite!: Phaser.GameObjects.Image;
  torchGlow!: Phaser.GameObjects.Image;
  playerShadow!: Phaser.GameObjects.Image;
  /** cross-system refs, wired by GameScene (ADR-0018 §3) */
  atmosphere!: AtmosphereSystem;
  village!: VillageSystem;
  district!: DistrictSystem;
  fishing!: FishingSystem;
  presence!: PresenceSystem;
  input!: InputSystem;
  // v4: the HUD Loadout bar reports which single item is in-hand (keys 1–5)
  private onHeld = (id: ItemId | null): void => {
    this.ctx.held.item = id;
    this.applyHeldSprite();
    // broadcast promptly so every other Player's in-hand item updates now
    this.ctx.backend.sendPosition(this.ctx.player.x, this.ctx.player.y, this.ctx.held.lastDir, false, this.ctx.held.item ?? undefined, this.swingCount);
  };
  // ADR-0017 §4: the inventory's Equip button toggles one Armor piece
  private onEquipToggle = (item: ItemId): void => this.toggleArmor(item);
  // the legacy gear weapon slots: only the HUD migration's CLEAR path fires now
  private onWeaponSlotSet = (slot: WeaponSlot, item: ItemId | null): void => this.setWeaponSlot(slot, item);

  constructor(
    private ctx: GameContext,
    private host: GameScene,
  ) {}

  /**
   * The own-Player bootstrap: bake the Avatar texture from the palette picks
   * (+ worn Armor overlays, restored from the join and re-baked on equip),
   * stand the physics sprite up, capture the World colliders (the Delve
   * disables them), and seat the Loadout visuals. Armor is worn by moving it
   * out of the bag, so keep the worn set as-is (the backend already normalized
   * any legacy worn-AND-in-bag save on join).
   */
  create(): void {
    const scene = this.ctx.scene;
    const me = this.ctx.me;
    this.equipped = sanitizeEquipped(me.equipped);
    const myTexture = `avatar-${me.name}`;
    ensureAvatarTexture(scene, myTexture, me.appearance, this.equipped);
    this.playerShadow = scene.add.image(me.x, me.y, 'shadow');
    this.playerShadow.setDisplaySize(14, 14 * 0.45);
    this.playerShadow.setDepth(2);
    this.host.player = scene.physics.add.sprite(me.x, me.y, myTexture, AVATAR_IDLE.down);
    const player = this.ctx.player;
    player.setOrigin(0.5, 1);
    const bw = 10;
    const bh = 8;
    player.body!.setSize(bw, bh);
    player.body!.setOffset((AVATAR_W - bw) / 2, AVATAR_H - bh);
    player.setCollideWorldBounds(true);
    // kept so they can be disabled while inside the Delve (which swaps in its own
    // wall collider); the World is only hidden behind the overlay, not unloaded
    this.host.worldColliders = [
      scene.physics.add.collider(player, this.host.groundLayer),
      scene.physics.add.collider(player, this.host.blockersGroup),
    ];

    // v4: Loadout visuals — created before the first inventory emit so the
    // initial 'held' event can update them. Light now comes only from a held
    // Hand Torch (the automatic player glow is gone) — warm orange, bigger and
    // more saturated than the old glow; the in-hand icon floats over the head.
    this.torchGlow = scene.add
      .image(player.x, player.y - 8, 'glow')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(TORCH_TINT)
      .setScale(1.6)
      .setAlpha(0)
      .setDepth(890_000);
    this.heldSprite = scene.add
      .image(player.x, player.y, 'held-axe')
      .setOrigin(0.5, 0.5)
      .setScale(0.8)
      .setDepth(player.y + 1)
      .setVisible(false);

    this.ctx.bus.on('held', this.onHeld);
    this.ctx.bus.on('equip-toggle', this.onEquipToggle);
    this.ctx.bus.on('weapon-slot-set', this.onWeaponSlotSet);
  }

  update(_time?: number, _dt?: number): void {}

  destroy(): void {
    this.ctx.bus.off('held', this.onHeld);
    this.ctx.bus.off('equip-toggle', this.onEquipToggle);
    this.ctx.bus.off('weapon-slot-set', this.onWeaponSlotSet);
  }

  /** §8 step 5: torch light, held item and shadow follow the Player (+ elevation depth) */
  updateFollow(night: number): void {
    const player = this.ctx.player;
    // v4: light follows only a held Hand Torch (warm orange, dim like a flame)
    this.torchGlow
      .setPosition(player.x, player.y - 8)
      .setAlpha(this.ctx.held.item === 'hand_torch' ? 0.1 + night * 0.35 : 0);
    positionHeld(this.heldSprite, player.x, player.y, this.ctx.held.lastDir);
    // keep the in-hand item with the Player when they climb a plateau (ADR-0009)
    const heldBump = this.atmosphere.elevationBonus(player.x, player.y);
    if (heldBump) this.heldSprite.setDepth(this.heldSprite.depth + heldBump);
    this.playerShadow.setPosition(player.x, player.y - 1);
  }

  /** §8 step 12: the cooked-food speed buff expiry (client-side timer, trusted client) */
  updateBuff(): void {
    if (this.buffUntil > 0 && Date.now() >= this.buffUntil) {
      this.buffUntil = 0;
      this.ctx.bus.emit('buff', 0);
      this.ctx.bus.emit('toast', t.toast.mealFades, 'info');
    }
  }

  /** §8 step 13 body: halt (chat focus or knocked down) */
  halt(stunned: boolean): void {
    this.ctx.player.setVelocity(0, 0);
    if (stunned) this.applyAnim(this.ctx.player, this.ctx.held.lastDir, false);
  }

  /** §8 step 14: movement + animation + elevation depth; returns `moving` */
  move(): boolean {
    const keys = this.input.keys;
    const player = this.ctx.player;
    const left = keys.left.isDown || keys.a.isDown;
    const right = keys.right.isDown || keys.d.isDown;
    const up = keys.up.isDown || keys.w.isDown;
    const down = keys.down.isDown || keys.s.isDown;
    let vx = (right ? 1 : 0) - (left ? 1 : 0);
    let vy = (down ? 1 : 0) - (up ? 1 : 0);
    if (vx !== 0 && vy !== 0) {
      vx *= Math.SQRT1_2;
      vy *= Math.SQRT1_2;
    }
    const speed = PLAYER_SPEED * this.moveSpeedFactor();
    player.setVelocity(vx * speed, vy * speed);
    const moving = vx !== 0 || vy !== 0;
    if (moving) {
      this.ctx.held.lastDir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : vy > 0 ? 'down' : 'up';
      this.fishing.cancelFishing('You step away — the line goes slack.');
    }
    this.applyAnim(player, this.ctx.held.lastDir, moving);
    // elevation depth bump: on a plateau the Player draws above base entities (ADR-0009)
    player.setDepth(player.y + this.atmosphere.elevationBonus(player.x, player.y));
    return moving;
  }

  // ------------------------------------------------------------ loadout + buffs

  /** point the local held sprite at the in-hand item's texture and place it in-hand */
  private applyHeldSprite(): void {
    setHeldTexture(this.ctx.scene, this.heldSprite, this.ctx.held.item);
    positionHeld(this.heldSprite, this.ctx.player.x, this.ctx.player.y, this.ctx.held.lastDir);
  }

  /** the in-hand item as a Tool (for hit RPCs), or undefined for bare hands / a non-Tool */
  heldTool(): ToolId | undefined {
    const h = this.ctx.held.item;
    return h && ITEMS[h].kind === 'tool' ? (h as ToolId) : undefined;
  }

  /** a ranged bow is in hand (the crafted Bow or the rare Fabled Bow) — strikes from afar */
  isBow(): boolean {
    return this.ctx.held.item === 'bow' || this.ctx.held.item === 'fabled_bow';
  }

  /**
   * Combined move-speed multiplier: the cooked-food buff (ADR-0012) × the
   * Village's collective tier bonus (ADR-0013). Both stack.
   */
  moveSpeedFactor(): number {
    const cooked = Date.now() < this.buffUntil ? SPEED_BUFF_FACTOR : 1;
    // ADR-0013: a running Dorffest (Wishing Well) speeds everyone in the World
    const festival = festivalActive(this.village.village, Date.now()) ? FESTIVAL_SPEED_FACTOR : 1;
    // ADR-0017 rung 1: the Tide's flood slows wading inside the Sunken Mire — a
    // pure f(clock), whole-district; the Mirefang's bearer ignores it (realm
    // synergy). Keyed on CARRYING the Mirefang (its item text promises the effect
    // "carried", not in-hand), so it holds while a machete cuts the reeds. Client-
    // side positional slow, stacked like the other move factors.
    const wade =
      this.district.activeDistrict?.id === 'sunken_mire' && tideFloods(Date.now(), TIDE_PERIOD_MS) && !gearOwns(this.ctx.inventory, this.equipped, 'mirefang')
        ? WADE_SLOW_FACTOR
        : 1;
    // ADR-0017 §3: the Tideglass Boots add their +8% beside the Village bonus
    return cooked * festival * wade * (1 + villageBuff(this.village.village.tier).moveSpeed + armorBuff(this.equipped).moveSpeed);
  }

  /** combat swing cadence with the Village's attack-speed buff folded in
   *  (ADR-0013) + the worn Gloves' bonus (ADR-0017 §3) */
  atkCadence(baseMs: number): number {
    return baseMs / (1 + villageBuff(this.village.village.tier).attackSpeed + armorBuff(this.equipped).attackSpeed);
  }

  /** the worn-Armor band raise of WHOEVER landed the hit (ADR-0017 §3): mine
   *  from my equipped record, a peer's from their synced `armor` field */
  armorBandOf(by: string): { bandMin: number; bandMax: number } {
    return armorBuff(by === this.ctx.me.name ? this.equipped : this.presence.remotes.get(by)?.armor);
  }

  // ------------------------------------------------------------ gear (ADR-0017 §4)

  /**
   * Wear/unwear one Armor piece (ADR-0017 §4): already worn → bare the slot,
   * else seat it there. The backend persists + re-validates and its record is
   * adopted; the sheet re-bakes locally at once (peers recompose off the
   * armor-carrying position broadcast the backend just pushed).
   *
   * Requests are SERIALIZED and coalesced: each toggle folds into a shared
   * desired record and the chain sends one equip at a time — without this,
   * two quick clicks would each compute from the last ACKNOWLEDGED state and
   * the slower round-trip would silently undo the faster one.
   */
  private toggleArmor(item: ItemId): void {
    const def = armorDef(item);
    if (!def) return;
    const next: EquippedGear = { ...(this.desiredEquip ?? this.equipped) };
    if (next[def.slot] === item) delete next[def.slot];
    else next[def.slot] = item;
    this.sendGear(next);
  }

  /** seat/clear one legacy gear weapon slot. Since the 2026-07-17 hotbar
   *  unification only the CLEAR path runs (the HUD's one-shot migration drains
   *  weapons an old client left equipped back into the bag); seating stays
   *  supported so an in-flight emit from an old session can't corrupt gear. */
  private setWeaponSlot(slot: WeaponSlot, item: ItemId | null): void {
    if (item && !isWeapon(item)) return;
    const next: EquippedGear = { ...(this.desiredEquip ?? this.equipped) };
    if (!item) delete next[slot];
    else {
      const other: WeaponSlot = slot === 'weapon1' ? 'weapon2' : 'weapon1';
      if (next[other] === item && (this.ctx.inventory[item] ?? 0) < 1) delete next[other];
      next[slot] = item;
    }
    this.sendGear(next);
  }

  /** the serialized, coalesced equip send shared by armor toggles and weapon slots */
  private sendGear(next: EquippedGear): void {
    this.desiredEquip = next;
    this.equipChain = this.equipChain.then(async () => {
      const want = this.desiredEquip;
      if (!want) return; // an earlier link already sent the coalesced record
      this.desiredEquip = null;
      const res = await this.ctx.backend.equip(want);
      this.equipped = res.equipped;
      this.rebuildOwnAvatar();
      // equip MOVES the piece: adopt the mutated bag so the equipped piece leaves
      // the inventory grid (and a bared one returns) live. 'inventory' BEFORE
      // 'equipped': a drained weapon must be back in the bag when the HUD
      // reconciles on the equipped event, or its quick-slot flickers
      this.ctx.setInventory(res.inventory);
      this.ctx.bus.emit('equipped', this.equipped);
      this.ctx.sfx('craft', 0.4);
    });
  }

  /** re-bake my own sheet (equip/unequip) and point the live sprite at it */
  private rebuildOwnAvatar(): void {
    const myTexture = `avatar-${this.ctx.me.name}`;
    this.ctx.player.anims.stop();
    ensureAvatarTexture(this.ctx.scene, myTexture, this.ctx.me.appearance, this.equipped);
    this.ctx.player.setTexture(myTexture, AVATAR_IDLE[this.ctx.held.lastDir]);
  }

  // ------------------------------------------------------------ the swing fx trio

  applyAnim(sprite: Phaser.GameObjects.Sprite, dir: Dir, moving: boolean): void {
    // a live swing pose (playSwingFx) outranks walk/idle for its short window —
    // gated here because this method re-writes the frame every update and
    // would otherwise stomp the pose on the very next frame
    const poseUntil = sprite.getData(SWING_POSE_KEY) as number | undefined;
    if (poseUntil !== undefined && poseUntil > Date.now()) {
      sprite.anims.stop();
      sprite.setFrame(AVATAR_SWING[dir]);
      return;
    }
    if (moving) {
      sprite.anims.play(`${sprite.texture.key}-walk-${dir}`, true);
    } else {
      sprite.anims.stop();
      sprite.setFrame(AVATAR_IDLE[dir]);
    }
  }

  /**
   * The ONE way a local swing happens: the cadence stamp, the peers' echo
   * counter and the body's pose/arc, fused so they can never desync — the
   * PlayerPos.swings contract (and the friends watching) depends on all three
   * firing together. Only the two update() cadence gates call this, and only
   * for an action that truly swings (a refused verb resolves swing:false and
   * never gets here).
   */
  markSwing(now: number): void {
    this.lastSwingAt = now;
    this.swingCount++; // rides the position stream so peers echo it
    this.playSwingFx(this.ctx.player, this.heldSprite, this.ctx.held.lastDir);
  }

  /**
   * The cosmetic body of a swing: flash the avatar's raised-arm frame for
   * ~100ms and sweep the in-hand Tool through a ~120ms grip-pivoted arc.
   * Reached through markSwing() for the local Player and the swing echo for
   * remotes — never from adjudication itself, so it fires exactly once per
   * swing and never touches timing (the cadences of ADR-0002/0006 stay authoritative).
   *
   * Deliberately takes the sprite/heldSprite/dir triple instead of reading
   * the own-player pair, so the swing echo replays a REMOTE Player's swing on
   * their RemoteView pair with the same code.
   */
  playSwingFx(sprite: Phaser.GameObjects.Sprite, heldSprite: Phaser.GameObjects.Image, dir: Dir): void {
    // pose: applyAnim honors the window on every following frame; set the
    // frame directly too so the pose shows THIS frame, not one update later
    sprite.setData(SWING_POSE_KEY, Date.now() + SWING_POSE_MS);
    sprite.anims.stop();
    sprite.setFrame(AVATAR_SWING[dir]);

    // bare hands (heldSprite hidden when nothing is held): pose only, no arc
    if (!heldSprite.visible) return;

    // kill-restart, never stack: a combat cadence can re-swing before the last
    // arc settled — the old tween dies and the new one restarts at the wind-up
    const prev = heldSprite.getData(SWING_TWEEN_KEY) as Phaser.Tweens.Tween | null;
    if (prev) prev.remove();

    // grip pivot + mirrored arc for the flipped left profile. positionHeld()
    // owns position/flip/depth per frame and never writes angle/origin, so the
    // rotation composes with it; onComplete restores both to rest exactly.
    const flip = HELD_HAND[dir].flip;
    const sign = flip ? -1 : 1;
    heldSprite.setOrigin(flip ? 1 - SWING_GRIP_X : SWING_GRIP_X, SWING_GRIP_Y);
    heldSprite.setAngle(sign * SWING_ARC_FROM_DEG);
    const restore = () => {
      heldSprite.setAngle(0).setOrigin(0.5, 0.5); // back to rest — idle rendering unchanged
      heldSprite.setData(SWING_TWEEN_KEY, null);
    };
    const tween = this.ctx.scene.tweens.add({
      targets: heldSprite,
      angle: sign * SWING_ARC_TO_DEG,
      duration: SWING_ARC_MS,
      ease: 'Quad.easeIn', // accelerate into the hit, like a real chop
      // positionHeld() re-flips the texture per frame from the CURRENT facing;
      // a left↔right turn mid-arc would leave this tween sweeping around the
      // stale mirrored grip — the tool visibly orbits its tip end — so bail to
      // rest the moment the live flip no longer matches the arc's facing.
      onUpdate: () => {
        if (heldSprite.flipX !== flip) {
          tween.remove();
          restore();
        }
      },
      onComplete: restore,
    });
    heldSprite.setData(SWING_TWEEN_KEY, tween);
  }
}
