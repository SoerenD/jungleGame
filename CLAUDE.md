# Jungle World

Pixel-art multiplayer browser game (Phaser 3 + Vite + TypeScript): one persistent jungle world
for ~8 friends — gathering, crafting, building, and exactly one opt-in encounter (the Guardian).

## Mechanics

- **Gathering** — hold interact to swing at Resource Nodes (tree, rock, bush, fiber, fishing
  spot); the finishing hit takes the yield, the matching in-hand Tool doubles damage, and nodes
  regrow lazily after a real-time delay.
- **Crafting** — Recipes turn Resources into Tools (carried) or Structures (placed); tier-2
  Recipes need Guardian Scales and planks.
- **Loadout** — three quick-slots; keys 1–3 pick the single in-hand Tool (only it acts, and it
  shows in each Player's hand). Bare hands still harvest the basic Nodes.
- **Structures** — placed permanently, first claim on a tile wins; functional ones: campfire
  (cooking), crate (shared storage), signpost (player text), Hammock (personal wake point),
  Sawmill (wood → planks after a real-time delay).
- **Seal** — communal wood/stone/fiber/fruit quotas with visible progress bars; pooled
  Offerings break it once, forever, opening the Guardian arena.
- **Guardian** — a crafted Summoning Totem wakes it for ~5 min of authored, time-keyed slam
  waves, telegraphed lunges, and three fury phases; unslain, it re-slumbers at full HP and the
  totem is spent.
- **Eye Windows** — hits count only in the short post-slam window (2 damage, 3 with an in-hand
  axe/pickaxe, shorter each fury phase); everything else bounces off.
- **Bow** — tier-1 ranged weapon (wood/fiber/stone, no Guardian drops, craftable before the
  first fight); looses arrows for 2 in an Eye Window on a slower cadence than melee — safe but
  weaker than an axe swing.
- **Knockdown / Exhaustion** — danger tiles stun ~5 s; three knockdowns in one fight wake the
  Player at their Hammock or spawn, inventory intact.
- **Participation loot** — every Player with ≥1 landed hit gets the full drop set (Guardian
  Scales), gating tier-2 Tools.
- **Tier-2 nodes** — ancient hardwood and obsidian are visible from day one but harvestable
  only with tier-2 Tools.
- **Fishing** — tier-2 rod; Fishing Spots are ordinary water-tile Resource Nodes with a
  client-side bite-and-reel rhythm.
- **Cooking** — fish cooks at any campfire; eating cooked fish gives a +20% move-speed food
  buff for ~3 min. (Village tiers add collective combat buffs — ADR-0013 retired the old
  "one buff only" rule.)
- **Day/night** — real-clock-derived cycle; night darkens the screen and adds fireflies.
- **Hand Torch** — tier-1 worn Tool; held, it lights the Player with a warm orange glow at
  night (there is no automatic player glow).
- **Avatar** — blockhead composed from four curated palette picks (skin, hair, shirt, pants),
  editable at every join, synced to all Players.
- **Journey** — 7-step onboarding checklist (first wood → first Seal Offering) that
  auto-completes from prior actions; contextual key hints retire after 3 uses.
- **Lore** — skippable intro story (re-readable at the Welcome Stone) plus five Ancient
  Tablets readable in the World.
- **Treasure** — Nodes drop map pieces (~12%); three pieces reveal a dig spot behind the vine
  gate, itself opened permanently by a one-time 2 fruit + 2 fiber Offering.
- **Chat & signposts** — T opens persisted broadcast chat; signposts hold a short line of
  Player-written text.
- **Multiplayer** — presence, names, and movement sync through the Backend; server order
  resolves all conflicts.
- **Minimap & Zones** — radar shows players and landmarks; Zone names display on entry.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — `tsc && vite build` (the correctness check; there are no tests)
- `npm run genmap` — regenerate `public/map/*.json` (generated — never hand-edit)
- npm/npx always need `--registry https://registry.npmjs.org/`
- `/goal <condition>` — Claude Code built-in (v2.1.139+): keeps working across turns until a fast model confirms the condition holds, then clears; `/goal clear` stops early. Good for driving `npm run build` to green.

## Read first

- `CONTEXT.md` — binding glossary: **Guardian** (never "boss"), **Structure** (never
  "building"), **Exhaustion** (never "death"), etc.
- `docs/adr/0001-supabase-as-entire-backend.md` — no dedicated game server, ever; time-based
  mechanics compute lazily from timestamps.
- `docs/adr/0002-guardian-runs-on-deterministic-schedule.md` — the fight is a pure function of
  `summonedAt + elapsed`; the Guardian never chases, aims, or reacts; nothing depends on HP.
- `.claude/plans/feature-plan-v3-fight-guide-build.md` — the current implementation plan.

## Gotchas

- `src/content/guardian.ts` must stay node-importable: no browser globals, no `../config`.
- Hidden preview tabs suspend RAF and freeze the game — load with `?pump&canvas` and drive via
  the `__jw` / `__game` dev handles.
- Dev URL flags: `?fight` (Seal broken, free totem, weak Guardian), `?night`, `?slowregrow`,
  `?slowseal`.
- All state goes through the `Backend` interface (`src/backend/types.ts`). Two implementations,
  chosen by env in `createBackend.ts`: `MockBackend` (localStorage, single-player) and
  `SupabaseBackend` (shared world; schema in `supabase/migrations/`, see ADR-0005).
