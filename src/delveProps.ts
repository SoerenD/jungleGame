/**
 * Procedural pixel-art PROPS for the Delve interior (ADR-0007 §10) — the mine
 * timbers, obsidian pillars, braziers, ore crystals, rubble, rails, bones and
 * glyph-stones that turn empty rooms into a mine-shaft-into-ruins. Drawn the
 * same way as the mobs/avatars (canvas fillRect → Phaser texture); no imported
 * art. Placements + collision + lighting live in dungeon.ts (DELVE_PROPS,
 * PROP_BLOCKS, PROP_LIGHT); this module only draws the sprites.
 */
import type Phaser from 'phaser';
import type { PropKind } from './content/dungeon';

export const PROP_TEX: Record<PropKind, string> = {
  support_beam: 'dp-beam',
  obsidian_pillar: 'dp-pillar',
  brazier: 'dp-brazier',
  brazier_violet: 'dp-brazier-v',
  crystal_amber: 'dp-crystal-a',
  crystal_teal: 'dp-crystal-t',
  rubble_pile: 'dp-rubble',
  mine_rail: 'dp-rail',
  bone_pile: 'dp-bone',
  glyph_stone: 'dp-glyph',
  basalt_pillar: 'dp-basalt',
  ember_brazier: 'dp-ember-brazier',
  lava_vein: 'dp-lava-vein',
  slag_pile: 'dp-slag',
};

export const PROP_SIZE: Record<PropKind, { w: number; h: number }> = {
  support_beam: { w: 16, h: 20 },
  obsidian_pillar: { w: 16, h: 22 },
  brazier: { w: 14, h: 16 },
  brazier_violet: { w: 14, h: 16 },
  crystal_amber: { w: 14, h: 14 },
  crystal_teal: { w: 14, h: 14 },
  rubble_pile: { w: 16, h: 10 },
  mine_rail: { w: 16, h: 16 },
  bone_pile: { w: 14, h: 10 },
  glyph_stone: { w: 16, h: 18 },
  basalt_pillar: { w: 16, h: 22 },
  ember_brazier: { w: 14, h: 16 },
  lava_vein: { w: 16, h: 16 },
  slag_pile: { w: 16, h: 10 },
};

/** flat floor decor (drawn at floor depth, centred on the tile) vs upright props
 *  (y-sorted with entities, standing at the tile so you can walk behind them) */
export const PROP_FLAT: Record<PropKind, boolean> = {
  support_beam: false,
  obsidian_pillar: false,
  brazier: false,
  brazier_violet: false,
  crystal_amber: true,
  crystal_teal: true,
  rubble_pile: true,
  mine_rail: true,
  bone_pile: true,
  glyph_stone: false,
  basalt_pillar: false,
  ember_brazier: false,
  lava_vein: true,
  slag_pile: true,
};

type Ctx = CanvasRenderingContext2D;
const R = (ctx: Ctx, x: number, y: number, w: number, h: number, c: string) => {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
};

function drawBeam(ctx: Ctx): void {
  R(ctx, 3, 0, 4, 20, '#3a2a1c'); // left post
  R(ctx, 9, 0, 4, 20, '#3a2a1c'); // right post
  R(ctx, 0, 0, 16, 4, '#5a3f28'); // top lintel
  R(ctx, 0, 0, 16, 1, '#7a5836'); // lintel rim-light
  R(ctx, 3, 0, 1, 20, '#5a3f28'); // left-lit posts
  R(ctx, 9, 0, 1, 20, '#5a3f28');
  R(ctx, 6, 0, 1, 20, '#2f2417'); // shaded right sides
  R(ctx, 12, 0, 1, 20, '#2f2417');
  R(ctx, 4, 5, 1, 1, '#1a120c'); // iron bolts
  R(ctx, 11, 5, 1, 1, '#1a120c');
  R(ctx, 2, 18, 12, 2, '#1a120c'); // base shadow
}

function drawPillar(ctx: Ctx): void {
  R(ctx, 2, 20, 12, 2, '#0d0a14'); // base slab
  R(ctx, 3, 4, 10, 18, '#1a1424'); // body
  R(ctx, 3, 4, 2, 18, '#2e2440'); // left-lit facet
  R(ctx, 11, 4, 2, 18, '#0d0a14'); // right shade facet
  R(ctx, 4, 0, 8, 5, '#2e2440'); // capital
  R(ctx, 4, 0, 8, 1, '#6a4fa0'); // capital rim
  R(ctx, 3, 4, 1, 18, '#6a4fa0'); // violet rim edge
  R(ctx, 6, 9, 1, 1, '#8b6dd6'); // flecks
  R(ctx, 9, 14, 1, 1, '#8b6dd6');
  R(ctx, 7, 18, 1, 1, '#6a4fa0');
}

function drawBrazier(ctx: Ctx, violet: boolean): void {
  const ember = violet ? '#5a2f8f' : '#e0561f';
  const flame = violet ? '#9a7fe0' : '#ff9a4d';
  const hot = violet ? '#cbb6ff' : '#ffd27a';
  R(ctx, 3, 11, 2, 5, '#3a3632'); // legs
  R(ctx, 9, 11, 2, 5, '#3a3632');
  R(ctx, 6, 13, 2, 3, '#3a3632');
  R(ctx, 1, 7, 12, 4, '#5a5450'); // bowl
  R(ctx, 1, 10, 12, 1, '#2f2b28'); // under-shade
  R(ctx, 1, 7, 12, 1, '#6b6560'); // bowl rim-light
  R(ctx, 3, 5, 8, 2, ember); // ember bed
  R(ctx, 4, 3, 6, 2, flame); // flames
  R(ctx, 5, 1, 4, 2, flame);
  R(ctx, 6, 0, 2, 1, hot); // hot tip
  R(ctx, 6, 4, 2, 1, hot); // hot core
}

function drawCrystal(ctx: Ctx, teal: boolean): void {
  const dark = teal ? '#1f5a55' : '#8a5a1e';
  const mid = teal ? '#2fb4a6' : '#c9772f';
  const hot = teal ? '#7fecdf' : '#f0b45a';
  R(ctx, 2, 10, 10, 3, '#3a352c'); // rock matrix (behind)
  R(ctx, 4, 6, 3, 4, dark);
  R(ctx, 3, 8, 2, 3, mid);
  R(ctx, 7, 4, 2, 5, mid);
  R(ctx, 8, 3, 1, 3, hot); // bright shard
  R(ctx, 6, 9, 2, 2, hot);
}

function drawRubble(ctx: Ctx): void {
  R(ctx, 2, 4, 3, 3, '#3a352c'); // chunks
  R(ctx, 5, 6, 4, 2, '#221f18');
  R(ctx, 9, 3, 3, 4, '#3a352c');
  R(ctx, 12, 5, 2, 3, '#221f18');
  R(ctx, 2, 4, 2, 1, '#57503f'); // highlights
  R(ctx, 9, 3, 2, 1, '#57503f');
  R(ctx, 3, 8, 6, 1, '#5a3f28'); // plank slivers
  R(ctx, 4, 9, 5, 1, '#5a3f28');
  R(ctx, 8, 7, 5, 1, '#5a3f28');
  R(ctx, 9, 8, 4, 1, '#736a52'); // lit plank edge
  R(ctx, 1, 7, 1, 1, '#221f18'); // grit
  R(ctx, 14, 8, 1, 1, '#3a352c');
}

function drawRail(ctx: Ctx): void {
  R(ctx, 2, 1, 12, 2, '#3a2a1c'); // ties
  R(ctx, 2, 9, 12, 2, '#3a2a1c');
  R(ctx, 2, 1, 12, 1, '#5a4a3a'); // tie top-light
  R(ctx, 2, 9, 12, 1, '#5a4a3a');
  R(ctx, 4, 0, 2, 16, '#4a4038'); // rails
  R(ctx, 10, 0, 2, 16, '#4a4038');
  R(ctx, 4, 0, 1, 16, '#8b9bb4'); // metal glint
  R(ctx, 10, 0, 1, 16, '#8b9bb4');
}

function drawBone(ctx: Ctx): void {
  R(ctx, 2, 6, 7, 2, '#8f8770'); // long bone
  R(ctx, 1, 5, 2, 2, '#8f8770'); // knobs
  R(ctx, 8, 5, 2, 2, '#8f8770');
  R(ctx, 2, 6, 7, 1, '#c9c2ad'); // top-light
  R(ctx, 5, 2, 2, 7, '#8f8770'); // crossing bone
  R(ctx, 5, 2, 1, 7, '#c9c2ad');
  R(ctx, 9, 4, 4, 4, '#8f8770'); // skull
  R(ctx, 9, 4, 4, 1, '#c9c2ad');
  R(ctx, 10, 6, 1, 1, '#221f18'); // eye sockets
  R(ctx, 12, 6, 1, 1, '#221f18');
  R(ctx, 2, 8, 11, 1, '#5a5344'); // shade
}

function drawGlyph(ctx: Ctx): void {
  R(ctx, 2, 2, 12, 16, '#2a2a30'); // slab
  R(ctx, 2, 2, 3, 16, '#454550'); // left-lit face
  R(ctx, 12, 2, 2, 16, '#221f18'); // right shade
  R(ctx, 2, 2, 12, 1, '#6a6a76'); // top rim
  R(ctx, 6, 4, 1, 10, '#221f18'); // cracks
  R(ctx, 6, 8, 4, 1, '#221f18');
  R(ctx, 4, 5, 5, 1, '#8b6dd6'); // glyph lines
  R(ctx, 4, 9, 3, 1, '#8b6dd6');
  R(ctx, 8, 11, 4, 1, '#8b6dd6');
  R(ctx, 6, 7, 1, 1, '#b49aff'); // hot node
}

// -------------------------------------------------------- the Deep (molten props)
function drawBasaltPillar(ctx: Ctx): void {
  R(ctx, 2, 20, 12, 2, '#140f0d'); // base slab
  R(ctx, 3, 4, 10, 18, '#241a16'); // body
  R(ctx, 3, 4, 2, 18, '#3a2a22'); // left-lit facet
  R(ctx, 11, 4, 2, 18, '#140f0d'); // right shade facet
  R(ctx, 4, 0, 8, 5, '#3a2a22'); // capital
  R(ctx, 4, 0, 8, 1, '#6a4a3a'); // capital rim
  R(ctx, 3, 4, 1, 18, '#6a4a3a'); // lit rim edge
  // molten veins bleeding up the shaft (the one emissive feature)
  R(ctx, 7, 5, 1, 14, '#ff6a1e');
  R(ctx, 6, 10, 2, 1, '#ff6a1e');
  R(ctx, 8, 14, 2, 1, '#ffb060');
  R(ctx, 7, 7, 1, 4, '#ffd27a');
  R(ctx, 5, 16, 1, 1, '#ff8c2a');
  R(ctx, 9, 12, 1, 1, '#ff8c2a');
}

function drawEmberBrazier(ctx: Ctx): void {
  R(ctx, 3, 11, 2, 5, '#2a2422'); // legs
  R(ctx, 9, 11, 2, 5, '#2a2422');
  R(ctx, 6, 13, 2, 3, '#2a2422');
  R(ctx, 1, 7, 12, 4, '#4a3a30'); // bowl
  R(ctx, 1, 10, 12, 1, '#241a16'); // under-shade
  R(ctx, 1, 7, 12, 1, '#6a4a3a'); // bowl rim-light
  R(ctx, 2, 5, 10, 2, '#c43a12'); // ember bed
  R(ctx, 4, 2, 6, 3, '#ff6a1e'); // flames
  R(ctx, 5, 0, 4, 2, '#ff9a4d');
  R(ctx, 6, 0, 2, 1, '#ffd27a'); // hot tip
  R(ctx, 6, 4, 2, 1, '#ffe0a0'); // hot core
}

function drawLavaVein(ctx: Ctx): void {
  // a branching crack of glowing lava set into the basalt floor
  R(ctx, 2, 7, 12, 2, '#1a120c'); // crack channel
  R(ctx, 4, 4, 2, 8, '#1a120c');
  R(ctx, 9, 8, 3, 5, '#1a120c');
  R(ctx, 3, 8, 10, 1, '#ff5a1e'); // glowing seam
  R(ctx, 5, 5, 1, 6, '#ff5a1e');
  R(ctx, 10, 9, 1, 3, '#ff5a1e');
  R(ctx, 6, 8, 4, 1, '#ffb060'); // hot centre
  R(ctx, 5, 7, 1, 1, '#ffd27a');
  R(ctx, 11, 9, 1, 1, '#ffd27a');
}

function drawSlagPile(ctx: Ctx): void {
  R(ctx, 2, 4, 3, 3, '#2a201a'); // chunks
  R(ctx, 5, 6, 4, 2, '#1a120c');
  R(ctx, 9, 3, 3, 4, '#2a201a');
  R(ctx, 12, 5, 2, 3, '#1a120c');
  R(ctx, 2, 4, 2, 1, '#4a3428'); // highlights
  R(ctx, 9, 3, 2, 1, '#4a3428');
  R(ctx, 4, 6, 1, 1, '#ff6a1e'); // ember glints in the cooling slag
  R(ctx, 10, 5, 1, 1, '#ff8c2a');
  R(ctx, 7, 7, 1, 1, '#ff6a1e');
  R(ctx, 3, 8, 8, 1, '#241a16'); // shade base
}

const DRAW: Record<PropKind, (ctx: Ctx) => void> = {
  support_beam: drawBeam,
  obsidian_pillar: drawPillar,
  brazier: (c) => drawBrazier(c, false),
  brazier_violet: (c) => drawBrazier(c, true),
  crystal_amber: (c) => drawCrystal(c, false),
  crystal_teal: (c) => drawCrystal(c, true),
  rubble_pile: drawRubble,
  mine_rail: drawRail,
  bone_pile: drawBone,
  glyph_stone: drawGlyph,
  basalt_pillar: drawBasaltPillar,
  ember_brazier: drawEmberBrazier,
  lava_vein: drawLavaVein,
  slag_pile: drawSlagPile,
};

/** draw one prop (exported so it can be rasterized/previewed outside the browser) */
export function drawPropFrame(ctx: Ctx, kind: PropKind): void {
  DRAW[kind](ctx);
}

/** build every Delve prop texture once (global textures, call in BootScene) */
export function ensureDelvePropTextures(scene: Phaser.Scene): void {
  (Object.keys(PROP_TEX) as PropKind[]).forEach((kind) => {
    const key = PROP_TEX[kind];
    if (scene.textures.exists(key)) return;
    const { w, h } = PROP_SIZE[kind];
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    DRAW[kind](canvas.getContext('2d')!);
    scene.textures.addCanvas(key, canvas);
  });
}
