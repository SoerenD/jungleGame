# Feature plan: Jungle World v3 — Fight, Guide, Build

One round of five features: a challenging Guardian fight (Eye Windows, fury phases, lunges, new
art), hold-E input, Journey onboarding, blockhead Avatar customizer, and functional Structures
(crate storage, Hammock, signpost, Sawmill + planks).

Resolved in a grilling session on 2026-07-03. CONTEXT.md and ADR-0002 were updated in the same
session — read them first; this file does not repeat the glossary.

## Resolved decisions

### A. Guardian fight rework (stays inside ADR-0002 as amended)

1. **Eye Windows** — the Guardian's amber eye opens for a window (~2s, tune freely) starting
   right after each slam. Hits land ONLY while the eye is open: 1 damage, doubled by owning
   axe/pickaxe (unchanged tool rule). Hits outside a window deal 0 and show a "clang"/bounce
   visual so the rule teaches itself. Server adjudicates damage validity from
   `summonedAt + elapsed` exactly like knockdowns.
2. **Fury phases** — three phases (calm → restless → fury) at fixed elapsed-time thresholds of
   the awake window (suggest 0–40% / 40–75% / 75–100%). Each phase: shorter wave period, denser
   danger tiles, shorter Eye Windows, more frequent lunges. Phase transition is announced with a
   roar SFX, camera shake, and rune glow shifting toward red. Phases key on TIME ONLY — never HP
   (ADR-0002: server must re-derive the whole schedule from `summonedAt`).
3. **Telegraphed lunges** — on an authored schedule the Guardian rears up, a landing marker glows
   on a pre-determined arena spot, then it crashes down there. The landing area is a knockdown
   zone (same stun/Exhaustion rules as slam tiles). Deterministic waypoints = pure f(time). It
   moves; it never chases or aims.
4. **HP retune** — `GUARDIAN_MAX_HP` (src/config.ts) must be re-sized for windowed uptime
   (players can only deal damage a fraction of the time now). Target: ~3–4 friends with tier-1
   tools win with decent-but-imperfect play inside the 5-minute window; solo remains near
   impossible in real mode. Keep the `?fight` dev flag trivially winnable solo.
5. **New Guardian art** — procedural, via the existing compose pipeline (tools/compose-v2-assets.ts
   style): ~96×96 frames (up from 48×48). Stone colossus with moss, cracked glowing runes, one
   large amber eye. Required states: slumber, awake idle ×2, eye-open ×2 (must be readable at
   gameplay zoom — this IS the weak-point signal), lunge windup, airborne, landing. Rune glow
   tint per fury phase. Update assetConfig.ts frame size and GameScene origin/depth handling.

### B. Hold-E input

6. Holding E auto-repeats at a fixed swing cadence (~300ms; first press fires immediately) for
   exactly two actions: harvesting Resource Nodes and hitting the Guardian.
7. One-shot interactions stay JustDown: Welcome Stone, tablets, altar Offerings, Seal
   contribution, summoning, digging, cooking, placement confirm, fishing reel-in. The repeat
   logic must check the action type BEFORE firing — a held E near a tablet must not reopen it.
8. Mashing E must never be faster than holding it (cadence is the cap, applied to taps too).

### C. Onboarding (the Journey)

9. **Journey checklist HUD** — small persistent tracker, sequential steps:
   gather wood → craft an axe → harvest stone → place a campfire → read a tablet → visit the
   Seal → contribute your first Offering. Steps tick off from existing game/bus events. The
   tracker disappears permanently once finished.
10. Progress persists per Player through the Backend interface (like `introSeen`).
11. **Veteran auto-complete** — on first login after the feature ships, steps are initialized
    from existing Player state (owns axe → crafted-axe step done; tablets read → done; Seal
    contribution recorded → done; etc.). Veterans see a mostly/fully ticked tracker that
    vanishes; nobody re-does completed content.
12. **Contextual key hints** — floating hints at the moment of relevance: "E — gather" near the
    first harvestable nodes, "E place · Esc cancel" in placement mode, "E — read" at the Welcome
    Stone/tablets. Each hint retires after a few uses (count per hint, persisted with Journey
    state).

### D. Avatars (blockhead customizer)

13. New base sprite: blocky big-headed "mini Minecraft" pixel character — cubic head ~half the
    sprite height, boxy body/limbs, 4-direction walk cycle, composed procedurally.
14. **Full customizer** at the join screen: 4 color slots — skin, hair, shirt, pants — each from
    a curated palette of ~8 swatches. No free RGB. Live preview in the join dialog.
15. Appearance is editable at EVERY join (join screen shows current look + edit option).
16. Appearance syncs through the Backend so remote Players render the same look; each client
    composes the spritesheet at runtime (canvas → Phaser texture per Player) from the 4 color
    choices. Presence/state payloads carry the choices.
17. The 4 tint presets (`AVATARS` in assetConfig.ts) are REPLACED. Existing Players get a default
    appearance mapped from their old tint (e.g. Jade → green shirt) and can re-edit at next join.

### E. Functional Structures

18. **Crate = shared storage** — E on a placed crate opens deposit/withdraw UI on a per-crate
    inventory. No locks, no ownership (trusted friends). Mutations server-ordered like all World
    mutations.
19. **Hammock = personal wake point** — new craftable Structure. After placing (and it becoming
    theirs by placement), Exhaustion wake-up AND login position use the owner's Hammock instead
    of World spawn. One active Hammock per Player (placing a new one retires the old point).
20. **Signpost = writeable text** — new craftable Structure; placing prompts for a short line
    (length-capped) rendered/readable in-world by everyone.
21. **Sawmill = refinery** — tier-1 craftable (wood + stone, requiresTool: hammer). Deposit wood
    → after a real-time delay collect planks. Lazy-timestamp computation (same pattern as node
    regrowth) — NO tick loop, per ADR-0001.
22. **Plank economy** — plank is a new refined Resource (a normal ResourceId in the Inventory).
    Consumed by: (a) the new Structures — Hammock and signpost recipes cost planks, plus 1–2
    plank decor Structures (e.g. plank floor, table); (b) tier-2 Recipes — wherever a tier-2
    recipe cost raw wood, it now costs planks instead (ancient_axe, ancient_pickaxe, fishing_rod,
    hardwood_arch, brazier). Rule of thumb: "tier 2 builds on refined wood."
23. **Tiki buff REJECTED** — the one-buff rule (cooked fish only) stands; the tiki statue stays
    decorative. Recorded in CONTEXT.md.

### Build order

hold-E (smallest) → Journey onboarding → Avatar customizer → Guardian rework (mechanics, then
art) → functional Structures + plank economy. All against MockBackend through the Backend
interface, shaped so the future Supabase implementation (ADR-0001) maps cleanly (per-crate
inventories, appearance and Journey state = rows/columns; sawmill = timestamps).

## Acceptance criteria

### Guardian

- Given the Guardian is awake and its eye is closed, when a Player in range presses/holds E,
  then the Guardian's HP does not change and a bounce/clang visual plays.
- Given the eye is open, when a Player with an axe hits it, then HP drops by 2 and the hit
  flash plays.
- Given the fight enters a later fury phase (elapsed time crosses a threshold), then wave
  period and Eye Window duration shrink and a roar + camera shake + rune tint change occur on
  every client at the same schedule position.
- Given a lunge is scheduled, then a landing marker appears before impact, and a Player standing
  in the landing area at impact is knocked down (server-adjudicated against `summonedAt`,
  with the existing slack).
- Given two clients with skewed local clocks, when the server adjudicates a hit or knockdown,
  then the outcome derives from server elapsed time only (no client clock decides).
- Given the fight, the Guardian renders at ~96×96 with distinct slumber/idle/eye-open/lunge
  animations, and the open eye is visually unmistakable at ZOOM 2.5.

### Hold-E

- Given a Player holds E next to a tree, then the tree takes repeated hits at the fixed cadence
  until depleted, with no key re-press.
- Given a Player holds E next to a tablet or altar, then the interaction fires exactly once.
- Given a Player mashes E as fast as possible, then hits land no faster than the hold cadence.

### Journey

- Given a brand-new Player finishes the intro, then the Journey tracker shows the first step
  ("gather wood"), and each subsequent action ticks its step in order up to the first Seal
  Offering, after which the tracker disappears for good.
- Given an existing Player who owns an axe and has read a tablet logs in after the update, then
  those steps are already ticked.
- Given a Player reloads mid-Journey, then progress is restored from the backend.
- Given a new Player approaches their first harvestable node, then an "E — gather" hint floats;
  after a few successful gathers the hint no longer appears.

### Avatars

- Given the join screen, a Player picks skin/hair/shirt/pants from curated swatches with a live
  preview; free color input is not possible.
- Given Player A customizes their Avatar, then Player B's client renders A with exactly those
  colors (after presence sync).
- Given a returning Player, the join screen shows their current Avatar and allows editing before
  entering the World.
- Given a pre-update Player with the "Jade" tint, their first post-update join shows a sensible
  default blockhead mapped from that tint.

### Structures

- Given a placed crate, when Player A deposits 5 wood and Player B opens the same crate, then B
  sees and can withdraw the 5 wood; simultaneous withdrawals resolve server-ordered (no dupes).
- Given a Player with a placed Hammock suffers Exhaustion, then they wake at their Hammock with
  inventory intact; a Player without one wakes at World spawn.
- Given a Player places a signpost and writes "Crates here →", then all Players can read that
  text at the signpost.
- Given a Player deposits wood in a Sawmill and waits the delay (dev-shortened like FAST_REGROW),
  then collecting yields planks; collecting early yields nothing/partial per design.
- Given no Sawmill has been used, tier-2 Recipes are uncraftable for lack of planks even with
  Guardian Scales (planks now gate tier-2 alongside Scales).

## Scope boundaries — do NOT build

- NO reactive Guardian AI, chasing, or targeting — ADR-0001/0002 stand; everything is f(time).
- NO dedicated game server; MockBackend remains the only Backend implementation this round
  (Supabase implementation is a separate milestone).
- NO new buffs of any kind (tiki aura explicitly rejected; cooked fish remains the only buff).
- NO changes to Seal quotas or adding planks to the Seal (mid-run goalpost move — rejected).
- NO hair styles / shapes in the customizer — 4 color slots on one fixed blockhead shape.
- NO passive resource generators (rejected: deflates the Seal's active-gathering pacing).
- NO storage locks/ownership on crates; NO per-Player contribution tracking anywhere.
- NO refactor of the existing wave-pattern families beyond fury-phase parameterization.
- NO continuous Guardian patrol movement — discrete telegraphed lunges only.

## Constraints and gotchas

- **Determinism is the law**: fury phases, Eye Windows, and lunge waypoints must all derive from
  `summonedAt + elapsed` (see src/content/guardian.ts — keep it importable from node tools: no
  browser globals, no ../config import). Server re-derives everything for adjudication with the
  existing `ADJUDICATION_SLACK_MS` pattern.
- **HP-keyed anything is forbidden** in the schedule — it would break server re-derivation.
- E currently multiplexes many actions via `tryHarvest()` (GameScene.ts:976–1042 priority
  chain); the hold-repeat must respect that priority chain and only auto-repeat when the
  resolved action is node-harvest or Guardian-hit.
- Guardian sprite size change (48→96) affects origin, depth sorting (`setOrigin(0.5, 1)`,
  `setDepth(y)`), hit-range distance checks (`tryHitGuardian` uses sprite center − TILE), and
  the arena layout in world-data.json — verify the resting-place rect still fits.
- Runtime avatar composition: one generated texture per Player; destroy/regenerate on
  appearance change; remote Players' textures keyed by player id. Phaser tint is no longer used
  for identity.
- `FAST_REGROW`-style dev shortening should apply to the Sawmill delay; add a `?` param or reuse
  the existing flag.
- Journey/hint/appearance persistence goes through the Backend interface — design the interface
  methods so a Supabase implementation is column-shaped (no client-only localStorage state for
  anything another Player can see).
- The intro story stays as-is (it's narrative); the Journey complements it, doesn't replace it.

## References

- CONTEXT.md — updated 2026-07-03: new terms **Eye Window**, **Avatar**, **Journey**,
  **Hammock**; amended **Resource**, **Guardian**, **Exhaustion**; new relationship rules for
  damage, fury, lunges, hold-E, functional Structures, plank economy, one-buff reaffirmation.
- docs/adr/0001-supabase-as-entire-backend.md — unchanged, still binding.
- docs/adr/0002-guardian-runs-on-deterministic-schedule.md — Amendment (2026-07-03): scripted
  deterministic movement is within the decision; reactive behaviour remains prohibited.
