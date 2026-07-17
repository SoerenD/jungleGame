# tools/

Offline Node/TypeScript asset-pipeline scripts, run via `tsx` (`npx tsx tools/<file>.ts`) — **never
bundled into the browser**. A shared PNG canvas/codec, the world-map generator, and a family of
sprite/audio composers that write into `public/assets/**` and `public/map/**`.

- `png.ts` (RGBA `Img` canvas + PNG writer) & `png-decode.ts` (decoder + `cropScaled`) — imported
  by nearly every `compose-*` / `crop` script.
- `generate-map.ts` — `npm run genmap` → `public/map/*.json`. Output is generated (never hand-edit
  the JSON), and edits here MUST preserve RNG draw order (pinned core, separate `rng2/3/4` streams
  per Realm district) or every node id shifts and breaks saved worlds.
- `compose-*.ts` / `make-*.ts` — sprite & audio generators. `make-*` placeholders never overwrite
  an existing file (downloaded CC0 assets win); record each generated file in `CREDITS.md`.
- These import from `src/content/**`, which is why those modules must stay node-importable.
