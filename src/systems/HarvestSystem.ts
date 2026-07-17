/**
 * HarvestSystem (ADR-0018 #3): Resource Nodes — render views + collision,
 * lazy regrowth visuals, wildgrain growth stages (ADR-0017 rung 3), the J3
 * harvest impact kit (chips, punch, pips), hover tooltips, the tide/
 * cultivation/pack-cap harvest gates, and the node entry of the E-chain.
 * Owns the nodeChanged backend listener and the 600 ms regrow/wildgrain tick.
 */
import Phaser from 'phaser';
import type { NodeState } from '../backend/types';
import { CULTIVATION_PERIOD_MS, CULTIVATION_SLACK_MS, INTERACT_RANGE, TIDE_EXPOSURE_SLACK_MS, TIDE_PERIOD_MS, TILE } from '../config';
import { msToNextRipe, wildgrainRipeWithin, wildgrainStage, type WildgrainStage } from '../content/cultivation';
import { ITEMS, type ItemId, type StructureId } from '../content/items';
import { NODE_TYPES, type NodeTypeId } from '../content/nodeTypes';
import { tideExposedWithin } from '../content/tide';
import { canAcceptItem, inventoryCapacity } from '../content/village';
import type { GameScene } from '../scenes/GameScene';
import { t } from '../i18n';
import type { GameContext } from './context';
import type { FishingSystem } from './FishingSystem';
import type { FogSystem } from './FogSystem';
import type { ProgressionSystem } from './ProgressionSystem';
import { addBlockerBody, addShadow, floatText, objImage, setObjTexture } from './sceneFx';
import type { EAction, GameSystem, NodeView } from './types';
import type { VillageSystem } from './VillageSystem';

/**
 * ADR-0017 rung 3: a wildgrain bed's clock-derived growth stage → a multiplicative
 * tint over the golden ripe sprite, so ripeness reads across the field at a glance.
 * The bed art is drawn RIPE-golden (tools/compose-wildgrain.ts), so `ripe` passes it
 * through untinted; the growing stages push it green then dim brown.
 */
const WILDGRAIN_STAGE_TINT: Record<WildgrainStage, number> = {
  bare: 0x6b5a3a, // dim, barely-sprouted soil brown
  sprout: 0x7f9a52, // young olive-green
  green: 0xa8c46a, // lush unripe green
  ripe: 0xffffff, // full sunlit gold as drawn — reads harvestable
};

/** deterministic per-id variance so the forest looks grown, not stamped */
export function idHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * J3 harvest impact kit — the most-repeated verb in the game (hold-E on a
 * Resource Node) finally answers back: per-hit debris chips tinted by node
 * type, a ~40ms squash punch on the sprite, and quiet damage pips while a
 * node sits below max HP. Pure client presentation over the shared 'poof'
 * texture (BootScene) — no new textures, no emitters, and no standing
 * per-node display objects (there are 3,854 node sprites; everything here
 * exists only at the point of impact and is reaped by a TTL sweep or its own
 * fade). Adjudication, yields, cadence and the wire are untouched.
 */
const CHIP_COUNT_HIT = 5; // chips per landed swing
const CHIP_COUNT_FINISH = 9; // the finishing hit pays a slightly larger burst
/**
 * Debris tints per Node type — muted, matching the mature palette: bark brown
 * with a leaf fleck for wood, granite greys for stone, leaf green with a fruit
 * fleck for the bush, pale dry fiber, water droplets for a Fishing Spot, and
 * the tier-2 pair in dense heartwood dark / volcanic-glass violet.
 */
export const CHIP_TINTS: Record<NodeTypeId, number[]> = {
  tree: [0x7a5a34, 0x5d4426, 0x4f7a3a],
  rock: [0x9aa0a6, 0x6e747a, 0xb9bec2],
  fruit_bush: [0x4f7a3a, 0x6f9c46, 0xc75b52],
  fiber_vine: [0xd9cf9e, 0xb5ab7c, 0x8ba75f],
  hardwood_tree: [0x4a3826, 0x6b5232, 0x8c7444],
  obsidian_rock: [0x2e2838, 0x554a6a, 0x8f84b8],
  fishing_spot: [0x66b8e0, 0x9ad4ee, 0x3f86b8],
  salt_reed_bed: [0xb3a76e, 0x8f855a, 0xd8dcd2],
  echo_crystal_seam: [0x93a8c9, 0x5a6b85, 0xd6e4f5],
  wildgrain_bed: [0xd8a83e, 0xb5882e, 0x86a048],
};
/** damage pips: 2px cells above a damaged node — shown only while it was hit
 *  recently, then faded out (the mob HP bar's idea, smaller and quieter) */
const NODE_PIP_SIZE = 2; // px — pixel-scale cells, no cartoon bar
const NODE_PIP_GAP = 1;
const NODE_PIP_HOLD_MS = 1500; // readable-at-a-glance window after the last hit
const NODE_PIP_FADE_MS = 250;
const NODE_PIP_FILL = 0xcfd6a8; // pale reed — far quieter than the mobs' bright green bar
const NODE_PIP_LOST = 0x4a4a40; // spent pips go dark, keeping max HP readable
const NODE_PUNCH_MS = 40; // squash punch per leg: rest → ~1.06 wide → rest (yoyo)
/** sprite-data key holding a node's in-flight punch tween (kill-restart, like SWING_TWEEN_KEY) */
const NODE_PUNCH_KEY = 'nodePunchTween';

/**
 * A node sprite's rest scale, re-derived instead of stored: trees plant at
 * 0.9 + (idHash % 40)/100, everything else at 1. The SINGLE source of truth —
 * addNode() plants with it, the regrow tween settles back to it, and the punch
 * tween kill-restarts against it, so the three can never drift apart.
 * Re-deriving (not storing) keeps the hot path free of any per-node
 * DataManager/field allocation across all 3,854 sprites.
 */
function nodeRestScale(state: NodeState): number {
  return state.type === 'tree' ? 0.9 + (idHash(state.id) % 40) / 100 : 1;
}

export class HarvestSystem implements GameSystem {
  nodes = new Map<string, NodeView>();
  nodesByTile = new Map<string, string>();
  /**
   * J3: the damage-pip displays live ONLY here — created lazily on the first
   * damage shown for a node, destroyed by their own fade (or hideNodePips), so
   * steady state carries zero pip objects. Keyed by node id; at most a
   * screenful of entries exists even under heavy group harvesting.
   */
  private nodePips = new Map<string, { gfx: Phaser.GameObjects.Graphics; tween: Phaser.Tweens.Tween | null }>();
  /** throttle for the "pack full" harvest toast (ADR-0013) */
  private packFullToastAt = 0;
  /** item kinds held on the quick-slots — "equipped", so they don't consume pack
   *  capacity (kept in sync by the HUD via the 'loadout-kinds' bus event) */
  private hotbarKinds = new Set<ItemId>();
  /** throttle for the tide-submerged reed refusal toast (ADR-0017 rung 1) */
  private tideToastAt = 0;
  /** throttle for the unripe-wildgrain harvest refusal toast (ADR-0017 rung 3) */
  private cultivationToastAt = 0;
  /** cross-system refs, wired by GameScene (ADR-0018 §3) */
  fog!: FogSystem;
  village!: VillageSystem;
  fishing!: FishingSystem;
  progression!: ProgressionSystem;
  private regrowTimer: Phaser.Time.TimerEvent | null = null;
  private onNodeChanged = (n: NodeState): void => this.updateNode(n);

  constructor(
    private ctx: GameContext,
    private host: GameScene,
  ) {}

  create(): void {
    this.ctx.backend.on('nodeChanged', this.onNodeChanged);
    this.ctx.bus.on('loadout-kinds', this.onLoadoutKinds);
    // lazy regrowth + wildgrain-stage visuals — timestamp-derived, no game tick
    this.regrowTimer = this.ctx.scene.time.addEvent({
      delay: 600,
      loop: true,
      callback: () => {
        this.checkRegrowthVisuals();
        this.refreshWildgrainStages();
      },
    });
  }

  update(_time?: number, _dt?: number): void {}

  destroy(): void {
    this.ctx.backend.off('nodeChanged', this.onNodeChanged);
    this.ctx.bus.off('loadout-kinds', this.onLoadoutKinds);
    this.regrowTimer?.remove();
    this.regrowTimer = null;
  }

  /** the HUD reports which kinds sit on the quick-slots; they're exempt from the
   *  pack-cap check (quick-bar items are "equipped", not carried) */
  private onLoadoutKinds = (ids: ItemId[]): void => {
    this.hotbarKinds = new Set(ids);
  };

  // ------------------------------------------------------------ nodes

  nodeAlive(n: NodeState): boolean {
    if (n.hp > 0) return true;
    const nt = NODE_TYPES[n.type];
    return n.harvestedAt !== null && Date.now() >= n.harvestedAt + nt.regrowMs;
  }

  /** show the Resource Node's name in a small tooltip while the cursor hovers it */
  private makeNodeHoverable(sprite: Phaser.GameObjects.Image, type: NodeState['type']): void {
    sprite.setInteractive();
    sprite.on('pointerover', () => {
      // World Nodes stay interactive under the Delve overlay (only their physics
      // colliders are disabled on entry); without this guard their hover label
      // would surface over the Dungeon. No label while we're below.
      if (this.host.inDelve) return;
      if (!this.host.nodeHoverLabel) {
        // same visual size as the remote-player name tags (fontSize 7, res 6)
        // so hover text reads consistently across the World; the base scale is
        // multiplied by the player's Name-label-size setting
        this.host.nodeHoverLabel = this.ctx.scene.add
          .text(0, 0, '', {
            fontSize: '7px',
            color: '#e8f5e9',
            stroke: '#000000',
            strokeThickness: 2,
            backgroundColor: 'rgba(10, 20, 8, 0.82)',
            padding: { x: 4, y: 2 },
          })
          .setOrigin(0.5, 1)
          .setResolution(6)
          .setScale(this.fog.labelScale())
          .setDepth(999_995);
      }
      this.host.nodeHoverLabel
        .setText(NODE_TYPES[type].name)
        .setPosition(sprite.x, sprite.y - sprite.displayHeight - 2)
        .setVisible(true);
    });
    sprite.on('pointerout', () => this.host.nodeHoverLabel?.setVisible(false));
  }

  addNode(state: NodeState): void {
    const scene = this.ctx.scene;
    const x = (state.tx + 0.5) * TILE;
    const y = (state.ty + 1) * TILE;
    const alive = state.hp > 0;
    const sprite = objImage(scene, x, y, alive ? state.type : `${state.type}_depleted`);
    if (!sprite) return;
    this.makeNodeHoverable(sprite, state.type);
    const h = idHash(state.id);
    if (state.type === 'tree') {
      sprite.setScale(nodeRestScale(state));
      sprite.setFlipX(h % 2 === 0);
      addShadow(scene, x, y - 1, 26 * sprite.scaleX);
    } else if (state.type === 'fruit_bush') {
      sprite.setFlipX(h % 2 === 0);
      addShadow(scene, x, y - 1, 22);
    } else if (state.type === 'rock') {
      addShadow(scene, x, y - 2, 16);
    } else if (state.type === 'wildgrain_bed' && alive) {
      // ADR-0017 rung 3: tint the fresh bed to its current growth stage so ripeness
      // reads immediately on load (the 600ms refresh keeps it current thereafter)
      sprite.setTint(WILDGRAIN_STAGE_TINT[wildgrainStage(Date.now(), idHash(state.id), CULTIVATION_PERIOD_MS)]);
    }
    let body: Phaser.GameObjects.Rectangle | null = null;
    if (NODE_TYPES[state.type].blocks) {
      body = addBlockerBody(scene, this.host.blockersGroup, state.tx, state.ty);
      body.setData('nodeId', state.id);
      (body.body as Phaser.Physics.Arcade.StaticBody).enable = alive;
    }
    this.nodes.set(state.id, { state, sprite, body, depletedShown: !alive });
    this.nodesByTile.set(`${state.tx},${state.ty}`, state.id);
  }

  private updateNode(state: NodeState): void {
    const view = this.nodes.get(state.id);
    if (!view) return;
    // J3: hp changes land HERE and only here (my own hit via the backend's
    // nodeChanged relay, a friend's hit via the shared event, regrowth via
    // checkRegrowthVisuals) — so the pip display hooks this exact spot and can
    // never show a value the authoritative state doesn't hold.
    const prevHp = view.state.hp;
    view.state = state;
    const alive = state.hp > 0;
    if (alive === view.depletedShown) {
      // state flipped relative to what we show
      view.depletedShown = !alive;
      setObjTexture(this.ctx.scene, view.sprite, alive ? state.type : `${state.type}_depleted`);
      if (view.body) (view.body.body as Phaser.Physics.Arcade.StaticBody).enable = alive;
      // J3: the finishing hit is the payoff beat — a slightly larger debris
      // burst rides the depletion squash below. Fired only on the flip (not on
      // repeated depleted events) and only when actually visible: nodeChanged
      // arrives for EVERY node on the map, and off-screen (or under the Delve
      // overlay) a burst would be nothing but invisible tween churn.
      if (!alive && this.nodeFxVisible(view)) this.nodeChipBurst(view, true);
    }
    if (!alive) {
      // J3: a punch tween still mid-flight would hand the squash below a
      // drifting start scale — settle the sprite at rest before the payoff
      this.settleNodePunch(view);
      this.hideNodePips(state.id); // depletion is the payoff beat; pips leave with it
      // depleting hit lands: little poof of scale
      this.ctx.scene.tweens.add({ targets: view.sprite, scaleX: 1.15, scaleY: 0.9, duration: 80, yoyo: true });
    } else if (state.hp < prevHp) {
      // a landed hit left the node damaged — surface the authoritative hp
      this.showNodePips(view);
    } else if (state.hp > prevHp) {
      this.hideNodePips(state.id); // regrown/refreshed — stale pips must not survive
    }
  }

  private checkRegrowthVisuals(): void {
    const now = Date.now();
    for (const view of this.nodes.values()) {
      if (!view.depletedShown || view.state.harvestedAt === null) continue;
      const nt = NODE_TYPES[view.state.type];
      if (now >= view.state.harvestedAt + nt.regrowMs) {
        view.depletedShown = false;
        view.state = { ...view.state, hp: nt.maxHp, harvestedAt: null };
        this.hideNodePips(view.state.id); // J3: back at max — no pips may linger
        setObjTexture(this.ctx.scene, view.sprite, view.state.type);
        if (view.body) (view.body.body as Phaser.Physics.Arcade.StaticBody).enable = true;
        // settle back to the sprite's PLANTED scale (trees vary by idHash) — a
        // regrown tree left at flat 1.0 would visibly snap on its next punch
        const rest = nodeRestScale(view.state);
        this.ctx.scene.tweens.add({ targets: view.sprite, scaleX: { from: rest * 0.6, to: rest }, scaleY: { from: rest * 0.6, to: rest }, duration: 250 });
      }
    }
  }

  /**
   * ADR-0017 rung 3: retint every wildgrain bed by its clock-derived growth stage
   * (bare → sprout → green → ripe golden) so ripeness sweeps the field as a spatial
   * gradient. A pure f(clock, idHash) — every client reads the identical stage. The
   * tint is reapplied each tick so it survives the depleted↔alive texture swaps; a
   * depleted (harvested) bed shows its own stubble sprite untinted.
   */
  private refreshWildgrainStages(): void {
    const now = Date.now();
    for (const view of this.nodes.values()) {
      if (view.state.type !== 'wildgrain_bed') continue;
      if (view.depletedShown) {
        view.sprite.clearTint();
        continue;
      }
      view.sprite.setTint(WILDGRAIN_STAGE_TINT[wildgrainStage(now, idHash(view.state.id), CULTIVATION_PERIOD_MS)]);
    }
  }

  // ------------------------------------------------- J3: harvest impact kit

  /**
   * Should node impact FX (chips, pips) render right now? nodeChanged events
   * arrive for the WHOLE map — a friend harvesting three Zones away must not
   * spawn invisible tweens here — and the Delve overlay (depth 900k+) hides
   * the World entirely, so anything fired beneath it would be pure churn.
   * Cheap: one rectangle-contains against the camera's live worldView.
   */
  private nodeFxVisible(view: NodeView): boolean {
    return !this.host.inDelve && this.ctx.scene.cameras.main.worldView.contains(view.sprite.x, view.sprite.y - TILE / 2);
  }

  /** chip debris off a node, tinted by its type, at roughly swing height */
  private nodeChipBurst(view: NodeView, big: boolean): void {
    const s = view.sprite;
    this.burstChips(s.x, s.y - s.displayHeight * 0.4, s.depth + 2, CHIP_TINTS[view.state.type], big);
  }

  /**
   * A short-lived burst of 2-3px debris chips — J4's death-puff pattern
   * (tweened images off the shared 4px 'poof' texture, tinted per burst)
   * tightened into impact debris: constant pixel size (0.5/0.75 of the 4px
   * texture = whole 2/3px — no fractional-scaling shimmer), a flat outward
   * scatter with a slight lift, and a hard TTL sweep so nothing strays. Never
   * allocates a texture or an emitter — chips exist only at the impact point.
   */
  burstChips(x: number, y: number, depth: number, tints: number[], big: boolean): void {
    const scene = this.ctx.scene;
    const n = big ? CHIP_COUNT_FINISH : CHIP_COUNT_HIT;
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n + (i % 2) * 0.7;
      const dist = (big ? 12 : 8) + (i % 3) * 4;
      const chip = scene.add
        .image(x + Math.cos(ang) * 2, y + Math.sin(ang), 'poof')
        .setTint(tints[i % tints.length])
        .setScale(i % 2 ? 0.5 : 0.75) // 2px / 3px off the 4px texture — whole pixels
        .setDepth(depth);
      scene.tweens.add({
        targets: chip,
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist * 0.5 - (big ? 6 : 4), // flattened scatter, slight lift
        alpha: 0,
        duration: 250 + (i % 4) * 40,
        ease: 'Quad.out',
        // each chip has exactly ONE tween, so its onComplete is the reap — no
        // TTL constant to hand-sync against tween durations, nothing to leak
        // if a duration is ever retuned. Scene teardown destroys chip and
        // tween alike, so there is no orphan window.
        onComplete: () => chip.destroy(),
      });
    }
  }

  /**
   * The ~40ms hit punch: a squash (wider, slightly shorter) layered on the
   * existing ±3° wobble — different properties (scale vs angle), so the two
   * tweens compose freely. Kill-restart discipline like playSwingFx: a held-E
   * cadence re-punches before the last settled, so the old tween dies and the
   * sprite snaps back to its exact rest scale first (re-derived, never read
   * mid-tween — see nodeRestScale) to rule out cumulative drift.
   */
  private punchNode(view: NodeView): void {
    const s = view.sprite;
    this.settleNodePunch(view);
    const rest = nodeRestScale(view.state);
    const tween = this.ctx.scene.tweens.add({
      targets: s,
      scaleX: rest * 1.06,
      scaleY: rest * 0.96,
      duration: NODE_PUNCH_MS,
      yoyo: true,
      ease: 'Quad.out',
      onComplete: () => {
        s.setScale(rest);
        s.setData(NODE_PUNCH_KEY, null);
      },
    });
    s.setData(NODE_PUNCH_KEY, tween);
  }

  /** kill an in-flight punch and restore rest scale (no-op when none is running) */
  private settleNodePunch(view: NodeView): void {
    // Phaser's getData lazily ALLOCATES a DataManager on first touch, and this
    // runs for every map-wide depletion event — most on sprites only remote
    // Players ever hit, which can never hold a punch (punchNode is local-only).
    // A punch implies punchNode's setData already built the manager, so a
    // data-less sprite provably has no punch: bail before allocating.
    if (!view.sprite.data) return;
    const prev = view.sprite.getData(NODE_PUNCH_KEY) as Phaser.Tweens.Tween | null | undefined;
    if (!prev) return;
    prev.remove();
    view.sprite.setScale(nodeRestScale(view.state));
    view.sprite.setData(NODE_PUNCH_KEY, null);
  }

  /**
   * Damage pips over a partially-damaged node: one 2px cell per max HP, lit
   * for remaining hp — the mob HP bar's job in a quieter voice (no bright
   * green, no outline; a whisper of UI fitting the restrained art direction).
   * Draws from view.state.hp, which updateNode has just set from the
   * authoritative event, so pips can never show a stale value. The display is
   * created lazily, redrawn (kill-restart on its fade) while hits keep
   * landing, and destroys ITSELF after hold+fade — steady state holds zero
   * pip objects, satisfying the no-standing-overhead constraint.
   */
  private showNodePips(view: NodeView): void {
    const st = view.state;
    const max = NODE_TYPES[st.type].maxHp;
    if (st.hp <= 0 || st.hp >= max) {
      this.hideNodePips(st.id);
      return;
    }
    if (!this.nodeFxVisible(view)) return;
    let pip = this.nodePips.get(st.id);
    if (!pip) {
      pip = { gfx: this.ctx.scene.add.graphics(), tween: null };
      this.nodePips.set(st.id, pip);
    }
    const g = pip.gfx;
    const w = max * (NODE_PIP_SIZE + NODE_PIP_GAP) - NODE_PIP_GAP;
    // integer world position keeps the 2px cells on whole pixels at integer zoom
    g.setPosition(Math.round(view.sprite.x - w / 2), Math.round(view.sprite.y - view.sprite.displayHeight) - 6);
    g.setDepth(view.sprite.depth + 2);
    g.setAlpha(1);
    g.clear();
    g.fillStyle(0x000000, 0.35); // faint backing so pips read on bright foliage
    g.fillRect(-1, -1, w + 2, NODE_PIP_SIZE + 2);
    for (let i = 0; i < max; i++) {
      g.fillStyle(i < st.hp ? NODE_PIP_FILL : NODE_PIP_LOST, 1);
      g.fillRect(i * (NODE_PIP_SIZE + NODE_PIP_GAP), 0, NODE_PIP_SIZE, NODE_PIP_SIZE);
    }
    // hold, then fade and self-destruct; another hit inside the window simply
    // kill-restarts the countdown (the ~1.5s window measures from the LAST hit)
    pip.tween?.remove();
    pip.tween = this.ctx.scene.tweens.add({
      targets: g,
      alpha: 0,
      delay: NODE_PIP_HOLD_MS,
      duration: NODE_PIP_FADE_MS,
      onComplete: () => {
        g.destroy();
        this.nodePips.delete(st.id);
      },
    });
  }

  /** drop a node's pip display immediately (depletion payoff, regrowth) */
  private hideNodePips(nodeId: string): void {
    const pip = this.nodePips.get(nodeId);
    if (!pip) return;
    pip.tween?.remove();
    pip.gfx.destroy();
    this.nodePips.delete(nodeId);
  }

  // ------------------------------------------------------------ harvest gates + the E-chain entry

  /**
   * The node entry of the E-chain: the nearest live Resource Node in reach —
   * a fishing-spot cast, a tide/cultivation/pack-cap refusal, or the swing.
   * Returns null when no node is in reach (the caller falls through to the
   * trailing Bow fallback).
   */
  nodeAction(px: number, py: number): EAction | null {
    let best: NodeView | null = null;
    let bestDist = INTERACT_RANGE;
    for (const view of this.nodes.values()) {
      if (view.depletedShown) continue;
      const d = Phaser.Math.Distance.Between(px, py, view.sprite.x, view.sprite.y - TILE / 2);
      if (d < bestDist) {
        bestDist = d;
        best = view;
      }
    }
    if (!best) return null;
    const view = best;
    // fishing spots use the cast-and-wait rhythm when the rod is IN HAND;
    // without it the server refusal (TOOL_REQUIRED) falls through below
    if (view.state.type === 'fishing_spot' && this.ctx.held.item === 'fishing_rod') {
      return { swing: false, run: () => this.fishing.startFishing(view) };
    }
    // ADR-0017 rung 1: the Tide gates the salt-reed banks — a reed is harvestable
    // only while the ebb exposes it (validated within ±slack of the clock, the
    // eyeOpenWithin idiom). A submerged reed refuses the swing (swing:false, like
    // the pack cap) so it never mimes a chop to friends.
    if (this.reedSubmerged(view)) {
      return { swing: false, run: () => this.tideSubmergedToast() };
    }
    // ADR-0017 rung 3: Cultivation gates the wildgrain beds — a bed is reapable
    // only in its ripe window (validated within ±slack of the clock, the same
    // reed-exposure idiom). A still-growing bed refuses the swing (swing:false).
    if (this.wildgrainUnripe(view)) {
      return { swing: false, run: () => this.wildgrainGrowingToast(view) };
    }
    // ADR-0013 pack cap, resolved BEFORE the verb: a client-refused swing must
    // not read as one — swing:false skips the cadence stamp, the pose/arc AND
    // the peers' swing echo, so a full pack never mimes chopping to friends.
    if (this.packWouldOverflow(view)) {
      return { swing: false, run: () => this.packFullToast() };
    }
    return { swing: true, run: () => this.swingAtNode(view) };
  }

  /** true when a tide-gated Mire reed is currently submerged (un-harvestable) */
  private reedSubmerged(view: NodeView): boolean {
    if (view.state.type !== 'salt_reed_bed') return false;
    return !tideExposedWithin(Date.now(), TIDE_PERIOD_MS, TIDE_EXPOSURE_SLACK_MS);
  }

  /** the tide-submerged refusal toast, throttled so repeats don't spam it */
  private tideSubmergedToast(): void {
    const now = Date.now();
    if (now - this.tideToastAt > 1500) {
      this.ctx.bus.emit('toast', t.toast.reedSubmerged, 'info');
      this.tideToastAt = now;
    }
  }

  /** true when a Cultivation-gated wildgrain bed is still growing (not yet ripe).
   *  The bed's phase seed is a deterministic hash of its node id (idHash), stable
   *  per node, so every client derives the identical ripeness (ADR-0001/0002). */
  private wildgrainUnripe(view: NodeView): boolean {
    if (view.state.type !== 'wildgrain_bed') return false;
    return !wildgrainRipeWithin(Date.now(), idHash(view.state.id), CULTIVATION_PERIOD_MS, CULTIVATION_SLACK_MS);
  }

  /** the still-growing wildgrain refusal toast, throttled so repeats don't spam it;
   *  shows the "ripens in Ns" countdown when known, else the plain growing hint */
  private wildgrainGrowingToast(view: NodeView): void {
    const now = Date.now();
    if (now - this.cultivationToastAt > 1500) {
      const ms = msToNextRipe(now, idHash(view.state.id), CULTIVATION_PERIOD_MS);
      this.ctx.bus.emit('toast', ms > 0 ? t.cultivation.ripensIn(Math.ceil(ms / 1000)) : t.cultivation.bedGrowing, 'info');
      this.cultivationToastAt = now;
    }
  }

  /**
   * ADR-0013: true when the Node's yield needs a NEW pack slot we lack room
   * for (stacks of kinds already held always grow — a full pack leaves the
   * resource in the world, no held item is ever lost). A pure read, safe
   * inside the side-effect-free resolveEAction.
   */
  private packWouldOverflow(view: NodeView): boolean {
    const cap = inventoryCapacity(this.village.village.tier);
    const yields = Object.keys(NODE_TYPES[view.state.type]?.yield ?? {});
    return yields.some((it) => !canAcceptItem(this.ctx.inventory, it, cap, this.hotbarKinds));
  }

  /** the pack-full refusal toast, throttled so repeats don't spam it */
  private packFullToast(): void {
    const now = Date.now();
    if (now - this.packFullToastAt > 1500) {
      this.ctx.bus.emit('toast', t.toast.packFull, 'bad');
      this.packFullToastAt = now;
    }
  }

  private swingAtNode(view: NodeView): void {
    // pack-cap backstop: nodeAction already resolves a full pack to
    // swing:false, but the cap is CLIENT-side (ADR-0005) — a hit slipping
    // through here would reach hitNode and overfill the pack, so keep the net.
    if (this.packWouldOverflow(view)) {
      this.packFullToast();
      return;
    }
    // tide backstop (ADR-0017 rung 1): the exposure gate is client-side (ADR-0001),
    // so keep the net here too — a submerged reed never reaches hitNode
    if (this.reedSubmerged(view)) {
      this.tideSubmergedToast();
      return;
    }
    // cultivation backstop (ADR-0017 rung 3): the ripeness gate is client-side too,
    // so keep the net here — a still-growing wildgrain bed never reaches hitNode
    if (this.wildgrainUnripe(view)) {
      this.wildgrainGrowingToast(view);
      return;
    }
    const scene = this.ctx.scene;
    scene.tweens.add({ targets: view.sprite, angle: { from: -3, to: 3 }, duration: 60, yoyo: true, repeat: 1, onComplete: () => view.sprite.setAngle(0) });
    // J3: debris chips + the squash punch ride the same optimism as the
    // wobble/sfx above — fired on the swing, not the roundtrip (a server-
    // refused hit still sparks, exactly as it already thunks). The pips and
    // the yield float stay on the authoritative result, byte-identical.
    this.nodeChipBurst(view, false);
    this.punchNode(view);
    const nodeType = view.state.type;
    const swingSfx = nodeType === 'tree' || nodeType === 'hardwood_tree' ? 'chop' : nodeType === 'rock' || nodeType === 'obsidian_rock' ? 'pick' : 'harvest';
    this.ctx.sfx(swingSfx, 0.5);
    void this.ctx.backend.hitNode(view.state.id, this.host.heldTool()).then((result) => {
      if (!result.ok) {
        if (result.reason === 'TOOL_REQUIRED') {
          this.ctx.bus.emit('toast', t.toast.needToolFor(ITEMS[result.requiredTool as StructureId]?.name ?? result.requiredTool), 'bad');
        } else if (result.reason === 'DEPLETED') {
          this.ctx.bus.emit('toast', t.toast.yieldTaken, 'bad');
        }
        return;
      }
      if (result.finishing && result.gained) {
        const text = Object.entries(result.gained)
          .map(([item, n]) => `+${n} ${ITEMS[item as ItemId]?.name ?? item}`)
          .join('  ');
        floatText(scene, view.sprite.x, view.sprite.y - TILE, text, '#ffd166');
        this.ctx.sfx('harvest', 0.6);
        this.progression.useHint('gather');
        if (result.gained.wood) this.host.tickJourney('gather_wood');
        if (result.gained.stone) this.host.tickJourney('harvest_stone');
      }
      if (result.inventory) {
        this.ctx.setInventory(result.inventory);
      }
    });
  }
}
