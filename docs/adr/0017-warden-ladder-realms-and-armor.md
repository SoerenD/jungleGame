# ADR-0017 — The Warden ladder: Realms as far-edge districts, visible Armor as individual power

## Status

**Accepted 2026-07-12.** Drafted the same day from the Warden-ladder grill session; the items
then pending — three Wardens / three armor slots (Boots +8% move, Gloves +8% attack speed,
Helm +2/+3 band), the district implementation of Realms, the per-Warden signature mechanics
(the Tide / Echoes / Cultivation), all names (rung 3's crop amended mirebulb → **wildgrain**
at sign-off), and the Depth-kit "the Sentinel" rename — were owner-confirmed in the sign-off
session the same day. The ladder frame and the separately-presented-map read were owner-decided
in the grill itself ("ignore ADR-0009's one-contiguous-World doctrine and change the ADR").
Supersedes ADR-0009's "one contiguous
walkable World / add zones before stretching" for post-Guardian expansion; deliberately
**reverses ADR-0013's rejection of individual combat stats** (recorded below, like ADR-0013
itself recorded reversing the one-buff rule).

## Context

The Guardian is one rung of a Valheim-pattern ladder the game was born with: communal Offering →
authored fight → drops that soft-unlock the next resource tier (ancient hardwood/obsidian taunt
from day one). The owner wants the ladder extended: each new **Warden** is woken by an Offering
of the current tier's goods, fights on its own authored kit, and its defeat opens a new,
smaller map whose resources feed a Sawmill-style refiner whose output crafts one **visible
armor piece** — and each Warden's Realm must introduce one genuinely new mechanic.

The grill established the hard constraints this must fit: no server tick ever (ADR-0001);
authored fights are pure functions of one server timestamp (ADR-0002) — the 7 Depth boss kits
are host-simulated (ADR-0007/0016) and therefore the *wrong* engine for a Warden; there is
today **no "which map am I on" concept anywhere** (not on the position stream, not in presence,
not in any DB key — nodes, structures, fog, minimap, wake points, treasure and the wildlife
host are all single-map); the avatar is one code-drawn 20-frame sheet per player, regenerated
wholesale on any appearance change; and the Sawmill kernel is lazy-timestamp but **hardcoded
wood→planks** in both TS and SQL.

## Decision

1. **The ladder**: Guardian = rung 0 (unchanged, no retrofit). Each further rung is a
   **Warden**: woken at an authored altar by a communal Offering of the *previous* tier's goods
   plus a crafted totem (the Seal + Summoning Totem shape, re-instanced per rung); fought on
   the guardian.ts **authored-schedule engine** with its own kit, arena, and look — never
   host-simulated (ADR-0002's split holds); paid out by the **participation rule** (≥1 hit =
   full drop set). Defeat opens that Warden's **Realm** permanently (world flag): every
   participant receives the Realm's **gate key item**, and any player opens the gate once with
   it in hand — the Delve-shaft pattern.
2. **Realms are separate maps in presentation, far-edge districts in implementation.** The
   player-facing read is "a new, smaller overworld you enter through a gate": own tile art, own
   Zone names, own minimap view, camera clamped to the district. Underneath, each Realm is a
   **rectangular district appended in unused coordinate space of the one pinned grid**
   (ADR-0009's own origin-pinned far-edge mechanism, generalized), entered by gate teleport
   only, with no walkable connection. This keeps every existing single-map system — node ids,
   builds, footprint claims, fog, presence, position stream, wake points, wildlife host —
   working **unchanged, with zero DB migration for maps**. The minimap and player-dot display
   filter by district rect; that is presentation, not architecture. A `map_id` dimension (the
   true-separate-map alternative) is rejected below.
3. **Three Wardens, three armor slots: Boots, Gloves, Helm.** Chest and pants armor are cut:
   they would paint over the shirt/pants palette picks that *are* a Player's avatar identity,
   and five full rungs (~5 realms + kits + mechanics + chains) is roughly twice the credible
   scope. Each piece grants exactly one attribute, client-applied like the Village buffs
   (ADR-0013 pattern, no migration for the stats themselves): **Boots +8% move speed, Gloves
   +8% attack speed, Helm +2 min / +3 max flat raise on the held weapon's damage band** —
   all numbers are a node-pure tuning table (`ARMOR_BUFFS`, village.ts precedent).
4. **Armor is individual power — a deliberate reversal.** ADR-0013 rejected "individual/earned
   combat stats" as against the collective ethos. This ADR reverses that, bounded: every piece
   is craftable by every Player from open communal chains, armor **gates nothing**, there is no
   armor leaderboard, no defense/HP semantics ever (armor adds power, never fragility — the
   no-HP/no-death contract is untouched), and the full-set gap stays modest (~8%/8%/+2–3).
   Visible armor is drawn as **overlay layers baked into the existing per-player avatar sheet**
   (the swing-pose precedent) and synced by an `armor` field riding the position
   broadcast/presence payload exactly like `held`/`swings`; equipped state persists as a jsonb
   column on the players row (the `wake_point` precedent).
5. **One fight at a time per World.** The single `world.fight jsonb` slot is kept and gains a
   `warden` key (null = the Guardian); summoning any Guardian-class fight while another runs is
   refused. Rejected: a keyed `fights` table for concurrent bosses — 8 friends do not fight two
   colossi at once, and the mutex is even flavorful.
6. **The refiner kernel is generalized once, then each Realm's refiner is data + art.** A new
   `refiners` table (`world_id, structure_id, input_count, since`) plus generic
   `jw_refiner_open/deposit/collect(p_world, p_id, p_input_item, p_output_item, p_ms, p_cap)`
   following the established "client passes tuning, SQL is the generic executor" pattern. The
   live Sawmill stays on its own table/RPCs untouched. **Chain depth stays 1**: node → raw
   Resource → one refiner → refined Resource → instant Recipe; no machine ever feeds a machine.
7. **Every Realm must ship with renewable demand** or it goes dead once its armor is crafted:
   each Realm's signature mechanic carries a built-in return hook (tide cycles, weekly reseeds,
   a food economy), each refined Resource gets exactly one repeatable consumable sink, and
   Realm resources carry Village-pool contribution values (the "frontier finds" hook,
   ADR-0010). This is an acceptance criterion of every rung, not a later pass.
8. **Naming (CONTEXT.md canon, entries land with each rung's ship):** the bosses are
   **Wardens** (never "boss"); the opened areas are **Realms** (never "world" — that is
   ADR-0014 tenancy — and never "map/level"); the processors are **Refiners** (CONTEXT already
   calls the Sawmill a refining Structure); the worn pieces are **Armor** (never "gear/
   equipment"; explicitly no defense semantics). The shipped Depth boss kit currently *named*
   "the Warden" (ADR-0016) keeps its internal `'warden'` kit id but is **renamed in i18n to
   "the Sentinel"** (EN/DE label-only change) so the ladder owns the word.

## Considered Options

- **True separate maps (a `map_id` dimension)** — rejected: the grill enumerated ten systems
  with no map concept (position stream, presence, nodes PK, structures/tiles PK, fog chunk
  arithmetic, minimap, zones, wake points, treasure coordinates, wildlife host election); a
  map_id means recutting PKs across the live DB (a second 0010-scale migration) plus wire and
  filter changes in every one of them, for a payoff the district trick delivers visually.
- **Growing the one map contiguously (pure ADR-0009)** — rejected by the owner: the fantasy is
  *entering another place*, and a walkable frontier extension can't be art-directed as a
  distinct overworld nor kept "smaller" in feel.
- **Five armor slots / five Wardens** — rejected: erases avatar identity colors (chest/pants),
  doubles content scope, and the mechanic budget (below) does not credibly stretch to five
  genuinely distinct serverless mechanics of this size.
- **Reactive (host-simulated) Warden fights** — rejected: ADR-0002 explicitly forbids host-sim
  for open-world encounters; the Depth kits live behind the Delve's locked-roster instancing.
- **Armor with defense/damage-reduction** — rejected outright: there is no player HP to reduce;
  defense semantics would smuggle HP in through the back door.

## Consequences

- **guardian.ts needs its enabling refactor first**: today phases, thresholds, wave patterns,
  seeds and arena size are module constants with no kit object; a `WardenKit` parameter bundle
  is the prerequisite for any second authored fight, and it must land with zero behavior change
  to the live Guardian (node-importable, no browser globals, as ever).
- **GameScene's fight layer is the biggest cost**: sprites, Ward, waves, toasts, HUD events are
  single-instance and Guardian-named; they generalize to "the active fight" rather than
  duplicating per Warden.
- **Map growth touches fog arithmetic**: explored-chunk indices encode `MAP_W`; appending
  district space repeats the 200→300 growth discipline (byte-stable core, appended RNG calls)
  and the fog-index consequence must be handled the same way ADR-0009's growth was.
- **Each Realm's node types are not data-only**: new Resources/Nodes touch ~5 client files +
  genmap + two PNGs per node (established cost, budgeted per rung).
- **Each rung ships a live migration** (its altar/offering state + refiner rows ride the
  generic kernel; the fight mutex change ships once).
- **CONTEXT.md** gains Warden/Realm/Refiner/Armor entries as each ships; the Avatar entry's
  "four color choices" statement is amended by visible Armor overlays.
- **ADR-0009's reward-gradient is deepened, not discarded**: each Warden's altar and arena sit
  in an existing frontier Zone (its payoff grows), and Realms hang off the far edge beyond.
