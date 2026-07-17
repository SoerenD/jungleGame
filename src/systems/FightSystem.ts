/**
 * FightSystem (ADR-0018 #6): the Guardian/Warden fights (ADR-0002/0004/0006/
 * 0017) — the per-Warden BossRig record (the §1.7 dedup of the four copy-paste
 * field blocks), summon/engage/end, the Ward, authored waves + telegraphs +
 * slams, the melee danger-ring, Eye-Window hits, knockdown/Exhaustion, the
 * altars + Offering flow, and the per-Warden world progress (wardens record +
 * Realm-gate opening relay). update() is the §8 step-9 fight block;
 * updateStunMarker() the step-10 upkeep.
 */
import Phaser from 'phaser';
import { AVATAR_H } from '../avatars';
import type { FightState, KnockdownResult, WardenAltarState } from '../backend/types';
import { FIGHT_MUSIC_BASE_VOLUME, GUARDIAN_AWAKE_MS, GUARDIAN_SCALE_DROP, INTERACT_RANGE, KNOCKDOWN_STUN_MS, TILE } from '../config';
import {
  eyeOpenAt,
  furyPhaseAt,
  guardianPoseAt,
  guardianSpotAt,
  GUARDIAN_DISPLAY_SCALE,
  inMeleeRing,
  lungeTarget,
  meleeRingWindow,
  waveInfoAt,
  waveTiles,
  weaponCombat,
  type ArenaSpot,
  type WardenKit,
  type WaveInfo,
} from '../content/guardian';
import { ITEMS, type ItemId, type ToolId } from '../content/items';
import { kitOf, wardenDef, WARDENS } from '../content/wardens';
import type { GameScene } from '../scenes/GameScene';
import { t } from '../i18n';
import type { AtmosphereSystem } from './AtmosphereSystem';
import type { GameContext } from './context';
import type { DelveSystem } from './DelveSystem';
import type { DistrictSystem } from './DistrictSystem';
import type { EchoSystem } from './EchoSystem';
import type { ProjectileSystem } from './ProjectileSystem';
import { addBlockerBody, addShadow, floatText, objImage } from './sceneFx';
import type { SealSystem } from './SealSystem';
import type { EAction, GameSystem, WardenArena } from './types';

/**
 * Per-Warden fight VISUALS (ADR-0017): the WardenKit carries no art (it must stay
 * node-importable), so the fight keeps each kit's palette + sprite/anim keys here,
 * keyed by the fight's warden id ('guardian' = rung 0). The Guardian entry holds
 * the exact former literals (a no-op); the Mire wears the drowned court's teal.
 */
interface KitArt {
  spriteKey: string;
  idle: string;
  eye: string;
  /** rune glow base tint (also the calm-phase fury tint) */
  glowBase: number;
  /** rune glow tint per fury phase: calm → restless → fury */
  fury: readonly [number, number, number];
  /** slam-tile telegraph fill / hot-slam fill / lunge landing fill / melee-ring fill */
  danger: number;
  slam: number;
  lunge: number;
  ring: number;
  /** the amber-eye blaze tint during an Eye Window */
  eyeTint: number;
  /** the raised Ward's cast (the per-fight barrier over the entrance) */
  ward: number;
}
const KIT_ART: Record<string, KitArt> = {
  guardian: { spriteKey: 'guardian', idle: 'guardian-idle', eye: 'guardian-eye', glowBase: 0xb478ff, fury: [0xb478ff, 0xff9a3d, 0xff4433], danger: 0xff3322, slam: 0xff2211, lunge: 0xffa02f, ring: 0xff5a2f, eyeTint: 0xffb437, ward: 0xffb9a0 },
  // the Mire Warden's rising-water court: teal telegraphs, a tideglass eye + Ward
  mire: { spriteKey: 'mire_warden', idle: 'mire-idle', eye: 'mire-eye', glowBase: 0x2f8f74, fury: [0x2f8f74, 0x39c39a, 0x63e0b8], danger: 0x1f9e7a, slam: 0x14c79a, lunge: 0x63e0b8, ring: 0x2fd6a6, eyeTint: 0x9ffbe4, ward: 0xa0ffe8 },
  // the Echo Warden's sound-ring court: cold blue-steel telegraphs, a hushsteel eye + Ward
  echo: { spriteKey: 'echo_warden', idle: 'echo-idle', eye: 'echo-eye', glowBase: 0x5a6b85, fury: [0x5a6b85, 0x7d8fb0, 0x93a8c9], danger: 0x4a6a9a, slam: 0x6f8fd0, lunge: 0x93a8c9, ring: 0x8fb0e0, eyeTint: 0xbcd0ee, ward: 0xb1c6ea },
  // the Reverberant (the puzzle-summoned deeper foe): the echo sheet, violet echo-light
  reverb: { spriteKey: 'echo_warden', idle: 'echo-idle', eye: 'echo-eye', glowBase: 0x9a7bd0, fury: [0x9a7bd0, 0xb6a0e8, 0xdcccff], danger: 0x7a5ad0, slam: 0x9f7fe0, lunge: 0xc9b0ff, ring: 0xb090f0, eyeTint: 0xecdcff, ward: 0xc9b8ff },
  // the Verdant Warden's terraced court (ADR-0017 rung 3): warm gold-green telegraphs,
  // a sunlit-gold eye + Ward — the Green Terraces' ripe-wildgrain signal color
  verdant: { spriteKey: 'verdant_warden', idle: 'verdant-idle', eye: 'verdant-eye', glowBase: 0x7cc96f, fury: [0x7cc96f, 0xb6d24a, 0xffd24a], danger: 0x6aa83e, slam: 0xd8a83e, lunge: 0xf0c95e, ring: 0x9dc85a, eyeTint: 0xffe89a, ward: 0xcfe8a0 },
};

export type WardenId = 'guardian' | 'mire' | 'echo' | 'verdant' | 'reverb';

/**
 * One Warden's render bundle (ADR-0018 §1.7): the four former copy-paste
 * per-warden field blocks (the mire/echo/verdant/reverb field families) folded
 * into a single record on the activeBoss() seam — a future Warden adds a rig
 * entry, not a fifth field block.
 */
export interface BossRig {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  eyeGlow: Phaser.GameObjects.Image;
  blockers: Phaser.GameObjects.Rectangle[];
  arena: { x: number; y: number; w: number; h: number };
  homeSpot: ArenaSpot;
  /** arena-local center of the entrance (the sealGate) — the wave-0 Ward-slam spot */
  entranceSpot: ArenaSpot;
  sealGate: { tx: number; ty: number }[];
  /** this Warden's summoning-altar dressing position ((0,0) for the altar-less Reverberant) */
  altarPos: { x: number; y: number };
  /** slain: left a broken wreck (angle/tint/dead glow) until summoned anew */
  broken: boolean;
  art: KitArt;
}

export class FightSystem implements GameSystem {
  fight: FightState | null = null;
  /** per-Warden altar/gate progress (ADR-0017) — mirrors the backend's view */
  wardens: Record<string, import('../backend/types').WardenWorldState> = {};
  /** every Warden's render bundle, keyed by WardenId ('guardian' always present) */
  rigs: Partial<Record<WardenId, BossRig>> = {};
  private dangerRects: Phaser.GameObjects.Rectangle[] = [];
  /** the authored melee danger-ring's tiles, live only while it is hot (ADR-0006 §7) */
  private meleeRingRects: Phaser.GameObjects.Rectangle[] = [];
  private renderedWave = -1;
  private slammedWave = -1;
  private landedWave = -1;
  private furyIndex = -1;
  private eyeOpenShown = false;
  /** live first-strike: the Ward is deferred until wave 0's leap slams the gate */
  private wardPending = false;
  stunnedUntil = 0;
  stunMarker: Phaser.GameObjects.Text | null = null;
  /** melee-ring shove cooldown: one push per contact so the tween can't restack (no stun) */
  private meleeRingShoveUntil = 0;
  fightMusic: Phaser.Sound.BaseSound | null = null;
  /** v5: the Ward — a fresh barrier slammed across the entrance for the fight */
  private wardParts: { sprite: Phaser.GameObjects.Image; body: Phaser.GameObjects.Rectangle }[] = [];
  /** set once this Player is knocked out (3 knockdowns) — the Ward then bars re-entry */
  private exhaustedThisFight = false;
  /** the post-victory delayed hide (so the death-throes play): held so a fresh
   *  summon within the delay can CANCEL it — else the stale timer would hide the
   *  newly-risen boss mid-fight (invisible, walk-through) */
  private reverbHideTimer?: Phaser.Time.TimerEvent;
  /** guards the summon-on-solve from firing every frame while covered */
  reverbSummonBusy = false;
  /** true once this Player has defeated the Reverberant this session (gates the memorial) */
  reverbDefeated = false;
  /** which Warden the active fight's VISUALS belong to (null = the Guardian, rung 0) */
  activeWarden: string | null = null;
  /** cross-system refs, wired by GameScene (ADR-0018 §3) */
  seal!: SealSystem;
  district!: DistrictSystem;
  atmosphere!: AtmosphereSystem;
  delve!: DelveSystem;
  echo!: EchoSystem;
  projectile!: ProjectileSystem;
  private onSummoned = (f: FightState): void => this.startFight(f, true);
  private onEngaged = (f: FightState): void => this.engageFight(f);
  private onHit = (hp: number): void => {
    if (this.fight) {
      this.fight = { ...this.fight, hp };
      this.ctx.bus.emit('fight-hp', hp);
      const hitSpr = this.activeBoss().sprite;
      hitSpr.setTintFill(0xffffff);
      this.ctx.scene.time.delayedCall(60, () => hitSpr.clearTint());
    }
  };
  private onVictory = (participants: string[]): void => {
    // capture the fallen colossus BEFORE endFight clears the slot (ADR-0017)
    const wardenId = this.fight?.warden ?? null;
    this.endFight('victory');
    // every fighter who landed a hit collects their drops from the Spoils window
    // (the grant is deferred to the take — see openLoot/claimLoot). Non-fighters
    // in the arena still get the death-throes spectacle, but no loot bag.
    if (participants.includes(this.ctx.me.name)) {
      // ADR-0017 rung 2: the Reverberant's reward flows through a SERVER-GUARDED
      // claim (epic helm + reliquary once-ever, Echo Sigil + resources weekly) —
      // not the free Spoils window, so it can't be farmed by re-summoning.
      if (wardenId === 'reverb') {
        void this.echo.claimReverbReward();
      } else {
        const def = wardenDef(wardenId);
        if (def) this.delve.openLoot({ ...def.drops, ...this.delve.rollFabledDrops() }, t.loot.fromWarden(t.warden.name(def.id)));
        else this.delve.openLoot({ guardian_scale: GUARDIAN_SCALE_DROP, ...this.delve.rollFabledDrops() }, t.loot.fromGuardian);
      }
    }
  };
  private onSlumber = (): void => this.endFight('slumber');
  // ADR-0017: a Warden altar's pooled Offering moved (or broke)
  private onWardenAltarChanged = (id: string, altar: WardenAltarState): void => {
    const w = (this.wardens[id] ??= { altar, gateOpen: false });
    w.altar = altar;
    this.ctx.bus.emit('warden-altar', id, altar);
    this.ctx.bus.emit('wardens', this.wardens);
    if (altar.broken) this.ctx.bus.emit('toast', t.toast.wardenAwaitsTotem(ITEMS[wardenDef(id)?.totem ?? 'summon_totem'].name), 'good');
  };
  // ADR-0017: a Realm gate opened — one-time, forever; re-dress its arches
  private onRealmOpened = (id: string): void => {
    const w = (this.wardens[id] ??= { altar: { broken: false, contributed: {}, quotas: {} }, gateOpen: true });
    w.gateOpen = true;
    this.ctx.bus.emit('wardens', this.wardens);
    this.ctx.bus.emit('toast', t.toast.realmGateKeyTurn(t.warden.realmName(id)), 'good');
    this.ctx.sfx('seal_gong', 0.6);
    this.district.rebuildRealmGates();
  };

  constructor(
    private ctx: GameContext,
    private host: GameScene,
  ) {}

  /** build the Guardian altar + every Warden court/rig, wire the fight's backend events */
  create(): void {
    this.buildRigs();
    const backend = this.ctx.backend;
    backend.on('guardianSummoned', this.onSummoned);
    backend.on('guardianEngaged', this.onEngaged);
    backend.on('guardianHit', this.onHit);
    backend.on('guardianVictory', this.onVictory);
    backend.on('guardianSlumber', this.onSlumber);
    backend.on('wardenAltarChanged', this.onWardenAltarChanged);
    backend.on('realmOpened', this.onRealmOpened);
  }

  destroy(): void {
    const backend = this.ctx.backend;
    backend.off('guardianSummoned', this.onSummoned);
    backend.off('guardianEngaged', this.onEngaged);
    backend.off('guardianHit', this.onHit);
    backend.off('guardianVictory', this.onVictory);
    backend.off('guardianSlumber', this.onSlumber);
    backend.off('wardenAltarChanged', this.onWardenAltarChanged);
    backend.off('realmOpened', this.onRealmOpened);
  }

  // ------------------------------------------------------------ rig building (create)

  /** one Warden's summoning-altar dressing (E with the Totem) */
  private buildAltarDressing(a: { tx: number; ty: number }): { x: number; y: number } {
    const scene = this.ctx.scene;
    const x = (a.tx + 1) * TILE;
    const y = (a.ty + 1) * TILE;
    objImage(scene, x, y, 'guardian_altar');
    addBlockerBody(scene, this.host.blockersGroup, a.tx, a.ty);
    addBlockerBody(scene, this.host.blockersGroup, a.tx + 1, a.ty);
    addShadow(scene, x, y - 1, 24);
    return { x, y };
  }

  /** one Warden's offering monument OUTSIDE the gate (Seal-bars panel) */
  private buildMonumentDressing(m: { tx: number; ty: number }): void {
    const scene = this.ctx.scene;
    const x = (m.tx + 1) * TILE;
    const y = (m.ty + 1) * TILE;
    objImage(scene, x, y, 'seal_monument');
    addBlockerBody(scene, this.host.blockersGroup, m.tx, m.ty);
    addBlockerBody(scene, this.host.blockersGroup, m.tx + 1, m.ty);
    addShadow(scene, x, y - 1, 22);
  }

  /**
   * One dormant colossus on its 3x3 resting place — THE former per-warden
   * copy-paste block, run once per rig (ADR-0018 §1.7). The home/entrance
   * spots and every sprite/glow/blocker literal are unchanged.
   */
  private buildDormantRig(id: WardenId, wa: Pick<WardenArena, 'arena' | 'home' | 'sealGate'>, altarPos: { x: number; y: number }): BossRig {
    const scene = this.ctx.scene;
    const g = wa.home;
    const arena = wa.arena;
    const art = KIT_ART[id];
    const x = (g.tx + 1.5) * TILE;
    const y = (g.ty + 3) * TILE;
    const homeSpot: ArenaSpot = { ax: g.tx + 1 - arena.x, ay: g.ty + 1 - arena.y };
    // arena-local center of the entrance (the sealGate the Ward re-seals). The
    // gate sits just below the arena, so ay is clamped in — wave 0's leap lands
    // in front of the doorway. Derived identically to the server's entranceSpot.
    const gate = wa.sealGate;
    const mid = gate[Math.floor(gate.length / 2)] ?? { tx: arena.x + Math.floor(arena.w / 2), ty: arena.y + arena.h - 1 };
    const entranceSpot: ArenaSpot = {
      ax: Math.max(0, Math.min(arena.w - 1, mid.tx - arena.x)),
      ay: Math.max(0, Math.min(arena.h - 1, mid.ty - arena.y)),
    };
    const sprite = scene.add.sprite(x, y, art.spriteKey, 0);
    sprite.setOrigin(0.5, 1);
    sprite.setDepth(y);
    const shadow = addShadow(scene, x, y - 2, 60);
    // the resting place blocks movement; during a fight the collision FOLLOWS
    // the boss as it lunges (and lifts while it is airborne) so Players can
    // walk into whatever tiles it has vacated — see positionGuardianBlockers()
    const blockers: Phaser.GameObjects.Rectangle[] = [];
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) blockers.push(addBlockerBody(scene, this.host.blockersGroup, g.tx + dx, g.ty + dy));
    }
    // its cracked runes smolder at night, even asleep; during a fight the
    // tint tracks the fury phase (purple → orange → red)
    const glow = scene.add
      .image(x, y - 45, 'glow')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(art.glowBase)
      .setScale(2.6)
      .setAlpha(0)
      .setDepth(890_001);
    this.atmosphere.glows.push({ img: glow, base: 0.5, x, y });
    // the amber eye's blaze while an Eye Window is open
    const eyeGlow = scene.add
      .image(x, y - 61, 'glow')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(art.eyeTint)
      .setScale(1.5)
      .setAlpha(0)
      .setDepth(890_002);
    return { sprite, shadow, glow, eyeGlow, blockers, arena, homeSpot, entranceSpot, sealGate: wa.sealGate, altarPos, broken: false, art };
  }

  private buildRigs(): void {
    const scene = this.ctx.scene;
    const world = this.ctx.world;
    // the Guardian's arena altar (E with a Summoning Totem), then the colossus
    // itself, slumbering on its 3x3 resting place (rung 0 keeps the top-level
    // world fields — every further Warden's court lives in wardenArenas)
    const guardianAltarPos = this.buildAltarDressing(world.guardianAltar);
    this.rigs.guardian = this.buildDormantRig(
      'guardian',
      { arena: world.arena, home: world.guardianHome, sealGate: world.sealGate },
      guardianAltarPos,
    );

    // ---- ADR-0017: the further Wardens' courts — each a SECOND authored arena
    // standing from day one (its own dormant sprite, altar and offering
    // monument), so every Warden is visibly asleep in its court. Its fight runs
    // here through activeBoss() (selected by fight.warden). Formerly three
    // byte-for-byte blocks (mire/echo/verdant) — now one loop over the rigs.
    for (const id of ['mire', 'echo', 'verdant'] as const) {
      const wa = world.wardenArenas?.[id];
      if (!wa) continue;
      const altarPos = this.buildAltarDressing(wa.altar);
      this.buildMonumentDressing(wa.monument);
      this.rigs[id] = this.buildDormantRig(id, wa, altarPos);
    }

    // ---- ADR-0017 rung 2: the Reverberant — pre-built HIDDEN (no altar/monument;
    // summoned by the puzzle). The sprite/glow/blockers exist so activeBoss('reverb')
    // routes correctly, but stay invisible + disabled until it RISES on summon
    // (startFight) and are hidden again on defeat (endFight). NOT in the glow
    // pool (no dormant ambient pulse — the fight drives its glow).
    const wr = world.wardenArenas?.reverb;
    if (wr) {
      const g = wr.home;
      const arena = wr.arena;
      const art = KIT_ART.reverb;
      const x = (g.tx + 1.5) * TILE;
      const y = (g.ty + 3) * TILE;
      const homeSpot: ArenaSpot = { ax: g.tx + 1 - arena.x, ay: g.ty + 1 - arena.y };
      const gate = wr.sealGate;
      const mid = gate[Math.floor(gate.length / 2)] ?? { tx: arena.x + Math.floor(arena.w / 2), ty: arena.y + arena.h - 1 };
      const entranceSpot: ArenaSpot = {
        ax: Math.max(0, Math.min(arena.w - 1, mid.tx - arena.x)),
        ay: Math.max(0, Math.min(arena.h - 1, mid.ty - arena.y)),
      };
      const sprite = scene.add.sprite(x, y, art.spriteKey, 0).setOrigin(0.5, 1).setDepth(y).setTint(0xc9b0ff).setScale(1.15).setVisible(false);
      const shadow = addShadow(scene, x, y - 2, 66).setVisible(false);
      const blockers: Phaser.GameObjects.Rectangle[] = [];
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = 0; dx < 3; dx++) {
          const b = addBlockerBody(scene, this.host.blockersGroup, g.tx + dx, g.ty + dy);
          (b.body as Phaser.Physics.Arcade.StaticBody).enable = false;
          blockers.push(b);
        }
      }
      const glow = scene.add.image(x, y - 45, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(art.glowBase).setScale(2.8).setAlpha(0).setDepth(890_001).setVisible(false);
      const eyeGlow = scene.add.image(x, y - 61, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(art.eyeTint).setScale(1.6).setAlpha(0).setDepth(890_002).setVisible(false);
      this.rigs.reverb = { sprite, shadow, glow, eyeGlow, blockers, arena, homeSpot, entranceSpot, sealGate: wr.sealGate, altarPos: { x: 0, y: 0 }, broken: false, art };
    }
  }

  /** a Warden's summoning-altar dressing position ((0,0) when that court is absent) */
  altarPosOf(id: WardenId): { x: number; y: number } {
    return this.rigs[id]?.altarPos ?? { x: 0, y: 0 };
  }

  // ------------------------------------------------------------ the fight

  /** the ACTIVE fight's kit (ADR-0017): fight.warden picks it; the Guardian by default */
  private fightKit(): WardenKit {
    return kitOf(this.fight?.warden);
  }

  /** the active fight's display name, or null for the Guardian (rung 0) */
  private fightWardenName(fight: FightState | null): string | null {
    return fight?.warden ? t.warden.name(fight.warden) : null;
  }

  /**
   * The render bundle (sprite + glow + arena anatomy + palette) of the Warden the
   * active fight belongs to — selected by `activeWarden` (set on summon, held
   * through endFight so the wreck/reset lands on the right boss). Defaults to the
   * Guardian. Every fight-render/adjudication site reads through this so a second
   * Warden fights in its OWN court with its OWN look, no per-site branching.
   */
  activeBoss(): BossRig {
    const rig = this.activeWarden ? this.rigs[this.activeWarden as WardenId] : undefined;
    return rig ?? this.rigs.guardian!;
  }

  /** mark the active fight's boss slain/whole (its own wreck flag) */
  private setBossBroken(v: boolean): void {
    this.activeBoss().broken = v;
  }

  /** the Reverberant is summon-only: show/hide its pre-built sprite + blockers */
  private setReverbVisible(v: boolean): void {
    const rig = this.rigs.reverb;
    if (!rig) return;
    rig.sprite.setVisible(v);
    rig.shadow.setVisible(v);
    rig.glow.setVisible(v);
    rig.eyeGlow.setVisible(v);
    for (const b of rig.blockers) (b.body as Phaser.Physics.Arcade.StaticBody).enable = v;
    if (v) {
      // rises from the court floor — a quick scale/alpha pop
      rig.sprite.setAlpha(0).setScale(0.8);
      this.ctx.scene.tweens.add({ targets: rig.sprite, alpha: 1, scaleX: 1.15, scaleY: 1.15, duration: 520, ease: 'Back.Out' });
    }
  }

  /**
   * A summon (or a mid-fight join). A DORMANT Guardian (`engagedAt === null`)
   * roams harmlessly — the arena open, no Ward, no danger schedule — until the
   * first strike engages it. An already-engaged fight (mid-join) goes straight
   * to the live schedule (Ward already up), derived from `engagedAt`.
   */
  startFight(fight: FightState, fresh: boolean): void {
    this.exhaustedThisFight = false;
    this.activeWarden = fight.warden ?? null; // pick the boss BEFORE restore/place
    if (fight.warden === 'reverb') {
      // a re-summon may race a prior kill's post-victory hide — cancel it so the
      // newly-risen boss is never hidden/un-collided out from under an active fight
      this.reverbHideTimer?.remove();
      this.reverbHideTimer = undefined;
      this.setReverbVisible(true); // the Reverberant rises
    }
    this.restoreGuardianWhole(); // a summon rekindles the runes: rebuild any slain wreck
    if (fight.engagedAt === null) {
      this.fight = fight;
      this.renderedWave = -1;
      this.landedWave = -1;
      this.slammedWave = -1;
      this.eyeOpenShown = false;
      this.furyIndex = -1;
      const b = this.activeBoss();
      b.glow.setTint(b.art.glowBase);
      b.sprite.anims.play(b.art.idle);
      this.placeGuardian(b.homeSpot, 0);
      this.positionGuardianBlockers(b.homeSpot);
      this.setGuardianBlockersEnabled(true);
      for (const r of this.dangerRects) r.destroy();
      this.dangerRects = [];
      for (const r of this.meleeRingRects) r.destroy();
      this.meleeRingRects = [];
      if (fresh) this.ctx.sfx('roar', 0.4); // a low stir, not the full engage roar
      this.ctx.bus.emit('fight-start', { hp: 0, maxHp: 0, engagedAt: null, awakeMs: GUARDIAN_AWAKE_MS, roster: [], title: this.fightWardenName(fight) });
    } else {
      this.beginEngaged(fight, false);
    }
  }

  /** the first strike landed (broadcast): re-anchor to `engagedAt`, slam the Ward */
  private engageFight(fight: FightState): void {
    this.beginEngaged(fight, true);
  }

  /**
   * Bring the fight into its engaged, dangerous state: reset the wave trackers
   * against `engagedAt`, tint the fury glow, raise the Ward, and start the
   * music. `dramatic` = the live first-strike (roar + Ward-slam FX); otherwise a
   * quiet mid-fight join with the Ward already standing.
   */
  private beginEngaged(fight: FightState, dramatic: boolean): void {
    this.fight = fight;
    this.activeWarden = fight.warden ?? null;
    const kit = this.fightKit();
    const b = this.activeBoss();
    const engagedAt = fight.engagedAt ?? Date.now();
    this.renderedWave = -1;
    this.landedWave = -1;
    this.eyeOpenShown = false;
    const w = waveInfoAt(Date.now() - engagedAt, GUARDIAN_AWAKE_MS, kit);
    this.slammedWave = w.msIntoWave >= w.phase.telegraphMs ? w.index : w.index - 1;
    this.furyIndex = furyPhaseAt(Date.now() - engagedAt, GUARDIAN_AWAKE_MS, kit).index;
    b.glow.setTint(b.art.fury[this.furyIndex]);
    b.sprite.anims.play(b.art.idle);
    // The Ward is SLAMMED shut by the engage-leap, not raised on contact. For a
    // live first-strike (dramatic) that is still winding up wave 0, defer it to
    // the moment the leap crashes on the entrance (see slamWave); a quiet
    // mid-fight join finds the Ward already standing, so raise it at once.
    const preSlam = w.index === 0 && w.msIntoWave < w.phase.telegraphMs;
    if (dramatic && preSlam) {
      this.wardPending = true;
    } else {
      this.wardPending = false;
      this.raiseWard(dramatic);
    }
    if (dramatic) {
      this.ctx.sfx('roar', 0.7);
      this.ctx.scene.cameras.main.shake(700, 0.01);
    }
    if (!this.fightMusic && this.ctx.scene.cache.audio.exists('guardian_drums')) {
      this.fightMusic = this.ctx.scene.sound.add('guardian_drums', {
        loop: true,
        volume: FIGHT_MUSIC_BASE_VOLUME * this.atmosphere.volumes.music * this.atmosphere.volumes.master,
      });
    }
    this.fightMusic?.play();
    this.ctx.bus.emit('fight-start', { hp: fight.hp, maxHp: fight.maxHp, engagedAt, awakeMs: GUARDIAN_AWAKE_MS, roster: fight.roster, title: this.fightWardenName(fight) });
  }

  /**
   * Raise the Ward across the arena entrance (the sealGate tiles). It reuses the
   * Seal's barrier art but is a distinct, per-fight barrier: it blocks outsiders
   * and Exhausted fighters and drops at victory/slumber. Permeability is
   * per-Player — the roster-and-not-Exhausted pass through (see below).
   */
  private raiseWard(dramatic: boolean): void {
    this.dropWard();
    const scene = this.ctx.scene;
    const b = this.activeBoss();
    for (const g of b.sealGate) {
      const x = (g.tx + 0.5) * TILE;
      const y = (g.ty + 1) * TILE;
      const sprite = scene.add.image(x, y, 'seal-barrier').setOrigin(0.5, 1).setDepth(y).setAlpha(0.9);
      sprite.setTint(b.art.ward); // the boss's Ward cast (Guardian amber / Mire teal), not the violet Seal
      if (dramatic) {
        sprite.setScale(1, 0);
        scene.tweens.add({ targets: sprite, scaleY: 1, duration: 220, ease: 'back.out' });
      }
      const body = addBlockerBody(scene, this.host.blockersGroup, g.tx, g.ty);
      this.wardParts.push({ sprite, body });
    }
    this.updateWardPermeability();
    if (dramatic) {
      this.ctx.sfx('chop', 0.6);
      scene.cameras.main.shake(300, 0.006);
    }
  }

  /** drop the Ward (victory or slumber) — the arena opens again */
  private dropWard(): void {
    for (const part of this.wardParts) {
      part.sprite.destroy();
      part.body.destroy();
    }
    this.wardParts = [];
  }

  /**
   * Per-Player permeability: the local Player passes the Ward only while a
   * roster member AND not Exhausted; outsiders and the Exhausted are blocked.
   * The Mock has one real Player, so toggling this body's collision enforces the
   * rule; a SupabaseBackend would resolve it per-Player.
   */
  private updateWardPermeability(): void {
    const mayPass = !!this.fight && this.fight.roster.includes(this.ctx.me.name) && !this.exhaustedThisFight;
    for (const part of this.wardParts) {
      (part.body.body as Phaser.Physics.Arcade.StaticBody).enable = !mayPass;
    }
  }

  private endFight(kind: 'victory' | 'slumber'): void {
    if (!this.fight) return;
    const wardenName = this.fightWardenName(this.fight);
    this.fight = null;
    this.exhaustedThisFight = false;
    this.wardPending = false;
    this.dropWard(); // the Ward falls — the arena opens again
    for (const r of this.dangerRects) r.destroy();
    this.dangerRects = [];
    for (const r of this.meleeRingRects) r.destroy();
    this.meleeRingRects = [];
    this.renderedWave = -1;
    this.furyIndex = -1;
    // collision settles back onto its resting place either way (the boss the
    // fight belonged to — activeWarden is still set until the very end here)
    const b = this.activeBoss();
    this.placeGuardian(b.homeSpot, 0);
    this.positionGuardianBlockers(b.homeSpot);
    this.setGuardianBlockersEnabled(true);
    b.eyeGlow.setAlpha(0);
    this.fightMusic?.stop();
    this.ctx.bus.emit('fight-end');
    if (kind === 'victory') {
      // slain: it doesn't just close its eyes — it BREAKS. Death throes now, then
      // a darkened wreck left on its resting place until it is summoned anew and
      // rebuilt (startFight → restoreGuardianWhole). See shatterGuardian.
      this.ctx.sfx('seal_gong', 0.6);
      this.ctx.scene.cameras.main.shake(500, 0.006);
      floatText(this.ctx.scene, b.sprite.x, b.sprite.y - 100, wardenName ? t.fight.wardenBestedFloat(wardenName) : t.fight.bestedFloat, '#ffd166');
      this.ctx.bus.emit('toast', wardenName ? t.toast.wardenBested(wardenName) : t.toast.guardianBested, 'good');
      this.shatterGuardian();
    } else {
      // unbeaten: it simply re-slumbers, whole, ready to be roused again
      this.restoreGuardianWhole();
      b.sprite.anims.stop();
      b.sprite.setFrame(0);
      this.ctx.sfx('roar', 0.35);
      this.ctx.bus.emit('toast', wardenName ? t.toast.wardenUnbeaten(wardenName) : t.toast.guardianUnbeaten, 'bad');
    }
    // the Reverberant is summon-only: it leaves NO lingering wreck in the walkable
    // puzzle court — hide it (after the death-throes on victory, at once on slumber)
    if (this.activeWarden === 'reverb') {
      this.reverbHideTimer?.remove(); // never stack two pending hides
      const hide = () => {
        this.reverbHideTimer = undefined;
        this.setReverbVisible(false);
        const rig = this.rigs.reverb;
        if (rig) rig.broken = false;
      };
      if (kind === 'victory') this.reverbHideTimer = this.ctx.scene.time.delayedCall(1400, hide);
      else hide();
      // re-arm the summon latch so a fresh solve raises it again (the one-fight
      // mutex still gates re-summon; without this the ?echotest ever-covers path
      // would stay 'solved' forever and the latch could never re-arm)
      this.reverbSummonBusy = false;
    }
    this.activeWarden = null; // the fight's visuals are resolved — back to dormant selection
  }

  /**
   * The slain Guardian's death throes: a blown-out flash and a heavy topple, a
   * burst of stone shards and dust, the runic glow snuffed out — leaving a
   * darkened, broken wreck on its resting place until it is summoned anew
   * (restoreGuardianWhole). Purely client-side spectacle; the fight is resolved.
   */
  private shatterGuardian(): void {
    this.setBossBroken(true);
    const scene = this.ctx.scene;
    const b = this.activeBoss();
    const spr = b.sprite;
    const cx = spr.x;
    const feetY = spr.y; // origin is bottom-centre — this is its base
    spr.anims.stop();
    spr.setFrame(7); // the crash pose, caught mid-collapse
    spr.setTintFill(0xffffff); // blown-out flash...
    scene.time.delayedCall(90, () => spr.setTint(0x4a4650)); // ...settling to dead grey stone
    scene.tweens.add({ targets: spr, angle: -24, duration: 640, ease: 'Bounce.out' }); // heavy topple on its base
    // the runes gutter out: implode + snuff the glow. Its night-smoulder is
    // driven every frame by the glows pool from `base`, so zero that too.
    const ge = this.atmosphere.glows.find((g) => g.img === b.glow);
    if (ge) ge.base = 0;
    scene.tweens.add({
      targets: b.glow,
      scale: 0.3,
      duration: 320,
      ease: 'Quad.in',
      onComplete: () => b.glow.setVisible(false),
    });
    b.eyeGlow.setAlpha(0);
    // stone shards flung outward
    const bodyY = feetY - 34;
    for (let i = 0; i < 16; i++) {
      const ang = (Math.PI * 2 * i) / 16 + (i % 3) * 0.4;
      const dist = 30 + (i % 5) * 13;
      const sz = 3 + (i % 4) * 2;
      const shard = scene.add
        .rectangle(cx + Math.cos(ang) * 6, bodyY, sz, sz, i % 3 === 0 ? 0x6f5da0 : 0x50515e)
        .setDepth(feetY + 40);
      scene.tweens.add({
        targets: shard,
        x: cx + Math.cos(ang) * dist,
        y: bodyY + Math.sin(ang) * dist * 0.5 + 30,
        angle: 140 + i * 22,
        alpha: 0,
        duration: 520 + i * 18,
        ease: 'Quad.out',
        onComplete: () => shard.destroy(),
      });
    }
    // dust kicked up at the base
    for (let i = 0; i < 5; i++) {
      const puff = scene.add.ellipse(cx + (i - 2) * 15, feetY - 6, 20, 11, 0x241f30, 0.5).setDepth(feetY + 30);
      scene.tweens.add({
        targets: puff,
        scaleX: 2.6,
        scaleY: 2.1,
        alpha: 0,
        y: feetY - 18,
        duration: 720 + i * 70,
        ease: 'Quad.out',
        onComplete: () => puff.destroy(),
      });
    }
    this.ctx.sfx('chop', 0.5);
  }

  /** rebuild the slain wreck into the whole, slumbering Guardian (summon / re-slumber) */
  private restoreGuardianWhole(): void {
    this.setBossBroken(false);
    const b = this.activeBoss();
    b.sprite.setAngle(0);
    b.sprite.clearTint();
    b.glow.setVisible(true).setTint(b.art.glowBase).setScale(2.6);
    const ge = this.atmosphere.glows.find((g) => g.img === b.glow);
    if (ge) ge.base = 0.5;
  }

  /** world position of an arena spot (the active boss's feet on its bottom row) */
  private placeGuardian(spot: ArenaSpot, lift: number): void {
    const bv = this.activeBoss();
    const a = bv.arena;
    const x = (a.x + spot.ax + 0.5) * TILE;
    const groundY = (a.y + spot.ay + 2) * TILE;
    bv.sprite.setPosition(x, groundY - lift);
    bv.sprite.setDepth(groundY);
    bv.shadow.setPosition(x, groundY - 2);
    bv.shadow.setAlpha(lift > 0 ? 0.5 : 1);
    bv.glow.setPosition(x, groundY - lift - 45);
    bv.eyeGlow.setPosition(x, groundY - lift - 61);
  }

  /** center the active boss's 3x3 collision on an arena spot (bodies row-major) */
  private positionGuardianBlockers(spot: ArenaSpot): void {
    const bv = this.activeBoss();
    const a = bv.arena;
    const cx = (a.x + spot.ax + 0.5) * TILE;
    const cy = (a.y + spot.ay + 0.5) * TILE;
    let i = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const b = bv.blockers[i++];
        if (!b) continue;
        b.setPosition(cx + dx * TILE, cy + dy * TILE);
        (b.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
      }
    }
  }

  private setGuardianBlockersEnabled(on: boolean): void {
    for (const b of this.activeBoss().blockers) (b.body as Phaser.Physics.Arcade.StaticBody).enable = on;
  }

  /** render the telegraphs of one wave: slam tiles, or a lunge landing marker */
  private renderWave(w: WaveInfo): void {
    for (const r of this.dangerRects) r.destroy();
    this.dangerRects = [];
    const kit = this.fightKit();
    const bv = this.activeBoss();
    const a = bv.arena;
    const mark = (ax: number, ay: number, color: number, alpha: number) => {
      const rect = this.ctx.scene.add.rectangle((a.x + ax + 0.5) * TILE, (a.y + ay + 0.5) * TILE, TILE - 2, TILE - 2, color, alpha);
      rect.setDepth(3);
      this.dangerRects.push(rect);
    };
    if (w.index === 0) {
      // wave 0 (ADR-0004): the engage-leap crashes on the entrance (the Ward
      // slam), so the doorway — not the authored slam tiles — is the danger
      const e = bv.entranceSpot;
      for (let dy = -kit.lungeZone; dy <= kit.lungeZone; dy++) {
        for (let dx = -kit.lungeZone; dx <= kit.lungeZone; dx++) mark(e.ax + dx, e.ay + dy, bv.art.lunge, 0.3);
      }
    } else if (w.kind === 'lunge') {
      // the landing marker glows on the pre-determined spot before impact
      const tgt = lungeTarget(w.lungeCount + 1, kit);
      for (let dy = -kit.lungeZone; dy <= kit.lungeZone; dy++) {
        for (let dx = -kit.lungeZone; dx <= kit.lungeZone; dx++) mark(tgt.ax + dx, tgt.ay + dy, bv.art.lunge, 0.3);
      }
    } else {
      const tiles = waveTiles(w.index, w.phase.density, kit);
      for (let ay = 0; ay < kit.arenaH; ay++) {
        for (let ax = 0; ax < kit.arenaW; ax++) {
          if (tiles[ay * kit.arenaW + ax]) mark(ax, ay, bv.art.danger, 0.22);
        }
      }
    }
  }

  /** the slam/landing moment: flash, shake, and adjudicate the local Player */
  private slamWave(w: WaveInfo): void {
    this.slammedWave = w.index;
    if (w.index === 0 && this.wardPending) {
      // the engage-leap has crashed on the entrance — the Ward slams shut NOW,
      // in lockstep with the Guardian landing (not raised early on first contact)
      this.wardPending = false;
      this.raiseWard(true);
    }
    const lunge = w.kind === 'lunge';
    const bv = this.activeBoss();
    for (const r of this.dangerRects) r.setFillStyle(lunge ? bv.art.lunge : bv.art.slam, 0.55);
    this.ctx.sfx('chop', lunge ? 0.6 : 0.35);
    this.ctx.scene.cameras.main.shake(lunge ? 350 : 180, lunge ? 0.008 : 0.004);
    if (Date.now() < this.stunnedUntil) return; // already down — no double count
    const kit = this.fightKit();
    const player = this.ctx.player;
    const ptx = Math.floor(player.x / TILE);
    const pty = Math.floor((player.y - 4) / TILE);
    const ax = ptx - bv.arena.x;
    const ay = pty - bv.arena.y;
    if (ax < 0 || ay < 0 || ax >= kit.arenaW || ay >= kit.arenaH) return;
    if (w.index === 0) {
      // wave 0's danger is the entrance (the Ward slam), not the slam tiles
      const e = bv.entranceSpot;
      if (Math.abs(ax - e.ax) > kit.lungeZone || Math.abs(ay - e.ay) > kit.lungeZone) return;
    } else if (lunge) {
      const tgt = lungeTarget(w.lungeCount + 1, kit);
      if (Math.abs(ax - tgt.ax) > kit.lungeZone || Math.abs(ay - tgt.ay) > kit.lungeZone) return;
    } else if (!waveTiles(w.index, w.phase.density, kit)[ay * kit.arenaW + ax]) {
      return;
    }
    // caught! stun locally, let the server adjudicate against ITS clock
    this.beginKnockdown();
    void this.ctx.backend.reportKnockdown(ptx, pty).then((res) => this.resolveKnockdown(res));
  }

  /** local knockdown FX: freeze, stun-marker, and the 5 s stun clock */
  beginKnockdown(): void {
    this.stunnedUntil = Date.now() + KNOCKDOWN_STUN_MS;
    this.ctx.player.setVelocity(0, 0);
    this.stunMarker?.destroy();
    this.stunMarker = this.ctx.scene.add
      .text(this.ctx.player.x, this.ctx.player.y - AVATAR_H - 6, '💫', { fontSize: '10px' })
      .setOrigin(0.5)
      .setResolution(4)
      .setDepth(999_999);
  }

  /** apply the server's knockdown verdict (shared by slam tiles and the melee ring) */
  private resolveKnockdown(res: KnockdownResult): void {
    if (!res.ok) {
      if (res.reason === 'NOT_IN_DANGER') this.stunnedUntil = 0; // the server disagrees — get up
      return;
    }
    if (res.exhausted) {
      // HARD Exhaustion (ADR-0004): out for this fight — the Ward now bars
      // re-entry (permeability recomputes to "blocked"), though prior hits
      // keep loot eligibility. Wake at the Village Hall/spawn, pack intact.
      this.exhaustedThisFight = true;
      this.updateWardPermeability();
      this.ctx.bus.emit(
        'toast',
        res.atVillage
          ? t.toast.exhaustionVillage
          : t.toast.exhaustionSpawn,
        'bad',
      );
      this.ctx.scene.cameras.main.fadeOut(400, 0, 0, 0);
      this.ctx.scene.time.delayedCall(450, () => {
        this.ctx.player.setPosition((res.wake.tx + 0.5) * TILE, (res.wake.ty + 0.5) * TILE);
        this.stunnedUntil = 0;
        this.ctx.scene.cameras.main.fadeIn(500, 0, 0, 0);
      });
    } else {
      this.ctx.bus.emit('toast', t.toast.knockedDown(res.knockdowns), 'bad');
    }
  }

  /**
   * The authored melee danger-ring (ADR-0006 §7): while it is hot (the wind-up
   * slice of a stationary slam wave) it glows around the Guardian's footprint
   * and shoves — a knockback off the body, but NO stun — any melee attacker
   * camping inside it. The push is the whole tax: it interrupts camping without
   * the 5 s knockdown (nor an Exhaustion count). A Bow user at range stays clear.
   * Pure schedule + position; the Guardian never reacts.
   */
  private updateMeleeRing(elapsed: number, wave: WaveInfo, time: number): void {
    const kit = this.fightKit();
    const ring = meleeRingWindow(wave, kit);
    const hot = ring !== null && elapsed >= ring.openMs && elapsed < ring.closeMs;
    if (!hot) {
      if (this.meleeRingRects.length) {
        for (const r of this.meleeRingRects) r.destroy();
        this.meleeRingRects = [];
      }
      return;
    }
    const bv = this.activeBoss();
    const a = bv.arena;
    const centre = guardianSpotAt(wave.lungeCount, bv.homeSpot, kit);
    if (!this.meleeRingRects.length) {
      for (let dy = -kit.meleeRingMax; dy <= kit.meleeRingMax; dy++) {
        for (let dx = -kit.meleeRingMax; dx <= kit.meleeRingMax; dx++) {
          const ax = centre.ax + dx;
          const ay = centre.ay + dy;
          if (ax < 0 || ay < 0 || ax >= kit.arenaW || ay >= kit.arenaH) continue;
          if (!inMeleeRing(ax, ay, centre, kit)) continue;
          const rect = this.ctx.scene.add.rectangle((a.x + ax + 0.5) * TILE, (a.y + ay + 0.5) * TILE, TILE - 3, TILE - 3, bv.art.ring, 0.26);
          rect.setDepth(3);
          this.meleeRingRects.push(rect);
        }
      }
    }
    const pulse = 0.2 + 0.12 * Math.sin(time / 55);
    for (const r of this.meleeRingRects) r.setFillStyle(bv.art.ring, pulse);
    // the Player standing in the hot ring gets shoved off the body — no stun,
    // no knockdown report. Gate on a short cooldown so the tween can't restack
    // while it plays; still frozen out if a slam tile has them stunned.
    if (Date.now() < this.stunnedUntil || Date.now() < this.meleeRingShoveUntil) return;
    const player = this.ctx.player;
    const ptx = Math.floor(player.x / TILE);
    const pty = Math.floor((player.y - 4) / TILE);
    if (!inMeleeRing(ptx - a.x, pty - a.y, centre, kit)) return;
    // knockback juice: shove the Player off the body, away from the ring centre
    const cx = (a.x + centre.ax + 0.5) * TILE;
    const cy = (a.y + centre.ay + 0.5) * TILE;
    const ang = Phaser.Math.Angle.Between(cx, cy, player.x, player.y);
    this.meleeRingShoveUntil = Date.now() + 260;
    this.ctx.sfx('chop', 0.4);
    this.ctx.scene.cameras.main.shake(160, 0.004);
    this.ctx.scene.tweens.add({
      targets: player,
      x: player.x + Math.cos(ang) * TILE * 2.2,
      y: player.y + Math.sin(ang) * TILE * 2.2,
      duration: 220,
      ease: 'quad.out',
    });
  }

  // ------------------------------------------------------------ E-chain entries

  guardianAction(): EAction | null {
    // the colossus is 96px tall on a 3x3 footprint — aim at its lower body (the
    // ACTIVE fight's boss, so a Warden fight strikes its own sprite/arena)
    const spr = this.activeBoss().sprite;
    const player = this.ctx.player;
    const d = Phaser.Math.Distance.Between(
      player.x,
      player.y - 4,
      spr.x,
      spr.y - TILE * 1.5,
    );
    // the Bow reaches ~8 tiles; melee needs to close to arm's length
    const bow = this.host.isBow();
    const range = bow ? TILE * 8 : INTERACT_RANGE + TILE * 2;
    if (d > range) return null;
    if (!this.fight) {
      if (this.seal.seal?.broken) {
        return {
          swing: false,
          run: () => this.ctx.bus.emit('toast', t.toast.guardianSlumbersLay, 'info'),
        };
      }
      return null; // sealed away — nothing to interact with yet
    }
    // each weapon carries its own COMBAT attack speed (ADR-0006 §4); harvesting
    // is untouched — resolveEAction only sets cadenceMs on Guardian swings
    if (bow) return { swing: true, cadenceMs: this.host.atkCadence(weaponCombat(this.host.heldTool()).attackMs), run: () => this.projectile.fireBow() };
    return { swing: true, cadenceMs: this.host.atkCadence(weaponCombat(this.host.heldTool()).attackMs), run: () => this.swingAtGuardian() };
  }

  private swingAtGuardian(): void {
    const spr = this.activeBoss().sprite;
    this.fireGuardianHit(this.host.heldTool(), spr.x, spr.y - 60);
  }

  /**
   * Land one hit on the Guardian with the in-hand Tool. Predicts the Eye Window
   * locally from the same schedule the server adjudicates with — outside a
   * window the strike bounces off so the rule teaches itself. Shared by melee
   * swings and the Bow's arrow.
   */
  fireGuardianHit(tool: ToolId | undefined, x: number, y: number): void {
    // dormant (engagedAt null): this strike IS the engage — always lands. Once
    // engaged, predict the Eye Window from the same schedule the server uses
    // (the ACTIVE fight's kit — ADR-0017).
    const engagedAt = this.fight?.engagedAt ?? null;
    const eyeOpen = engagedAt === null ? !!this.fight : eyeOpenAt(Date.now() - engagedAt, GUARDIAN_AWAKE_MS, this.fightKit());
    if (eyeOpen) {
      this.ctx.sfx('chop', 0.5);
      this.ctx.scene.tweens.add({ targets: this.activeBoss().sprite, scaleX: 1.04, scaleY: 0.97, duration: 70, yoyo: true });
    } else {
      this.ctx.sfx('blip', 0.35);
      floatText(this.ctx.scene, x + Phaser.Math.Between(-10, 10), y, t.fight.clang, '#9aa0a8');
    }
    void this.ctx.backend.hitGuardian(tool).then((res) => {
      if (!res.ok) return;
      this.ctx.setInventory(res.inventory);
      if (res.deflected) return;
      // float the DAMAGE DEALT (cosmetically scaled), NOT remaining HP — the HP
      // bar owns the pool. A crit pops bigger and gold (ADR-0006 §1).
      const shown = res.damage * GUARDIAN_DISPLAY_SCALE;
      const hitSpr = this.activeBoss().sprite;
      const fx = hitSpr.x + Phaser.Math.Between(-8, 8);
      const fy = hitSpr.y - 100;
      if (res.crit) floatText(this.ctx.scene, fx, fy, `${shown}!`, '#ffd166', 15);
      else floatText(this.ctx.scene, fx, fy, `${shown}`, '#ff8866', 10);
    });
  }

  /**
   * E at a Warden's altar in its Realm (ADR-0017): the real authored altar. Near
   * it, the whole Offering → summon arc runs through the generic
   * wardenAltarAction(id) — no dev flag. Formerly three copy-paste methods
   * (mire/echo/verdant) — now one rig-keyed proximity check.
   */
  wardenCourtAltarAction(id: 'mire' | 'echo' | 'verdant'): EAction | null {
    if (!this.ctx.world.wardenArenas?.[id]) return null;
    const pos = this.altarPosOf(id);
    const player = this.ctx.player;
    const d = Phaser.Math.Distance.Between(player.x, player.y - 4, pos.x, pos.y - 8);
    if (d > INTERACT_RANGE + 8) return null;
    return this.wardenAltarAction(id);
  }

  summonAction(): EAction | null {
    const player = this.ctx.player;
    const altarPos = this.altarPosOf('guardian');
    const d = Phaser.Math.Distance.Between(player.x, player.y - 4, altarPos.x, altarPos.y - 8);
    if (d > INTERACT_RANGE + 8) return null;
    if (this.fight) {
      return { swing: false, run: () => this.ctx.bus.emit('toast', t.toast.guardianAlreadyAwake, 'info') };
    }
    if ((this.ctx.inventory.summon_totem ?? 0) <= 0) {
      return { swing: false, run: () => this.ctx.bus.emit('toast', t.toast.altarAwaitsTotem, 'info') };
    }
    return {
      swing: false,
      run: () => {
        void this.ctx.backend.summonGuardian().then((res) => {
          if (res.ok) {
            this.ctx.setInventory(res.inventory);
          } else if (res.reason === 'FIGHT_IN_PROGRESS') {
            this.ctx.bus.emit('toast', t.toast.fightAlreadyRaging, 'bad');
          } else if (res.reason === 'NO_TOTEM') {
            this.ctx.bus.emit('toast', t.toast.needTotem, 'bad');
          } else if (res.reason === 'SEAL_INTACT') {
            this.ctx.bus.emit('toast', t.toast.sealStillHolds, 'bad');
          }
        });
      },
    };
  }

  /**
   * E at a Warden altar (ADR-0017): while its Offering is incomplete, lay the
   * carried demanded goods (the Seal-monument shape — one press pours in what
   * qualifies); once broken, a carried Warden Totem summons. The one-fight
   * mutex refusal comes back from the backend either way.
   */
  private wardenAltarAction(id: string): EAction {
    const def = WARDENS[id];
    // float text pops at THIS Warden's altar (the Mire's real altar, not the
    // Guardian's) — every Warden's rig carries its own altar position
    const altarPos = this.rigs[id as WardenId]?.altarPos ?? this.altarPosOf('guardian');
    if (this.fight) {
      return { swing: false, run: () => this.ctx.bus.emit('toast', t.toast.fightAlreadyRaging, 'info') };
    }
    if (!this.wardens[id]?.altar.broken) {
      return {
        swing: false,
        run: () => {
          void this.ctx.backend.contributeWardenAltar(id).then((res) => {
            if (res.ok) {
              this.ctx.setInventory(res.inventory);
              const text = Object.entries(res.taken)
                .map(([item, n]) => `-${n} ${ITEMS[item as ItemId]?.name ?? item}`)
                .join('  ');
              floatText(this.ctx.scene, altarPos.x, altarPos.y - 20, text, '#63e0b8');
              this.ctx.bus.emit('toast', t.toast.wardenAltarLaid, 'good');
              this.ctx.sfx('place', 0.6);
            } else if (res.reason === 'NOTHING_TO_GIVE') {
              const needs = Object.entries(this.wardens[id]?.altar.quotas ?? {})
                .map(([item, q]) => `${q} ${ITEMS[item as ItemId]?.name ?? item}`)
                .join(' · ');
              this.ctx.bus.emit('toast', t.toast.wardenAltarNeeds(needs), 'bad');
            }
          });
        },
      };
    }
    if ((this.ctx.inventory[def.totem] ?? 0) <= 0) {
      return { swing: false, run: () => this.ctx.bus.emit('toast', t.toast.wardenAwaitsTotem(ITEMS[def.totem].name), 'info') };
    }
    return {
      swing: false,
      run: () => {
        void this.ctx.backend.summonWarden(id).then((res) => {
          if (res.ok) {
            this.ctx.setInventory(res.inventory);
          } else if (res.reason === 'FIGHT_IN_PROGRESS') {
            this.ctx.bus.emit('toast', t.toast.fightAlreadyRaging, 'bad');
          } else if (res.reason === 'NO_TOTEM') {
            this.ctx.bus.emit('toast', t.toast.wardenAwaitsTotem(ITEMS[def.totem].name), 'bad');
          }
        });
      },
    };
  }

  // ------------------------------------------------------------ per-frame

  /**
   * §8 step 9 — the fight block: the danger schedule derives from engagedAt
   * (the first strike). A DORMANT Guardian (engagedAt null) roams harmlessly
   * at home: no waves, no Eye, arena open — nothing to drive here.
   */
  update(time: number, _delta: number): void {
    if (!(this.fight && this.fight.engagedAt !== null)) return;
    const kit = this.fightKit();
    const bv = this.activeBoss();
    const elapsed = Date.now() - this.fight.engagedAt;
    if (elapsed >= GUARDIAN_AWAKE_MS) {
      // every client derives the timer's end locally; the backend event follows
      this.endFight('slumber');
    } else {
      // fury phases at fixed elapsed-time thresholds — every client hits
      // the same transition at the same schedule position
      const phase = furyPhaseAt(elapsed, GUARDIAN_AWAKE_MS, kit);
      if (phase.index !== this.furyIndex) {
        this.furyIndex = phase.index;
        bv.glow.setTint(bv.art.fury[phase.index]);
        this.ctx.sfx('roar', 0.8);
        this.ctx.scene.cameras.main.shake(600, 0.008);
        this.ctx.bus.emit('toast', phase.index === 1 ? t.fight.furyRestless : t.fight.furyFury, 'bad');
      }
      // the Reverberant is kept OUT of the dormant glow pool (no idle pulse
      // before it is summoned), so nothing lights its body glow — drive it HERE
      // for the fight so its smoulder + fury-colour tint read like the others
      if (this.activeWarden === 'reverb') bv.glow.setAlpha(0.5 + 0.12 * Math.sin(time / 90));
      const wave = waveInfoAt(elapsed, GUARDIAN_AWAKE_MS, kit);
      if (wave.index !== this.renderedWave) {
        this.renderedWave = wave.index;
        this.renderWave(wave);
      }
      if (wave.msIntoWave < wave.phase.telegraphMs) {
        // telegraph pulse rises toward the slam / crash
        const pulse = 0.14 + (wave.msIntoWave / wave.phase.telegraphMs) * 0.22 + 0.06 * Math.sin(time / 60);
        const color = wave.kind === 'lunge' ? bv.art.lunge : bv.art.danger;
        for (const r of this.dangerRects) r.setFillStyle(color, pulse);
      } else if (this.slammedWave !== wave.index) {
        this.slamWave(wave);
      }
      // the authored melee danger-ring (hot during the wind-up of slam waves)
      this.updateMeleeRing(elapsed, wave, time);

      // scripted position: wave 0 leaps to the entrance (Ward slam), later
      // waves telegraph lunges to pre-determined spots
      const pose = guardianPoseAt(elapsed, GUARDIAN_AWAKE_MS, bv.homeSpot, bv.entranceSpot, kit);
      // collision follows the boss's ground footprint; while airborne it has
      // none, so the whole arena (incl. the tiles it just left) opens up
      if (pose.airborne) this.setGuardianBlockersEnabled(false);
      else {
        this.positionGuardianBlockers(pose.spot);
        this.setGuardianBlockersEnabled(true);
      }
      bv.eyeGlow.setAlpha(0);
      if (pose.airborne && pose.target) {
        const a = bv.arena;
        const fx = (a.x + pose.spot.ax + 0.5) * TILE;
        const fy = (a.y + pose.spot.ay + 2) * TILE;
        const tx2 = (a.x + pose.target.ax + 0.5) * TILE;
        const ty2 = (a.y + pose.target.ay + 2) * TILE;
        const tt = pose.leapT;
        const arc = Math.sin(tt * Math.PI) * 56;
        bv.sprite.anims.stop();
        bv.sprite.setFrame(6);
        const gx = fx + (tx2 - fx) * tt;
        const gy = fy + (ty2 - fy) * tt;
        bv.sprite.setPosition(gx, gy - arc);
        bv.sprite.setDepth(gy);
        bv.shadow.setPosition(gx, gy - 2).setAlpha(0.45);
        bv.glow.setPosition(gx, gy - arc - 45);
        bv.eyeGlow.setPosition(gx, gy - arc - 61);
      } else {
        this.placeGuardian(pose.spot, 0);
        if (pose.windup) {
          bv.sprite.anims.stop();
          bv.sprite.setFrame(5);
        } else if (wave.kind === 'lunge' && wave.msIntoWave >= wave.phase.telegraphMs && this.landedWave !== wave.index) {
          // the crash-down moment
          this.landedWave = wave.index;
          bv.sprite.anims.stop();
          bv.sprite.setFrame(7);
        } else if (this.landedWave === wave.index && wave.msIntoWave < wave.phase.telegraphMs + 500) {
          // hold the landing pose for a beat
        } else {
          // Eye Window: the amber eye opens right after each slam
          const eyeOpen = eyeOpenAt(elapsed, GUARDIAN_AWAKE_MS, kit);
          if (eyeOpen !== this.eyeOpenShown) {
            this.eyeOpenShown = eyeOpen;
            if (eyeOpen) this.ctx.sfx('blip', 0.5);
          }
          const want = eyeOpen ? bv.art.eye : bv.art.idle;
          if (bv.sprite.anims.currentAnim?.key !== want || !bv.sprite.anims.isPlaying) {
            bv.sprite.anims.play(want, true);
          }
          bv.eyeGlow.setAlpha(eyeOpen ? 0.5 + 0.18 * Math.sin(time / 70) : 0);
        }
      }
    }
  }

  /** §8 step 10 — stun-marker upkeep; returns whether the Player is knocked down */
  updateStunMarker(): boolean {
    const stunned = Date.now() < this.stunnedUntil;
    if (!stunned && this.stunMarker) {
      this.stunMarker.destroy();
      this.stunMarker = null;
    }
    if (this.stunMarker) this.stunMarker.setPosition(this.ctx.player.x, this.ctx.player.y - AVATAR_H - 6);
    return stunned;
  }
}
