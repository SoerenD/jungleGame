# Feature plan — GameScene restructure (humble Scene + 18 systems)

**One-liner:** Carve the 8,230-line `src/scenes/GameScene.ts` god-class into a humble Phaser
lifecycle host plus 18 plain-TS system classes, in one big-bang session of stacked
build-green commits, with zero intended behavior change.

Grill session 2026-07-17. All decisions below are owner-confirmed. Architecture recorded in
**ADR-0018** (`docs/adr/0018-humble-scene-system-decomposition.md`).

---

## 1. Resolved decisions

1. **Architecture: Humble Scene + Systems.** GameScene keeps only: init/create bootstrap
   (world JSON load, tilemap/ground layer, camera), the `GameContext` construction, system
   instantiation + wiring, and an ordered `update()` dispatch loop. Target ≤ ~700 lines.
   Everything else moves to `src/systems/*.ts`. ECS and multi-scene split were evaluated and
   rejected (see ADR-0018).
2. **System contract:** each system is a plain TS class
   `create(): void / update(time: number, dt: number): void / destroy(): void`,
   constructed with `(ctx, deps?)`. No Phaser subclassing; systems receive the scene via ctx
   for factory access (`ctx.scene.add`, physics, tweens).
3. **Execution: big-bang, stacked commits.** One marathon session; each extraction is its own
   `npm run build`-green commit (~10–15 commits), pushed together at the end.
   **Step 0 (before any restructure commit): land the currently-uncommitted drop-item feature
   + tiki_statue/hardwood_arch decor retirement as its own commit.**
4. **State model: GameContext + explicit refs** (see §3).
5. **Mode FSM: two modes** — `type Mode = 'overworld' | 'delve'`. Preserves today's `inDelve`
   early-return semantics: in `delve` mode only DelveSystem (and HUD glue) ticks. The Guardian
   fight is **not** a mode — it is FightSystem-internal state (`engagedAt`), because overworld
   systems (remotes, atmosphere, movement) demonstrably keep ticking mid-fight.
6. **Typed bus:** `src/ui/bus.ts` gains a `GameEvents` interface (event name → payload tuple)
   as generics over the existing 22-line singleton. No new dependency. All ~80 emit/on sites
   become compile-checked. HUD event **names and payloads must not change** — hud.ts is a peer,
   not part of this restructure.
7. **Warden field dedup in scope:** the four copy-pasted per-warden field blocks
   (`mire*` 685–697, `echo*` 700–712, `verdant*` 715–727, `reverb*` 731–748) fold into a
   single `Record<WardenId, BossRig>` built on the existing `activeBoss()` indirection.
8. **Pure rules keep flowing to `content/`** opportunistically during extraction (regrow math,
   quota math, enrage timing…), under the guardian.ts constraint: node-importable, no browser
   globals, no `../config`. `content/` modules are otherwise untouched.
9. **Verification bar: full mechanic smoke + adversarial review** (see §6).
10. **Post-refactor deliverables (owner-added 2026-07-17): a style skill + an implementation
    agent** so future features keep the architecture instead of regrowing the god file
    (see §10). Authored AFTER the restructure ships — templates are extracted from the real,
    final code, never invented up front.

## 2. The 18 systems (from the internals map, line refs = pre-refactor GameScene.ts)

| # | System | Contents (pre-refactor line refs) | ~lines |
|---|--------|-----------------------------------|--------|
| 1 | PlayerSystem | movement block (update 8135–8228 movement part), applyAnim/markSwing/playSwingFx (5355–5457), rebuildOwnAvatar 3717, held sprite 4060–4076, gear/armor/loadout 3655–3716, buffs, moveSpeedFactor 3630, atkCadence 3649 | 500 |
| 2 | InputSystem | key wiring (create), `resolveEAction` 4412–4617, facingTile 4981, E/LMB + cadence gating (update 8186–8228), ESC/ENTER/X dispatch | 300 |
| 3 | HarvestSystem | addNode/updateNode/nodeAlive 4078–4252, regrowth visuals, wildgrain stages, swingAtNode 4674, node FX kit 4253–4411, pips, hover labels, pack-full/tide/cultivation toasts | 450 |
| 4 | BuildSystem | placement 4958–5270 (enter/exit place, ghost, anchors, canPlaceLocal, drag-place, doPlace), addStructure/removeStructure 4829–4957, dismantle 5113, ghost preview (update 8164–8185) | 550 |
| 5 | StationsSystem | wireBus craft/eat/drop handlers, crate 4745, sawmill 4755–4818, refiner 4819, updateSawmills | 250 |
| 6 | FightSystem | 1985–2905 (kits, start/engage/end, ward, waves, slam, melee ring, knockdown, altars, shatter/restore, guardian placement/blockers) + fight block (update 8001–8094) + stun upkeep. Includes the BossRig dedup (§1.7) | 1000 |
| 7 | ProjectileSystem | bow/arrows 2609–2759 (aimDir, looseArrowRay, rayHit, fireBow, fallback); targets Fight/Delve/Wildlife via injected refs | 150 |
| 8 | SealSystem | applySeal 1768, barrier 1931, epic break 1946, contributeSealAction 2906 | 150 |
| 9 | VillageSystem | 1781–1930 (bake/apply/refresh, contribute, canFoundHall) + 3732–3850 (recall, bell, trade, name, chronicle, fountain, flowers) | 250 |
| 10 | FishingSystem | 3011–3103 (start/cancel/reel, cookAction) + bite/timeout (update 8104–8120) | 120 |
| 11 | ProgressionSystem | journey/hints 2937–3010, treasure applyQuest 3104 + dig, tablet/intro/welcome-stone actions | 200 |
| 12 | DistrictSystem | 3165–3360 (districtOf, camera regions, realm gates build/action/teleport, enter/leave district) | 200 |
| 13 | FogSystem | fog 3361–3428, vista lift 3576, checkZone 5568 + zone labels 5664, labelScale 3615 | 200 |
| 14 | AtmosphereSystem | nightness 3601, atmosphere block (update 7871–7954: night/dusk overlays, veils, fireflies, leaves, ambience), waterfall audio lerp, sfx/applyMusicVolumes 5544–5559, elevation/waterfall/vista build 3429–3600 | 250 |
| 15 | PresenceSystem | emitPresence/reconcile/upsertRemote/removeRemote 4018–4059 + 5271, remote interpolation (update 7975–7992), throttled sendPosition | 200 |
| 16 | DelveSystem | 5658–7269 wholesale (entrance, enter/descend, build interior, sim orchestration, render, loot, records, peer msgs, knockdown/exhaust) | 1300 |
| 17 | WildlifeSystem | 7271–7869 wholesale (host election, pool, step, enrage/calm, render, harm, loot, forage) | 550 |
| 18 | EchoSystem | 6526–6782 (echo recording, ghosts, vaults, Reverberant summon/claim, echoAction) | 250 |

Shared small helpers (floatText 5560, addShadow 4085, objImage/setObjTexture 4093/4101,
addBlockerBody 4171, death-FX beats 5459–5543) → `src/systems/sceneFx.ts` (or similar)
free functions taking `ctx`/scene.

Module-scope types currently at GameScene top (WorldData, NodeView, RemoteView, MobView,
DelveProjectile, EAction, …) → `src/systems/types.ts` (or colocated with their system).

## 3. GameContext spec

```ts
// src/systems/context.ts
interface GameContext {
  scene: Phaser.Scene;            // factory access only
  backend: Backend;
  bus: TypedBus;                  // the typed singleton (imported, but on ctx for symmetry)
  world: WorldData;               // loaded map JSON
  me: PlayerState;                // own backend player record
  player: Phaser.Physics.Arcade.Sprite;  // set once in create
  mode: Mode;                     // 'overworld' | 'delve' — only GameScene writes it
  held: { item: ItemId | null; lastDir: Dir; };   // read by many, written by PlayerSystem
  inventory: Readonly<Inventory>;
  setInventory(inv: Inventory): void;  // THE single mutate+emit path (replaces ~20 sites)
  journey: JourneyState;          // + tickJourney via ProgressionSystem ref if needed
}
```

- **Cross-system deps are explicit constructor/setter refs wired by GameScene**, not a service
  locator. Known edges from the map: Input→{Fight, Build, Harvest, Fishing, Seal, Village,
  Delve, Wildlife, Echo, District, Progression} (the EAction chain), Projectile→{Fight, Delve,
  Wildlife}, Fog←checkZone→{District (camera), Progression (hints)}, Presence→{Delve, Wildlife}
  (host election inputs), Atmosphere reads District (activeDistrict), Delve/Wildlife→PlayerSystem
  (knockdown/wake). Where a ref would be awkward, a typed bus event is acceptable — but
  per-frame reads use refs, never events.
- `resolveEAction` stays ONE ordered priority chain inside InputSystem (order is gameplay:
  first match wins); it calls into systems via refs. Do not distribute the chain across systems.

## 4. Extraction order (one commit each, easiest → hardest)

0. Drop-item feature commit (pre-existing working-tree changes, verbatim).
1. Scaffolding: `Mode` enum, `GameSystem` interface, `GameContext`, typed bus (`GameEvents`
   map), empty dispatch loop — behavior unchanged.
2. Death-FX + node-FX helpers → sceneFx module. 3. FogSystem. 4. AtmosphereSystem (incl.
   elevation/vista build). 5. FishingSystem. 6. SealSystem. 7. VillageSystem.
8. ProgressionSystem. 9. DistrictSystem. 10. StationsSystem. 11. HarvestSystem.
12. BuildSystem. 13. PresenceSystem. 14. EchoSystem. 15. WildlifeSystem. 16. DelveSystem.
17. FightSystem + ProjectileSystem (incl. BossRig dedup). 18. InputSystem + PlayerSystem last
(everything depends on them; by then all their callees have clean interfaces). 19. GameScene
slimming + `__jw` handle re-point + dead-code sweep. 20. **Style skill + implementation agent**
(§10) — last, so every template is copied from shipped code.

## 5. Acceptance criteria

- **Given** the restructure is complete, **when** `npm run build` runs, **then** it exits green
  (every stacked commit individually, too).
- **Given** the final tree, **then** `GameScene.ts` ≤ ~700 lines and no system file exceeds
  ~1,400 lines.
- **Given** a wrong bus event name or payload type anywhere, **then** compilation fails.
- **Given** `?fight`, **when** totem summon → engage → melee hit in an Eye Window → bow hit in
  a window → Guardian felled, **then** damage applies only in windows and participation loot
  grants Scales.
- **Given** the Delve entrance, **when** enter → fell mobs → descend a stage → exit, **then**
  the full loop works incl. loot claim (solo-Mock acceptable).
- **Given** a danger Zone, **when** wildlife spawns and an arrow hits a survivor, **then** it
  enrages (red tint, charges ~12 s, never into the Village) and calms.
- **Given** an axe in hand, **when** swinging a tree, **then** double damage, yield on finishing
  hit, node regrows after delay (`?slowregrow` to observe).
- **Given** resources, **when** crafting and placing a structure, **then** ghost/claim/dismantle
  work; sawmill mills wood→planks; crate deposit/withdraw round-trips.
- **Given** a fishing rod on a Fishing Spot, **when** bite → reel, **then** fish lands; cooking
  at a campfire + eating grants the move-speed buff.
- **Given** `?night`, **then** darkness overlay + fireflies; Hand Torch in hand lights the glow.
- **Given** Seal/Village panels, **when** contributing, **then** bars/pools update.
- **Given** chat (T) and a signpost, **then** send/persist/read work.
- **Given** the whole smoke run, **then** zero console errors.
- **Given** a second client (or Mock presence), **then** remote movement, held item, and avatar
  render as before.
- No player-observable behavior change anywhere.
- **Given** the shipped restructure, **then** `.claude/skills/system-dev/` exists with SKILL.md
  + template files whose code is copied from real shipped systems (not hand-invented), and
  `.claude/agents/system-implementer.md` exists and instructs loading that skill first.
- **Given** the system-implementer agent and a throwaway toy task ("scaffold a DummySystem that
  logs on create"), **when** it runs, **then** it produces a new `src/systems/` file following
  the template, wires it per the skill, and `npm run build` stays green — then the dummy is
  reverted. (One-time dry-run proving the agent+skill loop works.)

## 6. Verification plan

1. Per commit: `npm run build`.
2. After the final commit: full browser smoke of §5 via preview (`?pump&canvas`, drive with
   `__jw`/`__game` handles; dev flags `?fight ?night ?slowregrow ?slowseal`, delve + echo test
   flags as available). MockBackend (blank `VITE_SUPABASE_*` in `.env.development.local`) for
   solo loops; live world only for a final presence sanity check.
3. Adversarial multi-agent review of the full diff (find→verify workflow, as used on prior
   batches) before push. Findings fixed + re-smoked.
4. Push once; confirm Pages deploy green.

## 7. Scope boundaries — explicitly NOT in this change

- **No gameplay/behavior changes**, no balance changes, no new features.
- **`src/ui/hud.ts` is not restructured** (2,772 lines — a future candidate, separately). Its
  bus event names/payloads are frozen contract for this change.
- **`Backend` interface and both implementations untouched** (beyond the already-pending
  drop-item change in step 0). **No DB migration.**
- **No new dependencies** (typed bus is hand-rolled generics; no mitt, no ECS lib).
- **`content/` modules not rewritten** — they only *receive* extracted pure rules.
- **No map regeneration** (`npm run genmap` output untouched), no asset changes.
- **No multi-scene split** (no DelveScene/UIScene) — rejected, see ADR-0018.

## 8. Constraints & gotchas for the implementer

- **Preserve the exact `update()` ordering.** Pre-refactor order: pendingDeepEntry → [delve
  early-return: updateDelve] → sawmills → atmosphere/veils/echo-ambience → torch/held/shadow
  follow + depth → waterfall audio → remote interpolation → updateWild → fight block → stun
  marker → fishing → buff expiry → [chat/stun: halt] → movement/anim → throttled sendPosition
  → placement ghost → X dismantle → ESC/ENTER place → E/LMB action dispatch. The dispatch loop
  must reproduce this sequence; document it as a numbered list in GameScene.
- **`inDelve` early-return**: in `delve` mode, overworld systems must not tick at all (not even
  atmosphere) — mirror today exactly.
- **`__jw` / `__game` dev handles** poke scene internals and are the only way to drive the game
  under `?pump&canvas` (hidden preview tabs freeze RAF — see CLAUDE.md). Inventory the handle
  surface first, re-point it at systems, and keep names stable — memory-lane test flows depend
  on them.
- **Bus listener hygiene**: every system detaches its bus listeners in `destroy()` (scene
  restart on world-switch would otherwise double-subscribe — the classic Phaser scene bug).
- **`content/guardian.ts` must stay node-importable**; same constraint for every rule module
  extracted during this work.
- **checkZone is a hub**: it drives fog, hints, camera region, and zone labels — extract it to
  FogSystem but keep the fan-out via refs/bus, and keep its call cadence (movement-driven).
- **Host election** (delve + wildlife) keys off presence; PresenceSystem must expose the same
  roster data the election code reads today.
- **Physics colliders** (blockersGroup, delve walls, guardian blockers) are created per system
  but registered against the shared player sprite — wire through ctx.scene.physics, and destroy
  them in the owning system's `destroy()`.
- npm/npx always need `--registry https://registry.npmjs.org/` (no new deps expected anyway).

## 9. References

- **ADR-0018** — the architecture decision (humble Scene + systems; ECS and multi-scene
  rejected; this plan's §1 in decision form).
- ADR-0001 (no server, lazy timestamps), ADR-0002 (authored-schedule fights) — the model layer
  these systems orchestrate; unchanged.
- Internals map + research summary: produced in the 2026-07-17 grill session (concern map with
  line ranges is reproduced in §2; per-frame order in §8).
- Pattern sources: gameprogrammingpatterns.com (Component, Update Method, State, Event Queue);
  martinfowler.com Strangler Fig; Ourcade Phaser event-bus pattern; Phaser scene-systems docs.
- CONTEXT.md — unchanged by this feature (architecture is implementation, not domain language).

## 10. Post-refactor deliverables: style skill + implementation agent

Owner requirement: after the restructure ships, capture the style as tooling so future
implementations keep it. Both are the LAST commit(s) of the session (extraction step 20),
because every template must be **copied from real shipped code**, not written speculatively.

### 10.1 Skill — `.claude/skills/system-dev/`

`SKILL.md` frontmatter description targets: implementing any new gameplay feature, adding or
modifying a system, adding bus events, or extracting rules to `content/`. Body: the
architecture in one page (humble Scene, GameContext, two-mode FSM, typed bus, rules→content/;
pointer to ADR-0018) plus the hard rules — never add state or logic to GameScene beyond
wiring; one concern = one system; per-frame cross-system reads use refs, HUD talks bus-only;
`content/` modules stay node-importable; every system detaches bus listeners in `destroy()`;
`resolveEAction` stays one ordered chain in InputSystem.

Template files beside it (each a fenced, commented excerpt of the real shipped code, with
`<placeholders>`):

- `TEMPLATE-system.md` — minimal system class: constructor `(ctx, deps)`, private state
  fields, `create/update/destroy`, bus subscribe + `destroy()` unsubscribe pairing.
- `TEMPLATE-rule-module.md` — a `content/` pure rule module (guardian.ts constraints stated).
- `TEMPLATE-bus-event.md` — adding one typed event: `GameEvents` map entry + emit site +
  HUD/on site.
- `TEMPLATE-wiring.md` — registering a system in GameScene: instantiation, dep injection,
  where it slots into the documented update order, mode gating.
- `CHECKLIST.md` — pre-commit list: build green, mechanic smoked in browser (dev flags), no
  new GameScene fields, hud.ts event contract untouched unless typed map updated, listeners
  detached.

### 10.2 Agent — `.claude/agents/system-implementer.md`

Project subagent for implementing gameplay features in the post-ADR-0018 codebase.
Frontmatter: name `system-implementer`; description "Implements Jungle World gameplay features
as systems per ADR-0018 — use for any new feature, system change, or content rule work";
tools: full set (Read/Write/Edit/Glob/Grep/Bash at minimum). Body instructions (order
matters): (1) read `.claude/skills/system-dev/SKILL.md` + relevant templates FIRST;
(2) follow the templates verbatim for new files; (3) hard rules repeated from the skill;
(4) verify with `npm run build` and report which template(s) were used; (5) escalate to the
main session instead of ever adding state to GameScene or a new bus event without typing it.

### 10.3 Verification

One-time dry-run (acceptance criteria §5): point the agent at a toy task ("scaffold a
DummySystem that logs on create, wire it, build") — confirm it loads the skill, produces a
conforming system, build stays green; revert the dummy. Skill + agent then commit as
`chore(arch): system-dev skill + system-implementer agent`.
