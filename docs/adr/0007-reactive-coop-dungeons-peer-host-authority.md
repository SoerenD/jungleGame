# Reactive co-op dungeons on peer host-authority (v1: no migration)

The game wants combat beyond the single Guardian — farmable, weapon-variety-driven fights with
**reactive** mobs (they chase), a WoW-style end boss, always co-op and player-scaled. Reactive AI
needs continuous simulation and an authority to run it, but ADR-0001 forbids a dedicated game server
and the World persists with nobody online — "who simulates the roaming mob when the last player logs
off?" has no answer. The resolution is to put that combat in **ephemeral, instanced Dungeons** that
only exist while a party is inside, and to make **one player's client the authority** for the run.

## Decision

1. **Dungeons are ephemeral, instanced, opt-in.** A fixed World entrance (a mine/cave mouth) leads
   into a space that exists **only while a party is inside**, resets on each run, and touches the
   persistent World/DB only for the **loot** it grants. This is the first non-persistent,
   non-peaceful space in the game; the open World stays peaceful.

2. **Peer host-authority, not a server.** For each run, **one player's client is the host**: it runs
   all mob AI every frame, **owns mob HP in memory** (never a DB row — no write storms), consumes the
   other players' broadcast positions as AI targets, and adjudicates both player→mob and mob→player
   hits. This extends ADR-0005 (each client is authoritative for its own player) to "the host is
   authoritative for the instance's mobs," and **keeps ADR-0001 intact — a *peer* is the authority,
   not a server.** Transport is the existing Supabase Realtime channel.

3. **Reactivity is scoped to Dungeons.** Inside a Dungeon, mobs chase, aim and react. Everywhere
   else — the open World and the Guardian — *"nothing reacts"* still holds (ADR-0002 governs them
   unchanged). This ADR reverses "never reacts" **only within Dungeon walls.**

4. **Roster locks at the entrance; difficulty scales to headcount.** Like the Ward fixes the Guardian
   roster, a Dungeon's roster is fixed when the party enters (no late join). **Mob count and HP scale
   with headcount while per-mob danger stays ~constant**, so per-person tension is flat across group
   sizes (the `HP_PER_HEAD` philosophy).

5. **Harm reuses knockdown → Exhaustion; no player HP, no death.** Mob attacks knock players down;
   three knockdowns → Exhaustion (out of the run). A full-party wipe ends the run. The gentle
   "nothing kills you" pillar is preserved.

6. **v1 has no host migration.** If the host leaves or disconnects mid-run, the mobs' brain vanishes
   and **the run ends** — the party is booted back to the entrance with no loot. Host migration
   (snapshot mob state, hand authority to another present player) is the single hardest engineering
   item here and is **deferred to v2**, to be built only if v1 proves fun and the netcode holds.

## Considered Options

- **Roaming mobs in the persistent open World** — rejected: no authority can own them while the
  World persists unattended; would force a dedicated server, reversing ADR-0001 and the peaceful-
  overworld thesis. Instancing dissolves the "who simulates when empty" problem entirely.
- **Deterministic, non-reactive mobs** (Guardian-style, pure function of `enteredAt + elapsed`, no
  authority needed) — rejected by the designer: the target feel is mobs that *chase*, which is
  inherently reactive and cannot be a pure function of time.
- **Solo instances** (each player's client sims their own private dungeon — zero netcode) — rejected:
  kills the co-op that is the game's whole point.
- **DB-persisted mob HP / server-adjudicated hits** (like the Guardian) — rejected for transient mob
  combat: per-frame writes for many mobs would storm the DB; ephemeral host-owned HP is cheaper and
  fits the instance's lifetime. Only end-of-run loot persists.
- **Host migration in v1** — deferred: correct long-term but the hardest piece; shipping "host-leave
  ends the run" first de-risks the fun/netcode question for a fraction of the code.

## Consequences

- **The host's latency and CPU become the party's.** A laggy host means laggy mobs for everyone.
  Accepted as the price of serverless reactive co-op.
- **Host-leave ends the run in v1** — a real, visible rough edge, deliberately chosen over the
  complexity of migration. It is known v2 debt.
- **A spatial index (the #7 concern) is now load-bearing**, twice: the host uses it to resolve
  mob↔player targeting/collision/hits efficiently, and to broadcast only nearby/changed mobs so the
  Realtime channel stays under its message cap (cf. `POS_BROADCAST_MS` and the presence limits).
- **New glossary term: Dungeon** (added to CONTEXT). The lesser mobs and the entrance still need
  names (a designer choice) that don't dilute *"the World has no enemies"* — they live only in
  Dungeons.
- **Open v1 design, not decided here:** where the entrance sits in the progression ladder and what
  gates it; what mobs/boss drop and which "dedicated weapons" that loot unlocks (the #2/#4 payoff).
  Note this may introduce the **first pure-combat items** — weapons with no gathering use — breaking
  the current "every Tool also harvests" pattern.
- **CLAUDE.md drift:** its "exactly one opt-in encounter (the Guardian)" line is now stale; left for
  a separate lean-CLAUDE.md pass rather than edited here.
