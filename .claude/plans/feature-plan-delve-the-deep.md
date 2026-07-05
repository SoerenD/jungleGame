# Feature plan — The Deep (the Delve's second Stage)

**One line:** Felling the Deep Guardian shakes the screen and opens a hidden door; pressing interact
descends the surviving party into **the Deep** — a fresh, molten, roster-shrunk instanced run with
Cinder/Ember Husks and a new boss (**the Forgeborn**) whose own loot forges a sidegrade weapon
(**the Forgebrand**).

> Source of truth: **ADR-0011** (`docs/adr/0011-chained-multi-stage-dungeons.md`).
> Extends **ADR-0007** (peer host-authority Dungeons — every Stage is one of its instances). Reuses
> **ADR-0006** (weapon table + `rollGuardianDamage`) and **ADR-0004** (per-Stage roster lock +
> participation loot). Domain terms in **CONTEXT.md**: "Stage", "Dungeon", "Husk", "the Deep",
> "the Forgeborn", "Cinder/Ember Husk".

### ⚠ Size & verification
- Reuses the existing Delve machinery heavily (mob AI, host-authority, loot RPC) — the new surface is
  a second authored interior + mob/boss reskins + a **run-transition (descent)** on the wire + one
  new weapon. No backend/migration work.
- Build-green (`npm run build`) is **necessary, not sufficient**: the descent netcode, roster-shrink,
  and host-is-initiator behavior need a **manual multiplayer playtest**.

---

## Resolved decisions (facts)

### 1. Structure — two chained instanced runs
- The Delve now has **two Stages**, each a self-contained ADR-0007 instance (one boss, one roster
  locked at its entrance, scaled to its headcount, one participation payout). **Retire "level"** — the
  term is **Stage** (CONTEXT forbids level/floor/room for Dungeons).
- **Stage 1 = the Delve run** (mine-into-ruins), entered from the World shaft — unchanged. Ends at the
  **Deep Guardian**.
- **Stage 2 = the Deep** (molten forge-depth), entered from an **in-Dungeon door** — new. Ends at
  **the Forgeborn**.
- This **supersedes** any "one continuous run" framing: they are two chained runs, not one run in two
  areas.

### 2. Boss-1 death → open the door, do NOT exit
- On the **Deep Guardian's** death: pay Stage-1 participation loot (existing `claimDelveLoot`), **shake
  the screen** (`cam.shake`), spawn/open a **hidden door** in the boss room (room E) — and **keep the
  instance alive** (do NOT `leaveDelve`). The cleared party lingers in the ruins.
- **Split `completeDelveRun`**: the Deep Guardian's `onMobFelled` path pays-loot-and-opens-door-and-
  lingers; only the **Forgeborn's** death does the true complete-and-exit.

### 3. Descent (press interact at the door)
- The door prompt is **optional**: a party may instead walk back to the entrance and leave with its
  Stage-1 loot.
- Pressing interact at the open door starts **the Deep as a fresh run** (new `runId`): tear down the
  ruins interior, build the magma interior, teleport the party to the Deep's entry, host spawns the
  Deep's mobs.
- **Roster = non-Exhausted players at the door** (a subset of Stage 1's roster — it can only
  **shrink**; no one from outside the instance can join). **Host = whoever pressed interact**;
  everyone else at the door auto-joins. If the original Stage-1 host declines, they just leave.
- Descent is **one-way** — no climbing back to the ruins; the Deep has its **own exit** at its entry
  tile (press interact there to leave to the **World**; host-leave ends the run, v1).

### 4. Scaling
- The Deep scales **mob count + Forgeborn HP** to the **descending** headcount (not the Stage-1 entry
  count) — the `HP_PER_HEAD` philosophy per Stage. Reuse the Stage-1 per-head coefficients, tuned
  **slightly harder**.

### 5. Mobs — Cinder Husk + Ember Husk (reskin/retune, same engine)
- **Cinder Husk** = molten melee chaser (the `grasp` state machine, reskinned, slightly harder).
- **Ember Husk** = molten ranged kiter (the `spit` state machine, reskinned, slightly harder).
- New `HuskKind`/`MobKind` entries feeding the **existing** `stepMob`/`stepMelee`/`stepRanged` — **no
  new AI**. Per-mob danger stays readable (knockdown-only; no player HP).

### 6. Boss — the Forgeborn (reskin/retune + one signature move)
- The existing boss state machine (`stepBoss`: lunge + volley + 3 fury phases keyed on HP) reskinned
  molten, with its own harder `MobProfile` (more HP/head, tighter fury ramp, aggressive ranged-leaning
  rhythm).
- **Signature "eruption":** an oversized, **long-telegraphed, radius-based** strike centered on the
  Forgeborn, escaped by sprinting to the room's edges. Reuses the existing windup→strike + telegraph
  renderer (a big `strikeR` with a long wind-up) — **not** a new state machine, **not** line-of-sight.
  (Pillars are cover for the Ember Husk's *volleys*, not for the eruption.)

### 7. Loot — per-Stage, descenders-only for the Deep
- **Stage 1 unchanged:** Husks → `husk_shard`; Deep Guardian → `deep_core` → the Sword.
- **The Deep adds:** `cinder_shard` (common, from Cinder/Ember Husks) and `forge_core` (rare, from the
  Forgeborn) — new `ResourceId`s. Paid **only to Deep participants** (someone who fought Stage 1 but
  didn't descend gets no Deep loot).
- Each run pays once, on its own boss, via the existing `jw_claim_delve_loot` — **no new RPC, no
  migration** (the function merges any loot JSON; new ids ride the inventory JSON).

### 8. Reward — the Forgebrand (sidegrade weapon)
- New `ToolId` `forgebrand`, `kind: 'tool'`, **pure-combat** (no harvest, unlocks no Node) — like the
  Sword. Works on Husks, both bosses, and the open-world **Guardian** (plugs into the ADR-0006 table).
- **Stat identity:** **slower attack speed** (longer `attackMs`) + a **larger per-hit band**, tuned so
  **net DPS ≈ the Sword** (true parity — the axe-vs-pickaxe "same DPS, opposite feel" at the top melee
  tier). Add it to the ADR-0006 weapon table in `guardian.ts`.
- **Recipe:** `forge_core` + `cinder_shard` + planks + stone (exact counts = tuning). Independent
  craft — does **not** consume the Sword.

### 9. Interior — the Deep (one fixed magma layout)
- One fixed authored layout, mirroring Stage 1's flow: safe entry room → 2–3 Husk rooms → **Forgeborn
  boss room** (must be **large enough to have safe edges** for the eruption). Molten palette + new
  props (basalt pillars, lava-crack floor veins, ember braziers, slag piles) in `delveProps.ts` /
  `dungeon.ts`, drawn the same `fillRect`→texture way. Emit `bus.emit('zone', 'The Deep')` on descent.

### 10. Dev flag
- Add a `?deep` URL flag that drops you straight into the Deep for playtesting (keep `?dungeon` for
  Stage 1).

---

## Acceptance criteria (Given / When / Then)

1. **Door opens, run persists.** *Given* the Deep Guardian is felled, *then* the screen shakes,
   Stage-1 participation loot is paid to its participants, a hidden door opens in the boss room, and
   the instance does **not** tear down.
2. **Descend as a fresh run.** *Given* the open door, *when* a Player presses interact at it, *then* a
   new run starts with that Player as host, the ruins interior is replaced by the magma interior, and
   the descending non-Exhausted party is teleported to the Deep's entry.
3. **Roster only shrinks.** *Given* a Player was Exhausted in Stage 1 or is not at the door, *then*
   they are not in the Deep's roster; *and* no Player outside the Stage-1 instance can join the Deep.
4. **Scale to descenders.** *Given* N players descend, *then* the Deep's Husk count and the Forgeborn's
   HP scale to N, not to the Stage-1 entry headcount.
5. **New mobs.** *Given* I'm in the Deep, *then* I face Cinder Husks (molten melee chasers) and Ember
   Husks (molten ranged kiters) — reactive, telegraphed, knockdown-only.
6. **Eruption.** *Given* the Forgeborn, *then* alongside lunges/volleys it performs a room-wide,
   long-telegraphed radius strike escaped by reaching the room's edges.
7. **Deep loot + completion.** *Given* the Forgeborn dies, *then* every Deep participant receives
   `forge_core` + `cinder_shard`, the run completes, and the party exits to the World.
8. **Forgebrand.** *Given* `forge_core` + `cinder_shard` + planks + stone, *when* I craft, *then* I get
   the Forgebrand — a pure-combat molten two-hander with slower attack speed, a bigger per-hit band,
   and net DPS ≈ the Sword, usable on Husks, both bosses, and the Guardian.
9. **Wipe / host-leave in the Deep.** *Given* the Deep party wipes or its host leaves, *then* the Deep
   run ends with no Deep loot, but the banked Stage-1 loot is kept.
10. **Per-run door.** *Given* a fresh Delve run, *then* the door is closed until that run's Deep
    Guardian is felled (no permanent "Deep unlocked" flag).
11. **No open-world / backend change.** *Given* the open World, *then* nothing chases me (Husks stay
    Dungeon-only); *and* no migration or new RPC is introduced.
12. **Build.** `npm run build` passes.

---

## Scope boundaries — do NOT build

- **No host migration** — host-leave still ends the run (ADR-0007 v1, unchanged).
- **No permanent "Deep unlocked" flag; no second World entrance** — the door is per-run and in-Dungeon.
- **No climb-back-up** — descent is one-way.
- **No third Stage** — exactly one Deep layout, two new Husk variants, one new boss, one new weapon.
- **No new combat engine** — Cinder/Ember Husks and the Forgeborn reuse the existing mob state machine
  (+ the eruption as an authored big strike).
- **No Journey / onboarding or Lore / Ancient Tablet changes** — out of scope.
- **Don't touch Stage-1 content, loot, or the Sword.**
- **No player HP / no death** — harm stays knockdown → Exhaustion.
- **No migration / no new RPC** — reuse `jw_claim_delve_loot` as-is.

---

## Constraints & gotchas

- **Split `completeDelveRun`:** Deep Guardian death = pay loot + shake + open door + **linger**;
  Forgeborn death = pay loot + complete + exit to World.
- **Descent transition on the wire:** extend `DungeonMsg` `start` with a Stage/layout marker; **relax
  the guest `inDelve` join-guard** so at-the-door party-mates accept the descent (guests who decline
  stay in the lingering lobby or leave). This is the one genuinely new bit of netcode.
- **Node-importable purity:** `dungeon.ts` and `delveProps.ts` stay free of browser globals / `../config`
  (Deep layout, props, mob profiles, scaling live there like Stage 1's). `guardian.ts` stays
  node-importable — add the Forgebrand to its ADR-0006 weapon table; mob damage reuses
  `rollGuardianDamage`.
- **Eruption is radius-based**, not line-of-sight; size the Deep boss room so edges are safe.
- **Deep mobs spawn at descent only** (host) — never simulated or broadcast during Stage 1.
- **New content surfaces:** `ResourceId` `cinder_shard`, `forge_core`; `ToolId` `forgebrand` in
  `ITEMS` (+ EN/DE names/descs); icons in `ui/icons.ts`; mob sprites (Cinder/Ember Husk, Forgeborn) in
  `mobSprites.ts`; props in `delveProps.ts`; recipe for the Forgebrand.
- **i18n EN + DE** for new toasts (door opens / shake, descend, Forgeborn falls) and item strings.
- **Realtime budget:** the Deep obeys the same snapshot cull/rate-cap as Stage 1 (`POS_BROADCAST_MS`,
  presence limits).
- `npm`/`npx` need `--registry https://registry.npmjs.org/`.

---

## References

- **ADR-0011** — chained multi-Stage Dungeons (the architecture for this feature).
- **ADR-0007** — reactive co-op Dungeons on peer host-authority (each Stage is one of its instances).
- **ADR-0006** — weapon damage table + roll (Deep mob damage; the Forgebrand plugs in).
- **ADR-0004** — roster lock + participation loot (reused per Stage).
- **CONTEXT.md** — "Dungeon", "Stage", "Husk", "the Deep", "the Forgeborn", "Cinder/Ember Husk".
- Existing code: `src/content/dungeon.ts`, `src/delveProps.ts`, `src/scenes/GameScene.ts`
  (`enterDelve`/`beginDelve`/`completeDelveRun`/`onMobFelled`), `src/backend/types.ts` (`DungeonMsg`).
