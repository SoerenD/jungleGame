/**
 * PresenceSystem (ADR-0018 #15): remote Players — the roster reconcile from
 * presence syncs, per-peer render bundles (sprite/label/shadow/held/torch),
 * the swing echo, per-frame interpolation (§8 step 7) and the throttled
 * overworld position broadcast (§8 step 15). Owns the position/presence
 * backend listeners; exposes the same roster data host election reads.
 */
import Phaser from 'phaser';
import { AVATAR_H, AVATAR_IDLE, ensureAvatarTexture } from '../avatars';
import type { EquippedArmor } from '../content/armor';
import type { ItemId } from '../content/items';
import type { Dir, PlayerPos } from '../backend/types';
import type { GameScene } from '../scenes/GameScene';
import { t } from '../i18n';
import type { AtmosphereSystem } from './AtmosphereSystem';
import type { GameContext } from './context';
import type { FogSystem } from './FogSystem';
import { addShadow, positionHeld, setHeldTexture, TORCH_TINT } from './sceneFx';
import type { GameSystem } from './types';

export interface RemoteView {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  shadow: Phaser.GameObjects.Image;
  /** the item shown in this Player's hand; hidden when nothing is held */
  heldSprite: Phaser.GameObjects.Image;
  /** warm light this Player casts while holding a Hand Torch */
  torchGlow: Phaser.GameObjects.Image;
  held: ItemId | null;
  targetX: number;
  targetY: number;
  dir: Dir;
  moving: boolean;
  /** JSON of the composed Appearance — texture regenerates when it changes */
  look: string;
  /**
   * High-water mark of PlayerPos.swings seen from this peer; a packet above it
   * plays one swing echo. Undefined until the peer first sends the field
   * (bots/old clients never do — they render exactly as before).
   */
  swings?: number;
  /** the Armor this peer wears (part of `look` — a change recomposes the texture) */
  armor?: EquippedArmor;
}

/**
 * A peer's swings counter arriving THIS far below our stored high-water mark
 * means their session restarted (the counter is per-session and reboots at 0),
 * not that a stale presence meta interleaved — metas lag the broadcast stream
 * by at most a couple of swings, never by ~9s of continuous swinging.
 */
const REMOTE_SWING_RESET_GAP = 30;

export class PresenceSystem implements GameSystem {
  remotes = new Map<string, RemoteView>();
  /** cross-system refs, wired by GameScene (ADR-0018 §3) */
  fog!: FogSystem;
  atmosphere!: AtmosphereSystem;
  private onPosition = (p: PlayerPos): void => this.upsertRemote(p);
  private onPresence = (players: PlayerPos[]): void => this.reconcilePresence(players);

  constructor(
    private ctx: GameContext,
    private host: GameScene,
  ) {}

  create(): void {
    this.ctx.backend.on('position', this.onPosition);
    this.ctx.backend.on('presence', this.onPresence);
  }

  /** §8 step 7: remote interpolation + per-peer follow objects */
  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    const night = this.atmosphere.nightness();
    for (const r of this.remotes.values()) {
      const k = Math.min(1, dt * 12);
      r.sprite.x += (r.targetX - r.sprite.x) * k;
      r.sprite.y += (r.targetY - r.sprite.y) * k;
      // elevation depth bump: a peer up on a plateau sorts above the base (ADR-0009)
      const rBump = this.atmosphere.elevationBonus(r.sprite.x, r.sprite.y);
      r.sprite.setDepth(r.sprite.y + rBump);
      r.shadow.setPosition(r.sprite.x, r.sprite.y - 1);
      r.label.setPosition(r.sprite.x, r.sprite.y - AVATAR_H - 2);
      r.label.setDepth(r.sprite.y + 1 + rBump);
      positionHeld(r.heldSprite, r.sprite.x, r.sprite.y, r.dir);
      if (rBump) r.heldSprite.setDepth(r.heldSprite.depth + rBump);
      r.torchGlow
        .setPosition(r.sprite.x, r.sprite.y - 8)
        .setAlpha(r.held === 'hand_torch' ? 0.1 + night * 0.35 : 0);
      const visuallyMoving = r.moving || Math.hypot(r.targetX - r.sprite.x, r.targetY - r.sprite.y) > 2;
      this.host.applyAnim(r.sprite, r.dir, visuallyMoving);
    }
  }

  destroy(): void {
    this.ctx.backend.off('position', this.onPosition);
    this.ctx.backend.off('presence', this.onPresence);
  }

  /** §8 step 15: the throttled overworld position broadcast */
  throttledSend(time: number, moving: boolean): void {
    if (time - this.host.lastPosSent > 100) {
      this.host.lastPosSent = time;
      this.ctx.backend.sendPosition(
        this.ctx.player.x,
        this.ctx.player.y,
        this.ctx.held.lastDir,
        moving,
        this.ctx.held.item ?? undefined,
        this.host.swingCount,
      );
    }
  }

  emitPresence(): void {
    this.ctx.bus.emit('presence', [this.ctx.me.name, ...this.remotes.keys()]);
  }

  /**
   * Reconcile the live roster from a backend presence sync: upsert everyone
   * present and drop the sprites of any Player who has left (the Mock's bots
   * never leave, so this only ever fires for the real multiplayer backend).
   */
  private reconcilePresence(players: PlayerPos[]): void {
    const live = new Set<string>();
    for (const p of players) {
      if (p.name === this.ctx.me.name) continue;
      live.add(p.name);
      this.upsertRemote(p);
    }
    for (const name of [...this.remotes.keys()]) if (!live.has(name)) this.removeRemote(name);
    this.emitPresence();
    // ADR-0012: presence changed → re-elect the creature host (graceful re-elect +
    // respawn on host-leave; the new host repopulates its pool around remaining Players)
    this.host.recomputeWildHost();
    // v1 host-leave (ADR-0007 §6): if I'm a guest and the host dropped off
    // presence without a clean 'end', the mobs' brain is gone — boot out, no loot
    if (this.host.inDelve && !this.host.isDelveHost && this.host.delveHostName && !live.has(this.host.delveHostName)) {
      this.ctx.bus.emit('toast', t.toast.hostLeftCollapse, 'bad');
      this.host.leaveDelve();
    }
  }

  private removeRemote(name: string): void {
    const r = this.remotes.get(name);
    if (!r) return;
    r.sprite.destroy();
    r.label.destroy();
    r.shadow.destroy();
    r.heldSprite.destroy();
    r.torchGlow.destroy();
    this.remotes.delete(name);
    this.emitPresence();
  }

  upsertRemote(p: PlayerPos): void {
    if (p.name === this.ctx.me.name) return;
    const scene = this.ctx.scene;
    // the recompose key folds the worn Armor in (ADR-0017 §4): an equip
    // re-dresses the remote body exactly like a rejoined-with-new-look edit
    const look = JSON.stringify([p.appearance, p.armor ?? null]);
    const texture = `avatar-${p.name}`;
    let r = this.remotes.get(p.name);
    if (!r) {
      ensureAvatarTexture(scene, texture, p.appearance, p.armor);
      const shadow = addShadow(scene, p.x, p.y, 14);
      const sprite = scene.add.sprite(p.x, p.y, texture, AVATAR_IDLE.down);
      sprite.setOrigin(0.5, 1);
      const label = scene.add.text(p.x, p.y - AVATAR_H - 4, p.name, {
        fontSize: '7px',
        color: '#e8f5e9',
        stroke: '#000000',
        strokeThickness: 2,
      });
      label.setOrigin(0.5, 1);
      label.setResolution(6);
      // world-space text is magnified by camera ZOOM — labelScale() scales it
      // well down AND counter-scales by zoom so the name stays a constant-size
      // readable tag over the head at any zoom (× the player setting)
      label.setScale(this.fog.labelScale());
      label.setAlpha(0.9);
      // the item they hold, shown in their hand, synced through presence
      const heldSprite = scene.add
        .image(p.x, p.y, 'held-axe')
        .setOrigin(0.5, 0.5)
        .setScale(0.8)
        .setDepth(p.y + 1)
        .setVisible(false);
      // a Hand Torch in their hand lights them too
      const torchGlow = scene.add
        .image(p.x, p.y - 8, 'glow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(TORCH_TINT)
        .setScale(1.6)
        .setAlpha(0)
        .setDepth(890_000);
      r = { sprite, label, shadow, heldSprite, torchGlow, held: null, targetX: p.x, targetY: p.y, dir: p.dir, moving: p.moving, look, armor: p.armor };
      this.remotes.set(p.name, r);
      this.emitPresence();
    } else if (r.look !== look) {
      // they re-joined with an edited Avatar, or equipped Armor — recompose
      r.look = look;
      r.armor = p.armor;
      r.sprite.anims.stop();
      ensureAvatarTexture(scene, texture, p.appearance, p.armor);
      r.sprite.setTexture(texture, AVATAR_IDLE[p.dir]);
    }
    r.targetX = p.x;
    r.targetY = p.y;
    r.dir = p.dir;
    r.moving = p.moving;
    const held = p.held ?? null;
    if (r.held !== held) {
      r.held = held;
      setHeldTexture(scene, r.heldSprite, held);
    }
    // swing echo (PlayerPos.swings): the counter grew since the last packet →
    // they swung. Exactly ONE pose+arc per packet however big the jump (the
    // 10Hz stream batches the ~300ms cadence, so +1/+2 is normal); first sight
    // of the field initializes silently, so a mid-session joiner never replays
    // a burst. The mark is a high-water mark against small dips: presence-sync
    // snapshots refresh far slower than the broadcast stream, and a stale meta
    // interleaving with fresh packets must not re-echo an already-played swing.
    // A LARGE dip is different: swingCount restarts at 0 on reload, and a fast
    // reload keeps the presence key (the name) live so this RemoteView — and a
    // huge stale mark — survives. Without the reset the rejoined peer's echoes
    // would stay muted until they out-swung their whole previous session.
    if (p.swings !== undefined) {
      const stale = r.swings !== undefined && r.swings - p.swings > REMOTE_SWING_RESET_GAP;
      if (stale) {
        r.swings = p.swings; // their session restarted — adopt silently
      } else {
        if (r.swings !== undefined && p.swings > r.swings) {
          this.host.playSwingFx(r.sprite, r.heldSprite, r.dir);
        }
        r.swings = Math.max(r.swings ?? p.swings, p.swings);
      }
    }
  }
}
