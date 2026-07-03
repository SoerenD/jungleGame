# Jungle World

A pixel-art multiplayer browser game: one persistent jungle world that a group of friends
inhabits together — gathering resources, crafting, and building. The base world is peaceful
(no hunger, no player death, nothing attacks you in the open world). v2 adds exactly one
opt-in combat-lite encounter: the Guardian at the Ruins.

## Language

**World**:
The single persistent jungle map shared by all players; it lives on the backend and survives everyone logging off.
_Avoid_: map, level, room, session

**Player**:
A friend's avatar in the World, present only while they are connected.
_Avoid_: user, character, account

**Zone**:
A named, distinct region of the World (e.g. river delta, waterfall, ruins, swamp) that gives exploration its identity.
_Avoid_: biome, area, chunk (chunk is a loading concept, not a place)

**Resource**:
A raw material gathered from the World (e.g. wood, stone, fiber, fruit), or refined from other Resources at a refining Structure (e.g. planks from wood at a Sawmill). Refined Resources live in the inventory like any other.
_Avoid_: material, loot

**Resource Node**:
A fixed spot in the World (tree, rock, bush) that yields Resources when harvested and regrows after a real-time delay.
_Avoid_: spawner, drop point

**Recipe**:
A rule that converts Resources into a Tool or a Structure.
_Avoid_: blueprint, formula

**Tool**:
A crafted item a Player carries that improves or unlocks gathering (e.g. axe, machete).
_Avoid_: equipment, gear

**Structure**:
A crafted object placed permanently into the World (e.g. campfire, hut wall, bridge, torch).
_Avoid_: building, placeable, prop

**Offering**:
Resources given at an altar to trigger a World event (opening the vine gate, summoning the Guardian).
_Avoid_: sacrifice, payment

**Seal**:
The communal barrier on the Guardian's arena at the Ruins. It is broken once, forever, by pooled Offerings from all Players (with visible progress at the Ruins) — the World's first great shared goal, told to every new Player by the intro story.
_Avoid_: unlock, milestone, battle pass

**Guardian**:
A colossal creature slumbering at the Ruins — the only thing in the World that can be fought. Players summon it with Offerings, it never leaves its arena, and being caught by it knocks a Player down for a few seconds — no item loss, never death. Its drops unlock the next tier of Tools. It fights on a fully authored schedule (ADR-0002): tile-slam waves, telegraphed lunges to new arena spots, and three fury phases keyed on elapsed awake time — never on what Players do.
_Avoid_: boss, monster, enemy (the World has no enemies; the Guardian is summoned by choice)

**Eye Window**:
The Guardian's only vulnerability: its amber eye opens for a short window after each slam (shorter in later fury phases). Hits land only while the eye is open — outside a window they bounce off harmlessly. Skill in the fight is dodging and positioning, not key-mashing.
_Avoid_: weak point phase, DPS window

**Avatar**:
The visual appearance of a Player: a blocky, big-headed pixel sprite composed from four color choices (skin, hair, shirt, pants), each picked from a curated palette. Chosen at first join, editable at every join, and visible to all Players.
_Avoid_: skin, character model

**Journey**:
The per-Player onboarding checklist: sequential objectives from first wood to the first Seal Offering, shown in a small HUD tracker until complete. Steps auto-complete from what a Player has already done. Accompanied by contextual key hints that retire after a few uses.
_Avoid_: quest log, tutorial, achievements

**Exhaustion**:
What happens instead of death: a Player knocked down 3 times within a single Guardian fight collapses and wakes at the World spawn — or at their Hammock, if they have placed one — inventory fully intact. Hits already landed still count for participation loot, and running back to rejoin the fight is allowed — the run is the penalty.
_Avoid_: death, dying, respawn (nothing in the World kills)

**Hammock**:
A craftable Structure that sets its builder's personal wake point: Exhaustion and login place that Player at their Hammock instead of the World spawn. One active Hammock per Player.
_Avoid_: bed, spawn point, home

## Relationships

- The **World** is a single fixed, authored map of ~200×200 tiles, divided into **Zones**.
- The **World** is mutated by **Players** (gathering, building); mutations persist forever.
- A **Player** joins and leaves the **World** freely; the **World** does not depend on any Player being online.
- A **Player** is identified by a unique name and reclaimed on any device with a PIN; entry to the World is guarded by a shared invite link. (Accepted risk: weak security, fine for a trusted friend group.)
- The World supports up to ~8 concurrent **Players**.
- **Players** harvest **Resource Nodes**; a harvested Node regrows after a real-time delay — the jungle always heals, but is locally scarce in the moment.
- **Recipes** convert **Resources** into **Tools** (carried) or **Structures** (placed into the World).
- Conflict rule: the server orders all World mutations — the finishing hit on a **Resource Node** gets the yield; the first **Structure** placement on a tile wins.
- Exception to the finishing-hit rule: the **Guardian** uses participation loot — every **Player** who landed at least one hit during the fight receives the full drop set. Being present without hitting earns nothing. This makes fighting the Guardian at least once a rite of passage no Player can skip into tier 2.
- The **Guardian** stays awake for a fixed window (~5 minutes from summon). If not slain in time it returns to slumber with full HP and the summoning totem is consumed — the fight is a DPS-and-dodging check that more friends and better **Tools** make winnable.
- Guardian damage rule: hits land only during an **Eye Window**; a landing hit deals 1 damage, and owning the matching **Tool** (axe or pickaxe) doubles it — the same bonus-tool rule as **Resource Nodes**. Hits outside a window deal 0. No weapons, no equip system. (Guardian HP must be tuned for windowed uptime, not constant DPS.)
- The **Guardian**'s fight escalates through three fury phases (calm → restless → fury) at fixed elapsed-time thresholds: waves come faster and denser, **Eye Windows** shorten, lunges grow more frequent. Phases key on time, never HP — the server must be able to re-derive the whole schedule from `summonedAt` alone (ADR-0002).
- The **Guardian** relocates via telegraphed lunges on its authored schedule: a landing marker glows, then it crashes down — the landing area knocks down like any danger tile. It moves, but never chases.
- Holding the interact key repeats swings at a fixed cadence for harvesting **Resource Nodes** and fighting the **Guardian**; one-shot interactions (reading, offering, placing, reeling) stay single-press. Mashing is never better than holding.
- The **Guardian**'s arena is closed by the **Seal** until the community breaks it; afterwards the Guardian is summoned cheaply (crafted summoning totem as **Offering**), repeatably, and never chases beyond its arena.
- The **Seal** demands fixed per-resource quotas (wood, stone, fiber, fruit — Stardew-bundle style, four visible progress bars), sized so the whole group needs roughly two weeks of casual evenings. Progress is collective only — no individual contribution tracking, ever.
- Every new **Player** sees the intro story once on first join: it names the goal (break the **Seal**, face the **Guardian**, master the jungle's locked riches). It is skippable and re-readable at the Welcome Stone beside the spawn. Defeating it yields Resources that exist nowhere else, which gate tier-2 **Tools**/**Recipes**.
- A knocked-down **Player** is stunned ~5 seconds, then gets back up where they fell — there is no death anywhere in the World. Three knockdowns in one fight cause **Exhaustion** (wake at spawn, nothing lost).
- Two tier-2 **Resource Node** types (ancient hardwood tree, obsidian rock) are visible in the World from day one, but no tier-1 **Tool** can harvest them — they taunt. Tier-2 **Tools** require Guardian drops in their **Recipes**.
- Fishing is a tier-2 activity: the fishing rod is a **Recipe** requiring Guardian drops. Fishing Spots are ordinary **Resource Nodes** on water tiles (cast = harvest hit, deplete, regrow); fish is a **Resource**. The bite-wait-click rhythm is client-side flavor, not a new server concept.
- Cooking: fish can be cooked at any campfire **Structure** (giving campfires their function). Eating a cooked fish grants ~+20% move speed for ~3 minutes — the game's first and only buff. Future fish species/collections are a noted extension, not in scope now. (Reaffirmed 2026-07: a tiki-statue aura buff was considered and rejected — the one-buff rule stands.)
- Functional **Structures**: the crate is shared storage (open with interact → deposit/withdraw from a per-crate inventory; no locks, no ownership — trusted friends); the signpost holds a short line of Player-written text; the **Hammock** sets a personal wake point; the Sawmill refines wood into planks after a real-time delay (same lazy-timestamp pattern as **Resource Node** regrowth — no tick loop).
- The Sawmill is tier-1 (wood + stone + hammer to craft). Planks are consumed by the new **Structures** (Hammock, signpost, plank decor) and by tier-2 **Recipes**, which use planks wherever tier-1 used raw wood — the Sawmill is a prerequisite for tier-2 crafting, deepening the Seal → Guardian → tier-2 chain.
- Every **Player** composes their **Avatar** at join from curated palettes; the choice syncs through the backend so all Players render the same look. No free color picking — curated swatches keep the World's pixel art coherent.
- The **Journey** ends at the first Seal **Offering** — onboarding hands every new Player directly to the World's shared goal. Existing Players get steps auto-completed from their current state.

## Example dialogue

> **Dev:** "If every **Player** logs off, do we tear the **World** down?"
> **Domain expert:** "No — the **World** keeps existing on the backend. When a **Player** returns, everything anyone ever built is still there."

## Flagged ambiguities

- "isometric" was used to mean the angled lush look — resolved: the game is **3/4 top-down** (square tile grid, art drawn with fake depth, Stardew-style), not true diamond-grid isometric.
