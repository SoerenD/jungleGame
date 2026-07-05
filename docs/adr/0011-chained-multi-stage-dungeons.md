# Chained multi-Stage Dungeons (in-Dungeon boss-door, shrinking roster)

A Dungeon needed a second half — a deeper, harder area behind the first boss — without a second
combat engine, a second World entrance, or host migration. Rather than stretch one run across two
areas (which forces per-stage loot/participation bookkeeping *inside* a single instance and scales
the second half to a headcount that may no longer be present), we make each **Stage** its own
ordinary ADR-0007 instanced **run**, and **chain** them: a Stage boss's death opens an *in-Dungeon
door* that starts the next Stage as a fresh run whose roster is only the players who descend. The
**Delve** becomes the first two-Stage Dungeon: Stage 1 (the mine-into-ruins, ending at the **Deep
Guardian**) → Stage 2, **the Deep** (a molten forge-depth, ending at **the Forgeborn**).

> Extends **ADR-0007** (reactive co-op dungeons on peer host-authority), which stays fully intact —
> every Stage is exactly the instance ADR-0007 already describes. Reuses **ADR-0006** (weapon damage
> table + roll) for the Deep's mobs and the new weapon, and **ADR-0004** (roster lock + participation
> loot) per Stage. Domain terms: CONTEXT "Stage", "the Deep", "the Forgeborn", "Cinder/Ember Husk".

## Decision

1. **A Stage is a whole ADR-0007 instance, not a section of one.** Each Stage is a self-contained
   run: one boss, one roster locked at *its* entrance, difficulty scaled to *its* headcount, one
   participation-loot payout on its boss's death (one DB write via the existing `jw_claim_delve_loot`
   — no new RPC, no migration). Stage 1 is entered from the World shaft exactly as today; the Deep is
   entered from an **in-Dungeon door**.

2. **The boss-door chains runs; it is not a second World entrance.** Felling a Stage's boss pays that
   run's loot, shakes the screen, and opens a hidden door **inside the boss room** — but does **not**
   tear the instance down. The cleared party lingers; any Player pressing interact at the door starts
   the next Stage as a **fresh run** (new `runId`), tearing down the current interior and building the
   next one. Because the door is reachable only from inside, there is **no skip-ahead**: every run
   must clear Stage 1 to reach the Deep, and no one outside the instance can join the deeper run.

3. **The descending roster can only shrink, and the deeper run scales to it.** The Deep's roster is
   the non-Exhausted players who descend — a subset of Stage 1's roster. Mob count and boss HP scale
   to *that* count, so a party that lost someone in Stage 1 faces a Deep tuned for the survivors, not
   for the original headcount. This is the ADR-0007 `HP_PER_HEAD` philosophy applied per Stage, and it
   is the specific reason we chose chained instances over one continuous run.

4. **The deeper run's host is the descent's initiator — a fresh sim, never a migration.** Whoever
   presses interact at the door hosts the new run; everyone else at the door auto-joins it. There is
   no hand-off of a live simulation, so ADR-0007's "v1 has no host migration" holds unchanged: the
   original Stage-1 host may decline to descend and simply leave.

5. **No new combat engine; the deeper content is reskin + retune.** The Deep's Cinder Husk (melee)
   and Ember Husk (ranged) are the existing Grasp/Spit state machine, molten-reskinned and tuned
   slightly harder. The **Forgeborn** is the existing boss state machine with a harder profile plus
   one authored signature move — an **eruption**: an oversized, long-telegraphed, *radius-based* strike
   escaped by reaching the room's edges (reusing the strike-zone renderer, not line-of-sight). No
   second AI, per ADR-0007.

6. **Each Stage carries its own loot; deeper loot rewards a sidegrade, not an upgrade.** Stage 1 is
   unchanged (`husk_shard`, `deep_core` → the Sword). The Deep adds `cinder_shard` (common) and
   `forge_core` (rare, from the Forgeborn), paid only to descenders. `forge_core` (+ `cinder_shard` +
   planks + stone) forges **the Forgebrand**: a pure-combat molten two-hander with its own ADR-0006
   band — **slower attack speed, larger per-hit band, net DPS ≈ the Sword** (true parity, the
   axe-vs-pickaxe "same DPS, opposite feel" relationship at the top melee tier). It obsoletes nothing;
   its pull is feel, prestige, and the new materials.

## Considered Options

- **One continuous run spanning both areas** (walk through an opening wall into an extended grid) —
  rejected: it scales the second area to the *entry* headcount (punishing a party that lost someone in
  Stage 1), and it forces per-stage loot-banking and participation bookkeeping *inside* one instance —
  strictly more special-casing than treating each Stage as its own run. Chaining scales to the
  survivors and keeps every instance the plain ADR-0007 shape.
- **A separate, permanently-unlocked second Dungeon with its own World entrance** — rejected: the
  designer wants players to re-clear Stage 1 every run (no skip-ahead), and a persistent unlock + a
  second World mouth adds machinery for a gate we explicitly do not want.
- **A genuinely new boss/AI for the Deep** — rejected per ADR-0007's "no second combat engine": the
  reskin-and-retune of the existing state machine, plus one authored eruption, delivers "a new boss"
  for a fraction of the code and risk.
- **A strict-upgrade weapon** (deeper = better gear) — rejected: it obsoletes the Sword and contradicts
  ADR-0006's "weapons are DPS-variety, not strict upgrades." The Forgebrand is a DPS-parity sidegrade.

## Consequences

- **Boss-1 death changes meaning.** It no longer completes-and-exits the run; it pays loot, opens the
  door, and **lingers** in the cleared interior until players descend or leave. `completeDelveRun` must
  be split accordingly. Only the *final* Stage's boss (the Forgeborn) ends the whole descent.
- **The descent needs a run transition on the wire.** `DungeonMsg` `start` gains a Stage/layout marker,
  and the guest-side "already inside" join-guard must accept a descent from at-the-door party-mates
  (guests who decline stay in the lingering lobby or leave). This is the one genuinely new bit of
  netcode; it is a single message type, not a migration handshake.
- **CLAUDE.md / CONTEXT drift resolved in CONTEXT:** the Deep Guardian is demoted from "final boss" to
  the Stage-1 gate; "Stage", "the Deep", "the Forgeborn", and the Cinder/Ember Husks are added.
- **Farmability is per-Stage.** A group can bank Stage-1 loot and leave, or push the Deep; a Deep wipe
  never costs the banked Stage-1 reward. Each half is independently repeatable within a run's clear.
- **Still no persistent Dungeon state beyond loot.** The door is per-run (no "Deep unlocked" flag); the
  only DB writes remain the one-time `delve_open` (Stage-1 gate, unchanged) and per-run participation
  loot. New item ids ride the existing inventory JSON — **no migration.**
- **Verification is a manual multiplayer playtest.** `npm run build` green is necessary but not
  sufficient for the descent netcode, roster-shrink, and host-is-initiator behavior.
