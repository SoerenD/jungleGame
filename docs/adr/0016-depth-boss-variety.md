# ADR-0016 — Depth boss variety: five kits, rolled seeded per Depth

## Status

Accepted, 2026-07-09. Extends ADR-0015 (endless Depths); supersedes its "the
generated Depths only recycle the two authored boss kits" simplification.

## Context

Playtesting the endless Depths (ADR-0015) showed the generated floors changing
their colors but not their FIGHT: every Depth boss was one of the same two
kits (Deep Guardian lunge+volley, Forgeborn + eruption) re-tinted, so descents
turned samey within a few floors. The player asked for real variety — different
attack patterns AND different artwork — mixed "at random", but with ADR-0015's
determinism kept: the same Depth must roll the same boss everywhere, forever.

## Decision

1. **Five new boss kits**, each a small branch over the SAME state machine and
   MobEvent vocabulary in `src/content/dungeon.ts` (never a second engine, per
   ADR-0007; every wind-up honours the ADR-0015 telegraph floor, all mob and
   dash speeds stay below Player speed):
   - **the Ram** — locks a telegraphed charge lane THROUGH you and dashes it
     (the melee machine with a long strike); crowding it answers with a
     point-blank slam ring (the erupt fields).
   - **the Warden** — a hovering caster: kites a firing pocket, telegraphed
     3-shot fans (4 in deep fury), and a paced signature WALL — seven slow wide
     shots, a curtain with gaps. Never melees.
   - **the Whirlwind** — tucks its blades (long wind-up), then SPINS: a moving
     knockdown zone that drifts after you slower than you run, then a long
     dizzy recover — the punish window.
   - **the Bulwark** — guards behind its rune slab: hits BOUNCE (`applyMobHit`
     deals 0 while `MobState.guard`) as it walks you down; the guard drops on a
     cycle into a counter-slam ring, then a long exposed recover.
   - **the Broodmother** — rooted; on a cycle her cage bursts (a small
     shockwave + a `summon` MobEvent the HOST turns into two chaser-Husk adds,
     capped at `DEPTH_MOB_CAP`), and she claws anyone hugging her.
2. **Seeded per-Depth roll.** `themeFor(depth)` picks from the seven-kit pool
   (the two authored kits + the five above) via the same depth-seeded PRNG as
   the layouts — mixed like a random roll, but a pure function of the Depth
   number: no seed on the wire, guests derive the identical boss.
3. **Distinct silhouettes.** Each kit has its own code-drawn sprite in
   `src/mobSprites.ts` (house style: 3-frame sheet, one emissive feature,
   telegraph pose), shaped so the mechanic reads from the doorway: the ram's
   anvil plate, the warden's orbiting orbs, the whirlwind's out-then-tucked
   blades, the bulwark's rune slab, the broodmother's glowing rib-cage. All
   wear the neutral obsidian-violet palette so the per-Depth HSL tint keeps
   re-dressing them (a Depth-7 and Depth-12 Warden look like kin, not clones).
4. **Wire cost: one optional flag.** `MobSnap.guard` rides the existing snap so
   peers render the Bulwark's guard ring; the Broodmother's adds arrive through
   the ordinary authoritative snapshot. Nothing else changes on the wire, and
   nothing touches the DB (mob state stays host-memory, ADR-0007).
5. **Boss HP stays on the ONE monotone per-Depth curve** (ADR-0015): the kit
   changes moves and looks, never the wall's height. Depth Sigil loot is
   unchanged — one per boss, kill-count-independent, so the Broodmother's adds
   pay nothing extra.

## Consequences

- Depth N's boss is fixed content, like its palette and name — players can
  strategize ("Depth 7 is the Bulwark — bring patience").
- The Guardian (ADR-0002) is untouched: it stays deterministic-scheduled;
  Dungeon bosses stay reactive (ADR-0007's split).
- The verify harness (node-side) asserts: seven-kit membership, per-Depth
  determinism, all-kits coverage in Depths 3–40, and the speed/telegraph caps
  across kits.
- Multiplayer behaviour (guard ring on guests, adds arriving via snap) still
  needs the standing two-browser playtest, like every Dungeon change.
