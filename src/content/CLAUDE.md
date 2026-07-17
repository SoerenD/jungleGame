# src/content/

Pure content/data/rule modules — the single source of truth for the game's numbers and mechanics,
shared verbatim by both backends, the HUD, and the scene/systems.

- Item & world data: `items.ts` (Resource/Tool/Item ids), `recipes.ts`, `nodeTypes.ts`,
  `stats.ts` (the effective combat character-sheet: weapon band + Armor + Village buffs folded in).
- `guardian.ts` — the Guardian's authored fight schedule as a **pure function of elapsed time**
  (ADR-0002); never keys on HP or player actions.
- `dungeon.ts` — the Delve's **reactive** (host-simulated) mob engine; `wildlife.ts` reskins that
  same engine (ADR-0011/0012), never a second brain.
- Warden ladder (ADR-0017): `wardens.ts`, `armor.ts`, and the clock-pure Realm mechanics
  `tide.ts` / `echoes.ts` / `cultivation.ts`.
- `village.ts` (communal meta-loop, ADR-0010), `journey.ts` (onboarding), `lore.ts` (tablets).

**Load-bearing rule:** every module here must stay **node-importable** — no browser globals, no
`../config` import (the `guardian.ts` gotcha generalizes to the whole folder), because the offline
`tools/` and the server-side reasoning import them. Deterministic mechanics compute lazily as pure
functions of the clock/elapsed (ADR-0001/0002), never a tick loop.
