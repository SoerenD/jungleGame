/**
 * WildlifeSystem (ADR-0018 #17): open-world Wildlife (ADR-0012) — deterministic
 * creature-host election off presence, the host-simmed roaming pool (shared
 * stepMob engine), enrage/calm, render + own-harm checks, hunt/forage loot and
 * the rolling-window Exhaustion. update() is the §8 step-8 frame.
 */
import Phaser from 'phaser';
import type { CreatureMsg, Inventory, MobSnap } from '../backend/types';
import {
  CREATURE_DENSITY,
  CREATURE_DESPAWN_TILES,
  CREATURE_NIGHT_MULT,
  CREATURE_NIGHT_THRESHOLD,
  CREATURE_PREDATOR_CHANCE,
  CREATURE_SPAWN_MAX_TILES,
  CREATURE_SPAWN_MIN_TILES,
  MAP_H,
  MAP_W,
  TILE,
  WILD_BROADCAST_MS,
  WILD_EXHAUST_WINDOW_MS,
  WILD_EXHAUSTION_KNOCKDOWNS,
  WILD_SPAWN_TICK_MS,
} from '../config';
import { applyMobHit, createMob, profileOf, stepMob, type MobKind, type MobState } from '../content/dungeon';
import { GUARDIAN_DISPLAY_SCALE, weaponCombat } from '../content/guardian';
import { ITEMS, type ItemId, type ResourceId, type ToolId } from '../content/items';
import { inVillageZone, villageBuff } from '../content/village';
import { isPredator, isWildKind, planWildSpawn, RAGE_PROFILES, rollWildLoot, WILD_RAGE_MS, type WildKind } from '../content/wildlife';
import { MOB_TEX } from '../mobSprites';
import type { GameScene } from '../scenes/GameScene';
import { t } from '../i18n';
import type { AtmosphereSystem } from './AtmosphereSystem';
import type { GameContext } from './context';
import type { PresenceSystem } from './PresenceSystem';
import { clearDeathFx, DEATH_PUFF_TINT_WILD, floatText, playDeathBeat, type MobView } from './sceneFx';
import type { EAction, GameSystem } from './types';
import type { VillageSystem } from './VillageSystem';

export class WildlifeSystem implements GameSystem {
  /** host: authoritative creature state (HP lives ONLY here — never the DB). Guests: last snapshot. */
  wildMobs = new Map<string, MobState>();
  private wildViews = new Map<string, MobView>();
  /** J4: death-beat orphans mid-animation (views detached from wildViews) —
   *  reaped by clearWildMobs so a creature-host change mid-beat never leaks */
  private wildDeathFx = new Set<Phaser.GameObjects.GameObject[]>();
  /** host-side gentle-roam state for idle peaceful creatures (orchestration, not engine AI) */
  private wildWander = new Map<string, { ang: number; until: number }>();
  /** host-side enrage ledger: a hit survivor charges the Player who shot it until
   *  the timer runs dry (refreshed per hit) — orchestration, not engine AI */
  wildRage = new Map<string, { by: string; until: number }>();
  /** am I the elected creature host? (lowest-sorting online name — deterministic, zero negotiation) */
  isWildHost = false;
  wildHostName = '';
  private lastWildSpawnAt = 0;
  private lastWildSnapAt = 0;
  nextWildId = 1;
  /** open-world knockdown timestamps — a rolling window (distinct from the Guardian's per-fight count) */
  wildKnockdownTimes: number[] = [];
  /** cross-system refs, wired by GameScene (ADR-0018 §3) */
  atmosphere!: AtmosphereSystem;
  village!: VillageSystem;
  presence!: PresenceSystem;
  private onCreatures = (msg: CreatureMsg): void => this.onCreatureMsg(msg);

  constructor(
    private ctx: GameContext,
    private host: GameScene,
  ) {}

  create(): void {
    this.ctx.backend.on('creatures', this.onCreatures);
  }

  destroy(): void {
    this.ctx.backend.off('creatures', this.onCreatures);
  }

  /**
   * Deterministic creature-host election from the shared presence roster (zero
   * negotiation): the lowest-sorting online real-Player name is the host; every
   * client computes the same. On a host change I (as a guest) drop any locally
   * simulated creatures — the host's snapshots drive me now. In single-player the
   * lone MockBackend Player is trivially the host. Re-run on every presence sync.
   */
  recomputeWildHost(): void {
    const roster = this.ctx.backend.creatureRoster();
    const host = (roster.length ? [...roster].sort() : [this.ctx.me.name])[0];
    const wasHost = this.isWildHost;
    const hostChanged = host !== this.wildHostName;
    this.wildHostName = host;
    this.isWildHost = host === this.ctx.me.name;
    // stepping down from host, or the authority moved to someone else: my local
    // creatures are stale — clear them and rebuild from the new host's snapshots
    if (!this.isWildHost && (wasHost || hostChanged)) this.clearWildMobs();
    // PROMOTED to host: the inherited snapshot mobs may carry rage=true, but the
    // rage LEDGER (shooter + timer) was host-local and died with the old host —
    // without an entry the rage branch never runs and calmWild could never clear
    // the flag, leaving a permanently red, rage-telegraphing creature. Rage ends
    // on handover (a rare 12s window) rather than sticking forever.
    if (this.isWildHost && !wasHost) {
      for (const m of this.wildMobs.values()) m.rage = undefined;
    }
  }

  private clearWildMobs(): void {
    for (const v of this.wildViews.values()) {
      v.sprite.destroy();
      v.shadow.destroy();
      v.tele.destroy();
      v.bar.destroy();
    }
    this.wildViews.clear();
    this.wildMobs.clear();
    this.wildWander.clear();
    this.wildRage.clear();
    // J4: reap any death beat mid-animation — its objects are orphans (out of
    // wildViews) and a host handover must not strand them
    clearDeathFx(this.ctx.scene, this.wildDeathFx);
  }

  /** real online Player positions in TILE units (self + rendered peers; not sim bots) */
  private wildPlayerPositions(): { x: number; y: number }[] {
    const player = this.ctx.player;
    const out: { x: number; y: number }[] = [];
    for (const name of this.ctx.backend.creatureRoster()) {
      if (name === this.ctx.me.name) out.push({ x: player.x / TILE, y: (player.y - 4) / TILE });
      else {
        const r = this.presence.remotes.get(name);
        if (r) out.push({ x: r.sprite.x / TILE, y: (r.sprite.y - 4) / TILE });
      }
    }
    if (!out.length) out.push({ x: player.x / TILE, y: (player.y - 4) / TILE });
    return out;
  }

  private wildPlayerAnchors(): { tx: number; ty: number }[] {
    return this.wildPlayerPositions().map((p) => ({ tx: Math.floor(p.x), ty: Math.floor(p.y) }));
  }

  /** ONE online Player's live position in TILE units (self or a rendered peer) —
   *  the enraged creature's quarry lookup */
  private wildPlayerPos(name: string): { x: number; y: number } | null {
    if (name === this.ctx.me.name) return { x: this.ctx.player.x / TILE, y: (this.ctx.player.y - 4) / TILE };
    const r = this.presence.remotes.get(name);
    return r ? { x: r.sprite.x / TILE, y: (r.sprite.y - 4) / TILE } : null;
  }

  /** can a creature stand on this World tile? (open ground — not water/cliff, in bounds) */
  private wildWalkable(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    return this.ctx.world.blocked[ty * MAP_W + tx] === 0;
  }

  /**
   * Is (tx,ty) danger-flagged wilds (predator-eligible)? The Village is ALWAYS a
   * safe haven, and the un-zoned Deep Jungle + every core Zone are safe too —
   * predators only ever spawn/roam on a tile whose Zone carries `dangerous`.
   */
  dangerAt(tx: number, ty: number): boolean {
    if (inVillageZone(this.village.village, tx, ty)) return false; // the Village never has teeth
    for (const z of this.ctx.world.zones) {
      if (tx >= z.x && tx < z.x + z.w && ty >= z.y && ty < z.y + z.h) return !!z.dangerous;
    }
    return false; // Deep Jungle / unzoned = safe core
  }

  /** §8 step 8 — the whole Wildlife frame: host sim + broadcast, then render + own-harm check (every client) */
  update(time: number, delta: number): void {
    if (this.isWildHost) {
      if (time - this.lastWildSpawnAt > WILD_SPAWN_TICK_MS) {
        this.lastWildSpawnAt = time;
        this.maintainWildPool();
      }
      this.stepWild(delta);
      if (time - this.lastWildSnapAt > WILD_BROADCAST_MS) {
        this.lastWildSnapAt = time;
        this.broadcastWild();
      }
    }
    this.renderWild(time, delta);
    if (Date.now() >= this.host.stunnedUntil) this.checkWildHarm();
  }

  /**
   * Host only: keep an ephemeral pool roaming around each online Player. Cull
   * creatures that drift far from everyone, then top up toward the density — more
   * (and predator-leaning) at night in danger Zones. Peaceful spawn anywhere
   * walkable; predators ONLY on danger tiles (planWildSpawn enforces this).
   */
  private maintainWildPool(): void {
    const anchors = this.wildPlayerAnchors();
    if (!anchors.length) return;
    const night = this.atmosphere.nightness() > CREATURE_NIGHT_THRESHOLD;
    for (const [id, m] of this.wildMobs) {
      let near = false;
      for (const a of anchors) {
        if (Math.hypot(m.x - a.tx, m.y - a.ty) <= CREATURE_DESPAWN_TILES) {
          near = true;
          break;
        }
      }
      if (!near) {
        this.wildMobs.delete(id);
        this.wildWander.delete(id);
        this.wildRage.delete(id);
      }
    }
    const predatorChance = Math.min(0.9, CREATURE_PREDATOR_CHANCE * (night ? CREATURE_NIGHT_MULT : 1));
    for (const a of anchors) {
      const boost = night && this.dangerAt(a.tx, a.ty) ? CREATURE_NIGHT_MULT : 1;
      const target = Math.round(CREATURE_DENSITY * boost);
      let count = 0;
      for (const m of this.wildMobs.values()) {
        if (Math.hypot(m.x - a.tx, m.y - a.ty) <= CREATURE_SPAWN_MAX_TILES + 6) count++;
      }
      // fill a few per tick so life fades in briskly without a pop-in wall
      for (let i = 0; i < 3 && count < target; i++) {
        const spawn = planWildSpawn(a, {
          rng: Math.random,
          minR: CREATURE_SPAWN_MIN_TILES,
          maxR: CREATURE_SPAWN_MAX_TILES,
          isWalkable: (tx, ty) => this.wildWalkable(tx, ty),
          dangerAt: (tx, ty) => this.dangerAt(tx, ty),
          predatorChance,
        });
        if (!spawn) break;
        const id = `w${this.nextWildId++}`;
        this.wildMobs.set(id, createMob(id, { kind: spawn.kind, x: spawn.x, y: spawn.y }, 1));
        count++;
      }
    }
  }

  /** host: advance every creature one frame through the SHARED engine (stepMob) */
  private stepWild(delta: number): void {
    const allTargets = this.wildPlayerPositions(); // peaceful flee from anyone nearby
    // predators only "see" Players standing in the wilds — step onto the safe core
    // and they lose the scent (de-aggro); they also can't physically follow (below)
    const dangerTargets = allTargets.filter((p) => this.dangerAt(Math.floor(p.x), Math.floor(p.y)));
    const now = Date.now();
    for (const m of this.wildMobs.values()) {
      if (m.st === 'dead') {
        this.wildMobs.delete(m.id);
        continue;
      }
      // ENRAGED: the creature hunts ITS SHOOTER with the rage profile — revenge
      // follows onto safe ground (unlike a predator's usual leash), but the
      // Village never has teeth: a shooter who reaches it calls the revenge off,
      // and a creature outside never steps in (one already inside may move out —
      // walling EVERY tile would freeze it into a statue). Timer dry, shooter
      // gone or shooter in sanctuary → it calms down.
      const rage = this.wildRage.get(m.id);
      if (rage) {
        const quarry = now < rage.until ? this.wildPlayerPos(rage.by) : null;
        const quarrySafe = !quarry || inVillageZone(this.village.village, Math.floor(quarry.x), Math.floor(quarry.y));
        if (quarry && !quarrySafe) {
          const mobInVillage = inVillageZone(this.village.village, Math.floor(m.x), Math.floor(m.y));
          const ev = stepMob(m, {
            targets: [quarry],
            isWall: (tx, ty) => !this.wildWalkable(tx, ty) || (!mobInVillage && inVillageZone(this.village.village, tx, ty)),
            dt: delta,
            rng: Math.random,
            profile: RAGE_PROFILES[m.kind as WildKind],
          });
          if (ev.sfx === 'lunge') this.ctx.sfx('chop', 0.2);
          continue;
        }
        this.calmWild(m);
        if (!this.wildMobs.has(m.id)) continue; // a stranded predator despawned
      }
      const predator = isWildKind(m.kind) && isPredator(m.kind as WildKind);
      if (predator) {
        const ev = stepMob(m, {
          targets: dangerTargets,
          // safe tiles are walls to a predator → it NEVER crosses into the core
          isWall: (tx, ty) => !this.wildWalkable(tx, ty) || !this.dangerAt(tx, ty),
          dt: delta,
          rng: Math.random,
        });
        if (ev.sfx === 'lunge') this.ctx.sfx('chop', 0.2);
      } else {
        const before = { x: m.x, y: m.y };
        stepMob(m, {
          targets: allTargets,
          isWall: (tx, ty) => !this.wildWalkable(tx, ty),
          dt: delta,
          rng: Math.random,
        });
        // idle (no one near) → a gentle host-side roam so the World reads alive
        if (m.x === before.x && m.y === before.y) this.wanderPeaceful(m, delta);
      }
    }
  }

  /** host orchestration (NOT engine AI): amble an idle peaceful creature along a slow random walk */
  private wanderPeaceful(m: MobState, delta: number): void {
    const now = Date.now();
    let w = this.wildWander.get(m.id);
    if (!w || now >= w.until) {
      w = { ang: Math.random() * Math.PI * 2, until: now + 1500 + Math.random() * 2500 };
      this.wildWander.set(m.id, w);
    }
    const P = profileOf(m.kind);
    const s = (P.speed * 0.4 * delta) / 1000; // an amble, well under a flee
    const nx = m.x + Math.cos(w.ang) * s;
    const ny = m.y + Math.sin(w.ang) * s;
    if (this.wildWalkable(Math.floor(nx + Math.sign(Math.cos(w.ang)) * P.radius), Math.floor(m.y))) m.x = nx;
    else w.until = 0;
    if (this.wildWalkable(Math.floor(m.x), Math.floor(ny + Math.sign(Math.sin(w.ang)) * P.radius))) m.y = ny;
    else w.until = 0;
    m.face = w.ang;
  }

  /** host → all: ONE batched creature snapshot per tick (already near-Player culled) */
  private broadcastWild(): void {
    const mobs: MobSnap[] = [];
    for (const m of this.wildMobs.values()) {
      if (m.st === 'dead') continue;
      mobs.push({
        id: m.id,
        kind: m.kind,
        x: +m.x.toFixed(2),
        y: +m.y.toFixed(2),
        hp: m.hp,
        maxHp: m.maxHp,
        st: m.st,
        ax: +m.ax.toFixed(2),
        ay: +m.ay.toFixed(2),
        phase: 0,
        rage: m.rage || undefined,
      });
    }
    this.ctx.backend.sendCreatures({ t: 'sync', host: this.ctx.me.name, mobs });
  }

  /** guest: replace the rendered creature set from the host's authoritative snapshot */
  private applyWildSnap(msg: Extract<CreatureMsg, { t: 'sync' }>): void {
    const alive = new Set<string>();
    for (const s of msg.mobs) {
      alive.add(s.id);
      let m = this.wildMobs.get(s.id);
      if (!m) {
        m = { id: s.id, kind: s.kind as MobKind, x: s.x, y: s.y, hp: s.hp, maxHp: s.maxHp, st: s.st as MobState['st'], t: 0, face: 0, ax: s.ax, ay: s.ay, phase: 0, rage: s.rage };
        this.wildMobs.set(s.id, m);
      } else {
        m.x = s.x;
        m.y = s.y;
        m.hp = s.hp;
        m.maxHp = s.maxHp;
        m.st = s.st as MobState['st'];
        m.ax = s.ax;
        m.ay = s.ay;
        m.rage = s.rage;
      }
    }
    for (const [id, m] of [...this.wildMobs]) {
      if (alive.has(id)) continue;
      this.wildMobs.delete(id);
      // J4: DEATH vs DESPAWN on a guest. A creature gone from the host's snap
      // was either range-CULLED (maintainWildPool — must stay a silent, instant
      // vanish) or FELLED by the host itself (kills by other Players arrive as
      // an explicit 'felled' broadcast; the host's own kills get no message,
      // and pure presentation may not add wire traffic — ADR-0005). Tell them
      // apart by wounds AND proximity: the cull only removes creatures farther
      // than CREATURE_DESPAWN_TILES from EVERY Player, so a vanished creature
      // still near ME cannot have been culled — hurt + near ⇒ genuinely felled.
      // (Wounds alone are not enough: at min zoom the viewport spans ~40 tiles,
      // so a wounded fleeing creature can be culled ON-SCREEN; the near-gate
      // keeps that a silent vanish. The -2 slop absorbs the host's lerped view
      // of my position. A real host kill farther out stays a silent miss —
      // rare and barely readable at that distance, never a wrong poof.)
      const nearMe = Math.hypot(m.x - this.ctx.player.x / TILE, m.y - this.ctx.player.y / TILE) <= CREATURE_DESPAWN_TILES - 2;
      if (m.hp < m.maxHp && nearMe) this.wildDeathBeat(id);
    }
  }

  /** J4: detach a Wildlife creature's view and play its death beat (kills only — culls stay silent) */
  private wildDeathBeat(id: string): void {
    const v = this.wildViews.get(id);
    if (!v) return;
    this.wildViews.delete(id);
    playDeathBeat(this.ctx.scene, v, DEATH_PUFF_TINT_WILD, this.wildDeathFx);
  }

  /** dispatch an open-world Wildlife message (ADR-0012) */
  private onCreatureMsg(msg: CreatureMsg): void {
    switch (msg.t) {
      case 'sync':
        if (!this.isWildHost && msg.host === this.wildHostName) this.applyWildSnap(msg);
        break;
      case 'hit':
        if (this.isWildHost) this.applyWildHit(msg.id, msg.tool as ToolId | undefined, msg.by);
        break;
      case 'forage':
        if (this.isWildHost) {
          this.wildMobs.delete(msg.id);
          this.wildWander.delete(msg.id);
          this.wildRage.delete(msg.id);
        }
        break;
      case 'felled':
        // J4: every guest sees the kill, not just the hunter — the host has
        // already removed the creature authoritatively and the next 'sync'
        // would only silent-drop it, so detach the view here and play the
        // death beat at the spot it fell. (On the adjudicating host the
        // creature is already gone — delete() is false, no second beat.)
        if (this.wildMobs.delete(msg.id)) {
          this.wildWander.delete(msg.id);
          this.wildDeathBeat(msg.id);
        }
        if (msg.by === this.ctx.me.name) this.grantWildLoot(msg.loot, 'hunted');
        break;
    }
  }

  /** draw creatures (body, telegraph, HP bar) at World depth; guests interpolate snapshots */
  private renderWild(time: number, delta: number): void {
    const scene = this.ctx.scene;
    const seen = new Set<string>();
    const k = Math.min(1, (delta / 1000) * 14);
    for (const m of this.wildMobs.values()) {
      if (m.st === 'dead') continue;
      seen.add(m.id);
      const prof = profileOf(m.kind);
      const rpx = prof.radius * TILE;
      const barW = Math.max(rpx * 2, 16);
      let v = this.wildViews.get(m.id);
      if (!v) {
        const sprite = scene.add.sprite(m.x * TILE, m.y * TILE, MOB_TEX[m.kind], 0).setOrigin(0.5, 0.85);
        const shadow = scene.add.image(0, 0, 'shadow').setDisplaySize(rpx * 2.6, rpx * 1.3).setAlpha(0.4);
        const tele = scene.add.graphics();
        const bar = scene.add.rectangle(0, 0, barW, 3, 0x66ff88).setOrigin(0, 0.5).setVisible(false);
        v = { sprite, shadow, tele, bar };
        this.wildViews.set(m.id, v);
      }
      const prevX = v.sprite.x;
      const tx = m.x * TILE;
      const ty = m.y * TILE;
      v.sprite.x += (tx - v.sprite.x) * k; // lerp smooths guest snapshots; host ~exact
      v.sprite.y += (ty - v.sprite.y) * k;
      const px = v.sprite.x;
      const py = v.sprite.y;
      v.sprite.setDepth(py);
      if (Math.abs(px - prevX) > 0.05) v.sprite.setFlipX(px < prevX); // face travel direction
      // enraged: the whole body flushes red until the revenge timer runs dry
      if (m.rage) v.sprite.setTint(0xff7a66);
      else v.sprite.clearTint();
      const idleKey = `${MOB_TEX[m.kind]}-idle`;
      if (m.st === 'windup' || m.st === 'aim') {
        if (v.sprite.anims.isPlaying) v.sprite.anims.stop();
        v.sprite.setFrame(2);
      } else if (v.sprite.anims.currentAnim?.key !== idleKey || !v.sprite.anims.isPlaying) {
        v.sprite.anims.play(idleKey, true);
      }
      v.shadow.setPosition(px, py + rpx * 0.4).setDepth(2);
      const hurt = m.hp < m.maxHp;
      v.bar.setVisible(hurt).setPosition(px - barW / 2, py - rpx * 2 - 2).setDepth(py + 1).setScale(Math.max(0, m.hp / m.maxHp), 1);
      v.tele.clear();
      v.tele.setDepth(3); // a ground-level warning decal
      if (m.st === 'windup') {
        const warn = 0.35 + 0.25 * Math.sin(time / 55);
        // an enraged creature telegraphs the rage profile's strike zone
        const strikeR = (m.rage && isWildKind(m.kind) ? RAGE_PROFILES[m.kind as WildKind] : prof).strikeR;
        v.tele.lineStyle(3, 0xff3322, warn);
        v.tele.lineBetween(px, py, m.ax * TILE, m.ay * TILE);
        v.tele.fillStyle(0xff3322, warn * 0.5);
        v.tele.fillCircle(m.ax * TILE, m.ay * TILE, strikeR * TILE);
      }
    }
    for (const [id, v] of this.wildViews) {
      if (seen.has(id)) continue;
      v.sprite.destroy();
      v.shadow.destroy();
      v.tele.destroy();
      v.bar.destroy();
      this.wildViews.delete(id);
    }
  }

  /** each client checks its OWN player against live creature strike zones
   *  (predators — and since the enrage batch, any ENRAGED creature — strike) */
  private checkWildHarm(): void {
    const ptx = this.ctx.player.x / TILE;
    const pty = (this.ctx.player.y - 4) / TILE;
    for (const m of this.wildMobs.values()) {
      if (m.st !== 'strike') continue;
      // an enraged creature strikes with the rage profile's zone (a peaceful
      // kind's base strikeR is 0 — its gore would otherwise be a phantom)
      const prof = m.rage && isWildKind(m.kind) ? RAGE_PROFILES[m.kind as WildKind] : profileOf(m.kind);
      if (Math.hypot(m.x - ptx, m.y - pty) <= prof.strikeR + 0.35) {
        this.wildKnockdown(m.x, m.y);
        return;
      }
    }
  }

  /** a predator caught me: knock down (3 s stun + shove), count toward rolling-window Exhaustion */
  private wildKnockdown(srcX: number, srcY: number): void {
    if (Date.now() < this.host.stunnedUntil) return;
    this.host.beginKnockdown();
    this.ctx.sfx('chop', 0.4);
    this.ctx.scene.cameras.main.shake(160, 0.004);
    const player = this.ctx.player;
    const ang = Phaser.Math.Angle.Between(srcX * TILE, srcY * TILE, player.x, player.y);
    this.ctx.scene.tweens.add({
      targets: player,
      x: player.x + Math.cos(ang) * TILE * 1.6,
      y: player.y + Math.sin(ang) * TILE * 1.6,
      duration: 200,
      ease: 'quad.out',
    });
    const now = Date.now();
    this.wildKnockdownTimes = this.wildKnockdownTimes.filter((tms) => now - tms < WILD_EXHAUST_WINDOW_MS);
    this.wildKnockdownTimes.push(now);
    if (this.wildKnockdownTimes.length >= WILD_EXHAUSTION_KNOCKDOWNS) {
      this.wildKnockdownTimes = [];
      this.wildExhaust();
    } else {
      this.ctx.bus.emit('toast', t.toast.knockedInWild(this.wildKnockdownTimes.length, WILD_EXHAUSTION_KNOCKDOWNS), 'bad');
    }
  }

  /** Exhaustion in the wilds → wake at the Village Hall/spawn, inventory FULLY intact (only position + time lost) */
  private wildExhaust(): void {
    const wake = this.wildWakePoint();
    this.ctx.bus.emit('toast', wake.atVillage ? t.toast.wildExhaustionVillage : t.toast.wildExhaustionSpawn, 'bad');
    const cam = this.ctx.scene.cameras.main;
    cam.fadeOut(400, 0, 0, 0);
    this.ctx.scene.time.delayedCall(450, () => {
      this.ctx.player.setPosition((wake.tx + 0.5) * TILE, (wake.ty + 0.5) * TILE);
      this.host.stunnedUntil = 0;
      this.host.stunMarker?.destroy();
      this.host.stunMarker = null;
      cam.fadeIn(500, 0, 0, 0);
    });
  }

  /** where Exhaustion wakes me: the Village Hall, else World spawn */
  private wildWakePoint(): { tx: number; ty: number; atVillage: boolean } {
    const v = this.host.villageWakeTile();
    if (v) return { ...v, atVillage: true };
    return { tx: this.ctx.world.spawn.tx, ty: this.ctx.world.spawn.ty, atVillage: false };
  }

  /** in the World, E on the nearest creature in reach: hunt anything hostile —
   *  a predator or an ENRAGED survivor (swing) — or forage a calm peaceful (catch) */
  wildlifeAction(): EAction | null {
    const bow = this.host.isBow();
    const ptx = this.ctx.player.x / TILE;
    const pty = (this.ctx.player.y - 4) / TILE;
    let best: MobState | null = null;
    let bd = Infinity;
    for (const m of this.wildMobs.values()) {
      if (m.st === 'dead') continue;
      // the Bow hunts hostiles from range; foraging is ALWAYS an arm's-length
      // catch (the old 6-tile bow forage was a latent oddity)
      const hostile = m.rage || (isWildKind(m.kind) && isPredator(m.kind as WildKind));
      const allowed = hostile && bow ? 6 : 1.9;
      const d = Math.hypot(m.x - ptx, m.y - pty) - profileOf(m.kind).radius;
      if (d < allowed && d < bd) {
        bd = d;
        best = m;
      }
    }
    if (!best) return null;
    const target = best;
    // an enraged creature — even a peaceful kind — is a FIGHT, not a catch: the
    // forage verb would delete the charging animal for free loot and, being
    // swing:false, would also swallow the LMB while it stands adjacent
    if (target.rage || (isWildKind(target.kind) && isPredator(target.kind as WildKind))) {
      // hunt: a repeatable weapon swing (the Bow fires mouse-aimed; melee must close)
      return { swing: true, cadenceMs: this.host.atkCadence(weaponCombat(this.host.heldTool()).attackMs), run: () => (bow ? this.host.fireBow() : this.wildSwing(target)) };
    }
    // forage: a one-shot catch (bare hands fine — it is a moving Node, not a fight)
    return { swing: false, run: () => this.forageWild(target) };
  }

  private wildSwing(m: MobState): void {
    const tool = this.host.heldTool();
    this.ctx.sfx('chop', 0.5);
    if (this.isWildHost) this.applyWildHit(m.id, tool, this.ctx.me.name);
    else this.ctx.backend.sendCreatures({ t: 'hit', id: m.id, by: this.ctx.me.name, tool });
  }

  /** host: adjudicate a player→predator hit — reuse the ADR-0006 weapon roll, apply, float */
  applyWildHit(id: string, tool: ToolId | undefined, by: string): void {
    const m = this.wildMobs.get(id);
    if (!m || m.st === 'dead') return;
    const roll = applyMobHit(m, tool, Math.random, villageBuff(this.village.village.tier).critChance, this.host.armorBandOf(by));
    const prof = profileOf(m.kind);
    const fx = m.x * TILE + Phaser.Math.Between(-6, 6);
    const fy = m.y * TILE - prof.radius * TILE - 8;
    const shown = roll.damage * GUARDIAN_DISPLAY_SCALE;
    if (roll.crit) floatText(this.ctx.scene, fx, fy, `${shown}!`, '#ffd166', 13);
    else floatText(this.ctx.scene, fx, fy, `${shown}`, '#ff9a66', 10);
    if (roll.dead) this.onWildFelled(m, by);
    else this.enrageWild(m, by);
  }

  /** host: a surviving hit ENRAGES the creature — it drops flight, marks its
   *  attacker and charges (stepWild swaps in the rage profile while the timer
   *  runs; the flag rides the snapshot so every client sees it turn red) */
  private enrageWild(m: MobState, by: string): void {
    this.wildRage.set(m.id, { by, until: Date.now() + WILD_RAGE_MS });
    if (!m.rage) {
      m.rage = true;
      floatText(this.ctx.scene, m.x * TILE, m.y * TILE - profileOf(m.kind).radius * TILE - 14, '!', '#ff5544', 13);
    }
  }

  /** host: rage over (timer dry / shooter gone) — peaceful kinds return to
   *  flight; a predator stranded off danger ground despawns (its normal brain
   *  treats safe tiles as walls — it would only stand there as a statue) */
  private calmWild(m: MobState): void {
    this.wildRage.delete(m.id);
    m.rage = undefined;
    const predator = isWildKind(m.kind) && isPredator(m.kind as WildKind);
    m.st = predator ? 'chase' : 'kite';
    m.t = 0;
    if (predator && !this.dangerAt(Math.floor(m.x), Math.floor(m.y))) {
      // it slinks off, it is not slain: guests read a wounded creature vanishing
      // NEAR them as a kill (applyWildSnap's death-vs-cull heuristic) and would
      // play a phantom death beat. Heal it, let one broadcast carry full HP so
      // every client reads the removal as a silent despawn, THEN delete.
      m.hp = m.maxHp;
      this.ctx.scene.time.delayedCall(WILD_BROADCAST_MS * 2 + 50, () => {
        if (!this.isWildHost || this.wildRage.has(m.id)) return; // re-enraged/handover
        this.wildMobs.delete(m.id);
        this.wildWander.delete(m.id);
      });
    }
  }

  /** host: a predator fell — the hunter gets the hide/meat/trophy loot; the creature drops off the wire */
  private onWildFelled(m: MobState, by: string): void {
    this.ctx.sfx('harvest', 0.5);
    const loot = rollWildLoot(m.kind as WildKind, Math.random);
    // J4: detach + flash-squash-poof BEFORE the state vanishes — renderWild's
    // sweep would otherwise destroy the view this same frame (a despawn blink)
    this.wildDeathBeat(m.id);
    this.wildMobs.delete(m.id);
    this.wildWander.delete(m.id);
    this.wildRage.delete(m.id);
    if (by === this.ctx.me.name) this.grantWildLoot(loot, 'hunted');
    else this.ctx.backend.sendCreatures({ t: 'felled', id: m.id, by, loot });
  }

  /** forage a peaceful creature (catch): the catcher claims its loot, the host removes it */
  private forageWild(m: MobState): void {
    const loot = rollWildLoot(m.kind as WildKind, Math.random);
    this.ctx.sfx('harvest', 0.6);
    floatText(this.ctx.scene, m.x * TILE, m.y * TILE - 10, '✦', '#dfffd6', 12);
    if (this.isWildHost) {
      this.wildMobs.delete(m.id);
      this.wildWander.delete(m.id);
      this.wildRage.delete(m.id);
    } else {
      this.wildMobs.delete(m.id); // optimistic; the host removes it authoritatively
      this.ctx.backend.sendCreatures({ t: 'forage', id: m.id, by: this.ctx.me.name });
    }
    this.grantWildLoot(loot, 'foraged');
  }

  /** grant Wildlife loot into my own inventory + persist (reuses the generic claim path — no new RPC) */
  private grantWildLoot(loot: Partial<Record<ResourceId, number>>, kind: 'foraged' | 'hunted'): void {
    const parts = Object.entries(loot).filter(([, n]) => (n as number) > 0);
    if (!parts.length) return;
    void this.ctx.backend.claimDelveLoot(loot as Inventory).then((res) => {
      this.ctx.setInventory(res.inventory);
      const text = parts.map(([it, n]) => `+${n} ${ITEMS[it as ItemId]?.name ?? it}`).join('  ');
      this.ctx.bus.emit('toast', kind === 'foraged' ? t.toast.foraged(text) : t.toast.hunted(text), 'good');
    });
  }
}
