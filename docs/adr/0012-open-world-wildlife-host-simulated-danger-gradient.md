# Open-world Wildlife: host-simulated roaming creatures and a zoned danger gradient

The World grew to ~300×300 (ADR-0009) and gained a real meta-loop (the Village, ADR-0010), yet the
open world still felt **empty to be in**: the only verbs between destinations were *walk* and
*harvest a Node*, and the only combat was two opt-in set-pieces (the **Guardian**, the **Delve**).
The felt problem was diagnosed precisely: not a *retention* gap (the Village answers "why come back")
and not a *destinations* gap (one more Dungeon is one more dot on a big map) — but a **connective-tissue**
gap: the ~50k tiles *between* destinations are beautiful terrain where **nothing happens**. A world
feels alive when the space itself has renewable, spatially-distributed activity — not when it has one
more door at the far edge.

This forces a collision with two of the game's hardest commitments: the **peaceful open world**
("nothing attacks you," stated four ways in CONTEXT) and **serverless / no tick loop** (ADR-0001;
everything is a pure function of the clock or a player-triggered mutation; ADR-0002, nothing reacts).
Anything that *lives and reacts* in the open world seems to violate both at once.

## Decision

1. **Roaming Wildlife, simulated by an elected peer-host — the only serverless-legal reactivity.**
   The open world gains **Wildlife**: creatures that roam and (some of them) react. They are simulated
   by **one Player client at a time (the host)**, exactly the peer-host trick ADR-0007 uses for the
   Delve — no server simulates them (ADR-0001 preserved). The host is elected **deterministically from
   the shared presence view** (e.g. lowest-sorting online name) with **zero negotiation**, reusing the
   roster recompute every client already runs. It steps every creature's AI and **broadcasts all
   creature state in one batched message per tick**, so bandwidth is ~one stream regardless of creature
   count — staying under the realtime message-rate cap the ~7 msg/player/s position stream already
   respects (`SupabaseBackend`, `POS_BROADCAST_MS`).

2. **One creature engine, reusing the Husk AI — never a new brain.** Wildlife reuses `content/dungeon.ts`'s
   pure, node-importable reactive stepper (`stepMob` / `MobProfile` / `createMob` / `applyMobHit`) — the
   same reskin-not-rebuild discipline as ADR-0011. Player→creature damage reuses the ADR-0006 weapon
   rolls; creature→player harm is **knockdown-only** (no player HP). Two **dispositions** are just AI
   flags on that one engine:
   - **Peaceful** creatures — skittish, **forageable** (approach and catch a moving Node). Roam the
     *whole* map for ambient life.
   - **Predatory** creatures — aggressive, **huntable** with Husk combat (or fled). Roam **only** the
     danger-flagged wilds.

3. **Ephemeral, never persisted — so host handoff degrades gracefully.** Creatures are spawned around
   online Players by the host, live only in host memory, and are **thrown away** when no one is near or
   online (an empty World has no simulator, and needs none — nothing persistent to lose). On host
   departure, presence re-fires, a new host is elected, and it simply **respawns creatures** around the
   remaining Players. In-flight combat state is lost — an acceptable blink for a cozy group — so there
   is **no host-migration protocol** to build. This is the crucial divergence from ADR-0007, which
   *refused* migration because a Dungeon can just *end* on host-leave; the open world cannot end, but
   because Wildlife is disposable, it does not need to.

4. **Danger is zoned: safe core, dangerous wilds — a refactor of the peaceful promise, not a deletion.**
   Each **Zone** carries a `dangerous` flag. The **core** Zones and the **Village** are a **guaranteed
   safe haven** — a fresh Player at their first tree, or a cozy fisher, is *never* jumped. **Predators
   spawn only in danger-flagged frontier Zones**; **peaceful Wildlife roams everywhere.** "The open
   world is peaceful" becomes "the open world is peaceful *where you live*; the *wilds* have teeth" —
   which makes "combat is something you *walk into*" **literally** true and completes ADR-0009's
   reward-gradient with its missing **risk** half (that ADR gave more reward per step but no more risk).

5. **Harm is the existing currency; fleeing always works; the no-loss contract is inviolate.** A
   predator catch is a **knockdown**. Fleeing is **always** viable — **no predator outruns a Player,
   none crosses into the safe core**, and a knockdown is never death. Three knockdowns in a **rolling
   window** (no bounded fight to count within) → **Exhaustion** → wake at **Hammock/spawn, inventory
   fully intact.** The only thing ever lost is **position and time** — never an item, never a life. The
   wilds use a **3 s** stun: the global `KNOCKDOWN_STUN_MS` is lowered **5 s → 3 s** (a deliberate
   global change that also makes the Guardian/Dungeon marginally more forgiving — accepted, and
   playtest-tunable via a compensating Guardian nudge if needed).

6. **Night raises the wilds' teeth, never the core's.** The real-clock day/night cycle now gates
   danger: danger-flagged Zones get **more/tougher predators after dark** — a real "push in after dark?"
   decision that finally gives the **Hand Torch** and the cooked-fish speed buff a purpose out there.
   The core is **always safe**, day or night.

7. **Rewards feed existing loops and add zero power.** Wildlife drops a **hide / meat / trophy**
   Resource family that flows only into things that already exist: the **Village** pool (the "frontier
   finds" ADR-0010 anticipated), **cooking** (a new campfire *ingredient* granting the **existing**
   move-speed buff — a new input, **not** a new buff), and **decor / trophy Structures**. It grants
   **no armour, no weapon stats, no new buff** — the **no-HP** and **one-buff** rules stay inviolate,
   and the **Village still gates nothing**.

## Considered Options

- **Peaceful-only living world (clock-derived rhythms + forageable critters, no danger)** — viable and
  cheapest (zero identity change), and it remains the spine for the *peaceful* half. Rejected as the
  *whole* answer because the designer explicitly wants the wilds to have **teeth**, not just motion.
- **More destinations (Delve 2, a second open-world boss, more POIs)** — rejected as the *primary* fix:
  destinations are dots; they never fill the connective tissue that reads as "empty." Kept as a cheap
  *secondary* win the Dungeon/Guardian frameworks already support as data.
- **Enemies everywhere (delete the peaceful promise)** — rejected: guts onboarding (the **Journey**
  assumes a safe start), kills cozy "just fish and vibe" play, and turns "combat you walk into" into
  "combat that finds you." Zoning preserves the identity as a *gradient*.
- **Danger by radius from spawn** — rejected vs. per-Zone flags: too blunt to say "this grove is a
  peaceful fishing spot but *that* ridge is deadly," and it risks danger bleeding toward spawn by
  geometry accident.
- **Reactive "pocket" arenas embedded in the world** — rejected: a pocket is still a *destination*, so
  it does not fill the connective space (the actual complaint). Roaming is what the space needs.
- **Full host-migration protocol** — rejected as unnecessary: making Wildlife ephemeral turns migration
  into graceful respawn, dodging the exact problem ADR-0007 refused to solve.
- **New crafting branch off Wildlife loot (armour / stat weapons)** — rejected: reopens player-HP and
  the one-buff rule. Rewards must feed *existing* loops only.
- **Per-source stun (predators 3 s, Guardian/Dungeon stay 5 s)** — considered and overruled by the
  designer in favour of a single global 3 s.

## Consequences

- **New client subsystem: the open-world creature host.** Election from presence, an ephemeral creature
  pool, a per-tick batched `creatures` broadcast on the existing `jw-world` channel, and non-host
  clients rendering/interpolating remote creature state (mirrors the Delve's host/guest split, but in
  the persistent World rather than a locked instance).
- **`content/dungeon.ts` engine is reused, not forked** — new `MobProfile`s (peaceful skittish +
  predatory kinds) and a spawn planner for the open world; the stepper, damage, and knockdown paths are
  shared. Keep it node-importable (no browser globals), like `guardian.ts`.
- **Map data gains a per-Zone `dangerous` flag** in `tools/generate-map.ts` → `world-data.json`, plus a
  `zoneAt`-style danger lookup client-side. Existing Zone rects and Node ids **must stay byte-stable**
  (ADR-0009 discipline) — this adds a field, it does not move anything.
- **Config:** `KNOCKDOWN_STUN_MS` 5 000 → 3 000 (global); new creature tuning constants (spawn density,
  aggro, speeds capped below player speed, night multiplier, rolling-window length). Numbers are
  playtest work.
- **New Resources** (hide / meat / trophy) with recipes/uses wired into the Village pool contribution
  table, a cooked-meat campfire recipe (existing buff), and decor/trophy Structures. No new buff, no new
  tool tier.
- **CONTEXT gains `Wildlife` + open-world `Host`**, refines the opening peaceful-world claim into the
  safe-core/dangerous-wilds gradient, and cross-references the softened "no enemies" lines in the
  **Guardian**/**Husk** entries.
- **Guardian/Dungeon get marginally easier** from the shorter stun — an accepted, monitored side effect.
- **Correctness check stays `npm run build`** (no tests); `npm run genmap` regenerates the map with the
  new flag, keeping ids stable.
