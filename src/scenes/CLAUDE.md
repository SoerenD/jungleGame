# src/scenes/

The two Phaser scenes plus GameScene's extracted helpers.

- `BootScene.ts` — runs first: preloads assets and procedurally bakes canvas textures/anims
  (glow, clouds, arrow, held-item, shadow, fog-brush, Warden anims), then emits `assets-ready`.
- `GameScene.ts` — the ADR-0018 **humble Scene**: builds the shared `GameContext`, instantiates and
  wires the ~18 systems in `src/systems/`, and runs the explicit numbered per-frame `update()`
  dispatch. It holds **no gameplay logic** of its own — logic lives in the systems.
- `devHandles.ts` (DEV-only `__jw`) + `worldDressing.ts` (static foliage/clouds/water).

**Gotchas:** the late-wired `system.x = other` refs set in `create()` are NOT compile-checked (the
wiring-bug class); `update()`'s order is load-bearing (delve early-return + chat/stun halt live
inside it). `__jw` handle names are a stable contract that headless test flows depend on.
