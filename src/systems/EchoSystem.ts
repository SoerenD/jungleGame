/**
 * EchoSystem (ADR-0018 #18): the Echoes mechanic (ADR-0017 rung 2) — recorded,
 * server-persisted movement shades + pedestal-vaults, all pure f(loop-phase)
 * client-side (content/echoes.ts). Runs only inside the Hushdark; Atmosphere
 * drives updateEchoes() on its veil gate. The pedestal puzzle SUMMONS the
 * Reverberant; its defeat reward flows through the server-guarded claim.
 */
import type Phaser from 'phaser';
import { AVATAR_H, AVATAR_IDLE } from '../avatars';
import type { Dir } from '../backend/types';
import { ECHO_MIN_MOVE_TILES, ECHO_PEDESTAL_RADIUS, ECHO_PERIOD_MS, DEV_ECHO, TILE } from '../config';
import { ghostPoseAt, ghostTravelTiles, poseOnPedestal, vaultWeek, type EchoSample, type Ghost, type Pose } from '../content/echoes';
import type { GameScene } from '../scenes/GameScene';
import { t } from '../i18n';
import type { GameContext } from './context';
import type { DistrictSystem } from './DistrictSystem';
import type { PresenceSystem } from './PresenceSystem';
import { addShadow } from './sceneFx';
import type { EAction, GameSystem } from './types';

export class EchoSystem implements GameSystem {
  /** the in-progress 20s recording (null when not recording); `greeting` = the
   *  permanent memorial mark rather than an ordinary vault-solving shade */
  private echoRecording: { ghostId: string; startedAt: number; lastSampleAt: number; samples: EchoSample[]; greeting?: boolean } | null = null;
  /** which ghost slot the next recording overwrites (a Player keeps ECHO_SLOTS shades) */
  private echoNextSlot = 0;
  /** the World's shades, refreshed from the backend (RPC read, never presence) */
  private echoGhosts: Ghost[] = [];
  private echoLastListAt = 0;
  /** per-ghost render sprites (greetings also carry a nameplate), reaped on district exit */
  private echoGhostViews = new Map<string, { sprite: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Image; label?: Phaser.GameObjects.Text }>();
  /** the pedestal + vault-door markers (rebuilt lazily for the active district) */
  private hushVaultGfx: Phaser.GameObjects.Graphics | null = null;
  /** vault ids the client currently derives as SOLVED (all pedestals covered) */
  private hushVaultOpen = new Set<string>();
  /** cross-system refs, wired by GameScene (ADR-0018 §3) */
  district!: DistrictSystem;
  presence!: PresenceSystem;

  constructor(
    private ctx: GameContext,
    private host: GameScene,
  ) {}

  create(): void {}

  /** the scene-dispatch contract is a no-op — Atmosphere drives updateEchoes on its veil gate */
  update(_time?: number, _dt?: number): void {}

  destroy(): void {}

  /** the Hushdark frame: refresh shades, advance a recording, render shades, vaults */
  updateEchoes(time: number, _delta: number): void {
    const inHush = this.district.activeDistrict?.id === 'the_hushdark';
    const now = Date.now();
    // refresh the shade list + the vault-claim weeks (RPC reads; throttled; NEVER
    // presence — rate-limit gotcha). The vault weeks gate the deep vault + claims.
    if (inHush && time - this.echoLastListAt > 3000) {
      this.echoLastListAt = time;
      void this.ctx.backend.listEchoes().then((gs) => {
        this.echoGhosts = gs;
      });
    }
    // advance an in-progress recording (sample the Player, close at the period)
    if (this.echoRecording) {
      if (!inHush) {
        this.echoRecording = null; // left mid-recording — abandon (no charm spent yet)
      } else {
        const rec = this.echoRecording;
        const elapsed = now - rec.startedAt;
        if (now - rec.lastSampleAt >= 110 && rec.samples.length < 400) {
          rec.lastSampleAt = now;
          rec.samples.push({ t: Math.min(elapsed, ECHO_PERIOD_MS), x: this.ctx.player.x / TILE, y: this.ctx.player.y / TILE, dir: this.ctx.held.lastDir });
        }
        if (elapsed >= ECHO_PERIOD_MS) this.finishEchoRecording();
      }
    }
    if (!inHush) {
      this.reapEchoViews();
      if (this.hushVaultGfx) this.hushVaultGfx.setVisible(false);
      return;
    }
    this.renderGhosts(now);
    this.updateVaults(now);
  }

  /** E at a Hushdark pedestal arms a 20s recording; a chime_charm is required */
  private armEchoRecording(): void {
    if (this.echoRecording) return;
    if ((this.ctx.inventory.chime_charm ?? 0) < 1) {
      this.ctx.bus.emit('toast', t.toast.echoNeedsCharm, 'bad');
      return;
    }
    const ghostId = `${this.ctx.me.name}#${this.echoNextSlot}`;
    this.echoNextSlot = (this.echoNextSlot + 1) % 3; // a Player keeps up to 3 shades
    this.echoRecording = { ghostId, startedAt: Date.now(), lastSampleAt: 0, samples: [] };
    this.ctx.bus.emit('toast', t.toast.echoArmed, 'info');
  }

  /** E at the memorial: record the PERMANENT greeting shade (no charm — the reward) */
  private armGreetingRecording(): void {
    if (this.echoRecording) return;
    this.echoRecording = { ghostId: `${this.ctx.me.name}@greet`, startedAt: Date.now(), lastSampleAt: 0, samples: [], greeting: true };
    this.ctx.bus.emit('toast', t.toast.echoArmed, 'info');
  }

  /** close a recording: reject a motionless shade (anti-parking), else persist it —
   *  an ordinary shade via recordEcho (spends a charm), a greeting via leaveGreeting */
  private finishEchoRecording(): void {
    const rec = this.echoRecording;
    this.echoRecording = null;
    if (!rec) return;
    if (ghostTravelTiles(rec.samples) < ECHO_MIN_MOVE_TILES) {
      this.ctx.bus.emit('toast', t.toast.echoTooStill, 'bad'); // no charm spent (nothing sent)
      return;
    }
    if (rec.greeting) {
      void this.ctx.backend.leaveGreeting(rec.samples, ECHO_PERIOD_MS).then((ghost) => {
        if (!ghost) return;
        this.echoGhosts = [ghost, ...this.echoGhosts.filter((g) => g.ghostId !== ghost.ghostId)];
        this.ctx.bus.emit('toast', t.toast.greetingLeft, 'good');
      });
      return;
    }
    void this.ctx.backend.recordEcho(rec.ghostId, rec.samples, ECHO_PERIOD_MS).then((res) => {
      if (!res) {
        this.ctx.bus.emit('toast', t.toast.echoNeedsCharm, 'bad');
        return;
      }
      this.ctx.setInventory(res.inventory);
      this.echoGhosts = [res.ghost, ...this.echoGhosts.filter((g) => g.ghostId !== res.ghost.ghostId)];
      this.ctx.bus.emit('toast', t.toast.echoCaptured, 'good');
    });
  }

  /** position a translucent shade per listed ghost; reap views for vanished shades.
   *  Ordinary shades are cold blue; a greeting shade is warm gold + a floating name. */
  private renderGhosts(now: number): void {
    const scene = this.ctx.scene;
    const live = new Set<string>();
    for (const g of this.echoGhosts) {
      const pose = ghostPoseAt(now, g, g.periodMs);
      if (!pose) continue;
      live.add(g.ghostId);
      const x = pose.x * TILE;
      const y = pose.y * TILE;
      const greeting = g.kind === 'greeting';
      const frame = AVATAR_IDLE[(pose.dir ?? 'down') as Dir];
      let view = this.echoGhostViews.get(g.ghostId);
      if (!view) {
        const texKey = scene.textures.exists(`avatar-${g.who}`) ? `avatar-${g.who}` : `avatar-${this.ctx.me.name}`;
        const sprite = scene.add
          .sprite(x, y, texKey, frame)
          .setOrigin(0.5, 1)
          .setAlpha(greeting ? 0.55 : 0.42)
          .setTint(greeting ? 0xffd98a : 0x9fc4ff);
        const shadow = addShadow(scene, x, y - 1, 12).setAlpha(0.22);
        view = { sprite, shadow };
        if (greeting) {
          view.label = scene.add
            .text(x, y - AVATAR_H - 4, g.who, { fontFamily: 'monospace', fontSize: '9px', color: '#ffe6a8' })
            .setOrigin(0.5, 1)
            .setDepth(y + 1);
        }
        this.echoGhostViews.set(g.ghostId, view);
      }
      view.sprite.setPosition(x, y).setDepth(y).setFrame(frame);
      view.shadow.setPosition(x, y - 1);
      view.label?.setPosition(x, y - AVATAR_H - 4).setDepth(y + 1);
    }
    for (const [id, view] of this.echoGhostViews) {
      if (!live.has(id)) {
        view.sprite.destroy();
        view.shadow.destroy();
        view.label?.destroy();
        this.echoGhostViews.delete(id);
      }
    }
  }

  /** does any point of a shade's loop cross the pedestal? (dev vault-open aid only) */
  private ghostEverCovers(g: Ghost, ped: { tx: number; ty: number }): boolean {
    const steps = 24;
    for (let i = 0; i < steps; i++) {
      const pose = ghostPoseAt(g.recordedAt + (i / steps) * g.periodMs, g, g.periodMs);
      if (poseOnPedestal(pose, { tx: ped.tx + 0.5, ty: ped.ty + 0.5 }, ECHO_PEDESTAL_RADIUS)) return true;
    }
    return false;
  }

  private ensureVaultGfx(): Phaser.GameObjects.Graphics {
    if (!this.hushVaultGfx) this.hushVaultGfx = this.ctx.scene.add.graphics().setDepth(3);
    return this.hushVaultGfx;
  }

  /** derive the puzzle from live-player + shade coverage; when all three pedestals
   *  are covered AT ONCE (and no fight runs), SUMMON the Reverberant — the puzzle
   *  is a boss key, not a loot lever. Draws the pedestals + the court seal. */
  private updateVaults(now: number): void {
    const vaults = this.ctx.world.hushdarkVaults ?? [];
    const gfx = this.ensureVaultGfx();
    gfx.clear().setVisible(true);
    const coverers: (Pose | null)[] = [{ x: this.ctx.player.x / TILE, y: this.ctx.player.y / TILE }];
    for (const r of this.presence.remotes.values()) coverers.push({ x: r.sprite.x / TILE, y: r.sprite.y / TILE });
    for (const g of this.echoGhosts) coverers.push(ghostPoseAt(now, g, g.periodMs));
    let anySolved = false;
    for (const v of vaults) {
      const centre = (p: { tx: number; ty: number }) => ({ tx: p.tx + 0.5, ty: p.ty + 0.5 });
      const coveredNow = (p: { tx: number; ty: number }) => coverers.some((c) => poseOnPedestal(c, centre(p), ECHO_PEDESTAL_RADIUS));
      let solved = v.pedestals.every(coveredNow);
      // ?echotest aid: a pedestal also counts if a shade's loop EVER crosses it, so
      // the async-coop plumbing is solo-testable without perfect phase alignment
      if (!solved && DEV_ECHO) {
        solved = v.pedestals.every((ped) => coveredNow(ped) || this.echoGhosts.some((g) => this.ghostEverCovers(g, ped)));
      }
      if (solved) anySolved = true;
      for (const ped of v.pedestals) this.drawPlinth(gfx, ped.tx, ped.ty, coveredNow(ped) ? 0x63ffb0 : 0x93a8c9);
      this.drawVaultDoor(gfx, v.door.tx, v.door.ty, solved); // the court seal — bright when solved
      if (solved) this.hushVaultOpen.add(v.id);
      else this.hushVaultOpen.delete(v.id);
      // fire the summon exactly once per coverage event (re-armed when coverage drops)
      if (solved && !this.host.fight && !this.host.reverbSummonBusy) {
        this.host.reverbSummonBusy = true;
        void this.summonReverberant();
      }
    }
    if (!anySolved && !this.host.fight) this.host.reverbSummonBusy = false; // re-arm for the next solve
    // the memorial plinth — warm once you've defeated the Reverberant, cold when locked
    const mem = this.ctx.world.hushdarkMemorial;
    if (mem) this.drawPlinth(gfx, mem.tx, mem.ty, this.host.reverbDefeated ? 0xffd98a : 0x6b6478);
  }

  private drawPlinth(gfx: Phaser.GameObjects.Graphics, tx: number, ty: number, color: number): void {
    const x = (tx + 0.5) * TILE;
    const y = (ty + 0.5) * TILE;
    gfx.fillStyle(color, 0.18).fillCircle(x, y, TILE * 0.5);
    gfx.lineStyle(2, color, 0.85).strokeCircle(x, y, TILE * 0.5);
  }

  private drawVaultDoor(gfx: Phaser.GameObjects.Graphics, tx: number, ty: number, solved: boolean): void {
    const x = (tx + 0.5) * TILE;
    const y = (ty + 0.5) * TILE;
    const c = solved ? 0xc9b0ff : 0x3a4560; // violet when solved (the Reverberant's colour)
    gfx.fillStyle(c, solved ? 0.34 : 0.5).fillRect(x - TILE * 0.6, y - TILE * 0.6, TILE * 1.2, TILE * 1.2);
    gfx.lineStyle(2, solved ? 0xe6dcff : 0x93a8c9, 0.9).strokeRect(x - TILE * 0.6, y - TILE * 0.6, TILE * 1.2, TILE * 1.2);
  }

  /** solving the 3-pedestal puzzle summons the Reverberant (no altar/totem) */
  private async summonReverberant(): Promise<void> {
    const res = await this.ctx.backend.summonReverberant().catch(() => ({ ok: false as const }));
    // on ok, the guardianSummoned event drives startFight (the boss rises); the busy
    // latch stays until coverage drops, and the one-fight mutex blocks any re-summon.
    if (!res.ok) this.host.reverbSummonBusy = false; // a refused summon may retry
  }

  /** the Reverberant's defeat reward (server-guarded, idempotent): the epic helm +
   *  Reliquary on the first-ever clear, an Echo Sigil + resources once per week */
  async claimReverbReward(): Promise<void> {
    this.host.reverbDefeated = true; // unlocks the memorial greeting
    const res = await this.ctx.backend.claimReverb(vaultWeek(Date.now())).catch(() => ({ ok: false as const }));
    if (!res.ok) return;
    if ('inventory' in res && res.inventory) {
      this.ctx.setInventory(res.inventory);
    }
    if ('weekly' in res && res.weekly) this.ctx.bus.emit('toast', t.toast.reverbWeekly, 'good');
    if ('firstEver' in res && res.firstEver) {
      this.ctx.bus.emit('toast', t.toast.reverbEpicHelm, 'good');
      this.ctx.bus.emit('toast', t.toast.reliquaryEarned, 'good');
    }
  }

  /** E in the Hushdark: arm a recording at a pedestal, or (once you've defeated the
   *  Reverberant) leave a permanent greeting at the memorial. The puzzle itself is
   *  solved by COVERAGE (shades on the 3 pedestals), which summons the boss — no
   *  door to press. */
  echoAction(): EAction | null {
    if (this.district.activeDistrict?.id !== 'the_hushdark' || this.host.fight) return null;
    const px = this.ctx.player.x / TILE;
    const py = this.ctx.player.y / TILE;
    const near = (p: { tx: number; ty: number }) => Math.hypot(px - (p.tx + 0.5), py - (p.ty + 0.5)) <= 1.4;
    // the memorial plinth: leave a permanent greeting once you've bested the Reverberant
    const mem = this.ctx.world.hushdarkMemorial;
    if (mem && near(mem)) {
      if (!this.host.reverbDefeated) return { swing: false, run: () => this.ctx.bus.emit('toast', t.toast.greetingLocked, 'info') };
      return { swing: false, run: () => this.armGreetingRecording() };
    }
    // a pedestal: arm a recording (the shade that solves the puzzle)
    if (!this.echoRecording) {
      for (const v of this.ctx.world.hushdarkVaults ?? []) {
        for (const ped of v.pedestals) {
          if (near(ped)) return { swing: false, run: () => this.armEchoRecording() };
        }
      }
    }
    return null;
  }

  /** destroy every shade sprite (district exit / scene shutdown) */
  private reapEchoViews(): void {
    for (const view of this.echoGhostViews.values()) {
      view.sprite.destroy();
      view.shadow.destroy();
      view.label?.destroy();
    }
    this.echoGhostViews.clear();
  }
}
