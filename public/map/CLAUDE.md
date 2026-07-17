# public/map/

Generated world data: `jungle-map.json` (tile layers) and `world-data.json` (Nodes, Zones,
landmarks). Loaded at boot to build the World.

- **Generated — never hand-edit.** Regenerate with `npm run genmap` (`tools/generate-map.ts`).
  Output must stay byte-stable across unrelated changes; diff before committing.
