# Multi-tile Buildings, footprint-claim, and free dismantle (Structures are no longer permanent)

Structures were 1-tile, placed **permanently**, first-claim-on-a-tile-wins, with **no removal**. In
play that made most craftable decor feel like purposeless, un-fixable clutter, and gave no sense of
"building a village" — a misplaced statue was junk forever. The designer wants buildings substantial
enough to *read* as buildings, a system that takes future building types, and the freedom to
rearrange. Rather than bolt mechanical buffs onto decor (which would reverse the one-buff rule — see
Considered Options), we generalize the structure model itself.

## Decision

1. **Per-structure footprints.** A Structure gains a footprint (w×h). A **Building** is ≥2×2 (hut,
   workshop, house — the makings of a village); a **Prop** stays 1×1 (torch, signpost, statue,
   campfire). Footprints are data-driven so **future Buildings drop in without engine changes**.
2. **Footprint-claim.** Placement requires **every** footprint tile free and unclaimed; the conflict
   rule *"first placement on a tile wins"* becomes *"first placement on the **footprint** wins."*
   Collision bodies span the whole footprint. The stored anchor is the footprint's **top-left** tile
   and it grows **+x/+y** — the persisted/DB/server model. **Aiming is separate from storage:** the
   *facing* placement flow (`footprintAnchor`) positions the whole footprint **directly ahead of the
   Player in the faced direction** — adjacent, centred on the perpendicular axis, never on the
   Player's own tile — instead of spilling down-right. A 1×1 Prop reduces to the single faced tile
   (unchanged). Drag-to-place (no live ghost) keeps the cursor tile as the top-left corner.
3. **Free dismantle, no ownership.** **Any** Player may dismantle **any** Structure (matching the
   lock-free crate), reclaiming its **full** crafting cost **to the dismantler**; server-ordered.
   Structures are **no longer permanent** — a misplacement is undoable.
4. **v1 scope.** Build the **footprint system** + seed **one real Building** (a hut/house) to prove
   the village feel; do **not** mass-convert existing structures — they migrate as 1×1 Props.
   Terminology **Building/Prop** is promoted in CONTEXT (reversing the old *"Avoid: building"*).

## Considered Options

- **Give decor mechanical function / buffs** — rejected: reverses the one-buff rule (cooked fish is
  *"the game's first and only buff"*; a tiki-statue aura buff was already considered and rejected). A
  Building's meaning is **expression**, not stats.
- **Uniform 2×2 for everything** — rejected: a 2×2 torch or signpost looks absurd; size is
  per-structure.
- **Placer-only dismantle / structure ownership** — rejected: introduces ownership the game avoids
  everywhere else (the crate has no locks) and orphans a build when its author is offline.
- **Partial or no refund** — rejected in favour of full: rearranging must be frictionless for the
  village to feel sculptable. The resource sink lives in tools/weapons/summons/tier-2, not in
  permanent structures.
- **Keep structures permanent** — rejected: permanence is precisely why misplaced decor reads as
  junk. Undo is the feature.

## Consequences

- **Backend Structure model gains a footprint (w×h);** placement/first-wins and collision generalize
  from a tile to a region. Existing structures migrate as 1×1 Props (no data loss).
- **The village needs space** — this leans directly on a **bigger World** (#13), now load-bearing.
- **Accepted risk:** a trusted friend can dismantle another's build for the refund — the *same*
  lock-free trust as the crate, so it's consistent rather than a new hole. Optional friction: a
  confirm-prompt when dismantling a Building someone else placed (no ownership system, just a speed
  bump).
- **Structures stop being a permanent resource sink** (full refund) — intended; it encourages
  building and rebuilding.
- **CONTEXT revised:** Structure term (Building/Prop), the conflict rule (footprint-claim), and
  "no longer permanent."
- **Placement feedback:** the ghost paints each footprint tile green (clear) / red (blocked) and a
  refused build names the blocking Resource Node — a multi-tile footprint over small bush/stump nodes
  otherwise reads as "open ground won't build" (see the placement-feedback change).
