# Guardian of the Ruins — implementation verification report

Date: 2026-07-03. Feature implemented per `.claude/plans/feature-plan-guardian-of-the-ruins.md`,
CONTEXT.md terminology, ADR-0001 (no game server / no tick loop) and ADR-0002 (deterministic
stationary Guardian, server-time adjudication).

## Build & boot

| Check | Result |
| --- | --- |
| `tsc` + `vite build` | ✅ zero errors (`✓ built in 5.77s`) |
| Game boots in dev preview | ✅ join → intro → world; HUD, bots, chat all live |
| Console errors / warnings | ✅ none (error- and warn-level logs both empty) |

Note on method: the preview harness ran its tab fully hidden (`document.visibilityState ===
'hidden'`, layout never computed), which suspends Phaser's RAF loop — the documented quirk.
Verification used the dev-only `?pump` flag (added to `src/main.ts`, spoofs visibility and pumps
the loop via MessageChannel) plus `?canvas` (forces the 2D renderer). All criteria below were
demonstrated in the running game and observed through game state, the Mock server's persisted
state, HUD DOM, chat log and toasts. Pixel screenshots are impossible in a 0×0 hidden window;
sprite art was verified separately via a rendered contact sheet.

## Acceptance criteria

### Seal
- ✅ **Contribute**: at the monument, E moved carried wood/stone/fiber/fruit into the pool —
  inventory 2/1/1/1 → 0/0/0/0, bars showed 2/6 · 1/5 · 1/3 · 1/2 (FAST_SEAL dev quotas), HUD
  label `⛩ 31%`, seal panel opens on approach (proximity-driven).
- ✅ **Overshoot clamps**: carrying 10/10/5/5 against remaining 4/4/2/1 took exactly 4/4/2/1 and
  left 6/6/3/4.
- ✅ **Permanent break**: last quota filled → `world.seal.broken: true` persisted in the DB
  (survives logoff), epic chat announcement from 🌿 Jungle, `⛩ open` in HUD, monument hint
  changes. 25% milestone announcement observed earlier (`the Seal weakens — 25%…`).
- ✅ **Open for everyone**: seal state is world-level (no per-player field anywhere);
  `isWalkableTile(177,28)` (gate tile) → true after break; barrier sprites/bodies removed.

### Guardian fight
- ✅ **Summon**: totem consumed (1→0), every client starts from the broadcast `summonedAt`;
  fight panel showed `⚔ The Guardian · 30/30` and a live countdown; wake announcement in chat.
  (Dev `?fight`: HP 30, 90 s window, free totem — production values 500 HP / 300 s in config.)
- ✅ **Second summon rejected**: `summonGuardian()` mid-fight → `{ok:false, reason:'FIGHT_IN_PROGRESS'}`.
- ✅ **Damage rule**: hit without tools = −1 HP; with axe = −2 HP (measured 27→25 vs 28→27);
  hitter recorded in the participant set; HP shared via server-ordered RPC.
- ✅ **Knockdown**: standing in a telegraphed zone at the (server-validated) slam → 5 s stun;
  `reportKnockdown` re-derives the schedule from `summonedAt` against server time and confirmed
  each event. Duplicate reports for one wave are deduped server-side.
- ✅ **Exhaustion**: 3rd knockdown in one fight → `exhausted: true`, Player teleported to
  `world.spawn` (100,100), inventory byte-identical before/after, chat + toast fired
  ("hits already landed still count"). Counter resets so a returning Player gets three fresh
  knockdowns. Observed twice (kd log: 2, 3→EXHAUSTED, 1, 2, 3→EXHAUSTED).
- ✅ **Victory**: HP → 0 within the window → every participant with ≥1 hit received exactly
  3 Guardian Scales, 🏆 announcement fired, fight cleared, Guardian back to slumber frame.
- ✅ **Timer expiry**: window elapsed with HP > 0 → fight discarded (HP reset by discard),
  slumber announcement, no loot, new totem required (craft + re-summon demonstrated).
- ✅ **Mid-fight join**: full page reload during a live fight → fight reconstructed from
  persisted `summonedAt` (identical timestamp), panel + countdown at the correct phase
  (1:12 remaining at 18 s elapsed), danger zones rendering the correct wave.

### Tier-2
- ✅ **Refusal without tools**: hardwood tree → `TOOL_REQUIRED, requiredTool: 'ancient_axe'`;
  obsidian rock → `'ancient_pickaxe'`; toast names the tool. Nodes are in world data from day
  one (12 hardwood trees, 10 obsidian rocks across the map).
- ✅ **With tools**: ancient axe on hardwood: 6→4→2→0 HP (bonus double damage), +3 hardwood on
  the finishing hit; depleted → regrown to full HP after the regrow delay (FAST_REGROW).
  Obsidian likewise (+2 obsidian).
- ✅ **Scale gating**: with 0 scales, `craft('ancient_axe')` → `INSUFFICIENT`; after landing
  hits in a victorious fight (3 scales), the same craft succeeds. Scales come only from
  participation.

### Fishing & cooking
- ✅ **Fishing**: E at a Fishing Spot with a rod → cast → "!" bite after 1–4 s (observed
  3.97 s) → reel lands the catch as a normal `hitNode` → +1 fish; spot depleted (hp 0) and
  regrows like any node. 9 spots placed on water at the falls pool, river bends and delta.
- ✅ **Cooking + buff**: fish + adjacent campfire → cook → fish 1→0, cooked fish +1. Eating
  (HUD Eat button) → `💨 Swift +20% · 2:59` indicator; buff visibly expires (label disappears +
  "The warmth of the meal fades." toast). Speed multiplier ×1.2 applied in the movement code.

### Intro
- ✅ Shown once, full-screen, skippable (click/Enter), before gameplay, after the join screen;
  `introSeen` persisted per Player — did **not** reappear on later joins/reloads.
- ✅ Welcome Stone beside spawn re-shows it on demand (E), closable.

### v1 regression
- ✅ Gathering (tree → +3 wood, finishing-hit rule), crafting (torch), building (campfire
  placed), vine gate (world flag persisted from the old save; `offerAltar` → `ALREADY_OPEN`),
  treasure dig (3 map pieces → dig at ✕ → full loot incl. Golden Idol). Bots wander and chat.
  Existing player save (name, PIN, position, inventory) loaded cleanly; v1 node ids were kept
  byte-stable by placing all v2 nodes after the original RNG sequence in `generate-map.ts`.

## Architecture compliance

- Backend seam extended, not reshaped: 7 new RPC-shaped mutations
  (`contributeSeal`, `summonGuardian`, `hitGuardian`, `reportKnockdown`, `cook`,
  `eatCookedFish`, `markIntroSeen`) and 6 broadcast-shaped events (`sealChanged`, `sealBroken`,
  `guardianSummoned`, `guardianHit`, `guardianVictory`, `guardianSlumber`) — each maps 1:1 to a
  Postgres function / Realtime broadcast for the future SupabaseBackend.
- No tick loop: fight end is lazily reconciled from `summonedAt` on read (plus a mock-only
  one-shot broadcast timer); danger zones are a pure function in `src/content/guardian.ts`
  shared by client rendering and server adjudication; regrowth stays timestamp-derived.
- Guardian is stationary; all difficulty is authored wave patterns (ring / cross / stripes /
  scattered slams, deterministic per wave index).
- Scope boundaries respected: no trading, storage, ground items, leaderboards, weather, NPCs,
  new zones. Individual seal contributions are never tracked.
- Dev tunability: `FAST_SEAL` (tiny quotas; `?slowseal` for real ones), `?fight` (seal broken,
  free totem, weak/brief Guardian), mirroring `FAST_REGROW`/`?night`.

## Known notes

- `public/assets/objects/altar.png` (v1 grove altar) was found to be a fully transparent PNG —
  pre-existing v1 bug, out of scope; flagged as a separate task. v2 landmarks were composed
  from visible pieces instead.
- All new sprites are recolors/recombinations of the already-credited ArMM1998 CC0 crops
  (`tools/compose-v2-assets.ts`); new audio is synthesized placeholder WAV
  (`tools/make-v2-audio.ts`), both recorded in CREDITS.md (audio under TODO for later CC0
  replacement, matching repo convention).
- Toast phrasing "a Ancient Axe" inherits the v1 `a ${name}` template — cosmetic.
