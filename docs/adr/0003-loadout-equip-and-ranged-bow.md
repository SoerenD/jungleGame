# Players equip Tools in a Loadout, and a Bow strikes the Guardian at range

v4 reverses two things v2 wrote down: CONTEXT.md's "no weapons, no equip system" and the
plain reading of ADR-0002 ("never on what Players do"). We decided a **Tool now acts only while
it is the in-hand item of a three-slot Loadout** (keys 1–3 switch which slot is in-hand; only
that Tool works and it renders above every avatar, synced like position). Gathering bonuses and
gated-Node tool requirements now check the in-hand Tool, not mere inventory ownership — though
bare hands still harvest the basic Nodes so a new Player is never locked out. We also added a
**Bow**: a tier-1 Tool (crafted from basic Resources — no Guardian drops) that hits the Guardian
from range for 2 damage, **only during an Eye Window**, on a slower cadence than melee and with no
ammo. Because it needs no Guardian drops it is craftable before the first fight and can help kill
the first Guardian. The Guardian is the Bow's only target — the World stays enemy-free.

This is deliberately scoped to leave ADR-0002's real guarantee intact. The Guardian's schedule —
waves, telegraphed lunges, fury phases, Eye Windows — is still a pure function of `summonedAt +
elapsed`; the Guardian still never chases, aims, or reacts. The equip/ranged layer changes only
**how a Player delivers the same windowed damage** (which Tool, from how far), never how the
Guardian behaves. Damage always depended on Player hits (that was true in v2); what is new is
the *delivery*, not the schedule. The server keeps adjudicating: each hit RPC now carries the
Tool the client struck with, and the server honours it only as far as the Player owns that Tool
and the Eye Window is open at server time.

## Considered Options

- **Cosmetic-only equip slot** (show the held item, torch light, no combat change) — rejected:
  it leaves a crafted Bow with no purpose, since the World has no other target.
- **Bow as a true ranged upgrade with no downside** (infinite, full melee cadence, equal or
  greater damage) — rejected: it makes standing in the danger tiles pointless and guts the fight's
  risk/reward. The Bow IS available early (tier-1, basic-resource recipe, usable on the first
  fight — this was a deliberate later decision), so tier gating is NOT the mitigation. Instead the
  risk/reward is preserved by (a) buffing melee to out-damage the Bow per hit — 2 bare / 3 with an
  in-hand axe or pickaxe vs. the Bow's flat 2, (b) a slower Bow cadence (~500 ms vs. melee's 300),
  and (c) retuning `GUARDIAN_MAX_HP` upward (~1.5×, 1500 → 2250) so the safe-slow Bow is a longer
  grind than risky-fast melee. Risky melee still out-DPSes safe range.
- **Huntable animals to justify the Bow** — rejected: creature AI, spawns, and drops are a large
  new subsystem that contradicts the "nothing attacks you / no enemies" identity.
- **Arrow ammo economy** — rejected by the group in favour of a self-contained Bow; the arrow is
  the shot's motion, not a carried Resource.
- **Persisting the whole Loadout on the server** — rejected as unnecessary: the slot arrangement
  is a client preference (like inventory ordering); only the currently in-hand item needs to
  cross the wire, for the overhead visual and for hit adjudication.

## Consequences

- The `Backend` interface changes: `hitNode` and `hitGuardian` take the in-hand Tool, and
  `PlayerPos` / `sendPosition` carry a `held` item. A SupabaseBackend must validate the claimed
  Tool against ownership server-side; the client value is never trusted blind.
- The Bow is craftable from the start (tier-1, no Guardian drops), so ranged fighting is available
  even for the first fight — it is NOT a post-victory reward. Melee stays the higher-DPS choice
  because it hits harder per swing (2 bare / 3 with an in-hand axe or pickaxe vs. the Bow's flat 2)
  on a faster cadence, while the Bow trades that DPS for staying clear of the danger tiles. With
  `GUARDIAN_MAX_HP` retuned upward (~1.5×, 1500 → 2250), a pure-bow group is too slow to solo-clear
  the first Guardian — the Bow is a safe support/mixed-group weapon, and both routes are real
  choices from the very first fight.
- Night is darker for Players without a Hand Torch in-hand (the old automatic player-glow is
  gone). This is the intended incentive to craft and hold one; the night overlay never goes fully
  black and campfires/braziers still light fixed spots.
- `src/content/guardian.ts` must stay node-importable: `guardianDamage` receives the in-hand Tool
  as an argument rather than reading config or inventory globally. It now returns 2 for bare hands
  or the Bow, and 3 for an in-hand axe/pickaxe (a flat +1 for the matching Tool — NOT a doubling,
  which diverges from Resource Node damage). `GUARDIAN_MAX_HP` (2250) lives in `config.ts`, never
  in the node-importable `guardian.ts`.
- The peaceful open world is unchanged — the equip system gates gathering and lights the Player,
  and the only weapon in the game can be pointed at exactly one creature that must first be
  summoned by choice.
