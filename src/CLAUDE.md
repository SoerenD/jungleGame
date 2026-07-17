# src/

The bundled TypeScript app that runs in the browser (Vite + Phaser 3). `main.ts` is the entry:
it creates the Backend, boots the two scenes (Boot → Game), and mounts the HUD.

Loose top-level modules (subfolders are documented separately — `backend/`, `content/`,
`scenes/`, `systems/`, `ui/`):

- `config.ts` — all tuning constants, the grid (`TILE`, world size + frontier/Realm growth), and
  the dev URL flags (`?fight`, `?night`, …). The one place with browser-facing config.
- `world.ts` — multi-world identity: the join-screen name → `world_id` slug (ADR-0014).
- `i18n.ts` — language tables built **at import time**; changing language reloads the page so
  content tables rebuild. Call sites stay unchanged (`ITEMS[id].name`, `t.toast.…`).
- `avatars.ts`, `mobSprites.ts`, `delveProps.ts` — original code-drawn pixel art (canvas
  `fillRect` → Phaser texture), no PNGs.
- `assetConfig.ts` — declares what the `public/assets/` files look like (frame sizes, keys).
- `paths.ts` — `asset()` prefixes the Vite base URL. **Every runtime-loaded asset URL** passed to
  `fetch`/the Phaser loader MUST go through it, or it 404s under the GitHub Pages base path.
