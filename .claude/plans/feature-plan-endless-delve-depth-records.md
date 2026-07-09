# Feature plan: Endless Delve Depths + Depth Records

The Delve's Stage chain continues past the Forgeborn into generated, ever-harder **Depths**; every
Stage clear writes a per-World **Depth Record**, displayed on the **Grand Monument** (with a
one-line teaser on the Hall panel).

Grilled and resolved 2026-07-09. Binding docs: CONTEXT.md (terms **Descent**, **Depth**,
**Depth Sigil**, **Depth Record**, updated **Stage**/**Husk**/Relationships) and
[ADR-0015](../../docs/adr/0015-endless-delve-depths-and-depth-records.md) (extends ADR-0011).

## Resolved decisions

1. **The chain extends; ADR-0011 mechanics are untouched.** After the Forgeborn falls, another
   in-Dungeon boss-door opens: Stage 3, 4, … forever. Every Depth-3+ Stage is an ordinary
   ADR-0007/0011 run — fresh `runId`, roster = the descenders (shrink-only, no one joins), host =
   the descent's initiator, one participation-loot DB write per Stage, banked loot survives a wipe.
   **No checkpoints, no second entrance**: every Descent starts at the mine shaft; a record Depth is
   one uninterrupted sitting.
2. **Depth = Stage bosses felled.** Deep Guardian = 1, Forgeborn = 2, endless ladder = 3+. Entering
   a Stage counts nothing; the boss must fall.
3. **`themeFor(depth)` — a Depth's content is a pure function of its number** (no seed on the wire;
   guests rebuild everything from the Depth number carried in the descent `start` message):
   - **palette** (floor/wall/dressing hues),
   - **Husk family**: the same two archetypes (melee chaser + ranged kiter), re-dressed, with names
     **composed from localized word lists** (i18n.ts — never baked English strings),
   - **boss**: recycles one of the two existing kits (plain Deep-Guardian kit / Forgeborn eruption
     kit), recolored and renamed — no new signature moves in this feature,
   - **floor plan**: a constrained deterministic generator emitting only the authored grammar
     (safe entry chamber → 3–5 rooms west-to-east → boss room), same carve function as Stages 1–2,
   - **tuning** per decision 4.
   Depth 7 looks identical in every run and every World, forever.
4. **Per-Depth Husk hardening (compounding past Depth 2; all named playtest-tunable constants in
   `content/dungeon.ts`, applied by `themeFor(depth)` on top of per-head roster scaling):**
   - Husk & boss **HP** ~×1.15 per Depth,
   - Husk **move speed** creeps up, **capped just below Player speed** (escape/kiting always
     possible),
   - **attack cadence & recovery** quicken per Depth,
   - ranged kiter **projectile speed** rises per Depth,
   - **telegraph windups** shrink toward a hard **reactable floor**,
   - **mob count** steps up to a **hard cap** (host's single batched broadcast = bandwidth ceiling),
   - past the speed/windup/count caps, difficulty keeps compounding via HP and cadence.
   **Damage-to-player never scales**: no player HP exists; a catch is always exactly one knockdown.
   Knockdown → Exhaustion rules untouched (3 → out; roster only shrinks; wipe ends the Descent).
5. **Loot at Depth 3+ is the Depth Sigil, and nothing else.** One Sigil per Stage boss, paid to the
   participation-loot set. Prestige-only: its sinks are a large `VILLAGE_CONTRIB` value and (a
   LATER pass, not this feature) trophy decor. It crafts nothing combat-relevant. Depths 1–2 keep
   their authored loot tables unchanged.
6. **Depth Record persistence rides the existing per-Stage loot write.** The RPC that pays a
   Stage's participation loot is widened to also record the Descent (id = the Stage-1 `runId`
   carried through the chain), the Depth, and the roster, and to upsert each participant's personal
   best. **Credit = exactly the participation-loot set** — no second bookkeeping; "present without
   hitting earns nothing" extends to the ranking.
   - Per-World (`p_world` on the RPC, ADR-0014).
   - Append/upsert-only, never pruned; the UI displays a top slice (top 10), ties broken by
     earliest `achieved_at`.
   - **Migration 0011** (records table + widened RPC) — the first schema change since 0010.
     **Deploy the migration before the client** (live DB rejects unknown RPC shapes).
   - MockBackend mirrors the same behavior in localStorage.
   - Client-authoritative like everything else (ADR-0005); trusted-friends risk accepted.
7. **Display.** The **Grand Monument** (currently the game's only interaction-less Building) gains
   an interact → the engraved record board with two views: **Deepest Descents** (Depth, roster
   names, date) and **By Player** (each Player's personal best = deepest Stage they helped clear).
   The **Hall** contribution panel gains a one-line current-record teaser. Records accrue from the
   first Descent even while the Monument is unbuilt. A solo Descent is a roster of one on the same
   board — solo and party feats rank together.

## Acceptance criteria

- **Given** a party fells the Forgeborn, **when** any Player presses interact at the newly opened
  door, **then** Stage 3 starts as a fresh run (new `runId`, initiator hosts) whose interior,
  Husk names/colors, boss, and tuning are identical on host and every guest, with no seed message.
- **Given** any two clients (or two Worlds) at Depth N, **then** `themeFor(N)` renders the same
  palette, names, layout, and tuning on both.
- **Given** a Stage-N boss falls, **then** every Player in the participation-loot set receives one
  Depth Sigil (N ≥ 3), and the same DB write records Depth N with that roster.
- **Given** a Player Exhausted at Depth 5 of a Descent that reaches Depth 9, **then** their personal
  best is 5 and the Descent's board entry shows Depth 9 with the roster that cleared Depth 9.
- **Given** a solo Player clears Depth 3, **then** the Deepest-Descents board shows a roster-of-one
  entry.
- **Given** the Grand Monument is not built, **then** records still accrue and the Hall panel teaser
  shows the World's current record; **when** the Monument is later raised, **then** its board shows
  the full history's top slice.
- **Given** two Worlds (different world-id slugs), **then** each sees only its own records.
- **Given** deep Depths (e.g. 10+), **then** mob speed stays below Player speed, windups stay at or
  above the reactable floor, creature count stays at or below the broadcast cap, and Husk/boss HP
  keeps growing.
- **Given** a wipe at any Depth, **then** all previously cleared Stages' loot and records persist.
- `npm run build` is green.

## Scope boundaries — do NOT build

- No new boss signature moves, no new Husk AI/state machines (ADR-0007's one-engine rule).
- No combat-relevant deep loot, no strict-upgrade weapon, no armour/player-HP of any kind.
- No checkpoints, saved progress between Descents, or second World entrance.
- No trophy-decor Recipe for the Sigil yet (later pass; only the `VILLAGE_CONTRIB` sink now).
- No pruning/reset/admin UI for records.
- Do not touch: Guardian content/schedule, Wildlife, Seal, Village tier ladder/buffs, or the
  collective-only nature of the Village pool. The Hall panel change is one teaser line only.
- Do not refactor Stage-1/2 authored content beyond generalizing the `Stage` type.

## Constraints & gotchas

- `src/content/dungeon.ts` must stay node-importable: pure data + pure functions, no browser
  globals, no `../config`. `themeFor(depth)` and the layout generator live there.
- `Stage = 1 | 2` and the `STAGES` record generalize to a number + `stageDefFor(depth)` (authored
  defs for 1–2, generated beyond). The descent `start` message's stage marker widens to that number
  — no new message types.
- ADR-0011's "the Forgeborn ends the whole descent" is retired: no boss ends a Descent — only wipe,
  leaving, or declining the door. `completeDelveRun`-adjacent code paths must reflect this.
- Generated names go through the i18n word-list mechanism — check both language blocks (a past
  deploy broke on misplaced i18n labels).
- Live DB requires `p_world` on every RPC; migration 0011 first, client second.
- No `Date.now()`-style nondeterminism inside content functions; timestamps come from the backend
  write, not the theme.
- Verification: build green is necessary but not sufficient — descent netcode at Depth ≥ 3, the
  record write, and the Monument board need a manual multiplayer playtest (two browsers, `?fight`
  not applicable here; use the existing dungeon dev flow).

## References

- CONTEXT.md: **Descent**, **Depth**, **Depth Sigil**, **Depth Record**; updated **Stage**,
  **Husk**, Relationships (Delve endless chain; Grand Monument function).
- [ADR-0015](../../docs/adr/0015-endless-delve-depths-and-depth-records.md) — this feature's
  decisions; extends ADR-0011, honors ADR-0002/0005/0006/0007/0014.
- Prior art: ADR-0011 (chained Stages), ADR-0013 (building-function passes — the Monument now joins
  Market/Banner/Well/Fountain), ADR-0014 (per-World scoping).
