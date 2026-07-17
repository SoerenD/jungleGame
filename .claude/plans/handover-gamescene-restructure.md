# HANDOVER — GameScene restructure (ADR-0018), session 2026-07-17

**Goal (the /goal condition, still active):** execute
`.claude/plans/feature-plan-gamescene-restructure.md` per
`docs/adr/0018-humble-scene-system-decomposition.md` — 8,230-line GameScene →
humble Scene + 18 systems, stacked build-green commits, ZERO behavior change,
then: full browser smoke → adversarial multi-agent review → **one** push +
Pages green. Then step 20 (system-dev skill + system-implementer agent + dry-run).

## STATUS: code 100% done & committed. Mid-way through the browser smoke (V1).

### Commits on master (NOT pushed — push happens ONCE at the very end)

```
30974a1 feat(items): drop-item batch (step 0, verbatim)
425afa2 docs(adr): ADR-0018 + plan
297ac97 step 1  scaffolding (typed bus, ctx, setInv, order doc)
b74bb93 step 2  sceneFx
a18a518 step 3  FogSystem
35b6d2e step 4  AtmosphereSystem
6172033 step 5  FishingSystem
18b3df3 step 6  SealSystem
3645fe8 step 7  VillageSystem
629e02b step 8  ProgressionSystem
6e0de8a step 9  DistrictSystem
0252b2a step 10 StationsSystem
9a29192 step 11 HarvestSystem
345d12a step 12 BuildSystem
6f1d9b9 step 13 PresenceSystem
800ccb6 step 14 EchoSystem
eb94c88 step 15 WildlifeSystem
e6a9ae2 step 16 DelveSystem (script-assembled, verbatim bodies)
07079ba fix: setInv infinite recursion (step-1 script had mangled setInv itself)
46c5305 step 17 FightSystem + ProjectileSystem (BossRig dedup — the four
        mire/echo/verdant/reverb field blocks → Record<WardenId, BossRig>,
        one buildDormantRig loop, one wardenCourtAltarAction)
042ca20 step 18 InputSystem + PlayerSystem (also fixed latent harvest.fishing
        wired-before-construction bug)
02bbc3b step 19 slim: GameScene = exactly 700 lines; __jw → scenes/devHandles.ts
        (STABLE names); foliage/clouds/water → scenes/worldDressing.ts; delve
        floor/prop painters → systems/delveInterior.ts (DelveSystem 1413);
        dead imports/constants/delegates swept; §8 order doc finalized
40cea85 fix: missing fogSystem.district wiring (checkZone threw on 1st 300ms
        tick → killed the ?pump loop; found by the smoke)
```

Build is green at every commit (`npm run build` per commit, transcripts in session).
Typed-bus AC proven: a bogus `bus.emit('bogus-event')` fails tsc (TS2345 captured).
Line ACs: GameScene 700 (≤~700 ✓), max system DelveSystem 1413 (≤~1400 ✓).

### Architecture as landed (for the reviewer/successor)

- `src/systems/`: types.ts (Mode/GameSystem/WorldData/NodeView/EAction/OkJoin),
  context.ts (GameContext: scene/backend/bus/world/me/player(getter)/mode(getter
  over scene.inDelve)/held(getters over scene.heldItem+lastDir)/inventory RO/
  setInventory=THE mutate+emit path/sfx/journey), sceneFx.ts (shared free fns +
  death-beat kit), 18 system classes, delveInterior.ts.
- GameScene keeps: bootstrap (tilemap/camera/player-sprite creation is in
  PlayerSystem.create but scene.player field), ONE visible wiring block (ctors +
  late-wired public refs), explicit **ordered dispatch** in update() (numbered
  §8 doc above update()), and **host accessors** (get/set delegating into
  systems) for cross-mode seams: fight/wardens/stunnedUntil/stunMarker/
  fightMusic/reverbSummonBusy/reverbDefeated/mire|echo|verdantAltarPos/
  isDelveHost/delveHostName/chatFocused/lmbDown/keys/lastSwingAt/swingCount/
  buffUntil/heldSprite/torchGlow/playerShadow/placing + method delegates
  (beginKnockdown, fireBow, tickJourney, updateHints, moveSpeedFactor,
  atkCadence, armorBandOf, heldTool, isBow, resolveEAction, nearbyStructure,
  exitPlaceMode, applyAnim, markSwing, playSwingFx, sfx, checkZone,
  delveOpenNow, refreshDelveEntrance, villageWakeTile, leaveDelve,
  updateEchoes, recomputeWildHost). Scene fields that remain REAL state:
  inventory (private, behind setInv), heldItem+lastDir (ctx.held hub),
  inDelve, worldColliders, lastPosSent, groundLayer, blockersGroup,
  nodeHoverLabel, player.
- Every system: `create()/update(time,delta)/destroy()`; destroy detaches its
  bus AND backend listeners; scene SHUTDOWN hook runs all destroys.
- resolveEAction = ONE ordered chain in InputSystem (verbatim order preserved).
- In delve mode: scene.update calls ONLY delve.updateDelve() then returns.

### WIRING-BUG CLASS TO WATCH (2 found already, review must re-audit)
Late-wired public refs (`system.x = other`) are NOT compile-checked for
completeness. Bugs found so far: `fogSystem.district` never wired (fixed
40cea85); `harvest.fishing` wired before FishingSystem existed (fixed in
042ca20). **The adversarial review should mechanically diff each system's
declared `X!:` ref fields against the wiring block in GameScene.create().**

## SMOKE (V1) — done so far, all on MockBackend (`.env.development.local`
## already blanks VITE_SUPABASE_* — leave that file as is)

Environment: dev server running via preview (`jungle-world-dev`, port 5173,
serverId 0ab77865-… may be stale — just preview_start again). Tab "seed".

**CRITICAL harness knowledge:**
1. The built-in `?pump` loop DIES PERMANENTLY if any game-step exception
   escapes (MessageChannel chain breaks). Symptom: loop.frame frozen, scene
   timers frozen, zero console errors. ALWAYS install the resilient shadow
   pump below after every page load, and check `window.__pumpErrors` after
   every test batch (it is the "zero console errors" proxy — must stay []):
```js
window.__pumpErrors = [];
const ch = new MessageChannel(); let last = 0;
ch.port1.onmessage = () => {
  try { const g = window.__game; const now = performance.now();
    if (g && g.isRunning && now - last >= 33) { last = now; g.loop.step(now); }
  } catch (e) { window.__pumpErrors.push(String(e && e.stack || e)); }
  ch.port2.postMessage(0);
};
ch.port2.postMessage(0); window.__shadowPump = ch;
```
2. Join flow per load: fill `#join-name` = "Smoke", `#join-pin` = "1234"
   (dispatch 'input' events), click `#join-btn`, poll for `window.__jw`
   (~5-15s; BootScene decodes audio). First-ever join shows the intro —
   dismiss with `window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`.
   Player "Smoke" now exists in Mock localStorage; introSeen persisted.
3. Drive internals via runtime access (TS private is erased):
   `const s = __jw.scene;` then `s.ctx.bus.emit(...)`, `s.resolveEAction()`,
   `s.ctx.held.item = 'axe'`, `s.fightSystem…`, `s.wildlife…`, etc.
4. javascript_tool TIMES OUT AT 30s — never await long loops inline; start
   detached `setInterval` loops writing to `window.__x` and poll in later calls.
5. `?slowregrow` = REAL times. Dev default (no flag) = FAST_REGROW 20s — use that.

**PASSED (with evidence in transcript):**
- zone banner + checkZone hub (currentZone "The Cavern Mouth"), fog timers live
- presence: Mock bots Kiki+Bruno rendered, sprites alive
- harvest: axe = 2 dmg, bare = 1 (double-damage AC), depletion, +3 wood yield,
  regrow after FAST_REGROW (node n3213 regrown, body re-enabled)
- craft via bus ('craft','axe') → axe count +1
- place campfire → nearbyStructure finds it → dismantle (X path) → refund =
  crafting materials (campfire item not returned — correct)
- sawmill: place, deposit 10 wood, nextPlankMs 5000, collect → +1 plank; blade
  bookkeeping seated via Build→Stations maps
- crate: deposit 2 wood → withdraw 2 → exact round-trip
- Seal: contribute at monument (quotas filled 0→{6,5,3,2}) AND the one-time
  epic Seal break fired
- Village: hall founded via place, pool 0→5 on 'village-give' (bars data)
- chat: 'send-chat' → backend → 'chat' echo from "Smoke"
- signpost: sign-prompt/sign-text flow, placed with text, E-read emits 'lore'
- fishing: rod cast → bite → reelIn → +1 fish; cook at campfire → cooked_fish;
  'eat' → buffUntil set, moveSpeedFactor 1.2 (+20% AC)
- wildlife: host election (solo host), spawn, bow-arrow flight no-crash,
  bare-hit survivor → rage=true + ledger by "Smoke" + RED TINT (0xff7a66) on
  the view, calms after the ~12s window. BONUS: village-sanctuary rule proven
  live (a hit near the founded Hall did NOT enrage — revenge called off in the
  Village zone = the "never into the Village" evidence).
- ?fight guardian: summon (dormant) → first strike engages (26/30 hp) →
  ward deferred until wave-0 slam (wardParts 0 pre-slam, correct) →
  closed-Eye melee DEFLECTS (hp unchanged) → open-Eye melee LANDS (26→23).
  Round 1 fight SLUMBERED at 90s (correct behavior — my test pacing was slow).

**IN FLIGHT / WHERE I STOPPED (mid-investigation):**
Round 2 of the ?fight loop (fresh totem granted, summoned, engaged at 26/30).
A detached kill-loop (`window.__kill`, 120ms interval: bow-in-window first,
then axe hammer, watching `bv.eyeGlow.alpha > 0`) was started BUT after ~30s+
`__kill` showed bowTried 0 / hp 26 — the eye-open predicate never fired.
Round 1 used the same predicate successfully. Last two javascript_tool calls
(sampling eyeGlow.alpha/wave over a few seconds) TIMED OUT at 30s — possibly
the page/renderer got wedged, or my sampling loops were too slow; the timeouts
themselves are ambiguous. NEXT STEPS FOR SUCCESSOR:
  1. Reload the page fresh (navigate again), reinstall shadow pump, rejoin.
  2. Re-grant `{ summon_totem: 1 }`, redo the short fight; sample
     `s.fightSystem.renderedWave/slammedWave` + `bv.eyeGlow.alpha` with a
     SHORT (≤10 samples, ≤200ms apart) inline loop to confirm the fight block
     ticks; if renderedWave advances but eyeGlow never rises, suspect a REAL
     regression in the step-17 fight-update transcription (compare against
     pre-refactor block: eye opens only in the "else" branch after landing
     poses — pose.windup/lunge-hold branches suppress it; with ?fight's kit
     the windows may simply be short — poll faster).
  3. Prove: bow arrow (pointer aimed via
     `p.x=(wx-cam.scrollX)*cam.zoom; p.y=(wy-cam.scrollY)*cam.zoom;`) lands
     in an open window (hp drops), then fell it → 'loot-open' with
     guardian_scale → 'loot-take-all' → Scales in inventory (participation AC).

**SMOKE STILL TO DO after the fight:**
- Delve run: `__jw.delve.enterStage1()` (no flag needed) → assert inDelve,
  interior built, `__jw.delve.fellHusks()` + `fellBoss()` → loot-open →
  take-all → door open → `descend()` → stage 2 → `__jw.scene.delve
  .leaveDelveManual?` (leave via delveEAction at entry) → back in overworld,
  colliders restored, zone banner back. Watch __pumpErrors.
- ?night load: `?pump&canvas&night` → nightOverlay.alpha > 0, fireflies
  emitting (atmosphere.fireflies), torch: held=hand_torch (grant) →
  torchGlow.alpha ≈ 0.1+0.35.
- Journey/hints sanity: progression.journey steps ticked during the above
  (gather_wood etc. — likely already true from harvesting).
- Final: read_console_messages(onlyErrors) + __pumpErrors — must be clean.
- (Optional per plan: presence held-item/avatar of remotes — Kiki/Bruno render
  already verified; remote swing echo can't be driven solo — skip, note it.)

## THEN (in order)

1. **Step 20** — `.claude/skills/system-dev/` (SKILL.md +
   TEMPLATE-{system,rule-module,bus-event,wiring}.md + CHECKLIST.md; every
   template COPIED from real shipped code — good sources: FishingSystem
   (small system), SealSystem (backend listeners), the GameEvents map in
   ui/bus.ts (bus-event), the wiring block in GameScene.create (wiring),
   content/tide.ts or content/cultivation.ts (rule module)) and
   `.claude/agents/system-implementer.md` (frontmatter name/description/tools;
   body: read SKILL.md first, follow templates, hard rules, verify with
   npm run build, escalate instead of adding scene state/untyped events).
   Then DRY-RUN: spawn the agent (Agent tool, subagent_type general-purpose is
   fine if the custom type isn't registered in-session — but try
   'system-implementer' first) on "scaffold a DummySystem that logs on create,
   wire it, build" → verify build green → `git checkout` the dummy away.
   Commit: `chore(arch): system-dev skill + system-implementer agent`.
2. **V2 adversarial review** — multi-agent (Workflow tool; ultracode is ON):
   review the FULL diff `git diff 425afa2..HEAD` (~all 21 commits) across
   dimensions: (a) behavior-parity per system vs pre-refactor (the original
   file is at `git show aac1322:src/scenes/GameScene.ts` — wait, use
   `git show 30974a1:src/scenes/GameScene.ts` for the post-step-0 original),
   (b) missing late-wired refs (see bug class above), (c) bus/backend listener
   hygiene in destroy(), (d) update-order fidelity vs §8, (e) inDelve gating,
   (f) HUD contract untouched (src/ui/hud.ts must have NO diff except none —
   verify `git diff 30974a1..HEAD -- src/ui/hud.ts` is empty; bus.ts payload
   types must match hud usage), (g) leftover `this.` seam-rewrite artifacts in
   the script-assembled DelveSystem (double-check `this.ctx.scene.ctx` style
   damage — greps were clean but re-verify), (h) ordering of emits (inventory/
   equipped). Verify each finding adversarially before fixing; fix + re-smoke
   what they touched; commit fixes.
3. **V3** — push ONCE (`git push`), then watch GitHub Pages workflow to green
   (`gh run list/watch`). Memory gotcha: if deploy-pages fails "try again
   later" with build OK, toggle Pages source via API (legacy↔workflow) and
   redeploy (see memory pages-deploy-state-corruption).
4. Update memory (`memory/gamescene-restructure-planned.md` → done state; new
   facts: wiring-bug class, pump-death-on-exception).

## Key file map (post-restructure)

- src/scenes/GameScene.ts (700) — bootstrap+wiring+dispatch+accessors
- src/scenes/devHandles.ts — __jw (STABLE handle names)
- src/scenes/worldDressing.ts — foliage/clouds/water repaint
- src/systems/{types,context,sceneFx,delveInterior}.ts
- src/systems/{Fog,Atmosphere,Fishing,Seal,Village,Progression,District,
  Stations,Harvest,Build,Presence,Echo,Wildlife,Delve,Fight,Projectile,
  Player,Input}System.ts
- src/ui/bus.ts — typed GameEvents map (frozen HUD contract)
- Untouched: src/ui/hud.ts, Backend interface + Mock/Supabase (beyond step 0),
  content/* (no rewrites), public/map (no genmap), no new deps, no migrations.

## Danger notes for the successor

- DO NOT amend/rebase the existing commits (history is the deliverable).
- Push only once, at the very end, after review fixes.
- The goal's Stop hook re-prompts until every condition holds; report honestly.
- `.env.development.local` (Mock override) is intentionally uncommitted/local —
  do not commit it, do not delete it until after the smoke.
- The dev server may still be running (preview). `__jw.scene` handles above.
- Turn count so far: well under the 120-turn budget; V1 smoke ~70% done.
