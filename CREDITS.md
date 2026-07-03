# Asset credits

All art and audio in `public/assets/` comes from the free packs below. Licenses were
verified on each source page before integration. Adapted crops/recolors are noted —
the adaptation scripts live in `tools/compose-assets.ts` (art) and `tools/make-*.ts`
(remaining placeholders).

## Zelda-like tilesets and sprites — ArMM1998

- Source: https://opengameart.org/content/zelda-like-tilesets-and-sprites
- License: **CC0 1.0** (public domain)
- Files used: `Overworld.png`, `objects.png`, `NPC_test.png` from `gfx_3.zip`
- What we made from it:
  - `public/assets/tiles/terrain.png` — 11 16×16 tiles cropped from `Overworld.png`
    (grass, water, mud, dirt, swamp, cliff, ruins floor, flower, plant, 2 grass
    variants). Adaptations: swamp tile is the grass tile hue-shifted to olive;
    the two grass variants composite transparent tuft/mound overlays onto the
    grass base.
  - `public/assets/objects/` — `tree.png`, `stump.png`, `tablet.png` (parchment),
    `golden-idol.png` (statue recolored gold), `rock.png`,
    `rock-depleted.png` (pot shards desaturated to rock gray),
    `bush-fruit.png` (bush with hand-drawn red berries added),
    `bush-empty.png`, `campfire.png` (pack flame over hand-drawn stone ring),
    `crate.png`, `fence.png`, `bridge.png`, `hut-wall.png`, `statue.png`,
    `fruit-basket.png`, `stone-path.png`, `ruin-pillar.png` — all cropped from
    `Overworld.png` / `objects.png`.
  - `public/assets/characters/character.png` — copy of `NPC_test.png`
    (4-direction, 4-frame walk cycle, 16×32 frames). The four preset avatars
    (Amber, Jade, Sky, Rose) are runtime tints of this sheet.
  - `objects/altar.png` (grove altar) — composed by `tools/compose-altar.ts`
    from the checked-in crops (legs from `ruin-pillar.png`, tabletop from
    `stone-path.png`, recolored to mossy gray-green; hand-placed moss and
    emerald sigil pixels). The original v1 crop from `Overworld.png` hit an
    empty region and produced a fully transparent file.
  - **v2 (Guardian of the Ruins)** — composed by `tools/compose-v2-assets.ts`
    entirely from the CC0 crops above (recolors/recombinations of the same
    ArMM1998 pack pieces; a few hand-placed accent pixels):
    - `objects/guardian.png` — the Guardian: 3-frame 48×48 idle sheet
      (frame 0 slumber, 1–2 awake) composed from `rock.png` (torso + head,
      2× scaled), `ruin-pillar.png` (arms) with hand-drawn moss, eye-glow and
      chest-sigil pixels.
    - `objects/hardwood-tree.png` / `hardwood-stump.png` — `tree.png` /
      `stump.png` hue-shifted to ancient dark timber, amber sap glints added.
    - `objects/obsidian-rock.png` / `obsidian-rubble.png` — `rock.png` /
      `rock-depleted.png` recolored to violet-black volcanic glass.
    - `objects/seal-monument.png` — twin columns cropped from
      `ruin-pillar.png` + slab from `tablet.png`, violet-tinted, rune pixels.
    - `objects/guardian-altar.png` — slab from `tablet.png` + legs from
      `ruin-pillar.png`, amber sigil pixels.
    - `objects/welcome-stone.png` — `tablet.png` recolored to weathered gray.
    - `objects/obsidian-statue.png` — `statue.png` recolored obsidian.
    - `objects/obsidian-path.png` — `stone-path.png` recolored obsidian.
    - `objects/brazier.png` — `campfire.png` with the stone ring recolored to
      obsidian (flame kept).
    - `objects/hardwood-arch.png` — posts/lintel cropped from `hut-wall.png`,
      recolored dark, amber inlay pixels.
    - `objects/guardian-trophy.png` — pedestal from `ruin-pillar.png` + head
      from `rock.png`, amber eyes and teal scale-inlay pixels.

## CC0 Background Ambience (Forest Ambience) — FGResources

- Source: https://opengameart.org/content/cc0-background-ambience
- License: **CC0 1.0** (public domain)
- File used: `Forest_Ambience_0.mp3` → `public/assets/audio/jungle-ambient.mp3`
  (looped in-game as the jungle ambience).

## RPG Sound Pack — artisticdude

- Source: https://opengameart.org/content/rpg-sound-pack
- License: **CC0 1.0** (public domain)
- Files used (renamed):
  - `battle/swing.wav` → `public/assets/audio/chop.wav` (harvest swing)
  - `inventory/bubble.wav` → `public/assets/audio/harvest.wav` (yield pop)
  - `inventory/coin.wav` → `public/assets/audio/craft.wav` (craft success)
  - `inventory/wood-small.wav` → `public/assets/audio/place.wav` (structure placed)
  - `interface/interface1.wav` → `public/assets/audio/blip.wav` (chat blip)

## TODO / placeholders (drawn, to be replaced with pack art later)

Drawn programmatically by `tools/make-placeholders.ts` because no fitting sprite
was found in the packs above (original pixel art, no license concerns):

- `public/assets/objects/vine.png` and `vine-cut.png` — fiber vine Resource Node
- `public/assets/objects/torch.png` — torch Structure

v2 additions (original, no license concerns; replace with sourced CC0 later):

- `public/assets/objects/fishing-spot.png` and `fishing-spot-calm.png` — ripple
  rings + fish shadow, drawn by `tools/compose-v2-assets.ts` (water is the tile
  underneath).
- Synthesized audio from `tools/make-v2-audio.ts` (16-bit WAV, same pipeline as
  `tools/make-audio-placeholders.ts`):
  - `public/assets/audio/roar.wav` — Guardian wake/slumber roar
  - `public/assets/audio/seal-gong.wav` — the Seal breaking / victory gong
  - `public/assets/audio/splash.wav` — fishing catch landed
  - `public/assets/audio/munch.wav` — eating cooked fish
  - `public/assets/audio/guardian-drums.wav` — looping fight drums
- The `seal-barrier` wall shimmer and red danger-tile telegraphs are runtime
  canvas textures / tinted rectangles generated in code (no asset files).
