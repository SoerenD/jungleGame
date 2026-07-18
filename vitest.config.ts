import { defineConfig } from 'vitest/config';

// Vitest config for Jungle World's automated test suite (see test/README.md).
//
// The suite targets the game's RULES + DATA — the pure, node-importable content
// modules (guardian schedule, tide/cultivation clocks, crafting recipes, village
// ladder, journey quests, combat maths …) plus a MockBackend integration test
// that drives the real gather → craft → seal loop. This is the surface that used
// to need manual playtesting; the content modules ARE the game's "testdata".
//
// happy-dom supplies window/document/localStorage so config.ts (read at import
// time) and MockBackend load unchanged. Coverage is scoped to the rules/data
// modules under test — the honest denominator, not the art/render/Phaser code
// that a headless runner can't meaningfully exercise.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      // The rules/data surface the suite is responsible for. Everything else
      // (scenes, systems, HUD, art rasterizers, i18n strings, the network
      // SupabaseBackend) is render/IO code driven by the browser, not by tests.
      include: [
        'src/content/guardian.ts',
        'src/content/tide.ts',
        'src/content/cultivation.ts',
        'src/content/echoes.ts',
        'src/content/stats.ts',
        'src/content/armor.ts',
        'src/content/village.ts',
        'src/content/journey.ts',
        'src/content/items.ts',
        'src/content/recipes.ts',
        'src/content/nodeTypes.ts',
        'src/content/wardens.ts',
      ],
      thresholds: {
        statements: 75,
        lines: 75,
        functions: 75,
        branches: 75,
      },
    },
  },
});
