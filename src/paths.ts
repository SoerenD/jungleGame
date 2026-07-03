/**
 * Resolve a public asset path against Vite's base URL. In dev the base is `/`,
 * so paths are unchanged; a GitHub Pages build sets base to `/jungleGame/`, so
 * every runtime-loaded asset (`/assets/...`, `/map/...`) must be prefixed with
 * it — Vite rewrites its own imports and index.html, but NOT hardcoded strings
 * passed to `fetch` or the Phaser loader.
 */
export const asset = (p: string): string => import.meta.env.BASE_URL + p.replace(/^\/+/, '');
