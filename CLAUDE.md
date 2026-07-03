# Jungle World

Pixel-art multiplayer browser game (Phaser 3 + Vite + TypeScript): one persistent jungle world
for ~8 friends — gathering, crafting, building, and exactly one opt-in encounter (the Guardian).

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — `tsc && vite build` (the correctness check; there are no tests)
- `npm run genmap` — regenerate `public/map/*.json` (generated — never hand-edit)
- npm/npx always need `--registry https://registry.npmjs.org/`

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
- All state goes through the `Backend` interface (`src/backend/types.ts`) and must stay
  Supabase-shaped; `MockBackend` is the only implementation.
