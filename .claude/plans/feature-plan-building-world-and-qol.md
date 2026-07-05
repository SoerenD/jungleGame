# Feature plan — Buildings, Frontier & QoL batch

**One line:** Seven resolved changes from the design grill — a real building system, a bigger
frontier World with faux-elevation, a communal **Village meta-loop** (the game's missing long-term
progression), and four smaller gameplay/UX fixes.

> ⚠ **What is ALREADY built — do NOT re-implement:** the Guardian combat overhaul (ADR-0006:
> weapon bands/crits/DPS, damage-dealt float, HP 560, `GUARDIAN_DISPLAY_SCALE`) and Dungeons v1 /
> the Delve (ADR-0007: `src/content/dungeon.ts`, Husks, host-authority, `?dungeon`, sword,
> husk_shard/deep_core). Those shipped. This plan is the **next** batch.

> Big-ticket detail lives in **ADR-0008** (Buildings) and **ADR-0009** (Frontier). Domain terms:
> CONTEXT "Structure / Building / Prop", "Zone / frontier", "Dungeon".

**Suggested build order:** **A1 (Buildings) → A3 (Village)** are a dependency chain — the Village is
built *from* Buildings, so A1 first. **A2 (Frontier)** is the biggest standalone effort (map + art +
render). **B1–B4** are small quick wins. Reasonable order: B-items → A1 → A3 → A2 (A2 parallelizable).
**#11 is resolved** — folded into A3 (goals stay implicit; the Village is the shared goal); do NOT
build a quest system.

---

## A1 — Multi-tile Buildings, footprint-claim, free dismantle  (ADR-0008; #8/#9/#12)

**Decisions**
- Structures gain a **footprint (w×h)**, data-driven. A **Building** is ≥2×2; a **Prop** stays 1×1.
  Future Buildings drop in as data.
- **Footprint-claim:** placement needs *every* footprint tile free + unclaimed; the conflict rule
  "first on a tile wins" becomes "first on the **footprint** wins"; collision bodies span the
  footprint.
- **Dismantle:** **any** Player may dismantle **any** Structure (no ownership, like the crate),
  **full refund of the crafting cost to the dismantler**, server-ordered. Structures are no longer
  permanent.
- **v1 scope:** build the **footprint system** + seed **one real Building** (a hut/house); existing
  structures migrate as 1×1 Props — do NOT mass-convert them.
- Optional friction: confirm-prompt when dismantling a Building someone else placed (no ownership
  system, just a speed bump).

**Where:** `addStructure` / `def.blocks` blocker at [GameScene.ts:2072](src/scenes/GameScene.ts:2072);
`canPlaceLocal` [GameScene.ts:2126](src/scenes/GameScene.ts:2126), `placeAtTile`/`doPlace`
[GameScene.ts:2205](src/scenes/GameScene.ts:2205); `placeStructure` + the Structure row in both
backends; `ITEMS` gains a footprint (`src/content/items.ts`); a new `dismantleStructure` backend
method + a client interaction (E or a dismantle mode) that refunds `RECIPES[...].cost`.

**Acceptance**
1. A Building occupies its full ≥2×2 footprint (collision + claim); placement is refused if *any*
   footprint tile is occupied/claimed.
2. Any Player can dismantle any Structure; the dismantler's inventory gains the **full** crafting
   cost; the footprint frees for reuse; the removal syncs to all Players (server-ordered).
3. One seed Building exists and reads as a building (uses the ≥2×2 footprint). Existing structures
   still load as 1×1 Props, unchanged.

---

## A2 — Bigger World: far-edge frontier + faux-elevation  (ADR-0009; #13)

**Decisions**
- `MAP_W`/`MAP_H` **200 → 300** ([config.ts:2](src/config.ts:2)). **Origin pinned** — the existing
  200×200 stays in place (spawn, builds, node ids unchanged, **no save migration**); the new space
  is an **L-shaped frontier** east + south, generation **appended** after existing content (no RNG
  reorder — preserve byte-stable ids, cf. [generate-map.ts:432](tools/generate-map.ts:432)).
- **Reward-gradient:** every *named* frontier Zone carries a payoff; connective **Deep Jungle**
  between them still gets ambient nodes + a few scattered POIs (travel, not void).
- **Frontier zones (v1):** **Highland Crags** (hill + 3rd quarry + vista), **Overgrown Temple**
  (tier-2 obsidian/hardwood grove + lore tablets), **Mangrove Coast** (fishing + shipwreck
  treasure), **The Cavern Mouth** (a Delve entrance + room for future ones). Size ~6–9k tiles each;
  exact densities/placements are tuning.
- **Faux-elevation primitive** (reusable, first-used at Highland Crags): **cliff-edge** tiles
  (collision, drawn as a downward face), a **ramp** (only ascent), a **raised walkable plateau**
  (upward render offset), a **base shadow**, and an **elevation-aware depth bump** so a Player on the
  plateau draws *above* one at the base (plain `setDepth(baseY)` is not enough).
- **Vista reward:** reaching the plateau top lifts **fog-of-war on the surrounding minimap**.

**Where:** `MAP_W`/`MAP_H` in `config.ts`; zones/densities/landmarks in `tools/generate-map.ts`
([zones:281](tools/generate-map.ts:281), density maps ~316+); new cliff/ramp/high-ground tile types
+ collision in the generator; render offset + depth logic + minimap fog in `GameScene.ts`; new tiles
composed via `tools/compose-*.ts`. Regen `public/map/*.json` — **must keep existing ids stable.**

**Acceptance**
1. `npm run genmap` produces a 300×300 map; **all pre-existing structures and node ids are
   unchanged** (a loaded live save shows builds in the same tiles).
2. Each frontier zone has its stated payoff reachable; the Deep-Jungle gaps have ambient resources.
3. The Highland Crags hill reads as *raised*: cliff edges block, the ramp is the only way up, a
   Player on top renders above Players/objects at the base, and a base shadow is present.
4. Reaching the vista lifts minimap fog around the crag.

---

## A3 — The Village: communal meta-loop  (ADR-0010; progression / #11)

**Depends on A1 (Buildings)** — the Village's milestone builds and unlockable building types *are*
Buildings. This is the game's missing long-term progression; big feature, its own build effort.

**Decisions**
- **One communal Village, one collective tier, collective-only** (no individual tracking). The hub
  every activity feeds.
- **Driver:** a permanent, additive contribution **pool** at the **Hall** (accepts a broad set —
  resources, planks, Guardian scales, Delve cores, frontier finds) **+ a milestone build per tier.**
- **Ladder:** ~5 capped tiers **Camp → Hamlet → Village → Town → Capital**, endless decoration within
  each. Each tier unlocks new building types (decor + **non-combat QoL**: Waystone/fast-travel, Grand
  Stockpile, Bell), automatic visual grandeur, a prestige title. **Parallel — gates nothing.** The
  one-buff rule holds (utilities are opt-in Buildings, never stat buffs).
- **Group-founded:** raising the Hall (tier-1 milestone) wherever the group agrees founds the Village
  there (first-claim, server-ordered); zone = a radius around the Hall. Re-foundable; **the tier/pool
  are tile-independent — moving or dismantling the Hall never resets progress.**
- **Hall = communal spawn:** priority **Hammock > Hall > World spawn.** Build-anywhere still allowed;
  only village-zone builds advance the tier.
- **Cozy guardrails:** no decay / no upkeep; optional & ignorable; collective-only forever;
  **months-long** pace, **early-fast/late-grand**, scales to headcount.

**Where:** new persistent **Village** state (tier, pool, Hall location) — one per world,
server-ordered, **tile-independent** — in `src/backend/types.ts` + both backends; the **Hall** as a
special Structure (founding + contribution UI + pool/tier display + spawn anchor); spawn resolution
updated (Hammock > Hall > World spawn); a "what counts" contribution table + tier thresholds (new
content module).

**Acceptance**
1. Raising the Hall founds the Village there; the Hall becomes the group's spawn (unless a Player has
   a Hammock); with no Hall, spawn is the World spawn.
2. Depositing qualifying resources/loot at the Hall raises the shared pool (additive, permanent,
   synced); crossing a threshold **and** completing the tier's milestone build advances the tier for
   everyone.
3. Each tier unlocks its new building types + applies visible grandeur; the Village gates no other
   content.
4. Dismantling or re-founding the Hall **preserves** the tier and pool (tile-independent).
5. No decay: the tier never drops on its own; no individual contribution stats appear anywhere.

**Scope note:** numbers (contribution table, thresholds, pacing) are playtest tuning — DPS-style,
tune after it's playable.

---

## B1 — Left mouse button = alternative fire  (#3)

**Decision:** LMB triggers the same **`swing: true`** action E would (harvest + all combat,
**held-to-repeat** at weapon cadence) — but **not** the one-shot `swing: false` interactions (crate,
read, offer, enter Delve stay E-only). **Must not fire when the click is on the HUD/craft panel** —
scope to Phaser canvas pointer events, not DOM UI clicks.
**Where:** `resolveEAction` [GameScene.ts:1847](src/scenes/GameScene.ts:1847); swing gate
[GameScene.ts:2379](src/scenes/GameScene.ts:2379); add pointerdown/up state beside the existing
`input.on('wheel')` [GameScene.ts:586](src/scenes/GameScene.ts:586).
**Acceptance:** holding LMB over the game harvests/attacks exactly like holding E; LMB does not open
crates/signs/altars; clicking a craft card crafts (does not swing).

## B2 — End the Guardian fight when the arena empties  (#5)

**Decision:** end the **engaged** fight when the arena rect holds **zero live roster members**
(online **and inside the rect**; Exhausted/offline don't count) **continuously for ~5 s** →
**re-slumber, totem spent, no loot** (identical to the timeout path). Evaluate lazily on the events
that drop the count (disconnect, Exhaustion) + the grace timer; a client triggers the idempotent,
server-ordered re-slumber. Also confirm the **all-Exhausted wipe** ends the fight early (if it
currently only waits for the timer, this closes both).
**Where:** re-slumber logic [MockBackend.ts:902](src/backend/MockBackend.ts:902) + the Supabase
equivalent; roster/positions vs the arena rect; both backends.
**Acceptance:** with a fight engaged, once every roster member is offline/Exhausted **or** outside
the arena for ~5 s, the Guardian re-slumbers, the totem is spent, no loot drops, and a fresh summon
is possible. A lone fighter briefly clipping out and returning within the grace window does **not**
end the fight.

## B3 — Remove hut_wall entirely  (#14)

**Decision:** delete `hut_wall` from `RECIPES` ([recipes.ts:35](src/content/recipes.ts:35)),
`ITEMS`, and the `StructureId` union ([items.ts:26](src/content/items.ts:26)). Existing placed walls
**vanish gracefully** — `addStructure` already skips unknown types (the "retired fence" path,
[GameScene.ts:2042](src/scenes/GameScene.ts:2042)). No migration. (A properly-designed fence can
return later via the Building system.)
**Acceptance:** hut_wall is uncraftable and absent from the craft UI; a live world that had walls
loads without error, walls simply gone; `npm run build` passes.

## B4 — Crafting tabs  (#10)

**Decision:** three **tabs** in the craft panel, mapping to the recipe `kind`:
**Tools & Weapons** (`tool`), **Buildings & Props** (`structure`), **Consumables** (`consumable`).
Click-to-switch, **default Tools & Weapons**, **craftable-first ordering within each tab**.
**Where:** `renderRecipes` [hud.ts:976](src/ui/hud.ts:976); craft panel markup
[hud.ts:116](src/ui/hud.ts:116).
**Acceptance:** the panel shows three tabs; each lists only its `kind`; craftable recipes sort ahead
of uncraftable ones; switching tabs works; default open tab is Tools & Weapons.

---

## Scope boundaries — do NOT build

- **Do NOT re-implement** the combat overhaul or Dungeons/Delve — already shipped (ADR-0006/0007).
- **Do NOT** add a quest system / quest log (#11 is unresolved — see below; CONTEXT still says
  *"Avoid: quest log"*).
- **Do NOT** re-center spawn or expand the map symmetrically (breaks live saves) — far-edge only.
- **Do NOT** add a real Z-axis — elevation is faux (art + collision + depth bump).
- **Do NOT** give Structures mechanical buffs (the one-buff rule stands).
- **Do NOT** add structure ownership — dismantle is open to anyone (trusted-friends model).
- **Do NOT** mass-convert existing 1-tile structures to Buildings — they stay Props.

## Constraints & gotchas

- `npm`/`npx` need `--registry https://registry.npmjs.org/`. `npm run build` (`tsc && vite build`)
  is the only automated check — no tests; frontier/elevation/netcode need a manual playtest.
- The World is **live** (Supabase): every map/structure change must preserve existing builds +
  node ids.
- Both `MockBackend` and `SupabaseBackend` need the footprint-claim, dismantle, and end-fight
  changes.

## References
ADR-0008 (Buildings), ADR-0009 (Frontier), ADR-0004 (Ward/roster — end-fight reuses it),
ADR-0001 (no server). CONTEXT: Structure/Building/Prop, Zone/frontier, Exhaustion.

---

## #11 quests vs. implicit goals — RESOLVED (folded into the Village)

Goals stay **implicit** — no quest system, *"Avoid: quest log"* stands. The progression gap behind
#11 is answered by **A3 the Village (ADR-0010)**: it becomes the shared, world-signalled goal (its
grandeur + the Hall's pool display *are* the signpost). **Do NOT build a quest log.** The only
adjacent work worth doing is making existing implicit carrots more *legible* (a taunting tier-2 node
that reads "needs a better tool", the Delve entrance that reads "something's down there").
