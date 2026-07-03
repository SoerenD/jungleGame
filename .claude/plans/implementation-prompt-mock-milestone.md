# Implementation prompt — Jungle World v1, Mock Milestone

## Recommended launcher: built-in `/goal` (Claude Code v2.1.139+)

Paste this as one message. It starts implementation immediately and re-checks the condition
after every turn (a separate evaluator model judges it) until the game is provably playable:

```text
/goal The "Jungle World v1 — Mock Milestone" is implemented and proven playable. Begin by invoking the feature-dev skill with the mission in .claude/plans/implementation-prompt-mock-milestone.md (mock backend only — no real Supabase; source free assets online, licenses in CREDITS.md). The condition is met ONLY when ALL of the following are demonstrated with evidence in this session's transcript: (1) `npm run dev` starts clean and the game loads in the browser preview with zero console errors (console output shown); (2) screenshots show the authored ~200x200 jungle map with the player avatar, correct foliage depth-sorting, and at least 4 distinct Zones visited during play; (3) a play-test through the preview tools demonstrates each of: harvesting a Resource Node to depletion AND its regrowth, crafting a Tool from gathered Resources, placing a Structure, reloading the page with the Structure still present, at least one mock bot Player visibly moving and chatting, sending a chat message, toggling mute; (4) CREDITS.md lists every downloaded asset with source and license; (5) each of the six milestones in the mission file was verified with a screenshot when completed. Playing the game through the preview tools is the required proof — code existing is not sufficient. Or stop after 60 turns and report exactly which criteria remain unmet.
```

Notes:
- Run with auto mode (or a permissive permission mode) so turns proceed unattended; `/goal`
  removes per-turn prompts, auto mode removes per-tool prompts.
- `/goal` (no args) shows progress; `/goal clear` stops it early.
- Requires the workspace trust dialog accepted and hooks enabled (the evaluator is a Stop hook).

## Mission briefing (referenced by the goal above)

Alternatively, paste the block below as a single message to start implementation without /goal.

---

/feature-dev Implement the "Jungle World" game from the plan in `.claude/plans/feature-plan-jungle-world-v1.md` — read that file first, plus `CONTEXT.md` and `docs/adr/0001-supabase-as-entire-backend.md` — but build it as the **Mock Milestone**: fully playable locally with NO real database and NO Supabase project.

**Mock overrides (take precedence over the plan):**
- Do not connect to Supabase. Define a `Backend` interface covering everything ADR-0001 assigns to Supabase (presence/position/chat channel + atomic mutation RPCs: harvest, craft, place) and implement only `MockBackend`: in-memory state with artificial 50–150ms latency, persisted to `localStorage` so a page reload keeps the world. The interface must be shaped so a later `SupabaseBackend` swap touches no game code.
- Keep the join screen (name + avatar pick; PIN validated locally by the mock).
- Simulate multiplayer: `MockBackend` spawns 1–2 bot Players that wander, occasionally harvest nodes, and send a chat line now and then — so presence, chat, depth sorting, and the conflict rules are actually exercised.
- Everything else follows the plan: Phaser 3 + Vite + TypeScript, 3/4 top-down with Y-based depth sorting, ~200×200 authored Tiled map with distinct Zones, WASD/arrows + E to interact, regrowing Resource Nodes computed lazily from timestamps, 10–15 material-gated Recipes producing Tools and Structures, global chat window, ambient jungle loop + basic SFX with mute, desktop only.

**Assets — source them yourself:**
Search online and download free assets only (CC0 preferred; free-with-attribution acceptable): jungle/forest terrain tileset, layered trees/foliage with canopy depth, 4+ distinguishable preset avatars with walk animations, Resource Node states (tree/stump, rock, bush), sprites for every Tool and Structure, one ambient jungle loop, SFX for chop/harvest/craft/place/chat. Good sources: kenney.nl, opengameart.org, free itch.io packs. Verify each license before integrating and record every asset with source + license in `CREDITS.md`. If a sprite is missing from packs, adapt pack tiles or draw a small placeholder and note it as TODO in CREDITS.md.

**Self-inspection loop (mandatory — repeat after every milestone):**
1. Start the dev server via the preview tools and take a screenshot plus an accessibility snapshot.
2. Read the browser console; fix every error before continuing.
3. Actually play-test in the preview: walk into each Zone, harvest a node to depletion, verify regrowth (use a short debug regrow time in dev), craft a tool, place a structure, reload the page and confirm the world persisted, watch a bot move and chat, send a chat message, toggle mute.
4. If a screenshot shows problems (missing tiles, z-order glitches, unreadable UI, avatar clipping), fix and re-inspect. Never mark a milestone done from code alone — only from observed behavior.
(If preview tools are unavailable, run the dev server in the background and verify via console logs and DOM checks instead.)

**Milestones — inspect after each:**
① Walkable authored jungle map with camera follow + depth sorting → ② Resource Nodes: harvest/deplete/regrow → ③ inventory + crafting UI with all recipes → ④ Structure placement, persistent across reload → ⑤ mock multiplayer bots + global chat + conflict rules → ⑥ audio + polish pass.

**Definition of done:** `npm run dev` serves a game where every mock-adapted acceptance criterion from the plan passes in a real play-test through the preview tools; page reload preserves world state; zero console errors; `CREDITS.md` is complete. Work autonomously through all milestones — do not stop to ask questions; where detail is missing, prefer the plan's defaults and the CONTEXT.md conflict rules.
