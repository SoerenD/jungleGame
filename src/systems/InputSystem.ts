/**
 * InputSystem (ADR-0018 #2): key/pointer wiring (WASD/arrows, E, ESC/ENTER, X,
 * the LMB alt-fire hold, wheel zoom), the chat-focus keyboard gate, and the
 * ONE ordered E-priority chain (resolveEAction — order is gameplay: first
 * match wins; never distributed across systems). update() is §8 steps 13–19:
 * halt, movement (via PlayerSystem), position broadcast, placement ghost,
 * X-dismantle, place-mode keys and the E/LMB cadence-gated dispatch.
 */
import Phaser from 'phaser';
import { BRINE_KILN, CHIME_KILN, DEV_REFINER_TEST, SWING_CADENCE_MS, TEST_REFINER, VERDANT_LOOM } from '../config';
import { ITEMS } from '../content/items';
import type { GameScene } from '../scenes/GameScene';
import { t } from '../i18n';
import type { BuildSystem } from './BuildSystem';
import type { GameContext } from './context';
import type { DelveSystem } from './DelveSystem';
import type { DistrictSystem } from './DistrictSystem';
import type { EchoSystem } from './EchoSystem';
import type { FightSystem } from './FightSystem';
import type { FishingSystem } from './FishingSystem';
import type { FogSystem } from './FogSystem';
import type { HarvestSystem } from './HarvestSystem';
import type { PlayerSystem } from './PlayerSystem';
import type { PresenceSystem } from './PresenceSystem';
import type { ProgressionSystem } from './ProgressionSystem';
import type { ProjectileSystem } from './ProjectileSystem';
import type { SealSystem } from './SealSystem';
import type { StationsSystem } from './StationsSystem';
import type { EAction, GameSystem } from './types';
import type { VillageSystem } from './VillageSystem';
import type { WildlifeSystem } from './WildlifeSystem';

export class InputSystem implements GameSystem {
  keys!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    e: Phaser.Input.Keyboard.Key;
    enter: Phaser.Input.Keyboard.Key;
    esc: Phaser.Input.Keyboard.Key;
    dismantle: Phaser.Input.Keyboard.Key;
  };
  /** whether the alt-fire mouse button (LMB) is currently held over the canvas (B1) */
  lmbDown = false;
  chatFocused = false;
  /** cross-system refs, wired by GameScene (ADR-0018 §3) — the E-chain fan-out */
  player!: PlayerSystem;
  presence!: PresenceSystem;
  build!: BuildSystem;
  fishing!: FishingSystem;
  delve!: DelveSystem;
  wildlife!: WildlifeSystem;
  harvest!: HarvestSystem;
  projectile!: ProjectileSystem;
  progression!: ProgressionSystem;
  district!: DistrictSystem;
  seal!: SealSystem;
  fight!: FightSystem;
  stations!: StationsSystem;
  village!: VillageSystem;
  echo!: EchoSystem;
  fog!: FogSystem;
  private onSendChat = (text: string): void => {
    void this.ctx.backend.sendChat(text);
  };
  private onChatFocus = (): void => {
    this.chatFocused = true;
    this.ctx.player.setVelocity(0, 0);
    this.ctx.scene.input.keyboard!.enabled = false;
    this.ctx.scene.input.keyboard!.resetKeys();
  };
  private onChatBlur = (): void => {
    this.chatFocused = false;
    this.ctx.scene.input.keyboard!.enabled = true;
  };

  constructor(
    private ctx: GameContext,
    private host: GameScene,
  ) {}

  create(): void {
    const scene = this.ctx.scene;
    const cam = scene.cameras.main;
    scene.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      // Whole-number zoom only. The gutterless tileset bleeds thin dark seams
      // between tiles at every fractional zoom (nearest-neighbour sampling
      // straddles tile edges); integer zoom maps each texel to exactly N pixels
      // so edges never straddle. Step in whole levels rather than *1.15.
      cam.setZoom(Phaser.Math.Clamp(Math.round(cam.zoom) + (dy > 0 ? -1 : 1), 2, 5));
      // name tags are counter-scaled by zoom to stay readable — re-apply now
      this.fog.applyWorldLabelScale();
    });
    // B1: the left mouse button is alternative fire for the held-E swing loop
    // (harvest + combat) — held-to-repeat at weapon cadence. These fire only for
    // pointers over the Phaser canvas, so a click on the DOM HUD/craft panel is
    // never a swing; the swing gate in update() further restricts it to
    // `swing: true` actions (one-shot interactions stay E-only).
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.leftButtonDown()) this.lmbDown = true;
    });
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!p.leftButtonDown()) this.lmbDown = false;
    });
    // releasing outside the canvas, or losing the pointer, must also drop the hold
    scene.input.on('pointerupoutside', () => (this.lmbDown = false));
    scene.input.on('gameout', () => (this.lmbDown = false));

    const kb = scene.input.keyboard!;
    this.keys = {
      up: kb.addKey('UP'),
      down: kb.addKey('DOWN'),
      left: kb.addKey('LEFT'),
      right: kb.addKey('RIGHT'),
      w: kb.addKey('W'),
      a: kb.addKey('A'),
      s: kb.addKey('S'),
      d: kb.addKey('D'),
      e: kb.addKey('E'),
      enter: kb.addKey('ENTER'),
      esc: kb.addKey('ESC'),
      dismantle: kb.addKey('X'),
    };

    this.ctx.bus.on('send-chat', this.onSendChat);
    this.ctx.bus.on('chat-focus', this.onChatFocus);
    this.ctx.bus.on('chat-blur', this.onChatBlur);
  }

  destroy(): void {
    this.ctx.bus.off('send-chat', this.onSendChat);
    this.ctx.bus.off('chat-focus', this.onChatFocus);
    this.ctx.bus.off('chat-blur', this.onChatBlur);
  }

  /**
   * The E priority chain, resolved WITHOUT side effects so held-E can check
   * the action type before firing (a held E near a tablet must not reopen it).
   * ONE ordered chain — order is gameplay: first match wins (plan §3).
   */
  resolveEAction(): EAction | null {
    const px = this.ctx.player.x;
    const py = this.ctx.player.y - 4;

    // inside the Delve, E means "attack a Husk" or "leave" — never a World action
    if (this.host.inDelve) return this.delve.delveEAction(px, py);
    // the sealed mine shaft (clear it with an Ancient Pickaxe) / open shaft (enter)
    const delve = this.delve.delveEntranceAction(px, py);
    if (delve) return delve;
    // a Realm gate (ADR-0017): step through, or learn that it is dormant
    const realm = this.district.realmGateAction(px, py);
    if (realm) return realm;

    // special interactables take priority over nodes
    const stone = this.progression.welcomeStoneAction(px, py);
    if (stone) return stone;
    const tablet = this.progression.tabletAction(px, py);
    if (tablet) return tablet;
    const special = this.seal.contributeSealAction() ?? this.fight.summonAction() ?? this.fight.wardenCourtAltarAction('mire') ?? this.fight.wardenCourtAltarAction('echo') ?? this.fight.wardenCourtAltarAction('verdant') ?? this.fight.guardianAction();
    if (special) return special;
    const grove = this.progression.groveAltarAction(px, py);
    if (grove) return grove;
    const dig = this.progression.digAction(px, py);
    if (dig) return dig;

    const cook = this.fishing.cookAction();
    if (cook) return cook;

    // the Village Hall: E opens the contribution panel — per-resource sliders let
    // the Player choose how much of each qualifying Resource/loot to give (ADR-0010)
    const hall = this.build.nearbyStructure(['village_hall']);
    if (hall) return { swing: false, run: () => this.village.openVillageContribute() };

    // ADR-0013 building functions: the Victory Arch recalls you home; the Stone
    // Keep rings the muster bell to call everyone to the Village.
    const arch = this.build.nearbyStructure(['victory_arch']);
    if (arch) return { swing: false, run: () => this.village.recallHome() };
    const keep = this.build.nearbyStructure(['stone_keep']);
    if (keep) return { swing: false, run: () => this.village.ringBell() };
    const market = this.build.nearbyStructure(['market_square']);
    if (market) return { swing: false, run: () => this.village.openTradePost() };
    const banner = this.build.nearbyStructure(['village_banner']);
    if (banner) return { swing: false, run: () => this.ctx.bus.emit('village-name-open', { name: this.village.village.name ?? '', crest: this.village.village.crest ?? 0 }) };
    const well = this.build.nearbyStructure(['village_well']);
    if (well) return { swing: false, run: () => this.village.openChronicle() };
    const fountain = this.build.nearbyStructure(['fountain']);
    if (fountain) return { swing: false, run: () => this.village.openFountain() };
    const flowerBed = this.build.nearbyStructure(['flower_bed']);
    if (flowerBed) return { swing: false, run: () => this.village.tendFlowers() };
    // ADR-0015: the Grand Monument — until now the one interaction-less Building —
    // is the Depth Record stone: E opens the engraved record board
    const monument = this.build.nearbyStructure(['grand_monument']);
    if (monument) return { swing: false, run: () => this.delve.openRecordBoard() };
    // the Forge: E opens the craft menu on the Tools & Weapons tab, where the
    // heavy forged gear is now craftable (this station is what unlocks it)
    const forge = this.build.nearbyStructure(['forge']);
    if (forge) return { swing: false, run: () => this.ctx.bus.emit('open-forge') };

    // ADR-0017 rung 1: the Brine Kiln — E opens the generic Refiner panel with
    // the salt-reed → tideglass config (the kernel is untouched; data + art only)
    const kiln = this.build.nearbyStructure(['brine_kiln']);
    if (kiln) return { swing: false, run: () => this.stations.openRefiner(kiln.id, BRINE_KILN, ITEMS.brine_kiln.name) };
    // ADR-0017 rung 2: the Chime Kiln — the same generic Refiner, echo crystal → hushsteel
    const chime = this.build.nearbyStructure(['chime_kiln']);
    if (chime) return { swing: false, run: () => this.stations.openRefiner(chime.id, CHIME_KILN, ITEMS.chime_kiln.name) };
    // ADR-0017 rung 3: the Verdant Loom — the same generic Refiner, wildgrain → verdant fibre
    const loom = this.build.nearbyStructure(['verdant_loom']);
    if (loom) return { swing: false, run: () => this.stations.openRefiner(loom.id, VERDANT_LOOM, ITEMS.verdant_loom.name) };
    // ADR-0017 rung 2: the Echoes — arm a recording at a pedestal / claim an open vault
    const echoE = this.echo.echoAction();
    if (echoE) return echoE;

    // functional Structures: crate storage, the Sawmill, signposts
    const st = this.build.nearbyStructure(['crate', 'sawmill', 'signpost']);
    if (st) {
      if (st.type === 'crate') return { swing: false, run: () => this.stations.openCrate(st.id) };
      // ?refinertest (dev-only, ADR-0017 §6): the Sawmill tile doubles as the
      // generic test Refiner so the kernel is exercisable end-to-end before any
      // player-facing Refiner Structure ships — the live Sawmill path is untouched
      // without the flag
      if (st.type === 'sawmill') {
        if (DEV_REFINER_TEST) return { swing: false, run: () => this.stations.openRefiner(st.id, TEST_REFINER, t.refiner.testName) };
        return { swing: false, run: () => this.stations.openSawmill(st.id) };
      }
      return {
        swing: false,
        run: () => {
          this.ctx.bus.emit('lore', `🪧 ${st.placedBy} wrote:`, st.text?.trim() ? st.text : '(nothing is written here)');
          this.ctx.sfx('blip', 0.4);
        },
      };
    }

    // ADR-0012: forage a peaceful creature / hunt a predator in reach, before
    // harvesting a Node that might be standing behind it
    const wild = this.wildlife.wildlifeAction();
    if (wild) return wild;

    // the nearest live Resource Node in reach (fishing cast / gates / swing) —
    // HarvestSystem.nodeAction; nothing in reach falls through to the Bow
    const nodeAct = this.harvest.nodeAction(px, py);
    if (nodeAct) return nodeAct;
    // nothing else in reach: a held Bow still shoots toward the cursor (the
    // trailing fallback — every verb above keeps its priority)
    return this.projectile.bowFallbackAction();
  }

  /** §8 steps 13–19: halt → movement → broadcast → ghost → X → ESC/ENTER → E/LMB */
  update(time: number, delta: number, stunned = false): void {
    if (this.chatFocused || stunned) {
      this.player.halt(stunned);
      return;
    }

    const moving = this.player.move();

    // throttled position broadcast (§8 step 15) — PresenceSystem
    this.presence.throttledSend(time, moving);

    // placement ghost (§8 step 16) — BuildSystem.update
    this.build.update(time, delta);

    // X dismantles the nearest Structure (never while placing/fishing/in the Delve)
    if (!this.build.placing && !this.fishing.active && !this.host.inDelve && Phaser.Input.Keyboard.JustDown(this.keys.dismantle)) {
      this.build.dismantleFacing();
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.esc) && this.build.placing) {
      this.build.exitPlaceMode();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.enter) && this.build.placing) {
      this.build.confirmPlace();
    }
    // E: one-shots fire once per press; harvesting and Guardian swings
    // auto-repeat while held, and taps are capped at the same cadence
    // (mashing is never faster than holding)
    const ePressed = Phaser.Input.Keyboard.JustDown(this.keys.e);
    // B1: LMB (held over the canvas, not while typing) is alternative fire, but
    // ONLY for swing:true actions — one-shot interactions stay E-only below
    const lmbActive = this.lmbDown && !this.chatFocused;
    if (this.build.placing) {
      if (ePressed) this.build.confirmPlace();
    } else if (this.fishing.active) {
      if (ePressed) this.fishing.reelIn();
    } else if (ePressed || this.keys.e.isDown || lmbActive) {
      const now = Date.now();
      // resolve at the base cadence; a per-action cadence (the Bow's slower
      // fire) then further gates the swing so bow < melee DPS
      const minReady = now - this.player.lastSwingAt >= SWING_CADENCE_MS;
      if (ePressed || minReady) {
        const action = this.resolveEAction();
        if (action?.swing) {
          const cadence = action.cadenceMs ?? SWING_CADENCE_MS;
          if (now - this.player.lastSwingAt >= cadence) {
            this.player.markSwing(now); // stamp + peer echo counter + pose/arc, fused
            action.run();
          }
        } else if (action && ePressed) {
          // one-shot interactions (crate, read, offer, enter Delve) fire once per
          // E press only — never from the alt-fire mouse button (B1)
          action.run();
        }
      }
    }
  }
}
