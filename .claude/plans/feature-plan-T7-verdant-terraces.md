# T7 — The Verdant Warden + the Green Terraces (rung 3, final rung)

Source of truth for the T7 implementation tickets. Architect pass 2026-07-14 (ADR-0017).
The correctness gate is `npm run build` (tsc + vite; there are no tests). Genmap must stay
**byte-stable outside the new district footprint**.

## Mechanic — Cultivation (pure client f(clock), NO migration)

Green Terraces are hillside fields of **wildgrain**. Each `wildgrain_bed` node runs a growth
cycle that is a pure function of the real clock (ADR-0001/0002 — no server, no tick), scoped to
the `green_terraces` district. The Tide engine (`content/tide.ts`) respatialized: a bed cycles
bare-soil → sprout → green → **golden/ripe** → reset over `CULTIVATION_PERIOD_MS`. The new verb
vs. the Tide: the Tide is a single global phase; Cultivation gives **each bed its own phase
offset** derived from the bed's node id (`idHash`), **rotated weekly** by `cultivationWeek(now)`
(the `echoes.ts` `vaultWeek` monotone-integer idiom — NOT a `now % 24h` divisor phase, which is
the trap `tide.ts` warns about). Ripeness sweeps across the field as a spatial gradient; players
route between ripe beds. Wildgrain is takeable only in a bed's ripe window, validated client-side
within `±CULTIVATION_SLACK_MS` (same trust model as the Tide reed-exposure gate + the pack cap).
Refine wildgrain → **verdant fibre** at the **Verdant Loom** (2×2 refiner on the generic 0012
kernel — data + art only). Verdant fibre crafts the **verdant_cuirass** (+8% attack speed).

Renewable demand (ADR-0017 §7), all without SQL:
- return hook = **weekly reseed** (`cultivationWeek` rotates every bed's schedule each real week);
- one repeatable sink for the fibre = **Grasweave Ration** (`grasweave_ration`, food,
  `{wildgrain:2, verdant_fibre:1}` → existing +20% move-speed food buff, cooked_fish parity);
- `wildgrain` + `verdant_fibre` carry Village-pool contribution values.

## Migration decision — NONE

T7 ships zero SQL. Altar/Offering → generic `jw_contribute_warden`/`jw_summon_warden`
(`world.wardens`, 0014). Gate → `jw_open_realm_gate('verdant')` (0014). Refiner → generic
`jw_refiner_*` with `VERDANT_LOOM` config (0012). Equip → chest slot already whitelisted (0013).
Cultivation → pure `f(Date.now())`, harvest rides the existing node-harvest path gated
client-side. (A persisted-sowing `0016_verdant.sql` fork exists on paper but is explicitly NOT
taken — it exceeds Tide/Echoes scope for no gameplay the pure-clock design can't deliver.)

## Canonical naming (EN / DE)

| Role | id | EN | DE |
|---|---|---|---|
| Warden (fight id) | `verdant` | the Verdant Warden | Der Grünwächter |
| Realm / district id | `green_terraces` | — | — |
| Realm / Zone name | realmName('verdant') | The Green Terraces | Die Grünen Terrassen |
| Mechanic | — | Cultivation | Anbau / die Ernte |
| Crop (raw) | `wildgrain` | Wildgrain | Wildkorn |
| Refined fibre | `verdant_fibre` | Verdant Fibre | Grünfaser |
| Refiner Structure | `verdant_loom` | Verdant Loom | Grünwebstuhl |
| Node type | `wildgrain_bed` | Wildgrain Bed | Wildkorn-Bank |
| Gate key | `terrace_key` | Key to the Green Terraces | Schlüssel zu den Grünen Terrassen |
| Totem | `verdant_totem` | Verdant Warden Totem | Totem des Grünwächters |
| Fibre sink (food) | `grasweave_ration` | Grasweave Ration | Grasgewebe-Ration |
| Armor (exists) | `verdant_cuirass` | Verdant-woven Cuirass | Grüngewebter Brustpanzer |
| Lore tablet | `t10` | Tablet of the Season | Steintafel der Ernte |

**Reconcile the stale shell strings (pearlgrain→wildgrain, Verdant→Green Terraces):**
- `items.ts` EN `verdant_cuirass.desc` (~:221): "living pearlgrain fibre of the Verdant Terraces"
  → "living verdant fibre, retted from the wildgrain of the Green Terraces". Keep "+8% attack speed".
- `items.ts` DE `verdant_cuirass.desc` (~:321): "Perlkorn-Faser" → "Grünfaser / Wildkorn"
  (DE already says "Grünen Terrassen").
- The cuirass NAME (EN "Verdant-woven Cuirass" / DE "Grüngewebter Brustpanzer") stays.

## Tickets

Shared-file hotspots: **`items.ts`/`i18n.ts` → T7.1 owns them alone**; **`config.ts` → T7.2 owns
it alone** (all Cultivation constants + `VERDANT_LOOM` RefinerConfig + `WARDEN_ALTAR_PER_HEAD.verdant`
+ dev flags `?verdantfight`/`?cultivationtest`); **`assetConfig.ts` → T7.4 (nodes) then T7.7 (boss
sheet)**. So after T7.1, tickets T7.2/T7.3/T7.4/T7.5/T7.8 touch DISJOINT files.

### T7.1 — Naming + item shells + string reconciliation  **(foundation, lands first)**
Files: `src/content/items.ts`, `src/i18n.ts`.
- items.ts: `ResourceId += wildgrain | verdant_fibre | terrace_key`; `ConsumableId += verdant_totem
  | grasweave_ration`; `StructureId += verdant_loom`. Add BASE_ITEMS + ITEMS_DE entries for each
  (names/descs per table). Fix the two `verdant_cuirass` descs.
- i18n.ts: `warden.name`/`realmName` verdant entries EN+DE; ZONE_DE "Die Grünen Terrassen"; a new
  `cultivation` UI string block (ripe/growing hints) EN+DE.
Accept: build green; grep shows no "pearlgrain"/"Verdant Terraces" left.

### T7.2 — Cultivation module + config  (parallel after T7.1)
Files: `src/content/cultivation.ts` (NEW, node-importable — no browser globals, no `../config`),
`src/config.ts` (sole owner). Mirror `content/tide.ts`: `cultivationWeek(now)`, `bedPhase(...)`,
`wildgrainStage(...)`, `wildgrainRipe(...)`, `wildgrainRipeWithin(now,seed,period,slack)`,
`msToNextRipe(...)`. config.ts: `CULTIVATION_PERIOD_MS`, `CULTIVATION_SLACK_MS`, dev scaling +
`DEV_CULTIVATION` (`?cultivationtest`); `VERDANT_LOOM: RefinerConfig` (in wildgrain → out
verdant_fibre); `WARDEN_ALTAR_PER_HEAD.verdant`; `DEV_VERDANT_FIGHT` (`?verdantfight`).

### T7.3 — Verdant fight kit + wave vocabulary  (parallel after T7.1)
Files: `src/content/guardian.ts` (add `makeVerdantWaveTiles(w,h,seed)` — a genuinely distinct slam
family; stays node-importable, `mulberry32`, no browser globals), `src/content/wardens.ts`
(`VERDANT_PHASES`, `VERDANT_KIT`, `WARDENS.verdant = {id:'verdant', kit:VERDANT_KIT,
totem:'verdant_totem', gateKey:'terrace_key', realm:'green_terraces', drops:{terrace_key:1}}`).

### T7.4 — Node type + node/tile art  (parallel after T7.1)
Files: `src/content/nodeTypes.ts` (`NodeTypeId += 'wildgrain_bed'`; BASE_NODE_TYPES entry: yield
`{wildgrain:2}`, bonusTool `machete`, blocks false, regrow ~150s; NODE_NAMES_DE), `src/assetConfig.ts`
(node sprite entries `wildgrain_bed` + `_depleted` ONLY — leave the boss-sheet entry to T7.7),
`tools/compose-wildgrain.ts` (NEW; mirror `tools/compose-echo-crystal.ts`).

### T7.5 — Recipes + Verdant Loom structure + cuirass recipe + Village values  (parallel after T7.1)
Files: `src/content/recipes.ts` (`verdant_totem` {echo_crystal, hushsteel, fiber} requiresForge;
`verdant_loom` {plank, stone, hushsteel} requiresTool hammer; `verdant_cuirass` {verdant_fibre:6,
plank:2, fiber:2} kind tool auto-equip; `grasweave_ration` {wildgrain:2, verdant_fibre:1}
consumable/food), `src/content/village.ts` (`VERDANT_LOOM_ART` StructureArt 2×2 mirror
CHIME_KILN_ART; add wildgrain/verdant_fibre to the Village contribution-value table),
`src/ui/icons.ts` (icon draws for the 6 new ids + register VERDANT_LOOM_ART in the structure-icon
merge). Do NOT edit config.ts (T7.2 owns it).

### T7.6 — Genmap district (Green Terraces + Verdant arena)  (after T7.3)
Files: `tools/generate-map.ts`, then run `npm run genmap` to regen `public/map/*.json`.
- New RNG stream `rng4` — draw ALL Verdant terrain randomness from it (never rng/rng2/rng3).
- Verdant arena constants + late RNG-free carve + `blocked` home + `keptNodes` eviction (mirror
  mire/echo arenas). District rect recommended `{x:220, y:300, w:120, h:72}` (right of the Mire,
  after both districts in row-major order). NO `decor[][]` in the district (use `foliage[]` props
  so each tile still costs exactly one `pick2` — keeps the shared tile-variant loop's rng2 sequence
  unchanged). Append `placeNodeNear` calls AFTER the Hushdark's (stable node ids). Zone rect + `t10`
  tablet spot.
Accept: `git diff public/map/world-data.json` shows only new Verdant nodes/zone/district + arena
carve; `jungle-map.json` changes only inside/after the footprint; build green.

### T7.7 — Scene wiring (fight visuals, cultivation gate, Loom, veil) + Boot anims  (last code ticket)
Files: `src/scenes/GameScene.ts`, `src/scenes/BootScene.ts`, `src/assetConfig.ts` (`verdant_warden`
sheet entry — mirror echo_warden). GameScene: `KIT_ART.verdant`; verdant summon branch (mirror
mire/echo ~1063/1128); verdant ambience veil (mirror Hushdark veil ~1376); cultivation harvest gate
(refuse `wildgrain_bed` unless `wildgrainRipeWithin(...)`) + growth-stage bed tinting; `CHIP_TINTS`;
`nearbyStructure(['verdant_loom'])` → `openRefiner(id, VERDANT_LOOM, ...)`; register VERDANT_LOOM_ART
in the structure-art merge. BootScene: `verdant-idle`/`verdant-eye` anims guarded by
`if (this.textures.exists('verdant_warden'))`.
Accept: build green; `?verdantfight` solo → summon→fight→terrace_key→open gate; `?cultivationtest`
shows beds ripen/reset; Loom refines wildgrain → verdant_fibre; cuirass crafts + equips (visible).

### T7.8 — Quest + lore + Mock dev grant  (parallel after T7.1)
Files: `src/content/journey.ts` (`TERRACE_QUEST_STEPS` + `TerraceProgress` + `terraceQuestComplete()`
mirroring HUSHDARK_QUEST_STEPS: offering → best warden (terrace_key) → open gate → refine
verdant_fibre → craft cuirass), `src/content/lore.ts` (`t10` EN+DE), `src/backend/MockBackend.ts`
(`?verdantfight` dev grant: verdant_totem + altar goods, by item id — no wardenDef dependency). Do
NOT edit config.ts.

## Execution order

1. **T7.1** solo → build green (foundation; everyone imports its ids).
2. **T7.2, T7.3, T7.4, T7.5, T7.8** in parallel (disjoint files) → integration build → fix breaks.
3. **T7.6** (genmap, needs T7.3) → verify byte-stability.
4. **T7.7** (scene, needs 2/3/4/6) → build green → browser smoke (?verdantfight, ?cultivationtest).

## Gotchas (must hold)
- Genmap byte-stability: rng4 only, no `decor[][]`, append after Hushdark, late RNG-free arena carve.
- Do NOT change `MAP_W`/`MAP_H` (already 384; Verdant fits existing space).
- `guardian.ts` + `cultivation.ts` stay node-importable (genmap + backends import them).
- Weekly reseed uses `floor(now / 7d)` monotone integer, not a `% 24h` phase.
- `grasweave_ration` must ride the generic `kind:'food'` eat→move-buff path (verify it's not a
  hardcoded id list; if it is, add the id).
- Cuirass recipe `kind:'tool'` → Tools tab + auto-equip via armorDef (no armor tab).
