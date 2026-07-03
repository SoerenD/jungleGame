# Feature Plan: Guardian of the Ruins (v2 content arc)

One-liner: A communal Seal at the Ruins that the whole group grinds to break, a summonable
deterministic combat-lite Guardian behind it, tier-2 tools/resources gated by its drops, and
fishing + campfire cooking as the tier-2 repeatable — giving the friend group a long-term shared
goal from the first minute of play (told by an intro story).

Everything below was decided in a grilling session on 2026-07-03. These are facts, not options.
Numeric values are deliberate starting points and must live as tunable constants.

## Resolved decisions

### The arc
1. Player-felt problems addressed: nothing left to do after the v1 quest, nothing to work
   toward, world feels static. Solution shape chosen: Valheim-style summoned-boss progression
   merged with a WoW-Ahn'Qiraj-style one-time community goal.
2. The **Seal**: the Guardian's arena at the Ruins is closed by a Seal. Breaking it requires a
   communal pool of Offerings contributed by all Players at a Seal monument. It breaks **once,
   forever** (world flag, like `gateOpen`).
3. Seal quotas are **fixed per-resource** (not a weighted anything-pool): start at
   **600 wood, 500 stone, 300 fiber, 150 fruit**. Sized for ~2 weeks of casual evenings for ~8
   players; expose dev-fast overrides (see gotchas). Four progress bars in the UI.
4. Seal presentation: physical monument at the Ruins showing progress on approach; HUD quest
   label extended (existing `📜 x/5 · 🗺 x/3` pattern); chat announcements from "🌿 Jungle" at
   25/50/75/100%. **No individual contribution leaderboard — collective totals only.**
5. After the Seal breaks, the Guardian is resummoned repeatably and cheaply: craft a
   **Summoning Totem** (tier-1 resources only: 5 wood, 3 fiber, 2 fruit) and place it as an
   Offering at the arena altar.

### The Guardian (see ADR-0002 — read it before implementing)
6. Stationary, anchored to a fixed arena at the Ruins. Never chases beyond it. No AI, no tick
   loop: its attack pattern (telegraphed danger zones on arena tiles) is a **pure function of
   `summonedAt + elapsed`** — every client renders the same schedule locally.
7. Fight window (**slumber timer**): awake **300 s** from summon. Not slain in time → returns to
   slumber, HP resets fully, totem is consumed. Retry = craft another totem.
8. Guardian HP: **500** (tune in playtest). Damage rule: every Player hit deals 1; owning an
   axe or pickaxe (or their tier-2 versions) doubles it — the exact `bonusTool` mechanic from
   `src/content/nodeTypes.ts`. **No weapons, no equip system.**
9. Knockdown: caught in a danger zone → stunned **5 s** (can't move/hit), gets up in place.
   **No item loss, no scatter** (ground items don't exist in this game — do not invent them).
10. **Exhaustion** (the word "death" is banned — see CONTEXT.md): 3rd knockdown within one
    fight → Player collapses and wakes at `world.spawn`, inventory intact, may run back and
    rejoin. Hits already landed still count for loot.
11. Loot: **participation-based** — every Player who landed ≥1 hit during a victorious fight
    receives the full drop set: **3 Guardian Scales** each. Presence without a hit earns
    nothing. This is a deliberate exception to the finishing-hit rule and doubles as the
    latecomer gate: tier-2 requires Scales, Scales require personally fighting.
12. Hit/knockdown/exhaustion adjudication is validated against **server time**, not client
    time (clock skew — ADR-0002). Client clocks may drive rendering only.

### Tier-2 content
13. Two new Resource Node types are **visible in the World from day one** but refuse harvest
    (`TOOL_REQUIRED`) without tier-2 tools: **Ancient Hardwood tree** (yields hardwood,
    requires ancient axe) and **Obsidian rock** (yields obsidian, requires ancient pickaxe).
    They taunt from the start; the intro story points at them.
14. New resources: `guardian_scale`, `hardwood`, `obsidian`, `fish`, plus item `cooked_fish`
    and item `summon_totem`.
15. Tier-2 recipes (all require Guardian Scales):
    - Ancient Axe: 3 scale + 3 wood + 2 stone — harvests hardwood; doubles damage on trees and Guardian (supersedes axe).
    - Ancient Pickaxe: 3 scale + 2 wood + 3 stone — harvests obsidian; doubles damage on rocks and Guardian.
    - Fishing Rod: 2 scale + 2 wood + 2 fiber.
16. New tier-2 Structures (starting set, costs tunable): Obsidian Statue (4 obsidian),
    Hardwood Arch (4 hardwood, requires hammer), Guardian Trophy (5 scale + 2 obsidian),
    Obsidian Path (2 obsidian), Brazier (2 obsidian + 2 wood; glows at night like torch,
    bigger radius — add to the `glowDef` in GameScene).

### Fishing & cooking (the tier-2 repeatable)
17. **Fishing Spots are ordinary Resource Nodes** on water tiles (river delta, falls):
    `requiredTool: fishing_rod`, cast = harvest hit, depletes, regrows. The bite rhythm
    (random 1–4 s wait for "!", then click to land = the `hitNode` call) is client-side
    flavor only — zero new server concepts.
18. **Cooking**: interact with any campfire Structure while carrying fish → cooked fish
    (campfires finally have a function). Eating cooked fish grants **+20% move speed for
    180 s** — the game's first and only buff, client-side timer (trusted client, ADR-0001).

### Intro story
19. Shown **once per Player on first join** (per-player `introSeen` flag), full-screen textbox
    after the join screen, skippable (click/Enter). Re-readable at the **Welcome Stone**, a
    tablet-style object beside spawn that does NOT count toward the 📜 quest.
20. Add one new lore tablet near the Ruins ("Tablet of the Seal") that DOES count — derive the
    tablet total from world data instead of the hardcoded `/5` in `src/ui/hud.ts:110`.
21. Draft intro text (implementer may polish, keep ~this length):
    > The jungle remembers. Whatever you take, it returns; whatever you build, it remains.
    >
    > You and your friends share one world. Gather wood, stone, fiber and fruit; craft tools;
    > build a camp that outlasts you.
    >
    > But deep in the Ruins something older sleeps. The ancients sealed it behind a wall of
    > offerings — bring the jungle's gifts to the Seal, all of you together, and it will open.
    >
    > Beyond the Guardian's slumber lie the black rock no pickaxe can break and the ancient
    > hardwood no axe can cut. Earn its scales. Master the jungle.

## Acceptance criteria

Seal
- Given `sealBroken=false`, When a Player at the monument contributes carried resources, Then
  their inventory decreases, the pool increases, and all connected clients see updated progress.
- Given a contribution would overshoot a quota, Then only the needed amount is taken.
- Given the last quota fills, Then `sealBroken` becomes true permanently (survives everyone
  logging off), an epic chat/world announcement fires, and the arena becomes enterable.
- Given `sealBroken=true`, When any Player (including one who contributed nothing) approaches,
  Then the arena is open — no per-player seal state.

Guardian fight
- Given a Player carries a Summoning Totem and stands at the arena altar with `sealBroken=true`
  and no fight in progress, When they summon, Then the totem is consumed and every connected
  client starts the fight from the same broadcast `summonedAt`.
- Given a fight is already in progress, Then a second summon is rejected.
- Given the fight is live, When a Player lands a hit, Then shared HP decreases by 1 (2 with
  axe/pickaxe/tier-2 versions) via server-ordered RPC, and the hitter is recorded in the fight's
  participant set.
- Given a Player stands in a danger zone at its (server-time) trigger moment, Then they are
  stunned 5 s; on their 3rd knockdown in this fight they teleport to `world.spawn` with
  inventory intact.
- Given HP reaches 0 within 300 s, Then every participant with ≥1 hit receives 3 Guardian
  Scales, a victory announcement fires, and the Guardian returns to visible slumber.
- Given 300 s elapse with HP > 0, Then the Guardian sleeps, HP resets to full, no loot, and a
  new totem is required to retry.
- Given a Player joins mid-fight, Then they see the fight in the correct phase (state derived
  from `summonedAt`, not from having witnessed the summon).

Tier-2
- Given no ancient axe/pickaxe, When a Player hits a hardwood tree / obsidian rock, Then the
  harvest is refused with `TOOL_REQUIRED` naming the tool (nodes visible from day one).
- Given the tool, Then harvest/deplete/regrow behave like any Resource Node.
- Given a Player who has never hit a Guardian, Then they hold no Scales and cannot craft any
  tier-2 recipe; after landing one hit in any victorious fight they can.

Fishing & cooking
- Given a fishing rod, When a Player casts at a Fishing Spot, Then after a short bite delay a
  click lands the catch (a normal node hit) yielding fish; the spot depletes and regrows.
- Given carried fish and a nearby campfire, When the Player cooks and eats, Then move speed is
  +20% for 180 s and visibly expires.

Intro
- Given a brand-new Player finishes the join screen, Then the intro story renders before
  gameplay and never again on later joins; the Welcome Stone at spawn re-shows it on demand.

## Scope boundaries — do NOT build

- No trading/gifting between Players. No storage/chests — the Supply Crate stays decorative.
- No ground items / dropped-item entities (knockdown is stun-only; the scatter idea was
  explicitly rejected).
- No weather, seasons, NPCs, farming, pets, avatar customization, or new Zones.
- No dedicated game server and nothing requiring a server tick loop (ADR-0001, ADR-0002).
- No fish species/rarity/collections (noted future extension). No buffs other than the cooked
  fish speed boost. No leaderboards of any kind.
- Do not refactor the existing v1 quest arc (tablets / vine gate / treasure dig) except
  deriving the tablet count from data (hud.ts).
- Do not rename or restructure the Backend interface pattern — extend it.

## Constraints and gotchas

- `src/backend/types.ts` is the seam: add Guardian/Seal/cooking APIs + events there, implement
  in `MockBackend` first, and keep every mutation RPC-shaped and every event broadcast-shaped so
  the future SupabaseBackend maps 1:1 (ADR-0001). Follow the existing `offerAltar`/`gateOpen`
  pattern for the Seal — it is the proven miniature of this feature.
- Determinism discipline (ADR-0002): danger-zone schedule = pure function of `summonedAt`;
  adjudicate knockdowns/hits against server time. The Guardian can never chase or aim — design
  difficulty as authored patterns (rings, crosses, rhythm), like a bullet-pattern puzzle.
- Dev tunability: mirror the `FAST_REGROW` / `?night` pattern in `src/config.ts` with e.g.
  `FAST_SEAL` (tiny quotas) and `?fight` (instant summon ready) so everything is testable solo.
- Map work required in `tools/generate-map.ts` / `public/map/world-data.json`: Guardian arena +
  Seal monument + altar at the Ruins, hardwood trees, obsidian rocks, fishing spots, Welcome
  Stone, Tablet of the Seal. Extend minimap color mapping in `src/ui/hud.ts` for new features.
- Art pipeline: all assets are CC0 crops composed by `tools/compose-assets.ts` (see CREDITS.md —
  update it for EVERY new asset). The Guardian needs a large multi-tile sprite (48×48+ px,
  2–4 frame idle) — source a CC0 golem/beast from OpenGameArt or composite from pack pieces.
  "Epic" is mostly presentation, all in-pipeline: screen shake on slams, roar SFX (CC0), music
  change during the fight, glowing red telegraph tiles, braziers lighting up, Guardian added to
  the night `glowDef` in `GameScene.ts` (~line 654).
- Existing audio pattern: new SFX go through `src/assetConfig.ts` like chop/harvest/craft.
- Environment quirks: npm/npx here always needs `--registry https://registry.npmjs.org/`; when
  verifying in the preview, a hidden iframe freezes Phaser (`document.visibilityState`) —
  restart the preview rather than chasing phantom freezes.

## References

- `CONTEXT.md` — canonical terms used above: **Guardian, Seal, Offering, Exhaustion**, plus the
  updated Relationships section (participation-loot exception, tier-2 gating, fishing, cooking,
  intro story). The word list `_Avoid_` entries are binding for all UI text.
- `docs/adr/0001-supabase-as-entire-backend.md` — no game server; lazy time-based mechanics.
- `docs/adr/0002-guardian-runs-on-deterministic-schedule.md` — why the Guardian is stationary
  and deterministic; considered alternatives; clock-skew consequence.
- `CREDITS.md` — asset licensing ledger; must stay accurate.
- Design precedents consulted: Valheim Forsaken Altars (summon + drop-gated tiers), WoW Gates
  of Ahn'Qiraj / Helldivers 2 Major Orders (communal goal), Stardew bundles (per-resource
  quotas), Webfishing/Stardew (fishing feel), cozy-game faint conventions (Exhaustion).
