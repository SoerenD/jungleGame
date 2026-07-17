---
name: system-dev
description: How to add or extend a gameplay system in the ADR-0018 humble-Scene architecture (src/systems/). Use when implementing any new mechanic, system, bus event, or content rule module — the templates here are copied verbatim from shipped code and the checklist encodes the wiring-bug class the restructure surfaced.
---

# system-dev — working in the ADR-0018 system architecture

GameScene (`src/scenes/GameScene.ts`, ~700 lines) is a **humble Scene**: bootstrap,
one visible wiring block, an explicitly ordered update() dispatch, and host
accessors. All behavior lives in **18 plain-TS systems** in `src/systems/`, each
implementing the `GameSystem` interface (`create()` / `update(time, dt)` /
`destroy()`). Read `docs/adr/0018-humble-scene-system-decomposition.md` first.

## The four shapes of change

| You are adding…            | Template                   | Real source it was copied from |
|----------------------------|----------------------------|--------------------------------|
| a new system               | `TEMPLATE-system.md`       | `FishingSystem.ts` + `SealSystem.ts` |
| a pure clock/content rule  | `TEMPLATE-rule-module.md`  | `content/cultivation.ts`       |
| a new HUD bus event        | `TEMPLATE-bus-event.md`    | `ui/bus.ts` GameEvents map     |
| wiring for any of the above| `TEMPLATE-wiring.md`       | `GameScene.create()` + `update()` |

Work through `CHECKLIST.md` before every commit.

## Hard rules (violating any of these is an escalation, not a workaround)

1. **State lives in systems.** Never add a new mutable field to GameScene. If two
   systems need the same state, it belongs to one of them and the other reads it
   through an explicit wired ref (or a host accessor if a cross-mode seam
   genuinely needs it — rare; ask first).
2. **Inventory mutates ONLY through `ctx.setInventory(inv)`** — it is the one
   mutate+emit path. Never assign inventory anywhere else, never emit
   `'inventory'` yourself.
3. **Every bus event is typed.** Add the name→payload tuple to `GameEvents` in
   `src/ui/bus.ts` BEFORE emitting. An untyped `emit` fails `npm run build` —
   that is the design, not an obstacle.
4. **`ui/hud.ts` is a frozen contract.** Existing event names and payload shapes
   must not change. New events are fine; renames/reshapes are not.
5. **Every listener detaches in `destroy()`.** Both `ctx.bus.on` ↔ `ctx.bus.off`
   and `ctx.backend.on` ↔ `ctx.backend.off`, with the SAME stored handler
   reference (arrow-function fields, see the system template). The scene
   SHUTDOWN hook runs all destroys; a world-switch must never double-subscribe.
6. **The §8 update order is law.** GameScene.update() documents the numbered
   per-frame order; each system is called explicitly at its position. Never
   reorder, and never add a flat `for (const s of systems) s.update()` loop —
   the delve early-return and the chat/stun halt live INSIDE the sequence.
7. **Delve mode early-returns.** In `'delve'` mode only `delve.updateDelve()`
   runs — a new overworld system must tolerate not ticking for minutes.
8. **`resolveEAction` stays ONE ordered priority chain in InputSystem.** A new
   interaction verb is a new `xxxAction(): EAction | null` method on your
   system, inserted at a deliberate position in that chain.
9. **`content/` modules stay node-importable:** no browser globals, no Phaser,
   no `../config` import (pass constants in as parameters — see the rule-module
   template).
10. **No new dependencies. No DB migration** unless the feature plan says so —
    Mock + Supabase both implement the `Backend` interface; time-based mechanics
    compute lazily from timestamps (ADR-0001/0002).

## The wiring-bug class (why the checklist exists)

Late-wired public refs (`system.x = other` in GameScene.create) are **not
compile-checked for completeness**: a declared `x!: XSystem` field that never
gets wired crashes at first use, sometimes minutes in. The restructure shipped
two of these (`fogSystem.district`, `harvest.fishing`). After ANY wiring change,
mechanically diff every system's `!:` ref declarations against the wiring block.
