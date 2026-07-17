# ADR-0018 — Humble Scene: GameScene decomposes into plain-TS systems, not ECS, not multi-scene

## Status

**Accepted 2026-07-17.** From the GameScene-restructure grill session; execution plan in
`.claude/plans/feature-plan-gamescene-restructure.md`.

## Context

`src/scenes/GameScene.ts` reached 8,230 lines — ~30% of the codebase — and every one of its
46 feature commits touched it. The repo's *rules* already live outside the scene
(`content/guardian.ts` is a pure function of `summonedAt + elapsed` per ADR-0002;
`content/dungeon.ts` owns the mob sim; wildlife/village/echoes/tide all have rule modules),
and the HTML HUD already talks to the scene exclusively through the `ui/bus.ts` event
singleton. What the scene actually holds is orchestration, Phaser-object bookkeeping, and
per-frame rendering for ~18 distinguishable gameplay concerns, coupled through a handful of
hub fields (`player`, `inventory`, `heldItem`, `world`, `backend`).

## Decision

1. **Humble Scene + system classes.** GameScene remains the Phaser lifecycle host (bootstrap,
   tilemap/camera, wiring, ordered update dispatch, ≤ ~700 lines); each gameplay concern
   becomes a plain TS class in `src/systems/` with `create/update(time, dt)/destroy` — 18
   systems, one per concern in the internals map (Player, Input, Harvest, Build, Stations,
   Fight, Projectile, Seal, Village, Fishing, Progression, District, Fog, Atmosphere,
   Presence, Delve, Wildlife, Echo). Nystrom's Component pattern applied at scene level; also
   the Phaser-community consensus shape.
2. **Shared state via one `GameContext`, dependencies via explicit refs.** A single ctx object
   (scene, backend, bus, world, me, player, mode, held-item state, and a `setInventory()`
   that is the *only* inventory mutate+emit path) is injected into every system. Genuine
   cross-system calls (Input→Fight, Projectile→Wildlife, …) are references wired by GameScene
   in one visible place — no service locator, no globals.
3. **Two-mode FSM: `overworld | delve`.** Matches the runtime truth (the Delve early-returns
   the whole overworld tick today). The Guardian fight is *not* a mode — overworld systems
   keep ticking mid-fight — it stays FightSystem-internal state.
4. **The bus stays, and becomes typed.** `ui/bus.ts` keeps its role as the sole scene↔HUD
   seam, upgraded with a `GameEvents` payload map (hand-rolled generics, no dependency).
5. **Pure rules keep flowing down to `content/`** (node-importable, no browser globals — the
   guardian.ts constraint). Systems orchestrate and render; rules stay headless.

## Considered options

- **ECS (bitECS / miniplex / ecsy) — rejected.** ECS solves iteration speed over thousands of
  entities; this game has ~8 players and dozens of mobs, and its problem is code organization.
  bitECS's typed-array component storage is an impedance mismatch with JSON/Supabase row
  persistence (ADR-0001/0005); migration is a total state-model rewrite (the least incremental
  path); ecsy is archived/dead. Expect this to be re-proposed — the answer is here.
- **Multi-scene split (DelveScene/FightScene/parallel UIScene) — rejected for now.** The HUD
  is HTML, not a Phaser scene, so a UIScene buys nothing the bus doesn't already provide;
  gameplay-scene splits would force shared player/inventory state into a registry first and
  re-open the hidden-tab RAF/`?pump` workarounds per scene. The system decomposition doesn't
  preclude doing this later if a real need appears.
- **Bus-only decoupling (no shared ctx) — rejected.** Per-frame reads (player position in 10+
  systems) as events is the wrong tool; observer stays for facts, refs for calls.

## Consequences

- Every future feature lands as (usually) one system + rule-module edits, not another stratum
  of the god file; PR diffs localize.
- The `update()` dispatch order is now an explicit, documented list in GameScene — order
  changes become visible decisions instead of accidents of file position (ADR-0002's
  determinism depends on rules staying timestamp-pure, not on tick order, but render order is
  player-visible).
- `ui/hud.ts` (2,772 lines) is untouched and is the obvious next candidate for the same
  treatment; its bus contract was deliberately frozen during this restructure.
- The four per-warden copy-paste field blocks are replaced by a `Record<WardenId, BossRig>`;
  future Wardens add a rig entry instead of a fifth field block.
