# Guardian difficulty: roster-scaled HP behind a Ward, hard Exhaustion, first-strike engage

The Guardian was tuned for a party of 3 (`GUARDIAN_MAX_HP = 2250 ≈ 750 × 3`) but the World supports
~8 concurrent Players, and HP never scaled. A full group melted its HP in the first third of the
5-minute window — often before the *restless* and *fury* phases where the danger lives — so the
encounter felt both **too easy** (dies too fast) and **never dangerous** (over before anyone could be
knocked down). Raising a flat HP number would have locked small groups out instead. We reworked the
difficulty along three coupled axes, none of which touches the authored danger schedule.

## Decision

1. **HP scales per head, no floor.** At the moment the fight begins, Guardian HP is set to
   `HP_PER_HEAD (750) × roster size`, stored on the fight row (it was already a per-fight `maxHp`).
   750 is the old flat 2250 divided by the party of 3 it was validated against, so a 3-party plays
   exactly as before, an 8-party faces the same per-person tension, and a solo summoner faces 750.
   Difficulty per person is therefore roughly constant at every group size. There is deliberately
   **no minimum-roster floor**: pure per-head is the only shape that keeps *every* size a nail-biter,
   and the consequence — a lone, skilled Player *can* clear it — is accepted (see Consequences).

2. **The Ward closes the arena for the fight.** When the Guardian is first struck it leaps to the
   arena entrance and slams a stone barrier shut (~2s). The Ward blocks outsiders and Exhausted
   fighters from entering and drops only at victory or slumber. This fixes the roster so HP scaled
   to N cannot be diluted by latecomers, and removes reinforcements as a way to rescue a losing
   fight. The Ward is distinct from the permanent **Seal** (which is broken once, forever, to reach
   the arena at all); it rises fresh in every fight.

3. **Exhaustion is a hard removal.** Three knockdowns in one fight put a Player *out for the rest of
   that fight* — the Ward bars re-entry. They wake at spawn/Hammock with inventory intact, keep loot
   eligibility for hits already landed, and rejoin only on the next summon. If the whole roster
   exhausts before HP reaches 0, the fight is lost. This is what gives knockdowns weight and creates
   a genuine wipe state; it supersedes the earlier "running back to rejoin is allowed — the run is
   the penalty" rule.

4. **The fight clock re-anchors to the first strike (amends ADR-0002).** Summoning wakes the Guardian
   into a **dormant** state: it roams its arena harmlessly, the Ward down, no danger tiles and no Eye
   Windows, while the group gathers (this dormant window is the natural, open grace period — no one is
   accidentally locked out on the doorstep). The **first landed hit** records one server timestamp,
   `engagedAt`, and the entire danger schedule becomes a pure function of `engagedAt + elapsed`
   instead of `summonedAt + elapsed`. Wave 0 of that schedule *is* the leap-to-entrance + Ward slam
   (the existing lunge system with the wave-0 target forced to the entrance). The awake window
   (~5 min) runs from `engagedAt`. If no one strikes within ~90s of summon, the Guardian re-slumbers
   and the totem is spent.

## Considered Options

- **Raise flat HP to target a real 6–8 group** — rejected: a party of 2–3 could then never win,
  contradicting the design's "a group can prepare for and beat this together" and gating tier-2
  behind an impossible wall for small friend groups.
- **Per-head with a 3-head floor** (solo/duo face 3-player HP → impossible) — a valid alternative we
  discussed and rejected in favour of pure per-head: the floor keeps solo impossible but reintroduces
  "more friends = faster, eventually a faceroll" unless separately capped. Pure per-head makes the
  fight self-balancing at every size and derives "friends help" from *survivability* instead.
- **Ward at the summon instant** (seal the arena the moment the totem is offered) — rejected: it
  locks out a friend standing one tile outside and turns an accidental solo summon into a doomed,
  unavoidable solo fight, with no dramatic beat.
- **Blockade rises on first hit but the Guardian does not move** (keep the schedule anchored to
  `summonedAt`) — rejected: it keeps ADR-0002 untouched but loses the Guardian's dramatic leap to the
  door, and still leaves the timer ticking while players jog over.
- **Soft Exhaustion** (Ward blocks outsiders only; Exhausted roster members run back) — rejected:
  preserves the old wording but leaves knockdowns nearly toothless, which was half the complaint.

## Consequences

- **Solo is possible.** Pure per-head means a lone, near-perfect Player who never reaches Exhaustion
  can clear a 750-HP Guardian. This is accepted as a hardcore feat. It does **not** weaken the tier-2
  gate: that gate is landing ≥1 hit for participation loot, which is unchanged. CONTEXT's "solo stays
  near-impossible" is retired.
- **A real fail state exists.** Because HP is fixed at engage and DPS is not, attrition can turn a win
  into a loss: a group that dodges badly loses fighters faster than it burns HP. Losing the totem on a
  wipe or timeout (no refund) is the stakes.
- **ADR-0002's invariant is preserved but re-anchored.** The schedule is still a pure function of a
  *single* server timestamp + elapsed, re-derivable identically by every client and the server. The
  Guardian still never chases, aims, or reacts *during* the fight. The sole exception is the one-time
  dormant→engaged transition, which is a discrete, server-ordered world event (like summon or the
  Seal breaking), recorded as `engagedAt` — not adaptive AI, and not part of the bullet-pattern.
- **New fight-row state.** `DbFight` gains `engagedAt` (null until the first hit) and `roster:
  string[]`; `maxHp` is computed at engage. `engagedAt` is broadcast so clients re-anchor their local
  clocks. Consistent with ADR-0001: it is one more lazily-read timestamp, no tick loop.
- **The Ward needs collision with per-player permeability** (roster-and-not-exhausted may pass;
  outsiders and Exhausted are blocked) and a slam that knocks down anyone in the doorway.
- **The authored danger numbers are unchanged** (`FURY_PHASES`, `FURY_THRESHOLDS`, Eye/slam/lunge
  timings). The structural changes are expected to restore danger on their own; the schedule is
  retuned only after a real playtest.
