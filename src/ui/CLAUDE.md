# src/ui/

The DOM/HUD layer plus the typed event bus that wires the Phaser world to the HTML overlay. Holds
the whole in-game HUD (panels, minimap, chat, loadout), the pre-game join/intro overlays, and the
hand-drawn icon renderer.

- `bus.ts` — the typed singleton `bus`; `GameEvents` is the frozen, compile-checked
  scene/systems ↔ HUD contract (both directions).
- `hud.ts` — the large DOM HUD, driven entirely by bus events. `icons.ts` — 12×12 `GRIDS`/`PAL`
  item icons + `drawStructureArt`. `join.ts` / `intro.ts` — Promise-returning full-screen overlays.
  `styles.css` — all HUD CSS (`--ui-scale`).
- **Rule:** the UI talks to the game ONLY through `bus` — never import scene/systems here. To cross
  the boundary, add an event to `GameEvents` in `bus.ts`.
- `icons.ts` `GRIDS` feed BOTH the HUD slot icon and the in-world baked sprite — keep an icon edit
  visually in sync with the object's real sprite.
