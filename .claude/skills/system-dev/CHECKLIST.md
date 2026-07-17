# CHECKLIST — before committing any system change

Run through ALL of these. They encode the actual bugs this architecture has
shipped and caught.

## Compile & contract

- [ ] `npm run build` exits 0 (`tsc && vite build` — this is the correctness
      check; there are no tests).
- [ ] Every new bus event has its tuple in `GameEvents` (ui/bus.ts) — and no
      existing HUD event name/payload changed (`git diff -- src/ui/hud.ts`
      should be empty unless the HUD change is itself the reviewed feature).
- [ ] No new dependency in package.json; no genmap output change; no DB
      migration (unless the plan says so).

## Wiring (the shipped-bug class)

- [ ] For EVERY `x!: XSystem` ref your system declares: the wiring block in
      GameScene.create assigns it (`grep "yourSystem\." GameScene.ts`).
- [ ] Every wiring assignment happens AFTER both systems are constructed
      (the `harvest.fishing` bug: wired before the target existed).
- [ ] `this.systems.push(yourSystem)` is present (destroy() must run on
      shutdown) and `yourSystem.create()` is called at a deliberate bootstrap
      point.

## Listeners

- [ ] Every `ctx.bus.on(...)` in create() has a matching `ctx.bus.off(...)`
      in destroy() with the SAME stored handler field.
- [ ] Every `ctx.backend.on(...)` has its `off(...)` twin likewise.
- [ ] Handlers are arrow-function FIELDS (`private onX = (…) => …`), never
      inline lambdas passed to `on()` (those can never be detached).

## State & rules

- [ ] No new mutable field on GameScene; state lives in the owning system.
- [ ] Inventory only ever changes through `ctx.setInventory(inv)`.
- [ ] The §8 numbered order comment AND the explicit call sequence in
      GameScene.update() still agree; your addition has a number.
- [ ] Overworld systems sit BELOW the inDelve early-return and tolerate not
      ticking while the Player is in the Delve.
- [ ] New interaction verbs are `xxxAction(): EAction | null` slotted into
      resolveEAction's one chain at a deliberate priority.
- [ ] Any `src/content/` module you touched stays node-importable: no browser
      globals, no Phaser, no `../config` import.

## Behavior evidence (never bare claims)

- [ ] The changed mechanic was driven in a browser smoke via the preview tools
      (`?pump&canvas`, MockBackend via blank `VITE_SUPABASE_*` in
      `.env.development.local`, `__jw`/`__game` handles) with zero console
      errors — and the transcript shows the state proving it.
- [ ] Harness gotchas respected: install the resilient shadow pump after every
      page load and check `window.__pumpErrors` stays `[]`; drive ALL waits via
      Phaser timers (`scene.time.addEvent`/`delayedCall`), never in-page
      `setTimeout`/`setInterval` (Chrome throttles hidden-tab timers to
      ~1/minute); keep each `javascript_exec` call synchronous and poll
      `window.__x` state across calls.
