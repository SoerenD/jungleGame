# Handover — T6 Hushdark: Echo Warden + the Reverberant boss (2026-07-13, session c12f6725)

Read first: `.claude/plans/feature-plan-warden-ladder-armor.md`, `docs/adr/0017-warden-ladder-realms-and-armor.md`,
and the two earlier handovers (`handover-T6-echo-warden.md`, `handover-2026-07-12-warden-implementation.md`).
This doc carries the SESSION state after T6 + the owner-driven **Reverberant** redesign.

## Status headline
- **Everything is UNCOMMITTED in the working tree. `npm run build` is GREEN.**
- **Migration 0015 is NOT deployed** (owner explicitly chose HOLD). Mock needs no migration.
- ⚠️ **Git state to reconcile:** this checkout is HEAD `f38e73d` with **T5 STAGED-uncommitted**. A memory
  claims T5 was committed as `12458f9` — NOT in this checkout's log (likely an unmerged worktree). T6 was
  built directly on the staged T5 working tree (main checkout, not a worktree), so the code is coherent, but
  reconcile the T5 commit/worktree situation before committing T6.

## What shipped

### T6 — Echo Warden + The Hushdark (earlier this session, FULLY browser-verified, solid)
Rung-2 realm, 1:1 off the T5 Mire blueprint: Echo Warden (opens the Hushdark) at the Cavern Mouth; items
`echo_crystal/hushsteel/hushdark_key/chime_kiln/echo_totem/chime_charm`; Chime Kiln refiner; Hushsteel Helm;
node-pure `echoes.ts` (ghost replay); the Hushdark district (built from EXISTING tiles + a cold ambience veil —
bespoke tile strip deliberately deferred); a bespoke `echo-crystal-seam` node sprite; t8 lore; i18n.
`NODE_TYPES.echo_crystal_seam` was a gap caught by the browser test and fixed. Genmap byte-stable-proven.

### T6.6 — the Reverberant boss (THE CURRENT DESIGN — owner-driven, replaces T6.5's vault-loot payoff)
Owner rejected "puzzle → loot chest" as pointless; the puzzle must summon a boss whose defeat gives a cool
reward. Owner picks (via AskUserQuestion): reward = a **unique cosmetic** (an item that makes the Hushsteel
Helm an **epic** version — same stats, cooler look) + **weekly-repeatable** prestige/resources.

**The loop now:** kill the Echo Warden → enter the Hushdark → craft chime charms → record shades → **solve the
ONE 3-pedestal puzzle (3 overlaid shades cover all 3 pedestals at once)** → **this SUMMONS "the Reverberant"
(der Nachhall)**, a hidden authored boss that RISES in the court → defeat it → participation reward:
- **first-ever clear (per player, idempotent):** `hushsteel_helm_epic` (the epic Reverberant Helm, SAME +2/+3
  band, epic crested/glowing overlay) + `hushdark_reliquary` (the placeable prestige trophy).
- **weekly (per player, once per `vaultWeek`):** `echo_sigil` (depth_sigil-style prestige token, pools to
  Village) + `echo_crystal:8` + `hushsteel:2`.
- The **greeting-ghost memorial** is now gated on having defeated the Reverberant (post-victory "leave your mark").
The 4-pedestal deep vault + the T6.5 vault-claim-loot were REMOVED.

## VERIFIED in the browser (solo Mock, `?canvas&echotest`, driven via `__jw`)
- **Puzzle → summon:** 3 shades cover the 3 pedestals → `summonReverberant()` → `fight.warden==='reverb'`,
  `reverbSprite.visible===true` (it RISES), `activeBoss()` routes to the reverb arena (32,334). ✓ Screenshot:
  "⚔ Der Nachhall regt sich" banner + chat "ReverbHero hat den Hof gelöst, und DER NACHHALL erhebt sich!".
- **Reward:** `claimReverbReward()` → `{hushsteel_helm_epic:1, hushdark_reliquary:1, echo_sigil:1,
  echo_crystal:8, hushsteel:2}`; a 2nd claim grants **nothing** (idempotent guards work); the epic helm equips,
  `armorBandOf` = `{bandMin:2, bandMax:3}` (same stats). `reverbDefeated=true` (memorial unlocked). ✓
- genmap byte-stable-proven (pinned map + Mire district 0-diff outside footprint; all reachable). ✓

## ⚠️ OPEN ISSUE — where I was interrupted (NEEDS VERIFICATION / likely a small fix)
**The epic-helm cosmetic OVERLAY may not render on the avatar.** In the headless test, after equipping
`hushsteel_helm_epic` the avatar head still showed plain brown hair (no blue helm cap / no epic crest).
- The armor STAT (+2/+3 band) IS confirmed applied; only the VISUAL is unconfirmed.
- `rebuildOwnAvatar()` (GameScene — note: the method is `rebuildOwnAvatar`, NOT `rebuildMyAvatar`) calls
  `ensureAvatarTexture(this, 'avatar-<name>', appearance, this.equipped)`. Suspicion: it may cache by texture
  key and skip re-baking. BUT the real equip flow (`toggleArmor` → `rebuildOwnAvatar`) re-bakes boots/helm fine
  (T3-verified), so ensureAvatarTexture probably DOES re-bake on the real path — my test bypassed it via a
  direct `backend.equip()` + manual `gs.equipped =` assignment. Last action (interrupted): I did
  `gs.textures.remove('avatar-'+name)` then `rebuildOwnAvatar()` — did NOT get to screenshot the result.
- **TO VERIFY (do this FIRST next session):** (1) Read `src/avatars.ts` — the `ensureAvatarTexture` cache logic
  AND the `helmEpic` draw branch I added (~L307-345, the crest/horns/temple-echo `px()` calls after the
  `if (helm) {...}` block; the flag is resolved at ~L153 `const helmEpic = !!(equipped?.helm &&
  ARMOR_BUFFS[equipped.helm]?.epic)`). (2) In-browser: equip `hushsteel_helm_epic` via the REAL paperdoll/craft
  UI (or grant it + the normal equip button), zoom the camera (`cam.setZoom(6)`), confirm a bright blue cap +
  crest on the head. Plain helm = a 12×4 blue cap; epic adds a central spike + side horns + temple echo-light
  (accent `#e6f6ff`). If the head stays brown hair → the overlay isn't drawing → fix the re-bake (force a
  texture remove in rebuildOwnAvatar, or check ensureAvatarTexture's cache key includes `equipped`) or the
  helmEpic branch. This is the ONE piece of T6.6 not confirmed working end-to-end.

## OTHER OPEN ITEMS
1. **Adversarial review of the T6.6 rewire NOT run.** (T6 + T6.5 were reviewed clean.) Run the 7-dim
   find→2-skeptic-verify Workflow over the reverb diff. Focus: `jw_reverb_claim` guards (echo_trophies +
   reverb_clears idempotency, the `insert..on conflict do nothing returning` pattern), `jw_summon_reverb`
   (mutex + reconcile, no totem), the `reverbSummonBusy` latch (can it double-fire / never re-arm?), endFight
   reverb hide + re-slumber, the epic-helm overlay, byte-stability.
2. **Deploy migration 0015 to live** (throwaway world, never `default`) — owner held. New RPCs the live client
   needs: `jw_summon_reverb`, `jw_reverb_claim` (+ `reverb_clears` table), plus all the echo RPCs
   (`jw_echo_record/list/forget/greet`, `echo_ghosts`+`kind` col, `echo_trophies`). Then live-smoke.
3. **Commit** (owner commits; reconcile the T5-staged git state first).
4. **DEAD CODE from the rewire** (unused, harmless, tsc-clean — decide delete vs leave): the T6.5 vault-claim
   path is dead — backend `claimVault`/`listVaults`, migration `jw_pedestal_set`/`jw_vault_list`/`echo_vaults`
   table, `HushdarkVault.deep` (genmap type), config `VAULT_FABLED_CHANCE`, and the T6.5 vault toasts
   (`vaultOpened/vaultClaimed/vaultDeepSealed/vaultFabled/vaultSpent`, `echo.vaultSealed/vaultOpen/vaultDeepLocked`).
   STILL USED: the greeting ghost (`jw_echo_greet`/`leaveGreeting`), `jw_echo_record/list/forget`, the whole
   Echoes replay. I removed the dead `hushVaultWeek`/`echoClaimBusy`/`echoGreetBusy` fields + the `listVaults`
   call + the `VAULT_FABLED_CHANCE` import from GameScene already.
5. **Bespoke Hushdark tile strip** still deferred (realm uses existing tiles + ambience veil; the node + boss
   art ARE bespoke). Additive later, like mire-tiles was.

## Key mechanics / gotchas (T6.6-specific)
- **Reverberant is SUMMON-ONLY, not dormant-visible.** `reverbSprite` is PRE-BUILT HIDDEN in `create()` (from
  `world.wardenArenas.reverb`, no altar/monument), revealed in `startFight` (`setReverbVisible(true)` + a
  rise tween), hidden in `endFight` (delayed 1.4s on victory so the death-throes play, at once on slumber).
  `activeBoss('reverb')` needs `reverbSprite && reverbArenaRect` (both set at create). NOT in `this.glows`.
- **Summon trigger:** `updateVaults` derives all-3-covered (`?echotest` DEV_ECHO uses ever-covers), fires
  `summonReverberant()` once per coverage event via the `reverbSummonBusy` latch (reset when
  `!anySolved && !this.fight`). The one-fight mutex blocks re-summon while a fight runs. No door to press.
- **Reward:** `guardianVictory` → `if wardenId==='reverb' claimReverbReward()` (server-guarded), else normal
  `openLoot`. `WARDENS.reverb.drops` is EMPTY (reward is the guarded claim). `WARDENS.reverb.realm=''` so
  `wardenForRealm` never maps a district to it; `totem`/`gateKey` are vestigial.
- **Reverb kit** = `makeEchoWaveTiles` (fresh seed `0x5f3759df`) + harder `REVERB_PHASES`; `KIT_ART.reverb`
  reuses the `echo_warden` sheet with violet echo-light tints + a bigger scale (no new sprite asset).
- **genmap** (`tools/generate-map.ts`, byte-stable-proven): `REVERB_ARENA = {x:32,y:334,w:ARENA_W(17),
  h:ARENA_H(13)}` (module-level const), `REVERB_HOME` top-center. The 3-pedestal court is the arena (open,
  no cliff walls, `sealGate:[]`, home NOT stamped blocked — walkable for the puzzle). `wardenArenas.reverb`
  emitted with vestigial altar/monument. Memorial moved to (40,350), t9 to (38,350). Deep vault + old t9
  removed. Proof: `scratchpad/prove-genmap.mjs` (baseline `git show :public/map/*.json`).
- **Migration 0015** (undeployed → edited in place): added `jw_summon_reverb` (mutex + `jw_reconcile_fight`, no
  totem), `reverb_clears` table (PK world,who,week), `jw_reverb_claim` (echo_trophies first-ever → epic helm +
  reliquary; reverb_clears weekly → sigil+resources; both `insert..on conflict do nothing returning`). The
  earlier T6.5 `jw_pedestal_set` first-claim TOCTOU + NO_PLAYER-burn were already fixed (guarded upsert).
- **Headless-driving gotchas:** screenshots work ONLY when the tab is FRONTED + `?canvas` WITHOUT `?pump`;
  `activeDistrict` goes STALE after `jw.teleport` → call `gs.applyCameraRegion(true)`; summoned fights
  RE-SLUMBER if not engaged (correct rule, makes fight screenshots flaky — summon + screenshot fast); the
  rebuild method is `rebuildOwnAvatar`; `jw.grant` takes an OBJECT `{item:count}` (a string corrupts the
  inventory); `jw.scene` is the GameScene OBJECT (not a fn), `jw.state/teleport/grant` are fns.

## Files touched for T6.6 (on top of T6/T6.5)
- `src/content/wardens.ts` — `REVERB_PHASES`, `REVERB_KIT`, `WARDENS.reverb`.
- `src/content/items.ts` — `hushsteel_helm_epic` (ArmorId, EN+DE), `echo_sigil` (ResourceId, EN+DE).
- `src/content/armor.ts` — `ArmorDef.epic?` flag + `ARMOR_BUFFS.hushsteel_helm_epic` (slot helm, band 2/3, epic:true).
- `src/avatars.ts` — `helmEpic` resolve + the epic crest/glow draw branch. **(the unverified visual)**
- `src/ui/icons.ts` — GRIDs for `hushsteel_helm_epic` + `echo_sigil`.
- `src/scenes/GameScene.ts` — `KIT_ART.reverb`; reverb boss fields; pre-built-hidden init; `activeBoss`/
  `setBossBroken` reverb branches; `setReverbVisible`; startFight reveal + endFight hide; `updateVaults`
  rewired to summon-on-solve; `summonReverberant`/`claimReverbReward`; `drawVaultDoor` repurposed;
  `echoAction` (memorial gate → `reverbDefeated`, pedestal-arm kept); `guardianVictory` reverb branch;
  removed dead fields/import + the `listVaults` call.
- `src/backend/{types,MockBackend,SupabaseBackend}.ts` — `summonReverberant` + `claimReverb` + Mock
  `reverbClears`.
- `supabase/migrations/0015_echoes.sql` — `jw_summon_reverb`, `reverb_clears`, `jw_reverb_claim`.
- `src/i18n.ts` — `system.reverbRises` EN+DE, toasts `reverbEpicHelm`/`reverbWeekly`, `warden.name.reverb`.
- `tools/generate-map.ts` — `REVERB_ARENA`/`REVERB_HOME`, court resize, deep-vault removal, `wardenArenas.reverb`,
  memorial/t9 relocation. → regenerated `public/map/*.json`.

## Recommended next-session order
1. **Verify the epic-helm overlay** (the open issue above) — fix if broken. Then re-confirm the full loop in
   the browser (record shades → boss rises → strike-to-begin → the fight is the T5-verified engine → defeat →
   epic helm VISIBLE on the avatar + sigil).
2. Adversarial review of the T6.6 diff; fix findings.
3. (Owner) deploy 0015 live + live-smoke; commit.
