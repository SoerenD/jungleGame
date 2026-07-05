# The Village: a communal, group-founded meta-loop (the "next Seal")

The game had a strong **core loop** (gather / craft / build / fight) and one unforgettable **one-time
shared goal** (the Seal), but **no meta loop** — nothing to pull 8 friends back for *weeks* once the
Seal broke, the Guardian fell, and the Delve was farmed. Progression research is blunt about the gap:
the core loop holds a player for five minutes, the **meta loop** holds them for five months; and for
co-op specifically, **shared, interconnected progression is the #1 retention driver** (the Seal
already proved this hooks the group). Rather than a solo gear treadmill, we build a **shared,
never-finished** progression on top of the Buildings system (ADR-0008): the Village.

## Decision

1. **One communal Village, one collective tier, the hub the whole game feeds.** A single shared
   Village with one development **tier** the group raises together, **collective-only** (no individual
   contribution tracking — like the Seal). It is fed by contributions from **every** activity, so
   gathering, the Guardian, the Delve and the frontier all funnel into one shared project.
2. **Driver = contribution pool + a milestone build per tier.** A central **Hall** accepts a broad
   set of resources and loot (raw resources, planks, **Guardian scales, Delve cores, frontier
   finds**) into an **additive, permanent** communal pool; each tier needs the pool **and** a
   signature **milestone build**. A *pool* (not build-value) because loot must be able to feed it, it
   is cozy-additive and ungameable, and full-refund dismantle (ADR-0008) would otherwise make
   build-value farmable or make rearranging *drop* the tier.
3. **~5 capped tiers, horizontal/QoL rewards, parallel — never gating.** **Camp → Hamlet → Village →
   Town → Capital**, with **endless decoration within each** (never "finished" without an infinite
   treadmill). Each tier-up unlocks **new building types** (decor + **non-combat QoL** buildings — a
   Waystone for fast-travel, a Grand Stockpile, a Bell), **automatic visual grandeur**, and a
   **prestige title**. The Village **never gates** the Guardian / Delve / frontier (those keep their
   own progression); it is a **parallel, optional-but-rewarding** project. The **one-buff rule holds**
   — utilities are non-combat conveniences delivered as opt-in Buildings, never stat buffs.
4. **Group-founded, tile-independent progress, Hall-as-home.** Founding the Hall (the tier-1
   milestone) is done by one player wherever the group agrees (first-claim, server-ordered — no voting
   system for a trusted group); that spot **becomes** the Village (zone = a radius around the Hall).
   The Hall can be **re-founded** elsewhere (deliberate); the tier/pool belong to the **group, never
   the tile**, so moving or dismantling the Hall **never resets progress**. Founding makes the Hall
   the **communal wake/spawn point** — priority **Hammock > Village Hall > World spawn** — so wherever
   the Village is founded becomes *home*, which is what keeps a bigger World (ADR-0009) from spreading
   the group thin. Build-anywhere still holds; only **village-zone** builds advance the tier.
5. **Cozy guardrails.** **No decay / no upkeep** (only grows; permanent, additive); **optional &
   ignorable** (non-coercive — a player can just fish and vibe); **collective-only tracking, ever**
   (no leaderboard); **pacing** is a **months-long meta-loop**, tuned **early-fast, late-grand**, and
   **scales to headcount** (collective quotas → more friends = faster).
6. **The Village *is* the goal signal (resolves #11).** Its automatic grandeur + the Hall's
   pool-progress display make the goal legible at a glance, so goals stay **implicit** (no quest log —
   CONTEXT's stance holds). "Missing progression" and "quests vs. implicit goals" turn out to be the
   same fix: a shared progression axis, signalled through the world.

## Considered Options

- **Individual / per-building progression** — rejected: research + the Seal both say *shared*
  progression retains co-op players; individual tracking cuts against the anti-competitive ethos.
- **Build-value as the driver** — rejected: it can't ingest non-build loot, and full-refund dismantle
  (ADR-0008) makes it farmable or makes rearranging drop the tier. A consumed pool is additive and
  ungameable.
- **Gating content behind Village tier** — rejected: turns an optional joy into a chore, and any stat
  perk reopens the one-buff rule. Parallel-but-rewarding stays cozy.
- **Endless vertical tiers** — rejected: the content-treadmill trap. Capped named tiers + endless
  within-tier decoration gives "never finished" without infinite grind.
- **Spawn-anchored Village** (recommended, overruled) — the designer chose group-founded for
  ownership; the **Hall-as-communal-spawn** rule recovers the togetherness that anchoring at spawn
  would have guaranteed.

## Consequences

- **New persistent shared state:** a Village record (tier, contribution pool, Hall location) — one per
  World, server-ordered, additive, and **independent of any tile** so it survives Hall moves. Both
  backends.
- **The Hall is a special Structure:** founding structure + contribution UI + tier/pool display +
  communal spawn anchor.
- **Spawn resolution gains a tier:** Hammock > Village Hall > World spawn.
- **Depends on ADR-0008 (Buildings)** — build footprints + dismantle first; the milestone builds and
  unlockable building types *are* Buildings.
- **Tuning surface:** a "what counts" contribution table (resources + loot) and tier thresholds tuned
  to a months-long, headcount-scaling, early-fast/late-grand pace. Numbers are playtest work.
- **Ties the whole game into one loop:** go out (gather / fight / delve / explore) → bring back → the
  Village grows → unlocks more to build → the reason to go out again. This *is* the meta-loop the game
  lacked.
- **CONTEXT gains Village + Hall;** the **Seal** is reframed as the *first* shared goal, the Village as
  the *ongoing* one.
