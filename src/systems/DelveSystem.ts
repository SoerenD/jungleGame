/**
 * DelveSystem (ADR-0018 #16): the instanced Dungeons — the sealed mine-shaft
 * entrance, host-simmed Stages (the Delve, the Deep, the endless generated
 * Depths per ADR-0007/0011/0015), interior build/teardown, the run loop
 * (roster, knockdowns, Exhaustion), boss Spoils + Depth Records, and the
 * peer-host wire. In 'delve' mode updateDelve() is the ONLY frame that runs
 * (§8 step 2 early-return). Owns delveOpened/dungeon backend listeners and
 * the Spoils-window loot bus handlers.
 */
import Phaser from 'phaser';
import { AVATAR_H } from '../avatars';
import type { DungeonMsg, Inventory, MobSnap, ProjSnap } from '../backend/types';
import {
  DEV_DEEP,
  DEV_DUNGEON,
  EXHAUSTION_KNOCKDOWNS,
  FABLED_DROP_CHANCE,
  FABLED_WEAPONS,
  INTERACT_RANGE,
  PLAYER_SPEED,
  SWING_CADENCE_MS,
  TILE,
} from '../config';
import {
  applyMobHit,
  createMob,
  DEEP_CORE_DROP,
  DEPTH_MOB_CAP,
  DEPTH_SIGIL,
  FORGE_CORE,
  isBossKind,
  profileOf,
  PROP_BLOCKS,
  PROP_LIGHT,
  SHARD_PER_KILL,
  stageDefFor,
  stepMob,
  type MobEvent,
  type MobKind,
  type MobState,
  type Stage,
  type StageDef,
} from '../content/dungeon';
import { GUARDIAN_DISPLAY_SCALE, weaponCombat } from '../content/guardian';
import { ITEMS, type ItemId, type ToolId } from '../content/items';
import { villageBuff } from '../content/village';
import { MOB_FRAME, MOB_TEX, PROJ_GLOW, PROJ_TEX } from '../mobSprites';
import { PROP_FLAT, PROP_TEX } from '../delveProps';
import type { GameScene } from '../scenes/GameScene';
import { t, zoneName } from '../i18n';
import type { AtmosphereSystem } from './AtmosphereSystem';
import type { GameContext } from './context';
import type { DistrictSystem } from './DistrictSystem';
import type { FogSystem } from './FogSystem';
import { CHIP_TINTS, type HarvestSystem } from './HarvestSystem';
import type { PresenceSystem } from './PresenceSystem';
import type { ProgressionSystem } from './ProgressionSystem';
import { positionHeld, clearDeathFx, DEATH_PUFF_TINT_DELVE, floatText, playDeathBeat, type MobView } from './sceneFx';
import type { EAction, GameSystem } from './types';
import type { VillageSystem } from './VillageSystem';

/** a host-simulated Husk/boss projectile (tile units; velocity tiles/second) */
interface DelveProjectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
}
/** a party-mate rendered inside the Delve from their interior position broadcasts */
interface DelvePeerView {
  marker: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  x: number;
  y: number;
}

/** Delve overlay draws above every persistent World object (max depth ≈ MAP_H·TILE)
 *  so the World is simply hidden behind it — no per-object visibility toggling. */
const DELVE_DEPTH_BG = 900_000;
const DELVE_DEPTH_FLOOR = 900_010;
const DELVE_DEPTH_ENTITY = 950_000; // + y (px) so player/mobs y-sort together
const DELVE_DEPTH_PROJ = 970_000;


export class DelveSystem implements GameSystem {
  // ---- Dungeons v1: the Delve (ADR-0007) — an ephemeral, host-simmed instance
  /** world-tile + pixel position of the sealed mine-shaft entrance */
  private delveEntrance = { x: 0, y: 0, tx: 0, ty: 0 };
  private delveEntranceSprite: Phaser.GameObjects.Container | null = null;
  /** ?dungeon / ?deep: treat the shaft as open regardless of the persisted flag */
  delveForceOpen = DEV_DUNGEON || DEV_DEEP;
  /** ?deep: drop straight into the Deep on the first frame (dev playtest) */
  pendingDeepEntry = DEV_DEEP;
  private rubbleHits = 0;
  delveRunId: string | null = null;
  isDelveHost = false;
  /** roster locked at entry (like the Ward) — no late join */
  private delveRoster: string[] = [];
  private delveHeadcount = 1;
  /** host: authoritative mob state (HP lives ONLY here — never the DB). Peers: last snapshot. */
  mobs = new Map<string, MobState>();
  private mobViews = new Map<string, MobView>();
  /** J4: death-beat orphans mid-animation (views detached from mobViews so the
   *  render-sync sweep can't kill them) — reaped by teardownDelve so leaving
   *  the instance mid-tween never leaks a sprite or its puffs */
  private delveDeathFx = new Set<Phaser.GameObjects.GameObject[]>();
  /** host: live projectiles. Peers render them from snapshots. */
  private projectiles: DelveProjectile[] = [];
  private projViews = new Map<string, { sprite: Phaser.GameObjects.Sprite; glow: Phaser.GameObjects.Image }>();
  private delveObjects: Phaser.GameObjects.GameObject[] = [];
  /** per-room floor CanvasTexture keys — removed on teardown so a re-entry rebuilds */
  private delveFloorKeys: string[] = [];
  private delveBackdrop: Phaser.GameObjects.Rectangle | null = null;
  private delveWalls: Phaser.Physics.Arcade.StaticGroup | null = null;
  private delveWallCollider: Phaser.Physics.Arcade.Collider | null = null;
  /** my knockdowns this run; 3 → Exhaustion (out) */
  private delveKnockdowns = 0;
  private delveExhausted = false;
  /** did I land ≥1 hit this run? (participation-loot eligibility) */
  delveHitLanded = false;
  /** boss Spoils not yet taken out of the read-only loot window (any boss) */
  lootPending: Inventory = {};
  /** host-only: Husks felled (drives shard loot) + everyone who has landed a hit */
  private delveKills = 0;
  delveParticipants = new Set<string>();
  private delvePeers = new Map<string, DelvePeerView>();
  /** the host's name — a peer boots itself if the host vanishes from presence (v1: no migration) */
  delveHostName = '';
  /** the run I was Exhausted out of, kept so I still claim loot if my party wins */
  private delveExhaustedRun: string | null = null;
  private lastMobSnapAt = 0;
  private nextMobId = 1;
  private nextProjId = 1;
  /** which Stage of the Delve is live (ADR-0011/0015): 1 = the Delve, 2 = the
   *  Deep, 3+ = the generated Depths — the chain is endless */
  delveStage: Stage = 1;
  /** the live Stage's boss fell and the in-Dungeon door to the next Depth is open */
  deepDoorOpen = false;
  /** the Descent's id (ADR-0015): the Stage-1 runId, carried through the whole
   *  chain — the key every Stage clear's Depth Record write shares */
  private descentId = '';

  /** cross-system refs, wired by GameScene (ADR-0018 §3) */
  atmosphere!: AtmosphereSystem;
  district!: DistrictSystem;
  fog!: FogSystem;
  harvest!: HarvestSystem;
  village!: VillageSystem;
  presence!: PresenceSystem;
  progression!: ProgressionSystem;
  private onDelveOpened = (): void => this.refreshDelveEntrance(true);
  private onDungeon = (msg: DungeonMsg): void => this.onDungeonMsg(msg);
  private onLootTake = (item: ItemId, count: number): void => this.claimLoot({ [item]: count });
  private onLootTakeAll = (): void => this.claimLoot({ ...this.lootPending });
  private onLootClose = (): void => this.claimLoot({ ...this.lootPending });

  constructor(
    private ctx: GameContext,
    private host: GameScene,
  ) {}

  create(): void {
    this.buildDelveEntrance();
    this.ctx.backend.on('delveOpened', this.onDelveOpened);
    this.ctx.backend.on('dungeon', this.onDungeon);
    this.ctx.bus.on('loot-take', this.onLootTake);
    this.ctx.bus.on('loot-take-all', this.onLootTakeAll);
    this.ctx.bus.on('loot-close', this.onLootClose);
  }

  /** the scene calls updateDelve() directly in 'delve' mode (§8 step 2) */
  update(_time?: number, _dt?: number): void {}

  destroy(): void {
    this.ctx.backend.off('delveOpened', this.onDelveOpened);
    this.ctx.backend.off('dungeon', this.onDungeon);
    this.ctx.bus.off('loot-take', this.onLootTake);
    this.ctx.bus.off('loot-take-all', this.onLootTakeAll);
    this.ctx.bus.off('loot-close', this.onLootClose);
  }

  /** the live Stage's interior/mobs/loot bundle — every Stage (authored 1–2 and
   *  generated 3+, ADR-0015) flows through this one lookup */
  stageDef(): StageDef {
    return stageDefFor(this.delveStage);
  }

  /** a Stage's display name: generated Depths carry a composed localized name,
   *  the authored Stages translate their English zone id */
  private stageZoneLabel(S: StageDef): string {
    return S.names?.zone ?? zoneName(S.zone);
  }

  /** is the mine shaft open? (the persisted world flag, or the ?dungeon dev bypass) */
  delveOpenNow(): boolean {
    return this.delveForceOpen || !!this.progression.quest?.delveOpen;
  }

  /** the sealed mine-shaft entrance in the World — in the frontier Cavern Mouth */
  private buildDelveEntrance(): void {
    // the sealed mine shaft sits in the frontier's Cavern Mouth zone (ADR-0009) —
    // a rocky dig deep in the far south-west, a real trek from the Ruins where the
    // Ancient Pickaxe (its key) is earned. Room here for future dungeon entrances.
    const tx = 56;
    const ty = 260;
    const x = (tx + 0.5) * TILE;
    const y = (ty + 0.5) * TILE;
    this.delveEntrance = { x, y, tx, ty };
    const c = this.ctx.scene.add.container(x, y);
    const frame = this.ctx.scene.add.ellipse(0, 2, TILE * 2.9, TILE * 1.9, 0x000000, 0).setStrokeStyle(3, 0x4a3a2a);
    const mouth = this.ctx.scene.add.ellipse(0, 2, TILE * 2.3, TILE * 1.45, 0x07080b).setStrokeStyle(2, 0x2a2018);
    const rubble = this.ctx.scene.add.container(0, 0);
    const rockColors = [0x6b5844, 0x574636, 0x7a6650];
    for (let i = 0; i < 9; i++) {
      const rk = this.ctx.scene.add
        .rectangle(Phaser.Math.Between(-17, 17), Phaser.Math.Between(-8, 9), Phaser.Math.Between(5, 9), Phaser.Math.Between(4, 7), rockColors[i % 3])
        .setStrokeStyle(1, 0x2a2018)
        .setAngle(Phaser.Math.Between(-20, 20));
      rubble.add(rk);
    }
    const label = this.ctx.scene.add
      .text(0, -TILE * 1.7, '', { fontSize: '8px', color: '#c9b28a', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5)
      .setResolution(4);
    c.add([frame, mouth, rubble, label]);
    c.setDepth(y);
    c.setData('rubble', rubble);
    c.setData('label', label);
    this.delveEntranceSprite = c;
    this.refreshDelveEntrance(this.delveOpenNow());
    if (DEV_DUNGEON) this.ctx.player.setPosition(x, y + TILE * 1.4);
  }

  /** show the rubble sealed, or dissolve it once the shaft is opened, forever */
  refreshDelveEntrance(open: boolean): void {
    const c = this.delveEntranceSprite;
    if (!c) return;
    const rubble = c.getData('rubble') as Phaser.GameObjects.Container;
    const label = c.getData('label') as Phaser.GameObjects.Text;
    if (open) {
      if (rubble.visible) this.ctx.scene.tweens.add({ targets: rubble, alpha: 0, duration: 500, onComplete: () => rubble.setVisible(false) });
      label.setText(t.delve.descend);
    } else {
      rubble.setVisible(true).setAlpha(1);
      label.setText(t.delve.sealed);
    }
  }

  /** E at the shaft: clear the rubble (Ancient Pickaxe) while sealed, or descend once open */
  delveEntranceAction(px: number, py: number): EAction | null {
    const e = this.delveEntrance;
    if (Phaser.Math.Distance.Between(px, py, e.x, e.y) > INTERACT_RANGE + 10) return null;
    if (this.delveOpenNow()) return { swing: false, run: () => this.enterDelve() };
    if (this.ctx.held.item === 'ancient_pickaxe') return { swing: true, run: () => this.chipRubble() };
    return { swing: false, run: () => this.ctx.bus.emit('toast', t.toast.shaftSealed, 'info') };
  }

  private chipRubble(): void {
    this.ctx.sfx('pick', 0.5);
    this.ctx.scene.cameras.main.shake(110, 0.003);
    floatText(this.ctx.scene, this.delveEntrance.x, this.delveEntrance.y - 10, '*chip*', '#c9b28a', 9);
    // J3: the sealed shaft is not a Resource Node (its 4 hits live only in
    // this.rubbleHits), but it IS rock being picked — so it borrows the rock
    // debris from the harvest impact kit for a consistent read
    this.harvest.burstChips(this.delveEntrance.x, this.delveEntrance.y - 6, this.delveEntrance.y + 2, CHIP_TINTS.rock, false);
    if (++this.rubbleHits < 4) return;
    this.rubbleHits = 0;
    void this.ctx.backend.openDelve().then((res) => {
      if (res.ok) {
        this.ctx.sfx('craft', 0.7);
        this.ctx.scene.cameras.main.shake(300, 0.006);
        this.ctx.bus.emit('toast', t.toast.rubbleCollapses, 'good');
      }
      this.refreshDelveEntrance(true);
    });
  }

  /** create + host an instanced run: lock the roster, spawn scaled mobs, descend */
  enterDelve(): void {
    if (this.host.inDelve) return;
    this.delveStage = 1; // entering from the World shaft always starts at Stage 1
    const me = this.ctx.me.name;
    const roster = [me];
    for (const [name, r] of this.presence.remotes) {
      if (Phaser.Math.Distance.Between(r.sprite.x, r.sprite.y, this.delveEntrance.x, this.delveEntrance.y) < TILE * 6) roster.push(name);
    }
    const runId = `${me}:${Date.now()}`;
    this.descentId = runId; // the Descent is born here — every deeper Stage keeps this id
    this.isDelveHost = true;
    this.delveHostName = me;
    this.delveRoster = roster;
    this.delveHeadcount = Math.max(1, roster.length);
    this.ctx.backend.sendDungeon({ t: 'start', runId, host: me, heads: this.delveHeadcount, roster, stage: 1 });
    this.spawnDelveMobs();
    this.beginDelve(runId);
    this.ctx.bus.emit('toast', roster.length > 1 ? t.toast.descendWithOthers(roster.length - 1) : t.toast.descendAlone, 'info');
  }

  /**
   * DESCENT (ADR-0011 §3, endless per ADR-0015): at the open door, press interact
   * to start the NEXT Stage as a FRESH run — a new runId with me as host, the old
   * interior torn down and the next Depth's built (generated from its number for
   * Depths 3+ — no seed on the wire). The roster is the non-Exhausted players at
   * the door (a subset of the last Stage's — it can only shrink); no one outside
   * the instance can join (the door is reachable only from inside). Broadcast
   * BEFORE teardown so lingering party-mates accept the descent. The Descent's
   * id (the Stage-1 runId) carries through unchanged.
   */
  descendNextStage(): void {
    if (!this.host.inDelve || !this.deepDoorOpen) return;
    const me = this.ctx.me.name;
    const door = this.stageDef().door;
    const next = this.delveStage + 1;
    const roster = [me];
    if (door) {
      const dx = (door.tx + 0.5) * TILE;
      const dy = (door.ty + 0.5) * TILE;
      for (const [name, pv] of this.delvePeers) {
        if (Phaser.Math.Distance.Between(pv.x, pv.y, dx, dy) < TILE * 8) roster.push(name);
      }
    }
    const runId = `${me}:${Date.now()}:d${next}`;
    this.ctx.backend.sendDungeon({ t: 'start', runId, host: me, heads: roster.length, roster, stage: next });
    this.teardownDelve();
    this.delveStage = next;
    this.isDelveHost = true;
    this.delveHostName = me;
    this.delveRoster = roster;
    this.delveHeadcount = Math.max(1, roster.length);
    this.spawnDelveMobs();
    this.beginDelve(runId);
    const others = roster.length - 1;
    if (next === 2) {
      this.ctx.bus.emit('toast', others > 0 ? t.toast.descendIntoDeep(others) : t.toast.descendIntoDeepAlone, 'info');
    } else {
      const zone = this.stageZoneLabel(this.stageDef());
      this.ctx.bus.emit('toast', others > 0 ? t.toast.descendIntoDepth(zone, others) : t.toast.descendIntoDepthAlone(zone), 'info');
    }
  }

  /**
   * ?deep dev shortcut: start a fresh SOLO Deep run as host, skipping Stage 1 and
   * the boss-door. Identical to hosting a Stage-1 run, but at Stage 2 — so the
   * magma interior, Cinder/Ember Husks and the Forgeborn come up straight away.
   */
  enterDeepDirect(): void {
    if (this.host.inDelve) return;
    this.delveStage = 2;
    const me = this.ctx.me.name;
    const roster = [me];
    const runId = `${me}:${Date.now()}:deep`;
    this.descentId = runId; // a dev shortcut is its own (skip-ahead) Descent
    this.isDelveHost = true;
    this.delveHostName = me;
    this.delveRoster = roster;
    this.delveHeadcount = 1;
    this.ctx.backend.sendDungeon({ t: 'start', runId, host: me, heads: 1, roster, stage: 2 });
    this.spawnDelveMobs();
    this.beginDelve(runId);
    this.ctx.bus.emit('toast', t.toast.descendIntoDeepAlone, 'info');
  }

  /** host: build the authoritative mob roster (HP lives ONLY here — never the DB) */
  private spawnDelveMobs(): void {
    const S = this.stageDef();
    this.mobs.clear();
    for (const s of S.planSpawns(this.delveHeadcount, Math.random)) {
      const id = `m${this.nextMobId++}`;
      this.mobs.set(id, createMob(id, s, this.delveHeadcount, S.bossHpPerHead, S.hpMul));
    }
    this.delveKills = 0;
    this.delveParticipants.clear();
  }

  /**
   * A party-mate's client announced a run. Stage 1: join if I'm rostered and at
   * the World shaft (unchanged). Deeper Stages (the descent, ADR-0011 §3 /
   * ADR-0015): the join-guard is RELAXED so a party-mate who is ALREADY inside —
   * lingering in the just-cleared Stage with the door open — accepts the descent
   * to the next Depth. A generated Depth's whole interior rebuilds from the
   * stage NUMBER the message carries (no seed on the wire). Guests who decline
   * simply stay in the lingering lobby or leave.
   */
  private onDelveStart(msg: Extract<DungeonMsg, { t: 'start' }>): void {
    if (msg.host === this.ctx.me.name) return;
    if (!msg.roster.includes(this.ctx.me.name)) return;
    const stage: Stage = msg.stage ?? 1;
    if (stage === 1) {
      if (this.host.inDelve) return; // Stage 1 is entered fresh from the World, never mid-run
      if (Phaser.Math.Distance.Between(this.ctx.player.x, this.ctx.player.y, this.delveEntrance.x, this.delveEntrance.y) > TILE * 8) return;
      this.delveStage = 1;
      this.descentId = msg.runId; // guests carry the same Descent id down the chain
      this.isDelveHost = false;
      this.delveHostName = msg.host;
      this.delveRoster = msg.roster;
      this.delveHeadcount = msg.heads;
      this.mobs.clear(); // a guest renders mobs from the host's snapshots
      this.beginDelve(msg.runId);
      this.ctx.backend.sendDungeon({ t: 'join', runId: msg.runId, name: this.ctx.me.name });
      this.ctx.bus.emit('toast', t.toast.followInto(msg.host), 'info');
      return;
    }
    // deeper: only at-the-door party-mates of the just-cleared previous Stage descend
    if (!this.host.inDelve || this.delveStage !== stage - 1 || !this.deepDoorOpen) return;
    const door = this.stageDef().door;
    if (door) {
      const dx = (door.tx + 0.5) * TILE;
      const dy = (door.ty + 0.5) * TILE;
      if (Phaser.Math.Distance.Between(this.ctx.player.x, this.ctx.player.y, dx, dy) > TILE * 8) return;
    }
    this.teardownDelve();
    this.delveStage = stage;
    this.isDelveHost = false;
    this.delveHostName = msg.host;
    this.delveRoster = msg.roster;
    this.delveHeadcount = msg.heads;
    this.mobs.clear();
    this.beginDelve(msg.runId);
    this.ctx.backend.sendDungeon({ t: 'join', runId: msg.runId, name: this.ctx.me.name });
    if (stage === 2) this.ctx.bus.emit('toast', t.toast.followIntoDeep(msg.host), 'info');
    else this.ctx.bus.emit('toast', t.toast.followIntoDepth(msg.host, this.stageZoneLabel(this.stageDef())), 'info');
  }

  /** shared entry: reset run state, build the live Stage's interior, swap collision, teleport in */
  private beginDelve(runId: string): void {
    const S = this.stageDef();
    this.host.inDelve = true;
    this.delveRunId = runId;
    this.delveKnockdowns = 0;
    this.delveExhausted = false;
    this.delveHitLanded = false;
    this.delveExhaustedRun = null;
    this.deepDoorOpen = false;
    this.projectiles = [];
    this.rubbleHits = 0;
    this.host.stunnedUntil = 0;
    if (this.host.placing) this.host.exitPlaceMode();
    this.buildDelveInterior();
    for (const c of this.host.worldColliders) c.active = false;
    if (this.delveWallCollider) this.delveWallCollider.active = true;
    this.ctx.player.setPosition((S.entry.tx + 0.5) * TILE, (S.entry.ty + 0.5) * TILE);
    this.ctx.player.setVelocity(0, 0);
    const cam = this.ctx.scene.cameras.main;
    // Follow the player freely inside the Delve. Clamping the camera to the small
    // Stage rect (60×22 for Stage 1) let a tall viewport center the whole interior
    // so the camera never moved — you fought pinned to the screen edge. The Delve
    // backdrop tracks the camera and fills the viewport (updateDelve), so with no
    // bounds the void beyond the walls reads as solid dark rock. Bounds are
    // restored on exit by applyCameraRegion (leaveDelve).
    cam.removeBounds();
    // the Deep flashes hot-orange on descent; the mine flashes cool
    if (S.palette === 'magma') cam.flash(500, 60, 18, 6);
    else cam.flash(400, 3, 5, 9);
    this.ctx.bus.emit('zone', S.zone);
  }

  /** the interior render (a high-depth overlay hiding the World) + collision */
  private buildDelveInterior(): void {
    const S = this.stageDef();
    const bg = S.palette === 'magma' ? 0x0d0705 : 0x07090c;
    this.delveBackdrop = this.ctx.scene.add.rectangle(0, 0, 10, 10, bg).setDepth(DELVE_DEPTH_BG);
    this.buildDelveFloor();
    const ex = (S.entry.tx + 0.5) * TILE;
    const ey = (S.entry.ty + 0.5) * TILE;
    const exit = this.ctx.scene.add
      .text(ex, ey - TILE, t.delve.leave, { fontSize: '8px', color: '#9fe0a0', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5)
      .setResolution(4)
      .setDepth(DELVE_DEPTH_FLOOR + 3);
    this.delveObjects.push(exit);
    // static bodies for wall tiles bordering floor, PLUS blocking cover props —
    // the player physics-collides with both; mobs + projectiles use S.isBlocked
    this.delveWalls = this.ctx.scene.physics.add.staticGroup();
    for (let ty = 0; ty < S.h; ty++) {
      for (let tx = 0; tx < S.w; tx++) {
        if (!S.isWall(tx, ty)) continue;
        let border = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (!S.isWall(tx + dx, ty + dy)) {
            border = true;
            break;
          }
        }
        if (!border) continue;
        const body = this.ctx.scene.add.rectangle((tx + 0.5) * TILE, (ty + 0.5) * TILE, TILE, TILE).setVisible(false);
        this.delveWalls.add(body);
      }
    }
    for (const p of S.props) {
      if (!PROP_BLOCKS[p.kind]) continue;
      const body = this.ctx.scene.add.rectangle((p.tx + 0.5) * TILE, (p.ty + 0.5) * TILE, TILE - 2, TILE - 2).setVisible(false);
      this.delveWalls.add(body);
    }
    this.delveWallCollider = this.ctx.scene.physics.add.collider(this.ctx.player, this.delveWalls);
    this.buildDelveProps();
  }

  /** per-room textured stone floors: the mine→ruins ramp (Stage 1) or a uniform
   *  molten palette with glowing ember flecks (the Deep) — kills the flat fill */
  private buildDelveFloor(): void {
    const S = this.stageDef();
    const magma = S.palette === 'magma';
    // Stage 1 mine palette (with a ruins ramp east of ruinsFromX)
    const mine = {
      base: '#2a2620', toneA: '#221f1a', toneB: '#302b24', toneC: '#241f18',
      stain: '#1b1813', scuff: '#37312a', speckle: '#17140f',
      ruinTint: '#282430', ruinToneA: '#221f2a', ruinToneB: '#2f2a38',
      edgeMine: '#1e1a15', edgeRuin: '#1c1922',
    };
    // the Deep's magma palette — speckle is a bright ember fleck (a glowing floor)
    const lava = {
      toneA: '#301a14', base: '#3a221a', toneB: '#43271c', toneC: '#2a1712',
      stain: '#1e0f0a', scuff: '#4a2c1e', speckle: '#ff5a1e', edge: '#180d09',
    };
    // ADR-0015: a generated Depth paints its own per-Depth ramp (pure hue math
    // from the Depth number — identical on every client) instead of the two
    // authored palettes; the authored Stages keep their hand-picked colors.
    const gen = S.floor;
    // the corridor spine rows — keep specks out of the walking lane
    const spineRows = new Set<number>();
    for (const cor of S.corridors) for (let yy = cor.y; yy < cor.y + cor.h; yy++) spineRows.add(yy);
    for (const r of [...S.rooms, ...S.corridors]) {
      const ruins = !gen && !magma && r.x >= S.ruinsFromX;
      const ramp = gen
        ? [gen.toneA, gen.base, gen.toneB, gen.toneC]
        : magma
        ? [lava.toneA, lava.base, lava.toneB, lava.toneC]
        : ruins
        ? [mine.ruinToneA, mine.ruinTint, mine.ruinToneB, mine.toneC]
        : [mine.toneA, mine.base, mine.toneB, mine.toneC];
      const edge = gen ? gen.edge : magma ? lava.edge : ruins ? mine.edgeRuin : mine.edgeMine;
      const stain = gen ? gen.stain : magma ? lava.stain : mine.stain;
      const scuff = gen ? gen.scuff : magma ? lava.scuff : mine.scuff;
      const speckle = gen ? gen.speckle : magma ? lava.speckle : mine.speckle;
      const key = `delveFloor_${S.stage}_${r.x}_${r.y}`;
      if (this.ctx.scene.textures.exists(key)) this.ctx.scene.textures.remove(key);
      const tex = this.ctx.scene.textures.createCanvas(key, r.w * TILE, r.h * TILE);
      if (!tex) continue;
      const c = tex.context;
      for (let ty = r.y; ty < r.y + r.h; ty++) {
        for (let tx = r.x; tx < r.x + r.w; tx++) {
          const lx = (tx - r.x) * TILE;
          const ly = (ty - r.y) * TILE;
          const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
          const h2 = (h * 2654435761) >>> 0;
          c.fillStyle = ramp[h & 3];
          c.fillRect(lx, ly, TILE, TILE);
          const m = h % 100;
          if (m < 8) {
            c.fillStyle = stain;
            c.fillRect(lx, ly, TILE, TILE);
          } else if (m < 13) {
            c.fillStyle = scuff;
            c.fillRect(lx, ly, TILE, TILE);
          }
          c.fillStyle = edge; // wall-cast edge shade (recessed look)
          if (S.isWall(tx, ty - 1)) c.fillRect(lx, ly, TILE, 3);
          if (S.isWall(tx, ty + 1)) c.fillRect(lx, ly + TILE - 3, TILE, 3);
          if (S.isWall(tx - 1, ty)) c.fillRect(lx, ly, 3, TILE);
          if (S.isWall(tx + 1, ty)) c.fillRect(lx + TILE - 3, ly, 3, TILE);
          if (h2 % 10 < 3) {
            const spine = spineRows.has(ty); // keep the walking lane clean
            c.fillStyle = speckle;
            const sx = 2 + (h2 % 12);
            const sy = 3 + ((h2 >> 4) % 11);
            if (!(spine && sx > 4 && sx < 10)) c.fillRect(lx + sx, ly + sy, 1, 1);
            const sx2 = 8 + ((h2 >> 8) % 6);
            const sy2 = 6 + ((h2 >> 12) % 8);
            if (!(spine && sx2 > 4 && sx2 < 10)) c.fillRect(lx + sx2, ly + sy2, 1, 1);
          }
        }
      }
      tex.refresh();
      const img = this.ctx.scene.add.image(r.x * TILE, r.y * TILE, key).setOrigin(0, 0).setDepth(DELVE_DEPTH_FLOOR);
      this.delveObjects.push(img);
      this.delveFloorKeys.push(key);
    }
  }

  /** place every authored prop + its light pool (ADR-0007 §10 dressing) */
  private buildDelveProps(): void {
    const S = this.stageDef();
    for (const p of S.props) {
      const flat = PROP_FLAT[p.kind];
      const px = (p.tx + 0.5) * TILE;
      const py = flat ? (p.ty + 0.5) * TILE : (p.ty + 1) * TILE; // upright props stand on the tile
      const img = this.ctx.scene.add.image(px, py, PROP_TEX[p.kind]).setOrigin(0.5, flat ? 0.5 : 1);
      img.setDepth(flat ? DELVE_DEPTH_FLOOR + 1 : DELVE_DEPTH_ENTITY + py);
      if (S.tint) img.setTint(S.tint.prop); // ADR-0015: re-dress the recycled dressing per Depth
      this.delveObjects.push(img);
      const light = PROP_LIGHT[p.kind];
      if (light) this.addDelveLight((p.tx + 0.5) * TILE, (p.ty + 0.5) * TILE - (flat ? 0 : TILE * 0.4), light.color, light.scale, light.alpha, light.flicker);
    }
    for (const l of S.lights) this.addDelveLight((l.tx + 0.5) * TILE, (l.ty + 0.5) * TILE, l.color, l.scale, l.alpha, false);
  }

  /** an additive glow pool above the floor, below entities — the room's light */
  private addDelveLight(x: number, y: number, color: number, scale: number, alpha: number, flicker: boolean): void {
    const glow = this.ctx.scene.add
      .image(x, y, 'glow')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setScale(scale)
      .setAlpha(alpha)
      .setDepth(DELVE_DEPTH_FLOOR + 2);
    this.delveObjects.push(glow);
    if (flicker) this.ctx.scene.tweens.add({ targets: glow, alpha: Math.max(0.08, alpha - 0.06), duration: 900, yoyo: true, repeat: -1, ease: 'sine.inout' });
  }

  private teardownDelve(): void {
    for (const o of this.delveObjects) {
      // repeat:-1 flicker/door tweens outlive destroy() — kill them or every
      // Descent strands zombie tweens (door glow lives INSIDE a container)
      this.ctx.scene.tweens.killTweensOf(o);
      if (o instanceof Phaser.GameObjects.Container) for (const child of o.list) this.ctx.scene.tweens.killTweensOf(child);
      o.destroy();
    }
    this.delveObjects = [];
    for (const key of this.delveFloorKeys) if (this.ctx.scene.textures.exists(key)) this.ctx.scene.textures.remove(key);
    this.delveFloorKeys = [];
    this.delveBackdrop?.destroy();
    this.delveBackdrop = null;
    for (const v of this.mobViews.values()) {
      v.sprite.destroy();
      v.shadow.destroy();
      v.tele.destroy();
      v.bar.destroy();
    }
    this.mobViews.clear();
    // J4: a death beat still animating is an orphan (already out of mobViews) —
    // reap it explicitly or leaving mid-tween would leak its puffs and tweens
    clearDeathFx(this.ctx.scene, this.delveDeathFx);
    for (const v of this.projViews.values()) {
      v.sprite.destroy();
      v.glow.destroy();
    }
    this.projViews.clear();
    for (const pv of this.delvePeers.values()) {
      pv.marker.destroy();
      pv.label.destroy();
    }
    this.delvePeers.clear();
    this.delveWallCollider?.destroy();
    this.delveWallCollider = null;
    this.delveWalls?.destroy(true);
    this.delveWalls = null;
    this.mobs.clear();
    this.projectiles = [];
    this.host.stunMarker?.destroy();
    this.host.stunMarker = null;
  }

  /** where an involuntary Delve exit drops you: the founded Village Hall, else the
   *  World spawn — a known, safe home, never the far-off shaft (issue: Exhaustion
   *  used to strand you at the Cavern Mouth) */
  private delveWakeTile(): { tx: number; ty: number } {
    return this.host.villageWakeTile() ?? { tx: this.ctx.world.spawn.tx, ty: this.ctx.world.spawn.ty };
  }

  /** leave the Delve. `wake` overrides the exit tile (Exhaustion/collapse wake you
   *  home); the default is the mine-shaft mouth you climbed out of. */
  leaveDelve(wake?: { tx: number; ty: number }): void {
    if (!this.host.inDelve) return;
    this.host.inDelve = false;
    this.delveRunId = null;
    this.isDelveHost = false;
    this.delveHostName = '';
    this.deepDoorOpen = false;
    this.teardownDelve();
    for (const c of this.host.worldColliders) c.active = true;
    const cam = this.ctx.scene.cameras.main;
    cam.flash(300, 6, 8, 12);
    const at = wake ?? { tx: this.delveEntrance.tx, ty: this.delveEntrance.ty + 1 };
    this.ctx.player.setPosition((at.tx + 0.5) * TILE, (at.ty + 0.5) * TILE);
    this.ctx.player.setVelocity(0, 0);
    // back to the positional region clamp (the shaft is never inside a district)
    this.district.applyCameraRegion(true);
    this.host.stunnedUntil = 0;
    this.delveExhausted = false;
    this.ctx.bus.emit('zone', this.fog.currentZone || 'Ancient Ruins');
    // restore the entity depths the Delve overlay had bumped sky-high
    this.host.playerShadow.setDepth(2);
    this.host.torchGlow.setDepth(890_000);
    this.host.heldSprite.setDepth(this.ctx.player.y + 1);
  }

  /** walk out via the entrance room — a host leaving ends the run for everyone (v1) */
  private leaveDelveManual(): void {
    if (this.delveRunId) {
      if (this.isDelveHost) this.ctx.backend.sendDungeon({ t: 'end', runId: this.delveRunId, reason: 'hostleft' });
      else this.ctx.backend.sendDungeon({ t: 'down', runId: this.delveRunId, name: this.ctx.me.name, out: true });
    }
    this.ctx.bus.emit('toast', t.toast.climbOut, 'info');
    this.leaveDelve();
  }

  /** the live Stage's participation loot: common per Husk felled + the rare boss
   *  drop — except the generated Depths (3+), which pay ONE Depth Sigil and
   *  nothing else (ADR-0015 §4: prestige-only; the Record is the real prize) */
  private stageLoot(): Inventory {
    const S = this.stageDef();
    const loot: Inventory = {};
    if (S.stage >= 3) {
      loot[S.loot.rare] = 1;
      return loot;
    }
    const shards = this.delveKills * SHARD_PER_KILL;
    if (shards > 0) loot[S.loot.common] = shards;
    loot[S.loot.rare] = DEEP_CORE_DROP;
    return loot;
  }

  /**
   * A Stage boss fell (ADR-0011 §2, endless per ADR-0015): pay THIS run's
   * participation loot, write the Depth Record (it rides the same claim), shake
   * the screen, and open the next boss-door — but keep the instance ALIVE (do
   * NOT leaveDelve). No boss ends a Descent any more — the party lingers in the
   * cleared Stage to descend further or walk out with everything banked.
   */
  private onStageBossFelled(): void {
    const loot = this.stageLoot();
    const participants = [...this.delveParticipants];
    if (this.delveRunId) {
      this.ctx.backend.sendDungeon({ t: 'end', runId: this.delveRunId, reason: 'stagecleared', loot, participants });
    }
    this.ctx.scene.cameras.main.shake(500, 0.01);
    this.ctx.sfx('roar', 0.6);
    if (this.delveStage >= 2) this.ctx.scene.cameras.main.flash(700, 255, 120, 40);
    this.writeDepthRecord(participants);
    this.grantStageLoot(loot, this.delveHitLanded);
    this.openDeepDoor();
  }

  /**
   * The Depth Record write (ADR-0015 §5): rides the SAME RPC that pays the
   * participation loot — credit is exactly the participation-loot set, so only
   * a client that landed ≥1 hit sends it. Depth = the Stage just cleared;
   * roster = everyone in the participation set; id = the Descent's Stage-1 runId.
   */
  private writeDepthRecord(roster: string[]): void {
    if (!this.delveHitLanded) return;
    const record = { descentId: this.descentId || this.delveRunId || '', depth: this.delveStage, roster };
    void this.ctx.backend.claimDelveLoot({}, record).then(() => this.refreshDepthRecords());
  }

  /** open (and render) the boss-door to the next Depth in the cleared boss room */
  private openDeepDoor(): void {
    if (this.deepDoorOpen) return;
    this.deepDoorOpen = true;
    const nextLabel = this.stageZoneLabel(stageDefFor(this.delveStage + 1));
    this.ctx.bus.emit('toast', this.delveStage === 1 ? t.toast.deepDoorOpens : t.toast.depthDoorOpens(nextLabel), 'good');
    const door = this.stageDef().door;
    if (!door) return;
    const dx = (door.tx + 0.5) * TILE;
    const dy = (door.ty + 0.5) * TILE;
    const c = this.ctx.scene.add.container(dx, dy);
    const glow = this.ctx.scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xff6a2a).setScale(2.8).setAlpha(0.42);
    const frame = this.ctx.scene.add.rectangle(0, -2, TILE * 1.7, TILE * 2.1, 0x1a1210).setStrokeStyle(2, 0xff6a1e);
    const maw = this.ctx.scene.add.rectangle(0, 0, TILE * 1.05, TILE * 1.7, 0x120806).setStrokeStyle(2, 0xff8c2a);
    const label = this.ctx.scene.add
      .text(0, -TILE * 1.7, this.delveStage === 1 ? t.delve.descendDeep : t.delve.descendDepth(nextLabel), {
        fontSize: '8px',
        color: '#ffb060',
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setResolution(4);
    c.add([glow, frame, maw, label]);
    c.setDepth(DELVE_DEPTH_ENTITY + dy);
    this.ctx.scene.tweens.add({ targets: glow, alpha: 0.24, duration: 900, yoyo: true, repeat: -1, ease: 'sine.inout' });
    this.delveObjects.push(c);
  }

  /**
   * Each client claims its OWN Stage loot iff it landed ≥1 hit — the run's only DB
   * write (the existing jw_claim_delve_loot merges any loot JSON; new ids ride the
   * inventory JSON, so no migration/new RPC). The success/no-hit toast is chosen
   * from the loot payload so it names the right boss (Deep Guardian vs Forgeborn
   * vs a generated Depth's composed boss name).
   */
  private grantStageLoot(loot: Inventory, eligible: boolean): void {
    const S = this.stageDef();
    const isDepth = S.stage >= 3 || DEPTH_SIGIL in loot;
    const isDeep = FORGE_CORE in loot;
    if (!eligible) {
      this.ctx.bus.emit(
        'toast',
        isDepth ? t.toast.depthClearedNoHit(this.stageZoneLabel(S)) : isDeep ? t.toast.deepClearedNoHit : t.toast.delveClearedNoHit,
        'info',
      );
      return;
    }
    // roll THIS client's own rare Fabled drops (the broadcast base loot is shared;
    // the ~1% weapons are personal) and fold them into the haul. The generated
    // Depths pay the Sigil and NOTHING else (ADR-0015 §4) — no Fabled roll there,
    // so deep farming never out-loots the authored bosses.
    const full: Inventory = isDepth ? { ...loot } : { ...loot, ...this.rollFabledDrops() };
    // the boss fell — announce it, then present the haul in the Spoils window so
    // the drops are taken out deliberately (claimDelveLoot fires on the take)
    const parts = Object.entries(full)
      .filter(([, n]) => (n as number) > 0)
      .map(([k, n]) => `+${n} ${ITEMS[k as ItemId]?.name ?? k}`)
      .join('  ');
    const bossName = S.names?.boss ?? '';
    this.ctx.bus.emit(
      'toast',
      isDepth ? t.toast.depthBossFalls(bossName, parts) : isDeep ? t.toast.forgebornFalls(parts) : t.toast.deepGuardianFalls(parts),
      'good',
    );
    this.openLoot(full, isDepth ? t.loot.fromDepthBoss(bossName) : isDeep ? t.loot.fromForgeborn : t.loot.fromDeepGuardian);
  }

  /**
   * Roll the rare Fabled world-drop for one boss kill — ONE 1% roll for the
   * category, then a uniform pick among the weapons. Rolled LOCALLY per client
   * (never broadcast) so every fighter's luck is their own; a win lands in that
   * Player's Spoils window.
   */
  rollFabledDrops(): Inventory {
    const drop: Inventory = {};
    if (Math.random() < FABLED_DROP_CHANCE) {
      drop[FABLED_WEAPONS[Math.floor(Math.random() * FABLED_WEAPONS.length)]] = 1;
    }
    return drop;
  }

  /**
   * Open the read-only boss Spoils window with a fresh drop set, merging it into
   * anything still uncollected (a second boss before the first bag is emptied).
   * The loot is NOT in the pack yet: it lands there only as it is taken out
   * (claimLoot → claimDelveLoot). Every boss funnels through here.
   */
  openLoot(loot: Inventory, sub: string): void {
    for (const [k, n] of Object.entries(loot)) {
      if ((n as number) > 0) this.lootPending[k as ItemId] = (this.lootPending[k as ItemId] ?? 0) + (n as number);
    }
    this.ctx.bus.emit('loot-open', { ...this.lootPending }, sub);
  }

  /**
   * Take some (or all) of the pending Spoils into the pack. Clamped to what is
   * actually owed, then granted through the same per-client claim the Delve uses
   * (claimDelveLoot merges arbitrary loot into MY inventory — no server grant, no
   * migration). Echoes the remainder back so the window updates / self-closes.
   */
  claimLoot(part: Inventory): void {
    const take: Inventory = {};
    for (const [k, n] of Object.entries(part)) {
      const amt = Math.min(n as number, this.lootPending[k as ItemId] ?? 0);
      if (amt > 0) take[k as ItemId] = amt;
    }
    if (Object.keys(take).length === 0) {
      this.ctx.bus.emit('loot-changed', { ...this.lootPending });
      return;
    }
    for (const [k, n] of Object.entries(take)) {
      const left = (this.lootPending[k as ItemId] ?? 0) - (n as number);
      if (left > 0) this.lootPending[k as ItemId] = left;
      else delete this.lootPending[k as ItemId];
    }
    void this.ctx.backend.claimDelveLoot(take).then((res) => {
      this.ctx.setInventory(res.inventory);
      this.ctx.sfx('craft', 0.8);
      this.ctx.bus.emit('loot-changed', { ...this.lootPending });
    });
  }

  /** inside a Stage, E means leave (at the entry), descend (Stage-1 open door), or strike the nearest mob */
  delveEAction(px: number, py: number): EAction | null {
    void px;
    void py;
    const S = this.stageDef();
    const ex = (S.entry.tx + 0.5) * TILE;
    const ey = (S.entry.ty + 0.5) * TILE;
    if (Phaser.Math.Distance.Between(this.ctx.player.x, this.ctx.player.y, ex, ey) < INTERACT_RANGE) {
      return { swing: false, run: () => this.leaveDelveManual() };
    }
    // the open boss-door prompt — EVERY cleared Stage has one now (ADR-0015);
    // descending stays optional (a party may instead just leave with its haul)
    if (this.deepDoorOpen && S.door) {
      const dx = (S.door.tx + 0.5) * TILE;
      const dy = (S.door.ty + 0.5) * TILE;
      if (Phaser.Math.Distance.Between(this.ctx.player.x, this.ctx.player.y, dx, dy) < INTERACT_RANGE + 8) {
        return { swing: false, run: () => this.descendNextStage() };
      }
    }
    if (this.delveExhausted) return null;
    // the Bow always fires in the Delve — mouse-aimed, misses fly (the leave/
    // descend one-shots above keep priority)
    if (this.host.isBow()) {
      return { swing: true, cadenceMs: this.host.atkCadence(weaponCombat(this.host.heldTool()).attackMs), run: () => this.host.fireBow() };
    }
    const reach = 1.7; // melee closes to arm's length
    const ptx = this.ctx.player.x / TILE;
    const pty = (this.ctx.player.y - 4) / TILE;
    let best: MobState | null = null;
    let bd = reach;
    for (const m of this.mobs.values()) {
      if (m.st === 'dead') continue;
      const d = Math.hypot(m.x - ptx, m.y - pty) - profileOf(m.kind).radius;
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    if (!best) return null;
    const target = best;
    return { swing: true, cadenceMs: this.host.atkCadence(weaponCombat(this.host.heldTool()).attackMs), run: () => this.delveSwing(target) };
  }

  private delveSwing(m: MobState): void {
    const tool = this.host.heldTool();
    this.ctx.sfx('chop', 0.5);
    if (this.isDelveHost) {
      this.applyDelveHit(m.id, tool, this.ctx.me.name);
    } else if (this.delveRunId) {
      // ask the host to adjudicate; the mob's HP bar (from snapshots) shows the drop
      this.ctx.backend.sendDungeon({ t: 'hit', runId: this.delveRunId, mobId: m.id, by: this.ctx.me.name, tool });
      this.delveHitLanded = true;
    }
  }

  /** host: adjudicate a player→mob hit — reuse the ADR-0006 weapon roll, apply, float */
  applyDelveHit(mobId: string, tool: ToolId | undefined, by: string): void {
    const m = this.mobs.get(mobId);
    if (!m || m.st === 'dead') return;
    if (!this.delveHitInRange(by, m)) return; // loose trusted-friends range check (ADR-0005)
    const roll = applyMobHit(m, tool, Math.random, villageBuff(this.village.village.tier).critChance, this.host.armorBandOf(by));
    this.delveParticipants.add(by);
    if (by === this.ctx.me.name) this.delveHitLanded = true;
    const fx = m.x * TILE + Phaser.Math.Between(-6, 6);
    const fy = m.y * TILE - profileOf(m.kind).radius * TILE - 8;
    // the Bulwark's guard (ADR-0016): the hit BOUNCES — show the clank, not a 0
    if (roll.damage === 0 && m.guard) {
      floatText(this.ctx.scene, fx, fy, '✕', '#9aa0b5', 11);
      this.ctx.sfx('blip', 0.2);
      return;
    }
    const shown = roll.damage * GUARDIAN_DISPLAY_SCALE;
    if (roll.crit) floatText(this.ctx.scene, fx, fy, `${shown}!`, '#ffd166', 13);
    else floatText(this.ctx.scene, fx, fy, `${shown}`, '#ff9a66', 10);
    if (roll.dead) this.onMobFelled(m);
  }

  private delveHitInRange(by: string, m: MobState): boolean {
    let x: number;
    let y: number;
    if (by === this.ctx.me.name) {
      x = this.ctx.player.x / TILE;
      y = (this.ctx.player.y - 4) / TILE;
    } else {
      const pv = this.delvePeers.get(by);
      if (!pv) return true; // no position yet — trust the friend
      x = pv.x / TILE;
      y = pv.y / TILE;
    }
    return Math.hypot(m.x - x, m.y - y) <= 7 + profileOf(m.kind).radius;
  }

  onMobFelled(m: MobState): void {
    this.ctx.sfx('harvest', 0.5);
    // J4: detach the view BEFORE the MobState vanishes — renderDelve's sweep
    // destroys any view whose mob is gone, which used to erase the sprite the
    // same frame and make the kill read as a glitch, not a victory. The
    // orphaned view plays the flash-squash-poof at the death spot instead.
    // The Stage boss gets the same miniature: its stage-clear presentation
    // (onStageBossFelled's shake/flash/roar) is screen-level, not sprite-level,
    // so the two layer rather than double up.
    this.delveDeathBeat(m.id);
    if (!isBossKind(m.kind)) {
      this.delveKills++;
      this.mobs.delete(m.id);
      return;
    }
    // a Stage boss fell — clear its corpse, pay the loot + Record, open the next
    // door, linger (ADR-0015: no boss ends a Descent — only wipe/leave/decline)
    this.mobs.delete(m.id);
    this.onStageBossFelled();
  }

  /** my 3rd knockdown: Exhaustion — out of the run. You wake safe at home (the
   *  Village Hall or spawn), pack intact — never stranded at the far shaft. A SOLO
   *  player is always the host, so their calm wake reads as a normal defeat, not
   *  the alarming "no host migration" collapse (which only a real party ever sees). */
  private exitDelveExhausted(): void {
    this.delveExhausted = true;
    const stage = this.delveStage;
    const solo = this.delveHeadcount <= 1;
    if (this.isDelveHost) {
      const msg = solo
        ? (stage >= 3 ? t.toast.exhaustionDepthSolo : stage === 2 ? t.toast.exhaustionDeepSolo : t.toast.exhaustionDelveSolo)
        : (stage >= 3 ? t.toast.exhaustionDepthHost : stage === 2 ? t.toast.exhaustionDeepHost : t.toast.exhaustionDelveHost);
      this.ctx.bus.emit('toast', msg, solo ? 'info' : 'bad');
      if (this.delveRunId) this.ctx.backend.sendDungeon({ t: 'end', runId: this.delveRunId, reason: 'hostleft' });
      this.leaveDelve(this.delveWakeTile());
    } else {
      const msg = stage >= 3 ? t.toast.exhaustionDepthYou : stage === 2 ? t.toast.exhaustionDeepYou : t.toast.exhaustionDelveYou;
      this.ctx.bus.emit('toast', msg, 'bad');
      if (this.delveRunId) {
        this.ctx.backend.sendDungeon({ t: 'down', runId: this.delveRunId, name: this.ctx.me.name, out: true });
        if (this.delveHitLanded) this.delveExhaustedRun = this.delveRunId;
      }
      this.leaveDelve(this.delveWakeTile());
    }
  }

  /** a mob attack caught me — knock down (with a shove) and count toward Exhaustion */
  private delveKnockdown(srcX: number, srcY: number): void {
    this.host.beginKnockdown();
    this.ctx.sfx('chop', 0.4);
    this.ctx.scene.cameras.main.shake(160, 0.004);
    const ang = Phaser.Math.Angle.Between(srcX * TILE, srcY * TILE, this.ctx.player.x, this.ctx.player.y);
    this.ctx.scene.tweens.add({
      targets: this.ctx.player,
      x: this.ctx.player.x + Math.cos(ang) * TILE * 1.6,
      y: this.ctx.player.y + Math.sin(ang) * TILE * 1.6,
      duration: 200,
      ease: 'quad.out',
    });
    this.delveKnockdowns++;
    if (this.delveKnockdowns >= EXHAUSTION_KNOCKDOWNS) this.exitDelveExhausted();
    else {
      const knocked =
        this.delveStage >= 3 ? t.toast.knockedInDepth : this.delveStage === 2 ? t.toast.knockedInDeep : t.toast.knockedInDelve;
      this.ctx.bus.emit('toast', knocked(this.delveKnockdowns, EXHAUSTION_KNOCKDOWNS), 'bad');
    }
  }

  /** alive player positions the host AI steers toward (tile units) */
  private delveTargets(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    if (!this.delveExhausted) out.push({ x: this.ctx.player.x / TILE, y: (this.ctx.player.y - 4) / TILE });
    for (const pv of this.delvePeers.values()) out.push({ x: pv.x / TILE, y: pv.y / TILE });
    return out;
  }

  /** the whole Delve frame: dark ambiance, movement, host sim, render, combat, netcode */
  updateDelve(time: number, delta: number): void {
    const dt = delta / 1000;
    const cam = this.ctx.scene.cameras.main;
    if (this.delveBackdrop) this.delveBackdrop.setPosition(cam.midPoint.x, cam.midPoint.y).setSize(cam.displayWidth + 8, cam.displayHeight + 8);
    this.atmosphere.hideForDelve();
    this.host.torchGlow
      .setPosition(this.ctx.player.x, this.ctx.player.y - 8)
      .setAlpha(this.ctx.held.item === 'hand_torch' ? 0.5 : 0.22)
      .setDepth(DELVE_DEPTH_FLOOR + 2);
    positionHeld(this.host.heldSprite, this.ctx.player.x, this.ctx.player.y, this.ctx.held.lastDir);
    this.host.heldSprite.setDepth(DELVE_DEPTH_ENTITY + this.ctx.player.y + 1);
    this.host.playerShadow.setPosition(this.ctx.player.x, this.ctx.player.y - 1).setDepth(DELVE_DEPTH_ENTITY + this.ctx.player.y - 1);

    const stunned = Date.now() < this.host.stunnedUntil;
    if (!stunned && this.host.stunMarker) {
      this.host.stunMarker.destroy();
      this.host.stunMarker = null;
    }
    if (this.host.stunMarker) this.host.stunMarker.setPosition(this.ctx.player.x, this.ctx.player.y - AVATAR_H - 6).setDepth(999_999);

    // movement (frozen while stunned, chatting, or Exhausted-out)
    if (!this.host.chatFocused && !stunned && !this.delveExhausted) {
      const left = this.host.keys.left.isDown || this.host.keys.a.isDown;
      const right = this.host.keys.right.isDown || this.host.keys.d.isDown;
      const up = this.host.keys.up.isDown || this.host.keys.w.isDown;
      const down = this.host.keys.down.isDown || this.host.keys.s.isDown;
      let vx = (right ? 1 : 0) - (left ? 1 : 0);
      let vy = (down ? 1 : 0) - (up ? 1 : 0);
      if (vx !== 0 && vy !== 0) {
        vx *= Math.SQRT1_2;
        vy *= Math.SQRT1_2;
      }
      const speed = PLAYER_SPEED * this.host.moveSpeedFactor();
      this.ctx.player.setVelocity(vx * speed, vy * speed);
      const moving = vx !== 0 || vy !== 0;
      if (moving) this.ctx.held.lastDir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : vy > 0 ? 'down' : 'up';
      this.host.applyAnim(this.ctx.player, this.ctx.held.lastDir, moving);
    } else {
      this.ctx.player.setVelocity(0, 0);
      this.host.applyAnim(this.ctx.player, this.ctx.held.lastDir, false);
    }
    this.ctx.player.setDepth(DELVE_DEPTH_ENTITY + this.ctx.player.y);

    if (this.isDelveHost) this.simulateDelve(delta);
    this.stepProjectiles(dt);
    this.renderDelve(time);
    if (!stunned && !this.delveExhausted) this.checkDelveHarm();

    for (const pv of this.delvePeers.values()) {
      pv.marker.setPosition(pv.x, pv.y).setDepth(DELVE_DEPTH_ENTITY + pv.y);
      pv.label.setPosition(pv.x, pv.y - 16).setDepth(DELVE_DEPTH_ENTITY + pv.y + 1);
    }

    // netcode: my interior position, and (host) mob snapshots — both rate-capped
    if (this.delveRunId && time - this.host.lastPosSent > 150) {
      this.host.lastPosSent = time;
      this.ctx.backend.sendDungeon({ t: 'pos', runId: this.delveRunId, name: this.ctx.me.name, x: this.ctx.player.x / TILE, y: (this.ctx.player.y - 4) / TILE });
    }
    if (this.isDelveHost && this.delveRunId && time - this.lastMobSnapAt > 150) {
      this.lastMobSnapAt = time;
      this.broadcastMobSnap();
    }

    // E / LMB: strike / leave (same cadence discipline + alt-fire as the World swing loop)
    if (!this.host.chatFocused && !stunned) {
      const ePressed = Phaser.Input.Keyboard.JustDown(this.host.keys.e);
      // B1: LMB is alt-fire for swing:true attacks here too; one-shots (leave,
      // descend) stay E-only via the `ePressed` guard below (chat already excluded)
      const lmbActive = this.host.lmbDown;
      if (ePressed || this.host.keys.e.isDown || lmbActive) {
        const now = Date.now();
        if (ePressed || now - this.host.lastSwingAt >= SWING_CADENCE_MS) {
          const action = this.host.resolveEAction();
          if (action?.swing) {
            const cad = action.cadenceMs ?? SWING_CADENCE_MS;
            if (now - this.host.lastSwingAt >= cad) {
              this.host.markSwing(now); // stamp + peer echo counter + pose/arc, fused
              action.run();
            }
          } else if (action && ePressed) {
            action.run();
          }
        }
      }
    }
  }

  /** host: advance every mob's reactive AI one frame and act on what they emit */
  private simulateDelve(delta: number): void {
    const S = this.stageDef();
    const targets = this.delveTargets();
    // mobs treat cover props as walls too — so a Husk rounds a pillar. S.tune is
    // the per-Depth hardening (ADR-0015) — undefined on the authored Stages.
    const ctx = { targets, isWall: (tx: number, ty: number) => S.isBlocked(tx, ty), dt: delta, rng: Math.random, tune: S.tune };
    for (const m of this.mobs.values()) {
      if (m.st === 'dead') continue;
      const ev = stepMob(m, ctx);
      this.applyMobEvent(m, ev);
    }
  }

  private applyMobEvent(m: MobState, ev: MobEvent): void {
    if (ev.sfx === 'roar') this.ctx.sfx('roar', 0.3);
    else if (ev.sfx === 'lunge') this.ctx.sfx('chop', 0.25);
    else if (ev.sfx === 'spit') this.ctx.sfx('blip', 0.3);
    if (ev.projectile) {
      const p = ev.projectile;
      this.projectiles.push({ id: `p${this.nextProjId++}`, x: p.x, y: p.y, vx: p.vx, vy: p.vy, r: p.r, life: 3000 });
    }
    // the Broodmother's birth (ADR-0016): the host turns the summon positions
    // into live Husk adds — the Stage's own chaser kind, never past the mob cap
    // (guests receive them through the ordinary authoritative snap)
    if (ev.summon) {
      const S = this.stageDef();
      const kind = S.shot === 'acid' ? 'grasp' : 'cinder';
      const alive = [...this.mobs.values()].filter((x) => x.st !== 'dead').length;
      let room = Math.max(0, DEPTH_MOB_CAP - alive);
      for (const s of ev.summon) {
        if (room <= 0) break;
        const tx = Math.floor(s.x);
        const ty = Math.floor(s.y);
        if (S.isBlocked(tx, ty)) continue;
        const id = `m${this.nextMobId++}`;
        this.mobs.set(id, createMob(id, { kind, x: s.x, y: s.y }, this.delveHeadcount, S.bossHpPerHead, S.hpMul));
        room--;
      }
    }
    void m;
  }

  private stepProjectiles(dt: number): void {
    const S = this.stageDef();
    this.projectiles = this.projectiles.filter((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 1000;
      // a Husk's shot dies on a wall OR a cover prop — pillars are real cover
      return p.life > 0 && !S.isBlocked(Math.floor(p.x), Math.floor(p.y));
    });
  }

  /** draw mobs (body, telegraph, HP bar) + projectiles from this.mobs / this.projectiles */
  private renderDelve(time: number): void {
    const S = this.stageDef();
    const seen = new Set<string>();
    for (const m of this.mobs.values()) {
      if (m.st === 'dead') continue;
      seen.add(m.id);
      const prof = profileOf(m.kind);
      const rpx = prof.radius * TILE;
      const fh = MOB_FRAME[m.kind].h;
      const barW = Math.max(rpx * 2, MOB_FRAME[m.kind].w * 0.8);
      let v = this.mobViews.get(m.id);
      if (!v) {
        const sprite = this.ctx.scene.add.sprite(0, 0, MOB_TEX[m.kind], 0).setOrigin(0.5, 0.78);
        // ADR-0015: a generated Depth re-dresses the recycled sprites with its tint
        if (S.tint) {
          const kiter = m.kind === 'spit' || m.kind === 'ember';
          sprite.setTint(isBossKind(m.kind) ? S.tint.boss : kiter ? S.tint.kiter : S.tint.chaser);
        }
        const shadow = this.ctx.scene.add.image(0, 0, 'shadow').setDisplaySize(rpx * 2.6, rpx * 1.4).setAlpha(0.45);
        const tele = this.ctx.scene.add.graphics();
        const bar = this.ctx.scene.add.rectangle(0, 0, barW, 3, 0x66ff88).setOrigin(0, 0.5).setVisible(false);
        v = { sprite, shadow, tele, bar };
        this.mobViews.set(m.id, v);
        this.delveObjects.push(sprite, shadow, tele, bar);
      }
      const px = m.x * TILE;
      const py = m.y * TILE;
      const d = DELVE_DEPTH_ENTITY + py;
      v.shadow.setPosition(px, py + rpx * 0.5).setDepth(d - 1);
      v.sprite.setPosition(px, py + rpx * 0.5).setDepth(d);
      v.sprite.setFlipX(Math.cos(m.face) < -0.15); // face the way it's heading
      // snap to the telegraph pose during a wind-up, else play the idle heave.
      // the Whirlwind keeps its TUCKED pose through the whole spin and shimmers
      // (fast flip) so the rotation reads even in pixel art (ADR-0016)
      const idleKey = `${MOB_TEX[m.kind]}-idle`;
      const spinning = m.st === 'strike' && prof.kit === 'whirl';
      if (m.st === 'windup' || m.st === 'aim' || spinning) {
        if (v.sprite.anims.isPlaying) v.sprite.anims.stop();
        v.sprite.setFrame(2);
        if (spinning) v.sprite.setFlipX(Math.floor(time / 90) % 2 === 0);
      } else if (v.sprite.anims.currentAnim?.key !== idleKey || !v.sprite.anims.isPlaying) {
        v.sprite.anims.play(idleKey, true);
      }
      // HP bar only once the mob has been hurt (keeps the room uncluttered)
      const hurt = m.hp < m.maxHp;
      v.bar
        .setVisible(hurt)
        .setPosition(px - barW / 2, py - fh * 0.55)
        .setDepth(d + 1)
        .setScale(Math.max(0, m.hp / m.maxHp), 1);
      // ground telegraph reinforces the sprite's reared pose
      v.tele.clear();
      v.tele.setDepth(DELVE_DEPTH_FLOOR + 3);
      if (m.st === 'windup' && m.erupt) {
        // the Forgeborn's ERUPTION wind-up (ADR-0011 §6): a huge pulsing radius
        // centred on the boss — a clear "sprint to the room's edge" warning
        const tr = (prof.eruptR ?? prof.strikeR) * TILE;
        const warn = 0.32 + 0.26 * Math.sin(time / 45);
        v.tele.fillStyle(0xff5a1e, warn * 0.45);
        v.tele.fillCircle(m.ax * TILE, m.ay * TILE, tr);
        v.tele.lineStyle(3, 0xffb060, Math.min(0.95, warn + 0.35));
        v.tele.strokeCircle(m.ax * TILE, m.ay * TILE, tr);
      } else if (m.st === 'strike' && m.erupt) {
        // the eruption goes off — a bright blast across the whole radius
        const tr = (prof.eruptR ?? prof.strikeR) * TILE;
        v.tele.fillStyle(0xff7a2a, 0.5);
        v.tele.fillCircle(m.ax * TILE, m.ay * TILE, tr);
        v.tele.lineStyle(3, 0xffe0a0, 0.85);
        v.tele.strokeCircle(m.ax * TILE, m.ay * TILE, tr);
      } else if (m.st === 'strike' && prof.kit === 'whirl') {
        // the Whirlwind's SPIN (ADR-0016): the danger zone rides the boss itself
        // for the whole spin — a live, moving circle you keep your distance from
        v.tele.fillStyle(0xff3322, 0.3);
        v.tele.fillCircle(px, py, prof.strikeR * TILE);
        v.tele.lineStyle(3, 0xff7a55, 0.8);
        v.tele.strokeCircle(px, py, prof.strikeR * TILE);
      } else if (m.st === 'windup') {
        const warn = 0.35 + 0.25 * Math.sin(time / 55);
        v.tele.lineStyle(3, 0xff3322, warn);
        v.tele.lineBetween(px, py, m.ax * TILE, m.ay * TILE);
        v.tele.fillStyle(0xff3322, warn * 0.5);
        v.tele.fillCircle(m.ax * TILE, m.ay * TILE, prof.strikeR * TILE);
      } else if (m.st === 'aim') {
        const warn = 0.35 + 0.25 * Math.sin(time / 55);
        v.tele.lineStyle(2, 0xffaa33, warn);
        v.tele.lineBetween(px, py, m.ax * TILE, m.ay * TILE);
      }
      // the Bulwark's guard ring (ADR-0016): lit while hits bounce — the moment
      // it vanishes, the slab is down and the boss is yours to hurt
      if (m.guard) {
        const gp = 0.45 + 0.2 * Math.sin(time / 140);
        v.tele.lineStyle(2, 0xffc36a, gp);
        v.tele.strokeCircle(px, py, (prof.radius + 0.35) * TILE);
      }
    }
    for (const [id, v] of this.mobViews) {
      if (seen.has(id)) continue;
      v.sprite.destroy();
      v.shadow.destroy();
      v.tele.destroy();
      v.bar.destroy();
      this.mobViews.delete(id);
    }
    // projectiles wear the live Stage's spat shot (ADR-0011/0015): an acid glob
    // in the stone Stages, a molten cinder in the molten ones — a flickering
    // pixel sprite over an additive glow, sized to the shot's radius. Radial
    // art, so guest snapshots (position only) render identically.
    const projKey = PROJ_TEX[S.shot];
    const projGlow = PROJ_GLOW[S.shot];
    const seenP = new Set<string>();
    for (const p of this.projectiles) {
      seenP.add(p.id);
      const px = p.x * TILE;
      const py = p.y * TILE;
      let v = this.projViews.get(p.id);
      if (!v) {
        const glow = this.ctx.scene.add
          .image(0, 0, 'glow')
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(projGlow.color)
          .setAlpha(projGlow.alpha);
        const sprite = this.ctx.scene.add.sprite(0, 0, projKey, 0).setOrigin(0.5, 0.5);
        sprite.anims.play(`${projKey}-fly`, true);
        v = { sprite, glow };
        this.projViews.set(p.id, v);
        this.delveObjects.push(sprite, glow);
      }
      // the 12px art fills the shot's diameter; the 64px glow is a soft halo ~2.4× it
      const diam = Math.max(6, p.r * TILE * 2);
      v.sprite.setPosition(px, py).setDepth(DELVE_DEPTH_PROJ).setScale(diam / 12);
      v.glow
        .setPosition(px, py)
        .setDepth(DELVE_DEPTH_PROJ - 1)
        .setScale((diam / 26) * (projGlow.scale / 0.65));
    }
    for (const [id, v] of this.projViews) {
      if (seenP.has(id)) continue;
      v.sprite.destroy();
      v.glow.destroy();
      this.projViews.delete(id);
    }
  }

  /** each client checks its OWN player against live danger — melee strike zones + projectiles */
  private checkDelveHarm(): void {
    const ptx = this.ctx.player.x / TILE;
    const pty = (this.ctx.player.y - 4) / TILE;
    for (const m of this.mobs.values()) {
      if (m.st !== 'strike') continue;
      const prof = profileOf(m.kind);
      // the Forgeborn's eruption is a big radius centred where it planted (m.ax,m.ay);
      // an ordinary melee strike is prof.strikeR at the mob's live position
      const erupt = !!m.erupt;
      const r = erupt ? prof.eruptR ?? prof.strikeR : prof.strikeR;
      const cx = erupt ? m.ax : m.x;
      const cy = erupt ? m.ay : m.y;
      if (Math.hypot(cx - ptx, cy - pty) <= r + 0.35) {
        this.delveKnockdown(cx, cy);
        return;
      }
    }
    for (const p of this.projectiles) {
      if (Math.hypot(p.x - ptx, p.y - pty) <= p.r + 0.35) {
        p.life = -1;
        this.delveKnockdown(p.x, p.y);
        return;
      }
    }
  }

  /** host → peers: the live mob roster + projectiles (dead mobs drop off the wire) */
  private broadcastMobSnap(): void {
    if (!this.delveRunId) return;
    const mobs: MobSnap[] = [];
    for (const m of this.mobs.values()) {
      if (m.st === 'dead') continue;
      mobs.push({ id: m.id, kind: m.kind, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp, st: m.st, ax: m.ax, ay: m.ay, phase: m.phase, erupt: m.erupt, guard: m.guard });
    }
    const projectiles: ProjSnap[] = this.projectiles.map((p) => ({ id: p.id, x: p.x, y: p.y }));
    this.ctx.backend.sendDungeon({ t: 'snap', runId: this.delveRunId, mobs, projectiles });
  }

  /** guest: replace the rendered mob/projectile set from the host's authoritative snapshot */
  private applyDelveSnap(msg: Extract<DungeonMsg, { t: 'snap' }>): void {
    const alive = new Set<string>();
    for (const s of msg.mobs) {
      alive.add(s.id);
      const kind = s.kind as MobKind;
      let m = this.mobs.get(s.id);
      if (!m) {
        m = { id: s.id, kind, x: s.x, y: s.y, hp: s.hp, maxHp: s.maxHp, st: s.st as MobState['st'], t: 0, face: 0, ax: s.ax, ay: s.ay, phase: s.phase, erupt: s.erupt, guard: s.guard };
        this.mobs.set(s.id, m);
      } else {
        m.x = s.x;
        m.y = s.y;
        m.hp = s.hp;
        m.maxHp = s.maxHp;
        m.st = s.st as MobState['st'];
        m.ax = s.ax;
        m.ay = s.ay;
        m.phase = s.phase;
        m.erupt = s.erupt;
        m.guard = s.guard;
      }
      m.face = Math.atan2(s.ay - s.y, s.ax - s.x);
    }
    for (const id of [...this.mobs.keys()]) {
      if (alive.has(id)) continue;
      this.mobs.delete(id);
      // J4 guest path: a mob missing from a live snap was FELLED — dead mobs
      // drop off the wire (broadcastMobSnap skips st==='dead') and the Delve
      // never culls for range — so a guest plays the same death beat the host
      // saw, frozen at the view's last snapshot spot, not a silent removal.
      this.delveDeathBeat(id);
    }
    this.projectiles = msg.projectiles.map((p) => ({ id: p.id, x: p.x, y: p.y, vx: 0, vy: 0, r: 0.8, life: 2000 }));
  }

  /** dispatch a peer-host-authority Delve message (ADR-0007) */
  private onDungeonMsg(msg: DungeonMsg): void {
    switch (msg.t) {
      case 'start':
        this.onDelveStart(msg);
        break;
      case 'snap':
        if (this.host.inDelve && !this.isDelveHost && msg.runId === this.delveRunId) this.applyDelveSnap(msg);
        break;
      case 'end':
        this.onDelveEnd(msg);
        break;
      case 'pos':
        this.onDelvePos(msg);
        break;
      case 'hit':
        if (this.host.inDelve && this.isDelveHost && msg.runId === this.delveRunId) this.applyDelveHit(msg.mobId, msg.tool as ToolId | undefined, msg.by);
        break;
      case 'down':
        this.onDelveDown(msg);
        break;
      case 'join':
        break; // the host learns positions via 'pos'; nothing to do on join itself
    }
  }

  private onDelveEnd(msg: Extract<DungeonMsg, { t: 'end' }>): void {
    const active = msg.runId === this.delveRunId && this.host.inDelve;
    const exhausted = msg.runId === this.delveExhaustedRun;
    if (!active && !exhausted) return;
    // a Stage boss fell on the host: claim THIS run's loot (the Depth Record
    // rides the claim) and open the next door, but do NOT tear down — the party
    // lingers to descend or leave (ADR-0011 §2, endless per ADR-0015). An
    // Exhausted-out client whose hits landed still collects + gets credited.
    if (msg.reason === 'stagecleared') {
      const eligible = active ? this.delveHitLanded : true;
      if (eligible) this.writeDepthRecordAs(msg.participants ?? [], msg.runId);
      if (msg.loot) this.grantStageLoot(msg.loot, eligible);
      if (active) this.openDeepDoor();
      this.delveExhaustedRun = null;
      return;
    }
    if (msg.reason === 'victory' && msg.loot) {
      // legacy wire compat (pre-ADR-0015 hosts): the old "Forgeborn ends it" end
      this.grantStageLoot(msg.loot, active ? this.delveHitLanded : true);
    } else if (active) {
      // host-leave / wipe — name the live Stage in the collapse toast (CONTEXT terms)
      const stage = this.delveStage;
      const collapse =
        msg.reason === 'hostleft'
          ? stage >= 3
            ? t.toast.depthHostLeftCollapse
            : stage === 2
            ? t.toast.deepHostLeftCollapse
            : t.toast.hostLeftCollapse
          : stage >= 3
          ? t.toast.depthPartyOverwhelmed
          : stage === 2
          ? t.toast.deepPartyOverwhelmed
          : t.toast.partyOverwhelmed;
      this.ctx.bus.emit('toast', collapse, 'bad');
    }
    this.delveExhaustedRun = null;
    if (active) this.leaveDelve();
  }

  /** guest/exhausted-side Depth Record write for a stagecleared broadcast: same
   *  rules as the host's (participation credit), keyed by the shared Descent id */
  private writeDepthRecordAs(roster: string[], runId: string): void {
    const record = { descentId: this.descentId || runId, depth: this.delveStage, roster };
    void this.ctx.backend.claimDelveLoot({}, record).then(() => this.refreshDepthRecords());
  }

  /** ADR-0015: the Grand Monument's interact — fetch fresh and open the board */
  openRecordBoard(): void {
    this.ctx.sfx('blip', 0.4);
    void this.ctx.backend.getDepthRecords().then((r) => this.ctx.bus.emit('records-open', r));
  }

  /** re-read the World's Depth Records and refresh the Hall panel's teaser line */
  refreshDepthRecords(): void {
    void this.ctx.backend.getDepthRecords().then((r) => this.ctx.bus.emit('depth-record', r.descents[0] ?? null));
  }

  private onDelvePos(msg: Extract<DungeonMsg, { t: 'pos' }>): void {
    if (!this.host.inDelve || msg.runId !== this.delveRunId || msg.name === this.ctx.me.name) return;
    const px = msg.x * TILE;
    const py = msg.y * TILE + 4;
    let pv = this.delvePeers.get(msg.name);
    if (!pv) {
      const marker = this.ctx.scene.add.circle(px, py, 6, 0x8fd0ff).setStrokeStyle(2, 0x0a1a2a);
      const label = this.ctx.scene.add
        .text(px, py - 16, msg.name, { fontSize: '8px', color: '#dff0ff', stroke: '#000', strokeThickness: 3 })
        .setOrigin(0.5)
        .setResolution(4);
      pv = { marker, label, x: px, y: py };
      this.delvePeers.set(msg.name, pv);
      this.delveObjects.push(marker, label);
    }
    pv.x = px;
    pv.y = py;
  }

  private onDelveDown(msg: Extract<DungeonMsg, { t: 'down' }>): void {
    if (!this.isDelveHost || msg.runId !== this.delveRunId) return;
    if (!msg.out) return;
    const pv = this.delvePeers.get(msg.name);
    if (pv) {
      pv.marker.destroy();
      pv.label.destroy();
      this.delvePeers.delete(msg.name); // out of the run — no longer an AI target
    }
  }

  /** J4: detach a Delve mob's view from the render-sync map and play its death beat */
  private delveDeathBeat(id: string): void {
    const v = this.mobViews.get(id);
    if (!v) return;
    this.mobViews.delete(id);
    playDeathBeat(this.ctx.scene, v, DEATH_PUFF_TINT_DELVE, this.delveDeathFx);
  }

}
