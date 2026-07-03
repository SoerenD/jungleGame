# Guardian encounter runs on a deterministic schedule — still no game server

v2 adds the Guardian: a summonable combat-lite encounter at the Ruins, whose drops gate tier-2
tools. ADR-0001 rules out an authoritative tick loop, and a boss that moves, chases, and reacts
would need one. We decided the Guardian is **stationary and fully deterministic**: it is anchored
to its arena, its attack pattern (telegraphed danger zones on arena tiles) is a pure function of
`summonedAt + elapsed time`, so every client computes the identical schedule locally with no
server simulation. Player damage against it goes through the same server-ordered RPC pattern as
Resource Nodes (shared HP row; loot is participation-based — every Player with ≥1 hit gets the
full drop set). Being caught in a danger zone knocks a Player down for ~5 seconds (stun only,
no item loss); the third knockdown within one fight causes Exhaustion — the Player wakes at the
World spawn with inventory intact and may run back. It never kills, preserving the no-death rule.

## Considered Options

- Dedicated authoritative server with a real boss AI (chasing, targeting, reactive phases) —
  rejected: the exact cost ADR-0001 avoided, and it changes the game's peaceful identity more
  than the group wants.
- Fully peaceful community mega-goal instead of any fight — rejected as the *only* mechanic:
  the group explicitly wants something to prepare for and face together; kept as a companion
  mechanic (community-wide goals) rather than a replacement.
- Host-client simulation (one player's browser simulates the boss) — rejected: fragile on
  disconnect, trivially cheatable, and violates "the server orders all World mutations."

## Consequences

- The Guardian can never chase, aim at a specific Player, or react to what Players do.
  All encounter difficulty must come from pre-authored patterns (rotating zones, rhythm,
  arena layout), not adaptivity. Designers must treat it like a bullet-pattern puzzle,
  not an AI.
- Clock skew between clients shifts where each client *renders* the danger zones in time;
  hits/knockdowns must therefore be validated against server time, not client time.
- If a future encounter genuinely needs reactive behaviour, ADR-0001 and this ADR must be
  revisited together (dedicated server).

## Amendment (2026-07-03)

"Stationary" is refined, not overturned: the Guardian may **move on the authored schedule**
(telegraphed lunges to pre-determined arena spots) because scripted movement is still a pure
function of `summonedAt + elapsed time` — every client and the server derive identical positions.
The prohibition that matters is unchanged: the Guardian never chases, aims, or reacts to Players.
The same reasoning covers fury phases and Eye Windows, which key on elapsed time only (never HP,
which would require server-side history to re-derive the schedule).

## Amendment (2026-07-03, #2 — clock re-anchored to the first strike; see ADR-0004)

The schedule's **origin moves from `summonedAt` to `engagedAt`** (the server timestamp of the first
landed hit). The invariant is unchanged in substance: the schedule is still a pure function of a
*single* server timestamp + elapsed, re-derived identically by every client and the server. What
changes is only *which* timestamp. Summoning now wakes the Guardian into a harmless **dormant**
state (arena open, no danger zones, no Eye Windows) until the first strike; the first strike sets
`engagedAt`, and wave 0 is the leap-to-entrance that slams the **Ward** shut. This one-time
dormant→engaged transition is the *only* thing the Guardian ever does in response to a Player — and
it is a discrete, server-ordered world event (like the summon itself), not the reactive, aiming,
chasing AI this ADR forbids *during* the fight. The prohibition on HP-keyed or per-Player-adaptive
schedule behaviour is otherwise untouched. Full reasoning, plus the roster-scaled HP and hard
Exhaustion that ship alongside it, live in ADR-0004.
