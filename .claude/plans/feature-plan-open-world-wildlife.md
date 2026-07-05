# Feature plan: Open-world Wildlife

**One-line:** The open world gains **Wildlife** — host-simulated roaming creatures (peaceful
forageable + predatory huntable) that fill the dead space *between* destinations, gated behind a
**safe-core / dangerous-wilds** zoning so "combat is something you walk into" becomes literal.

Source ADR: `docs/adr/0012-open-world-wildlife-host-simulated-danger-gradient.md`.
Grilled against: `CONTEXT.md` (terms **Wildlife**, open-world **Host**; refined peaceful-world claim).

---

## Resolved decisions (facts)

**Diagnosis (why we're building this)**
1. The gap is **connective-tissue**, not retention (Village solves that) and not destinations (one
   more Dungeon is one more dot). The ~50k tiles *between* destinations are where "nothing to do"
   lives. Only spatially-distributed, renewable, *roaming* activity fills it.

**Engine & authority**
2. Wildlife is simulated by **one Player client at a time (the host)** — the ADR-0007 peer-host
   trick applied to the persistent World. **No server** simulates it (ADR-0001 preserved).
3. Host is elected **deterministically from the shared presence view** (e.g. lowest-sorting online
   name), zero negotiation — reuse the roster recompute in `SupabaseBackend.onPresenceSync`.
4. The host **broadcasts all creature state in ONE batched message per tick** (a `creatures` event
   on the existing `jw-world` channel), so bandwidth is ~one stream regardless of creature count —
   stays under the realtime cap the `POS_BROADCAST_MS` (~7 msg/player/s) position stream respects.
5. The creature engine **reuses `src/content/dungeon.ts`**: `stepMob` / `MobProfile` / `createMob` /
   `applyMobHit`. Player→creature damage reuses ADR-0006 weapon rolls; creature→player harm is
   **knockdown-only** (no player HP). **No new AI brain.** Keep the module node-importable (no
   browser globals, no `../config`), like `guardian.ts`.
6. Two **dispositions** = AI flags on that one engine: **peaceful** (skittish, forageable — a moving
   Node you approach and catch) and **predatory** (aggressive, huntable with Husk combat, or fled).

**Persistence & handoff**
7. Wildlife is **ephemeral**: host-spawned around online Players, lives only in host memory, **never
   persisted** (no DB row, no migration). Discarded when no one is near/online.
8. On host departure, presence re-fires, a new host is elected, and it **respawns** creatures around
   remaining Players. In-flight combat state is lost — **graceful degradation, no host-migration
   protocol** (the divergence from ADR-0007, made safe by ephemerality).

**Zoning (danger gradient)**
9. Each **Zone** carries a **`dangerous` flag**. Core Zones + the **Village** are a **guaranteed
   safe haven**. **Predators spawn only in danger-flagged frontier Zones**; **peaceful Wildlife
   roams everywhere.** This is the missing *risk* half of ADR-0009's reward-gradient.
10. Danger is **zone-tagged, not radial.**

**Harm model**
11. Predator catch = **knockdown**. **Fleeing always works**: no predator's speed exceeds the
    Player's, none crosses into the safe core, a knockdown is never death.
12. **3 knockdowns in a rolling time window → Exhaustion → wake at Hammock/spawn, inventory fully
    intact.** The only loss is **position + time**. **No item drop, ever. No player HP, ever.**
13. Wilds stun = **3 s**. `KNOCKDOWN_STUN_MS` lowered **5 000 → 3 000 globally** (deliberately also
    softens Guardian/Dungeon; accepted, playtest-tunable).

**Day/night**
14. **Night intensifies danger in flagged Zones only** (more/tougher predators after dark). Core is
    **always safe**, day or night. Gives Hand Torch + cooked-fish buff a purpose in the wilds.

**Rewards (feed existing loops, add zero power)**
15. Both dispositions drop a **hide / meat / trophy** Resource family. Flows only into:
    - **Village pool** contribution (the "frontier finds" ADR-0010 anticipated),
    - **Cooking**: a cooked-meat campfire recipe granting the **existing** move-speed buff (a new
      *ingredient*, **not** a new buff — one-buff rule holds),
    - **Decor / trophy Structures** (cozy expression + Village grandeur).
16. **No armour, no weapon stats, no new buff, no new tool tier.** Village **still gates nothing**.

---

## Acceptance criteria (Given/When/Then)

> Note on verification: the host model is multiplayer by nature, but in single-player MockBackend the
> lone Player **is** the host, so most of this is solo-demonstrable. Multiplayer-only items are
> flagged **[MP]** — implement to spec, do not claim proven without a manual multiplayer playtest.

- **AC1 — Ambient life everywhere.** Given a Player anywhere (incl. the safe core), When they move
  around, Then peaceful Wildlife is visibly roaming nearby, and approaching one lets them forage it
  (catch → a hide/meat/trophy Resource enters inventory).
- **AC2 — Core is inviolate.** Given a Player standing in a core Zone or the Village, When they idle
  or gather indefinitely (day or night), Then **no predator ever spawns or attacks them**.
- **AC3 — Predators only in the wilds.** Given a Player crosses from a safe Zone into a
  danger-flagged frontier Zone, Then predatory Wildlife can appear and aggro; When they cross back
  over the threshold, Then predators de-aggro and do not follow into the core.
- **AC4 — Fleeing always works.** Given a predator is chasing a Player, When the Player runs, Then
  the predator never closes distance faster than the Player can open it (predator speed ≤ player
  speed), so escape is always possible.
- **AC5 — Huntable predators reuse Husk combat.** Given a Player attacks a predator with an in-hand
  weapon, Then damage is rolled via the ADR-0006 weapon band (bare hands weakest, Bow/Sword per
  their bands), the creature's host-memory HP drops, and on death it drops the hide/meat/trophy loot.
- **AC6 — Knockdown, never loss.** Given a predator catches a Player, Then the Player is knocked down
  and stunned **3 s** with **no item loss**; When it is their 3rd knockdown within the rolling
  window, Then they Exhaust and wake at Hammock/spawn with **inventory fully intact**.
- **AC7 — Global 3 s stun.** Given any knockdown anywhere (predator, Guardian slam, Dungeon Husk),
  Then the stun lasts **3 s** (`KNOCKDOWN_STUN_MS === 3_000`).
- **AC8 — Night raises the wilds' teeth only.** Given night falls, Then flagged Zones show
  more/tougher predators than by day; And the core remains attack-free at night (re-asserts AC2).
- **AC9 — Loot feeds existing loops, no new power.** Given a Player holds hide/meat/trophy, Then they
  can contribute it to the Village Hall pool, cook meat at a campfire for the **existing** move-speed
  buff, and/or place a trophy/decor Structure — and there is **no** craftable armour, stat-weapon, or
  new buff anywhere in the new content.
- **AC10 — Batched, cheap broadcast.** Given N creatures are active, When the host broadcasts, Then
  it emits **one** `creatures` message per tick (not N), and the world channel stays under the
  realtime message-rate cap with 8 players moving. **[MP]**
- **AC11 — Deterministic host & graceful handoff.** Given multiple Players online, Then exactly one
  is the elected host (by the deterministic rule) and all clients agree; When the host disconnects,
  Then a new host is elected with no negotiation and creatures respawn around the remaining Players
  (an acceptable blink, no crash, no duplicate authorities). **[MP]**
- **AC12 — No new persistent state.** Given a full-party logout, When any Player returns, Then no
  Wildlife persisted (no DB rows, no migration) — the World is exactly as ADR-0001/0007 require, and
  all existing Zone rects + Node ids are byte-stable.
- **AC13 — Build stays green.** `npm run build` exits 0.

---

## Scope boundaries — do NOT build

- **NO player HP / health bar / damage-to-player.** Harm stays knockdown → Exhaustion, forever.
- **NO item loss on Exhaustion/knockdown.** The no-loss contract is load-bearing.
- **NO new buff.** Cooked meat grants the *existing* move-speed buff only (one-buff rule).
- **NO armour, NO stat-bearing weapons, NO new tool tier** off Wildlife loot.
- **NO change to the Village meta-loop mechanics** (ADR-0010) — only *feed* its pool a new input.
- **NO predators in the safe core or Village — ever**, day or night.
- **NO host-migration protocol** — ephemeral respawn is the design, not a bug to fix.
- **NO new AI engine** — reuse `dungeon.ts`'s `stepMob`. No new reactive brain.
- **NO server / edge function / tick loop** for creatures (ADR-0001).
- **NO Husks in the open world** and **no Wildlife in Dungeons** — the two creature classes stay in
  their homes; Wildlife is *animals*, Husks are *constructs*.
- **NO map re-layout / id shift.** Add a per-Zone flag only; keep `world-data.json` ids byte-stable.
- **NO new Dungeon, no second open-world boss** in this feature (a separate, later, cheap win).
- **NO reactivity added to the Guardian** (ADR-0002 stays; the Guardian never reacts).

---

## Constraints & gotchas

- `src/content/dungeon.ts` and any new creature-content module **must stay node-importable**: no
  browser globals, no `../config` import (same rule as `guardian.ts`). Positions in **tile units**,
  speeds in **tiles/second**; multiply by `TILE` only at the render boundary.
- **Byte-stable map:** `tools/generate-map.ts` adds a `dangerous` field per Zone rect; regenerate
  with `npm run genmap`; existing Zone rects and sequential Node ids must not move (ADR-0009).
- **Realtime budget is already near the cap** (`POS_BROADCAST_MS = 150`, ~7 msg/player/s tuned to
  keep the 8-player `jw-world` channel under the msg/s cap). The creature broadcast **must** be a
  single batched message per tick, spatially culled to near-player creatures. Presence `track()`
  >~0.5/s trips "Client presence rate limit exceeded" — do not add per-creature presence.
- **Predator speed ≤ player speed** is a hard invariant (flee-always). Account for the cooked-fish
  +20% move buff — even an unbuffed Player must be able to escape.
- **Rolling-window Exhaustion:** open-world knockdowns have no bounded fight to count within — track
  a rolling time window, distinct from the Guardian's per-fight `EXHAUSTION_KNOCKDOWNS` counter.
- Lowering `KNOCKDOWN_STUN_MS` to 3 000 touches the Guardian and Delve — expected. If the Guardian
  feels too soft afterwards, compensate via HP/window tuning **separately**, not by reverting.
- Use **CONTEXT terminology** everywhere: **Wildlife** (never monster/enemy/mob), **forage/hunt**,
  **knockdown/Exhaustion** (never death), **Zone**, **Structure**, danger-flagged **wilds** vs safe
  **core**. Wildlife are *natural animals*, distinct from Husks (constructs) and the Guardian.
- npm/npx always need `--registry https://registry.npmjs.org/`.
- Both backends (`MockBackend`, `SupabaseBackend`) must expose whatever the creature host needs;
  MockBackend is single-player so the lone Player is trivially the host.

---

## Suggested build order

1. **Content data (pure, node-importable):** hide/meat/trophy `ResourceId`s; peaceful + predatory
   `MobProfile`s (speeds ≤ player, aggro/flee flags) and an open-world spawn planner in a
   `dungeon.ts`-style module; EN+DE strings + icons.
2. **Map flag:** `dangerous` per Zone in `generate-map.ts`; `zoneAt`-style danger lookup client-side;
   `npm run genmap` (ids stable).
3. **Config:** `KNOCKDOWN_STUN_MS` → 3 000; new creature constants (density, night multiplier, aggro,
   speeds, rolling-window length).
4. **Creature host subsystem:** deterministic election from presence; ephemeral pool; per-tick
   `stepMob` + batched `creatures` broadcast; spatial culling; graceful re-elect/respawn.
5. **Non-host rendering:** interpolate remote creature state (mirror the Delve host/guest split).
6. **Combat & forage wiring:** predator hit → `applyMobHit`; forage a peaceful creature (moving
   Node); knockdown/rolling-window Exhaustion in the open world; flee/de-aggro at the core threshold.
7. **Rewards:** Village pool contribution entries; cooked-meat recipe (existing buff); trophy/decor
   Structures.
8. **Dev flag** (e.g. `?wild`) to drop into a danger Zone with creatures for solo verification.
9. **Verify:** `npm run build` green; drive the preview app to demonstrate each solo-verifiable AC;
   flag [MP] items as implemented-to-spec pending manual multiplayer playtest.

---

## References

- `docs/adr/0012-open-world-wildlife-host-simulated-danger-gradient.md` (this feature)
- `docs/adr/0007-reactive-coop-dungeons-peer-host-authority.md` (peer-host model reused)
- `docs/adr/0009-frontier-expansion-faux-elevation.md` (the reward-gradient this completes)
- `docs/adr/0010-village-communal-meta-loop.md` (the pool the loot feeds)
- `docs/adr/0006-guardian-combat-depth-weapon-dps-and-melee-tax.md` (weapon rolls reused)
- `docs/adr/0002-guardian-runs-on-deterministic-schedule.md` / `0001-supabase-as-entire-backend.md`
  (constraints honoured: serverless, non-reactive open world outside Wildlife)
- `CONTEXT.md` — terms **Wildlife**, open-world **Host**; refined peaceful-world identity.
- Code: `src/content/dungeon.ts` (engine), `src/backend/SupabaseBackend.ts` (channel/presence),
  `src/config.ts` (constants), `tools/generate-map.ts` (Zones).
