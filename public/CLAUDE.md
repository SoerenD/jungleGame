# public/

Vite's static-serve root: files here are served verbatim at the site root (no bundling,
no hashing) and fetched at runtime by the game.

- `assets/` — art & audio (PNG/WAV/MP3). `map/` — generated world JSON.
- Reference these by absolute URL path (`/assets/...`, `/map/...`), not by import.
