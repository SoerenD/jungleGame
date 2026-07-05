# Frontier expansion: a bigger World by far-edge growth, reward-gradient zones, and faux-elevation hills

The World was 200×200, authored in code (zone rectangles + per-zone densities + hand-placed
landmarks), and it is a **live** Supabase world with player builds. The designer wants more to
explore (#13, choice A). Two traps: (1) growing the map *symmetrically* would shift every stored
structure `(tx,ty)` and every sequential node id, **breaking live builds**; (2) a bigger *empty* map
is strictly worse than a small one. So the expansion is deliberate on both axes, and the map is
**right-sized to the content** rather than the reverse.

## Decision

1. **Far-edge expansion, origin pinned.** `MAP_W`/`MAP_H` 200 → **300**. The existing 200×200 stays
   exactly where it is (spawn, all builds, and node ids unchanged — **no save migration**); the new
   space is an **L-shaped frontier** added to the **east + south**. Existing generation is untouched;
   frontier zones/landmarks are **appended** after it with no RNG reorder, matching the generator's
   existing byte-stability discipline.
2. **Reward-gradient.** Near-spawn stays dense/safe/social; the frontier is sparser, but **every
   named frontier Zone carries a payoff** — a tier-2 grove, treasure, a lore tablet, or a Delve
   entrance. Distance trades boredom-risk for reward; **no named Zone is just terrain.**
3. **Frontier zone set (v1):** **Highland Crags** (hill + 3rd quarry + vista), **Overgrown Temple**
   (tier-2 obsidian/hardwood grove + lore), **Mangrove Coast** (fishing + shipwreck treasure), **The
   Cavern Mouth** (a Delve entrance + room for future dungeon entrances). Size these **generously
   (~6–9k tiles each)** and let the **connective Deep Jungle between them carry ambient nodes + a few
   scattered POIs** so crossing it is travel, not void. Exact densities and tile placements are
   implementation tuning.
4. **Faux-elevation primitive + one hill.** The grid is flat (no Z-axis; depth is `setDepth(baseY)`).
   A hill is faked Stardew-style: **cliff-edge** tiles (collision, drawn as a downward face), a
   **ramp** (the only ascent), a **raised walkable plateau** (rendered with an upward offset), and a
   **base shadow**. An **elevation-aware depth bump** makes a Player on the plateau draw *above* one
   at the base. Built as a **small reusable primitive** (cliff / ramp / high-ground tile types + the
   depth fix), first and only deployed as the Highland Crags hill; future hills / a layered Delve
   drop in as data. This **extends** CONTEXT's documented "fake depth, Stardew-style" identity, not
   fights it. (The same raised-surface art vocabulary is what will make any future wall/fence read as
   raised rather than as floor.)
5. **Vista reward.** Reaching the plateau top lifts **fog-of-war on the surrounding minimap** — the
   climb pays off.

## Considered Options

- **Symmetric expansion (spawn re-centered)** — rejected: shifts every `(tx,ty)` and node id, breaks
  live builds, needs a risky migration pass. Far-edge growth needs none and *reads* as "the
  frontier."
- **Just raise the dimensions (empty bigger map)** — rejected: violates the reward-gradient; adds
  walking, not play.
- **×2 (400×400)** — rejected: ×4 area (~120k new tiles, *triple* the current map) that four zones
  fill only ~¼, leaving ¾ empty wilderness, and it spreads 8 friends thin. Right-size the map to the
  content: **add zones before stretching the map**, never the reverse.
- **Real Z-axis elevation** — rejected: a massive rewrite of a flat-grid engine; faux-elevation buys
  the feel for art + collision cost only.
- **A one-off hand-drawn hill** — rejected in favour of a reusable primitive (same philosophy as
  multi-tile Buildings, ADR-0008): future hills and Delve depth reuse it.

## Consequences

- **×1.5 linear = ×2.25 area.** The frontier adds ~50k tiles (1.25× the current map). Four
  generously-sized zones fill roughly ½–⅔ of it as named Zones, with living Deep-Jungle connective
  tissue (ambient nodes + scattered POIs) between them — a frontier that's travel-space, not void.
- **Togetherness risk is milder than ×2 but still real.** Keep the core loop (spawn, Seal, Ruins,
  first Delve) clustered in/near the original 200×200, and lean on the minimap/vista to help Players
  regroup; consider fast-travel later if it feels lonely.
- **The elevation primitive is the biggest art + render item** in the frontier: new cliff / ramp /
  high-ground tiles + assets (composed via `tools/compose-*.ts`) + the cross-elevation depth-sort.
- **`generate-map.ts` grows:** `MAP_W`/`MAP_H`, appended frontier zone rects + densities + landmark
  placements + the hill's footprint / ramp / collision. Regenerated `public/map/*.json` **must keep
  existing ids stable.**
- **CONTEXT updated:** World size (~300×300), the frontier + reward-gradient, and the
  elevation/vista concept.
