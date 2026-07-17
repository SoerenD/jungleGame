# src/systems/

The ADR-0018 gameplay systems: ~18 plain-TS `*System` classes (Harvest, Fight, Input, Delve,
Build, Village, Wildlife, Fog, …), each one gameplay concern implementing the `GameSystem`
create/update/destroy contract, constructed `(ctx, deps?)` — no Phaser subclassing — and driven by
GameScene's humble dispatch.

- `context.ts` — the injected `GameContext` hub every system reads through.
- `types.ts` — the `Mode` FSM, the `GameSystem` contract, the `WorldData` shape.
- `sceneFx.ts` / `delveInterior.ts` — free render helpers (take the scene, hold no state).

**Gotchas:** genuine cross-system refs (`.district`, `.fog`, …) are late-wired PUBLIC fields set in
`GameScene.create()` — NOT compile-checked; after any edit, diff every `X!:` field against that
wiring or a `checkZone`-style call throws at runtime. `destroy()` MUST detach every bus listener
(world-switch restart double-subscribes otherwise). `update()` is GameScene's explicit numbered
dispatch, not a flat loop — never rely on file order. See the `system-dev` skill before adding one.
