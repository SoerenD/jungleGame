# Prompt: find the best Thundering Falls waterfall (compare + verify)

**Goal:** produce a labelled set of in-game screenshots of every candidate waterfall,
rendered at the Thundering Falls, so the **human chooses** — do NOT pick for them.
Every candidate must pass two hard gates before its screenshot counts.

**Falls geometry (fixed, from `tools/generate-map.ts`):** the water column is
`fillRect(96, 0, 9, 22, 'water')` → tiles x96–104; the northern cliff band is rows
0–5 (drop lip at ty=6); the plunge pool is `fillCircle(100, 28, 9)` (~ty19–37).
Screenshot camera: `preview_start` → load `/?pump&canvas` → join → `cam.stopFollow();
cam.setZoom(2.2); cam.centerOn(1608, 150)`; set `nightOverlay`/`duskOverlay` alpha 0.

## Candidates (one variant each — label every screenshot)
1. `proc-strands` — hand-drawn scrolling strand tileSprite (`waterfall.png`).
2. `proc-narrow-foam` — narrowed strands + wavy foam bands + ripple pool.
3. `cc-sevarihk` — CC-BY Sevarihk crest/body/pool 32px autotile (current build).
4. `cc-sodri` — CC0 sodri 16px "animated tiles" waterfall (extract a clean fall from `water_combined.png`).
5. `user-tileset` — the human-supplied tileset (8 waterfall frames laid out 4×2 in the
   left portion + pond/sand tiles on the right). **Needs the file dropped into
   `public/assets/objects/<name>.png` first.** Slice the 8 frames, treat as the fall
   animation (or crest/body/pool if it decomposes that way).
6. (optional) `discovery` — first fan out a Workflow of web-search subagents for more
   CC0/CC-BY *bright-flat-cartoon* animated waterfalls (verify license ON the page),
   add any strong finds as extra candidates.

## Per-candidate procedure
For each candidate, in isolation (revert the previous one first):

1. **Integrate** — point the single `waterfall_anim` (or equivalent) entry in
   `src/assetConfig.ts` at this candidate; rewrite `buildWaterfall()` in
   `src/scenes/GameScene.ts` to render it. Change nothing else.

2. **GATE A — tiles align (MUST pass, else fix before screenshotting):**
   - Crest/top sits exactly at the cliff-band bottom (ty=6), horizontally centred on
     the water column (midX = 1608 = x100.5).
   - Fall is continuous crest → body → pool with **no half-tile offset seams** and no
     transparent gaps between stacked tiles.
   - Pixel scale is an integer multiple of the source (16px tileset native = 1:1,
     32px source = 2 game-tiles) — **no blurry non-integer scaling**.
   - The pool/base foam lands at the plunge pool (~ty24), not floating over grass.
   - Verify BOTH ways: `preview_eval` the sprite x/y/displayWidth/displayHeight/depth
     of every waterfall object (assert positions/step exactly), AND a zoomed
     screenshot inspected by eye.

3. **GATE B — old tiles overridden (MUST pass):**
   - `src/assetConfig.ts` has **exactly one** waterfall texture key — grep for stale
     keys (`waterfall`, `waterfall_anim`, `water_foam`, old names) and remove any not used.
   - **No orphaned** waterfall sprites/tilesprites from a prior version remain: after
     load, `preview_eval` `scene.children.list.filter(o=>o.texture&&/water|fall/i.test(o.texture.key))`
     and confirm only THIS candidate's objects exist.
   - Delete unused waterfall PNGs from `public/assets/objects/` (`ls` + grep the code
     for each filename; if unreferenced, remove it).
   - `npm run build` green (`--registry https://registry.npmjs.org/`); **zero** console
     errors via `preview_console_logs level:error`.

4. **Screenshot** — with the fixed camera above, `preview_screenshot`; keep/label it
   `waterfall-<candidate>` and record: Gate A pass/fail, Gate B pass/fail, license +
   attribution requirement.

## Output
A labelled screenshot per passing candidate + a table: candidate · license/attribution ·
Gate A · Gate B. Present them for the human to choose. If a candidate fails a gate and
can't be fixed cleanly, say so and show it anyway marked FAILED — don't silently drop it.

## Licensing rule
Prefer CC0 (no attribution). CC-BY is allowed only with a `CREDITS.md` line. Reject
CC-BY-SA / GPL / NC / unclear. Record the exact license + required credit per candidate.
