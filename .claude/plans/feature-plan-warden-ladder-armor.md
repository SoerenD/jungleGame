# Feature plan — The Warden Ladder & Armor Progression

Three post-Guardian Wardens, each: communal Offering trigger → authored fight (own kit/arena)
→ defeat opens a **Realm** (far-edge district presented as its own small map) → Realm resources
feed one **Refiner** → refined Resource crafts one **visible Armor piece** → each Realm carries
one genuinely new, serverless signature mechanic plus renewable demand.

Grill session: 2026-07-12. Full decision record: `docs/adr/0017-warden-ladder-realms-and-armor.md`.

## Status of decisions

**All decisions owner-confirmed (sign-off session 2026-07-12):** the ladder frame; Realms
presented as separate maps (ADR-0009 doctrine superseded — ADR-0017); exactly **3 Wardens /
3 slots** with attribute mapping Boots=+8% move, Gloves=+8% attack speed, Helm=+2/+3 flat band
raise; the three signature mechanics **the Tide** (Mire), **Echoes** (Hushdark), **Cultivation**
(Terraces); all names (Wardens, Realms, resources, refiners, armor, the Mirefang) with one
sign-off amendment — rung 3's crop renamed **mirebulb → wildgrain** (raw; Husking Mill husks it
into pearlgrain) to avoid the clash with rung 1's Mire realm; and the Depth-kit "the Warden" →
i18n rename **"the Sentinel"**. No open blockers — T5+ are clear to build.

## Resolved design facts (from the grill, verified against code)

- Warden fights run on the **guardian.ts authored engine** (pure function of `engagedAt`),
  never the host-simulated Depth-kit engine (ADR-0002/0007 split). The engine currently has
  **no kit abstraction** — phases/thresholds/patterns/seeds/arena are module constants; a
  `WardenKit` refactor is the prerequisite (T0).
- There is **no map concept anywhere** (wire, DB, renderer). Realms are implemented as
  **appended far-edge districts on the one pinned 300×300 grid** (grown as needed), teleport
  gates only, camera clamp + minimap crop + district-filtered dots for the "separate map" read.
  Zero DB migration for maps. (ADR-0017 §2.)
- The **Sawmill kernel is not generic** (wood→planks hardcoded in TS + SQL, ~11–12 files per
  copy). T1 builds one generic refiner kernel; Sawmill stays untouched.
- **Armor visibility**: overlay fillRect layers inside `drawBlockheadSheet` (per pose loop,
  hook points identified per slot in the grill), regenerated per player like today — texture
  count unchanged (1/player). Wire: `armor` field on `PlayerPos`/`SelfPos` + include armor in
  the `look` recompose key + a local rebuild call on equip (new — today appearance only changes
  at join). Persistence: `players.equipped jsonb` column + one `jw_equip` RPC.
- **Armor stats**: client-applied like Village buffs — `moveSpeedFactor()` multiplier,
  `atkCadence()` multiplier, band delta into `rollGuardianDamage`/`applyMobHit` (bonusCrit
  precedent). No SQL change; trusted-friends posture unchanged (ADR-0005).
- **One fight at a time**: `world.fight` jsonb gains a `warden` key; summon refused while any
  fight runs.
- **Chain depth stays 1**: node → raw → one Refiner → refined → instant Recipe. Confirmed
  nothing today feeds machine→machine; keep it that way.
- **Journey/quest steps**: model Warden checklists like `DELVE_QUEST_STEPS` (pure predicates
  over synced state — data-only), not like `JOURNEY_STEPS` (closed union + hand-wired ticks).
- **Trigger precedents to reuse**: Seal quota bars (communal pooled Offering), Summoning Totem
  (crafted, spent), Delve shaft (key item in hand opens world flag once). No generic altar
  abstraction exists — the closest generic shape is `jw_contribute_village`'s
  "jsonb demands parameter + generic clamp loop"; build the Warden altar RPC in that shape so
  rungs 2–3 are data.
- **Day/night is a 20-minute cycle** (`Date.now() % 1_200_000`), not real nights — any
  mechanic keyed to "tonight/overnight" is built on a clock that does not exist (this killed
  the Star Charting candidate). Tide/cycle mechanics must use minutes-scale periods that do
  NOT evenly divide 24h.

## The three rungs (recommended content)

| Rung | Warden | Altar/arena Zone | Realm (district) | Node → raw | Refiner → refined | Armor | Signature mechanic |
|---|---|---|---|---|---|---|---|
| 1 | **Mire Warden** | Mangrove Coast | **The Sunken Mire** | salt-reed bed → saltreed | **Brine Kiln** → tideglass | **Tideglass Boots** (+move) | **The Tide** — walkability/nodes are a pure function of the real clock (~35 min cycle, wade-slow flooding, spring-tide appointment events) |
| 2 | **Echo Warden** | The Cavern Mouth (surface) | **The Hushdark** | echo-crystal seam → echo crystal | **Chime Kiln** → hushsteel | **Hushsteel Helm** (+2/+3 band) | **Echoes** — record a 20 s ghost of your own movement that loops forever; multi-pedestal vault doors solved by layering ghosts of absent friends (async co-op) |
| 3 | **Verdant Warden** | Overgrown Temple | **The Verdant Terraces** | (planted) grain paddies → wildgrain | **Husking Mill** → pearlgrain | **Verdant-woven Gloves** (+atk speed) | **Cultivation** — plant/tend multi-stage crops; timers only *unlock* a tend, a player act advances it; nothing ever dies (dormancy, not loss) |

- **Trigger scenario per rung** (recycles previous tier's economy): pooled Offering at the
  Warden's altar with visible bars (Seal pattern) — rung 1 demands tier-2 goods (hardwood /
  obsidian / cooked fish), rung 2 demands Mire goods, rung 3 demands Hushdark goods — plus a
  crafted **Warden Totem** (Forge recipe) to wake it. Defeat pays every participant the Realm's
  **gate key**; any player opens the gate once (Delve-shaft pattern).
- **Mire Warden's special weapon**: **the Mirefang** — combat Tool on the sword family, its own
  band/crit/cadence row in `WEAPON_COMBAT`, plus one realm-synergy passive: its holder ignores
  the Tide's wade-slow. Participation drop (everyone with ≥1 hit gets one).
- **Fight kits** (authored, all-different, pure time functions): Mire = rising-water wave rows
  + geyser columns; Echo = expanding sound-rings + a delayed "echo repeat" of the previous
  wave; Verdant = creeping vine rows that close corridors. All reuse slam/lunge/Eye-Window
  vocabulary with distinct geometry, tints, silhouettes.
- **Renewable demand per Realm** (acceptance criterion): tide-pool skims + spring-tide events;
  weekly-reseeded vault configs + curated greeting-ghosts; permanent feast-dish food economy.
  Each refined Resource gets one repeatable consumable sink (e.g. amber-style lantern oil /
  chime charm / feast dish) and a Village contribution value.

## Geography (verified against tools/generate-map.ts, 2026-07-12)

- All three altar/arena host Zones **exist today** and are ADR-0012 dangerous frontier zones:
  Mangrove Coast (tiles 100,226 108×70), The Cavern Mouth (16,222 80×74 — Delve shaft at
  56,260), Overgrown Temple (214,116 72×76).
- **Each rung replicates the Guardian's arena anatomy** (fixed genmap-baked court, Guardian
  precedent: 17×13 arena at 169,15 in the Ancient Ruins; offering monument OUTSIDE the gate,
  summoning altar INSIDE, colossus home tile top-center). Each Warden is **visibly asleep in
  its arena from day one** — the soft-gate taunt pattern.
- **District placement** (proposed; gate teleport makes adjacency cosmetic): the Sunken Mire
  south of Mangrove Coast (x≈100–208, y≥300), the Hushdark south of the Cavern Mouth
  (x≈16–96, y≥300), the Verdant Terraces east of the Overgrown Temple (x≥300, y≈116–192).
  Free space is strictly x≥300 / y≥300 (origin pinned NW; negative coordinates never).
- Realms use **persistent appended map space**, deliberately NOT the Delve's ephemeral
  same-scene overlay (depth-900k curtain over the NW corner) — Realm builds/nodes/fog persist.

## Tickets

**T0 — Kit-parameterize the fight engine** *(enabler, zero behavior change)*
Extract `WardenKit` (arenaW/H, phases, thresholds, pattern fn + seeds, lunge/ring constants)
in `src/content/guardian.ts`; Guardian becomes the first kit. Node-importable, no config
import. AC: `npm run build` green; Guardian fight byte-identical (same schedule outputs for
sampled elapsed values via a node-side check).

**T1 — Generic Refiner kernel** *(enabler)*
`refiners` table + `jw_refiner_open/deposit/collect(p_world, p_id, p_input_item,
p_output_item, p_ms, p_cap)`; Mock mirror; one generic HUD panel. Sawmill untouched. AC: a
test refiner structure processes item A→B lazily across reload; dismantle cleans the row.

**T2 — Realm districts** *(enabler)*
genmap: district support (appended grids in unused coordinate space, origin pinned, node ids
appended); gate-teleport interaction; camera clamp per district; minimap crop + district-
filtered player dots; Zone names per district; fog-growth handling (repeat ADR-0009
discipline). AC: a stub district is enterable/leavable; builds/harvest/fog work inside; a
player in the World doesn't see Realm dots and vice versa; existing map byte-stable
(`npm run genmap` diff limited to appended content).

**T3 — Armor system core**
3 armor ItemIds + `players.equipped jsonb` + `jw_equip`; equip UI (crafting panel section);
stat application (move/cadence/band incl. `applyMobHit`); avatar overlay draws for
boots/gloves/helm (all 20 frames, up-facing hair + side hair-trail handled); `armor` on the
pos/presence payload + `look` recompose + local rebuild on equip. AC: two browsers see each
other's armor incl. swing pose; stats verifiably applied; reload persists equipment.

**T4 — Warden fight backend + altar**
`world.fight.warden` key (mutex); generalized summon/hit/knockdown paths taking a warden id
(legacy Guardian wrappers kept); generic altar-offering RPC in the `jw_contribute_village`
shape (jsonb demands, visible bars) + gate-key world flags + totem recipes. One migration. AC:
a second authored fight can run at the Guardian's arena in dev (`?fight`-style flag) with
Guardian untouched; summon refused while any fight runs.

**T5 — Rung 1 vertical slice: Mire Warden + The Sunken Mire**
Altar at Mangrove Coast, Mire kit + arena art, Mirefang drop, gate key, district w/ Tide
mechanic (~35 min period, wade-slow, exposure-validated harvest ±60 s slack, spring-tide
seeded events), salt-reed nodes, Brine Kiln, Tideglass Boots, consumable sink, Village values,
quest steps, lore tablet, i18n EN+DE. AC: full loop solo in Mock and live: offer → summon →
defeat → open gate → gather on the tide → refine → craft → boots visible to a second browser.

**T6 — Rung 2: Echo Warden + The Hushdark** (Echoes mechanic: echo rows `(recordedAt,
samples[])`, ghost replay = pure fn of loop phase; pedestal vaults; weekly reseed; hushsteel →
Helm). Mandatory design fixes from refutation: anti-parking rule; quantize recording starts to
`serverNow mod 20s` so ghost phases can align.

**T7 — Rung 3: Verdant Warden + The Verdant Terraces** (Cultivation: plot rows
`{stage, stageEnteredAt, tendScore}`, tend RPC advances stage, dormancy never loss; Husking
Mill; feast dish; Gloves). Stage durations tuned to session cadence.

**T8 — Depth-kit label rename** *(tiny, independent)*
i18n-only: `t.depth.bossWarden` EN/DE "the Warden" → "the Sentinel"; internal `'warden'` kit id
unchanged (determinism untouched).

Order: T0/T1/T8 parallel → T2 → T3/T4 → T5 → T6 → T7. Names + mechanics were owner-signed-off
2026-07-12 — T5–T7 are clear to build.

## Scope boundaries (do NOT build)

- No chest/pants armor, no armor sets beyond one piece per Realm, no defense/HP semantics, no
  armor leaderboard.
- No `map_id` dimension, no second Phaser scene per Realm, no touching the live Sawmill
  table/RPCs, no Guardian behavior/tuning changes (except via the no-op T0 refactor).
- No concurrent fights; no reactive/host-sim Warden.
- No new buff *kinds* beyond the three armor attributes (values are the tuning surface).
- Wildlife loot stays armor-free (ADR-0012 unchanged).

## Constraints & gotchas

- `guardian.ts` must stay node-importable (no browser globals / `../config`).
- genmap byte-stability: appended RNG calls only; never reorder; `npm run genmap` after edits;
  generated JSON never hand-edited.
- Every RPC needs `p_world`; migrations must be deployed live before client relies on them.
- Presence `track()` rate limit: new realtime needs ride `send()` broadcasts or existing
  payloads, never extra presence updates.
- The armor `look` key must include equipment or peers won't recompose on equip.
- Tide/cycle periods must not divide 24h evenly (fixed-schedule players would never see the
  other phase); anchor seeded appointment events to evenings, not raw formula peaks.
- Dismantle-refund vs in-flight state: any Realm structure holding value (weirs, plots) must
  bank on dismantle — "no item loss ever" is inviolate.

## Glossary entries to add to CONTEXT.md (verbatim-ready, land with each ship)

- **Warden**: A colossal authored foe of the post-Guardian ladder, woken at its altar by a
  pooled Offering of the previous tier's goods plus a crafted Warden Totem; fights like the
  Guardian (pure function of its engage time, never reacts), pays participation loot, and its
  one defeat opens its Realm forever. _Avoid_: boss, raid; (the Depth kit formerly labeled
  "Warden" is the Sentinel).
- **Realm**: A Warden-opened side-region presented as its own small map — entered only through
  its gate, with its own Zones, Resources, Refiner and signature mechanic — but part of the one
  World (one World contains its Realms; every Realm is open to every Player once unlocked).
  _Avoid_: world (that is the ADR-0014 instance), map, level, dimension.
- **Refiner**: The family of Structures that turn a deposit into a refined Resource over real
  time, lazily from timestamps (the Sawmill is the first; each Realm adds one). _Avoid_:
  machine, factory, processor.
- **Armor**: Worn pieces (Boots, Gloves, Helm) crafted from Realm chains, visible on the
  Avatar and synced to all Players; each grants one small attribute (move, attack speed, flat
  band raise). Armor is power, never protection — there is no HP to protect. _Avoid_: gear,
  equipment, defense.

## Mechanic bench (refutation survivors not used, for future rungs/ideas)

Geyser Lattice (scheduled launch traversal), Chokevine Reclaim (regrowing maze + root
anchors), Glacier Glide (momentum-lock ice + structures as logic gates), Ashfront Forecast
(deterministic weather fronts), Sapflow Gutters (flow-graph routing), Zipline Freight (cargo
in transit w/ ETA; needs bootstrap + dismantle fixes), Pheromone Trails (painted routes, decay
upkeep), Millrace Allocation (contended shared throughput), Bell Chorus (synchronized strikes;
scope small), Lantern Procession (relay ritual), Turning of the Terraces (week-derived shared
garden), Living Tide/Tidewrack/Tidewatch (merged into rung 1). Refuted: The Long Vigil
(attendance-as-gameplay), Star Charting (assumed real nights; night is a 20-min cycle).

## References

- ADR-0017 (this feature's decision record), ADR-0001/0002 (engine constraints), ADR-0009
  (superseded growth doctrine + the append discipline reused), ADR-0013 (buff pattern +
  the individual-stats reversal), ADR-0016 (Depth kits + the name collision), ADR-0005/0014
  (trust posture, p_world).
- Grill fact reports (avatar/fight/economy/map/backend/triggers/stats/worktree) + full
  mechanic verdicts: session scratchpad `report-*.md`, `mechanics.md` (workflow
  wf_50c17fc3-2cf).
