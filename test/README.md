# Tests

An automated suite so the core game **rules and data no longer need a manual playtest**
to trust. Runs headless (Vitest + happy-dom) in ~3 s.

```bash
npm test          # run once
npm run test:watch  # re-run on change
npm run coverage  # run + coverage report (gated at 75%)
```

## What is covered

Two layers:

1. **Pure content modules** (`test/content/*`) — the deterministic rules/data that
   define the game: the Guardian's authored schedule + combat rolls, the Tide and
   Cultivation clocks, the Echoes replay math, the crafting recipes, the Village tier
   ladder + market + pool, the Journey/Warden quest chains, the character sheet, the
   item/node/warden tables. These are the "testdata" — pure `f(input) → output`, no
   Phaser, no clock, no network.

2. **The rules engine** (`test/backend/mockBackend.test.ts`) — drives the real
   `MockBackend` gather → craft → Seal loop the way a player would (join, fell a tree,
   craft an axe, tool-doubling, depletion/affordability rules). `fetch` is stubbed to
   serve `public/map/world-data.json`; network lag and the roaming bots are neutralised
   so the loop is deterministic.

Coverage (`vitest.config.ts` → `coverage.include`) is scoped to the rules/data modules
under test — the honest denominator. Render/IO code (scenes, systems, the HUD, art
rasterizers, i18n strings, the network `SupabaseBackend`) is driven by the browser, not
by tests, and is out of scope; verify those in the preview as before. Current coverage of
the scoped surface is ~94% statements / ~87% branches / 100% functions.

## Notes

- Tests live outside `tsconfig.json`'s `include`, so `npm run build` (`tsc`) never
  compiles them — the build stays the production correctness check.
- The clock-based modules take their period as a **parameter** and never read
  `Date.now()`, so tests pin exact instants. Keep it that way when extending them.
