# Endless Delve Depths (generated Stage ladder) + per-World Depth Records

The Delve's chain no longer ends at the Forgeborn: past the two authored Stages, each boss's fall
opens another in-Dungeon door into a **generated Depth** — new look, new Husk family, harder tuning,
forever — and every Stage clear writes a per-World **Depth Record** (deepest Descents + per-Player
bests), displayed at the **Grand Monument**. The ladder is deterministic (a pure function of the
Depth number, no seed), the deep loot is prestige-only (the **Depth Sigil**), and the record write
rides the existing one-DB-write-per-Stage loot call.

> Extends **ADR-0011** (chained multi-Stage Dungeons) — every generated Depth is exactly the
> fresh-run-behind-the-boss-door instance that ADR describes; only "the door stops after Stage 2"
> is deleted. Honors **ADR-0007** (no second combat engine), **ADR-0002**'s determinism discipline,
> **ADR-0014** (everything per-World), and ADR-0006/0011's "no strict-upgrade loot." Domain terms:
> CONTEXT "Descent", "Depth", "Depth Sigil", "Depth Record".

## Decision

1. **The chain extends; nothing else about it changes.** Depth 3+ Stages are ordinary ADR-0011 runs:
   fresh `runId`, roster = the descenders (shrink-only), host = the descent's initiator, one
   participation-loot write per Stage, wipe banks nothing new but loses nothing banked. **No
   checkpoints and no second entrance** — every Descent starts at the mine shaft, so a record Depth
   is one uninterrupted sitting. (A "re-enter at your record" mode was rejected: it needs persistent
   per-Player Dungeon state, which ADR-0011 explicitly avoided, and it is skip-ahead by another name.)

2. **A Depth's content is a pure function of its number.** `themeFor(depth)` derives palette, Husk
   family (names composed from **localized word lists**, never baked English), boss kit, floor plan,
   and tuning from the Depth number alone — same result in every run and every World, **no seed on
   the wire** (guests rebuild everything from the stage number the descent `start` message already
   carries). Layouts come from a **constrained generator** that only emits the authored grammar
   (safe entry chamber → 3–5 rooms west-to-east → boss room), so spawn placement and pathing stay
   inside proven shapes. Bosses **recycle the two existing kits** (plain Deep-Guardian kit /
   Forgeborn eruption kit), recolored and renamed; new authored signature moves are a later content
   pass, not part of this ladder. (An authored cycling theme list was offered and rejected by the
   designer — wanted non-repeating variety; per-run seeds were rejected because Depths would lose
   their shared identity and the seed becomes wire + record state.)

3. **Difficulty compounds without end, inside hard physical limits — and it is the Husks themselves
   that harden.** Per Depth past 2: Husk and boss **HP** ~×1.15 (compounding); Husk **move speed**
   creeps up, capped just below Player speed so escape/kiting always stays possible; **attack
   cadence and recovery** quicken; the ranged kiter's **projectile speed** rises; **telegraph
   windups** shrink to a humanly **reactable floor**; **mob count** steps up to a **hard cap** (the
   host broadcasts all creature state in one batched message — creature count is a bandwidth
   ceiling). Past the speed/windup/count caps, the wall keeps growing through HP and cadence —
   attrition, never unreadable attacks. Damage-to-player can never scale: there is no player HP, a
   catch is always exactly one knockdown (Knockdown → Exhaustion untouched). All multipliers are
   named playtest-tunable constants in `content/dungeon.ts`, applied by `themeFor(depth)` on top of
   the per-head roster scaling.

4. **Deep loot is prestige-only: the Depth Sigil.** Depths 3+ pay one Sigil per boss (participation
   rule), and nothing else. Sinks: a large Village-pool contribution value, trophy decor later. It
   crafts nothing combat-relevant. (Scaled shard/core payouts were rejected: deeper-runs-as-best-farm
   inflates the authored Sword/Forgebrand loops; the ranking itself is the reward.)

5. **The Depth Record rides the existing loot write.** The RPC that pays a Stage's participation
   loot also records the Descent's Depth + roster and upserts each participant's personal best —
   credit is **exactly the participation-loot set** (no second bookkeeping; "present without
   hitting earns nothing" extends to the ranking). Records are per-World (`p_world`, ADR-0014),
   append/upsert-only, never pruned (the board displays a top slice). This is the first schema
   change since 0010: **migration 0011** (records table + widened loot RPC); MockBackend mirrors it
   in localStorage. Client-authoritative like everything else (ADR-0005) — a trusted friend could
   fake a record; accepted, same trust model as the crate.

6. **Displayed at the Grand Monument; teased at the Hall.** The Monument — until now the game's one
   interaction-less Building — becomes the record stone: interact opens the board (Deepest Descents:
   Depth/roster/date; By Player: personal bests). The Hall panel gains a one-line current-record
   teaser so the Record is visible before Town (tier 4). Records accrue from the first Descent
   regardless of whether the Monument stands. **Ethos note:** this is the game's first individual
   display — allowed because it is pure prestige (no power, no gating); the collective-only rule for
   Seal/Village *contributions* is untouched, and the Descent (party of 1..n) stays the unit of
   record so solo and group feats rank on the same board.

## Consequences

- `Stage = 1 | 2` and the `STAGES` record generalize to a number + `stageDefFor(depth)` (authored
  defs for 1–2, generated past that). `content/dungeon.ts` stays pure data + pure functions,
  node-importable, no browser globals.
- The descent `start` message's stage marker widens from a two-value flag to the Depth number — no
  new message types.
- "The Forgeborn ends the whole descent" (ADR-0011) is retired; no boss ends the Descent — only
  wipe, leaving, or declining the door.
- Migration 0011 must ship **before** the client that writes records (live DB rejects unknown RPC
  shapes); deploy order matters for the first time since multi-world.
- Verification: `npm run build` green is necessary; the descent netcode at Depth ≥ 3, the record
  write, and the Monument board need a manual multiplayer playtest.
