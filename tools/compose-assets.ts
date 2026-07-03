/**
 * Composes the game's asset files from the downloaded CC0 pack
 * "Zelda-like tilesets and sprites" by ArMM1998 (opengameart.org).
 * Crops/adapts pack tiles into the exact files the game expects,
 * overwriting placeholder art. See CREDITS.md.
 *
 * Run: npx tsx tools/compose-assets.ts <packDir>
 */
import fs from 'node:fs';
import path from 'node:path';
import { Img } from './png';
import { decodePng, cropScaled } from './png-decode';

const packDir = process.argv[2];
if (!packDir) throw new Error('usage: compose-assets.ts <packDir>');
const OW = decodePng(path.join(packDir, 'Overworld.png'));
const OBJ = decodePng(path.join(packDir, 'objects.png'));

function tile(src: Img, tx: number, ty: number, w = 1, h = 1): Img {
  return cropScaled(src, tx * 16, ty * 16, w * 16, h * 16, 1);
}

const root = path.resolve(import.meta.dirname, '..');
const write = (rel: string, img: Img) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, img.toPng());
  console.log('wrote', rel, `${img.w}x${img.h}`);
};

/** recolor helper: map every pixel through fn(r,g,b,a) */
function recolor(img: Img, fn: (r: number, g: number, b: number, a: number) => [number, number, number, number]): Img {
  const out = new Img(img.w, img.h);
  for (let i = 0; i < img.data.length; i += 4) {
    const [r, g, b, a] = fn(img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]);
    out.data[i] = r;
    out.data[i + 1] = g;
    out.data[i + 2] = b;
    out.data[i + 3] = a;
  }
  return out;
}

// swamp = grass hue-shifted to murky olive (adaptation of pack art)
const swamp = recolor(tile(OW, 0, 0), (r, g, b, a) => [
  Math.min(255, Math.round(r * 0.75 + 45)),
  Math.round(g * 0.72),
  Math.round(b * 0.45),
  a,
]);

// ---------------------------------------------------------------- terrain (11 slots of 16x16, 1 row)
const slots: [string, Img][] = [
  ['grass', tile(OW, 0, 0)],
  ['water', tile(OW, 19, 2)],
  ['mud', tile(OW, 14, 15)],
  ['dirt', tile(OW, 1, 30)],
  ['swamp', swamp],
  ['cliff', tile(OW, 1, 26)],
  ['stone_floor', tile(OW, 14, 12)],
  ['flower', tile(OW, 37, 2)],
  ['plant', tile(OW, 38, 2)],
  ['grass2', grassOver(1, 0)],
  ['grass3', grassOver(0, 29)],
];

// (1,0) tuft and (0,29) dig-mound are overlays with transparent bg — put grass under them
function grassOver(tx: number, ty: number): Img {
  const g = tile(OW, 0, 0);
  g.blit(tile(OW, tx, ty), 0, 0, 16, 16, 0, 0);
  return g;
}
const terrain = new Img(slots.length * 16, 16);
slots.forEach(([, img], i) => terrain.blit(img, 0, 0, 16, 16, i * 16, 0));
write('public/assets/tiles/terrain.png', terrain);

// water animation frames (ripple variants from the pack's pool block)
const waterFrames = new Img(48, 16);
[[18, 1], [19, 2], [20, 3]].forEach(([tx, ty], i) => waterFrames.blit(tile(OW, tx, ty), 0, 0, 16, 16, i * 16, 0));
write('public/assets/tiles/water-frames.png', waterFrames);

// ---------------------------------------------------------------- objects
write('public/assets/objects/tree.png', tile(OW, 5, 16, 2, 2));
write('public/assets/objects/stump.png', tile(OBJ, 0, 10, 2, 2));
// twin round boulders (pixel-precise, they sit across tile boundaries)
write('public/assets/objects/rock.png', cropScaled(OW, 562, 112, 26, 16, 1));
// rubble = pot shards desaturated to rock-gray (also boundary-centered)
write(
  'public/assets/objects/rock-depleted.png',
  recolor(cropScaled(OBJ, 97, 96, 28, 20, 1), (r, g, b, a) => {
    const l = Math.round(0.3 * r + 0.5 * g + 0.2 * b);
    return [l, l, Math.min(255, l + 8), a];
  }),
);

write('public/assets/objects/bush-empty.png', tile(OBJ, 0, 12, 2, 2));
const bushFruit = tile(OBJ, 12, 12, 2, 2);
for (const [x, y] of [
  [9, 10],
  [18, 8],
  [22, 16],
  [12, 18],
  [17, 22],
]) {
  bushFruit.px(x, y, 0xe4484bff);
  bushFruit.px(x + 1, y, 0xff7376ff);
  bushFruit.px(x, y + 1, 0xc4272aff);
  bushFruit.px(x + 1, y + 1, 0xc4272aff);
}
write('public/assets/objects/bush-fruit.png', bushFruit);

// campfire: stone ring + pack flame
const campfire = new Img(16, 16);
for (const [x, y] of [
  [2, 12],
  [5, 14],
  [9, 14],
  [12, 12],
  [3, 10],
  [11, 10],
]) {
  campfire.rect(x, y, 3, 2, 0x8a8f98ff);
  campfire.px(x, y, 0xb5bac2ff);
}
campfire.blit(tile(OBJ, 4, 3), 0, 2, 16, 14, 0, 0);
write('public/assets/objects/campfire.png', campfire);

write('public/assets/objects/crate.png', cropScaled(OW, 563, 127, 24, 17, 1));
write('public/assets/objects/fence.png', cropScaled(OW, 5, 305, 24, 14, 1));
write('public/assets/objects/bridge.png', tile(OW, 31, 18));
write('public/assets/objects/hut-wall.png', tile(OW, 22, 18, 1, 2));
write('public/assets/objects/statue.png', tile(OW, 10, 24, 1, 3));
write('public/assets/objects/fruit-basket.png', tile(OW, 24, 20));
write('public/assets/objects/stone-path.png', tile(OW, 23, 1));
write('public/assets/objects/ruin-pillar.png', tile(OW, 24, 0, 1, 2));

// secrets: lore tablet (parchment), golden idol (statue recolored gold).
// altar.png is NOT written here: the original crop tile(OW, 6, 24, 2, 2) hit an
// empty region of Overworld.png (fully transparent output) — it is composed
// from the checked-in crops by tools/compose-altar.ts instead.
write('public/assets/objects/tablet.png', tile(OW, 10, 20, 2, 2));
write(
  'public/assets/objects/golden-idol.png',
  recolor(tile(OW, 10, 24, 1, 3), (r, g, b, a) => [
    Math.min(255, Math.round(r * 1.15 + 70)),
    Math.min(255, Math.round(g * 0.95 + 40)),
    Math.round(b * 0.35),
    a,
  ]),
);

// ---------------------------------------------------------------- character (tintable NPC walk sheet)
fs.copyFileSync(path.join(packDir, 'NPC_test.png'), path.join(root, 'public/assets/characters/character.png'));
console.log('wrote public/assets/characters/character.png (copy of NPC_test.png)');

// ---------------------------------------------------------------- verification contact sheet
const outFiles = [
  'public/assets/tiles/terrain.png',
  'public/assets/objects/tree.png',
  'public/assets/objects/stump.png',
  'public/assets/objects/rock.png',
  'public/assets/objects/rock-depleted.png',
  'public/assets/objects/bush-fruit.png',
  'public/assets/objects/bush-empty.png',
  'public/assets/objects/campfire.png',
  'public/assets/objects/crate.png',
  'public/assets/objects/fence.png',
  'public/assets/objects/bridge.png',
  'public/assets/objects/hut-wall.png',
  'public/assets/objects/statue.png',
  'public/assets/objects/fruit-basket.png',
  'public/assets/objects/stone-path.png',
  'public/assets/objects/ruin-pillar.png',
  'public/assets/characters/character.png',
];
const SCALE = 4;
const PAD = 8;
let cw = 0;
let ch = PAD;
const imgs = outFiles.map((f) => decodePng(path.join(root, f)));
for (const i of imgs) {
  cw = Math.max(cw, i.w * SCALE + PAD * 2);
  ch += i.h * SCALE + PAD;
}
const sheet = new Img(cw, ch);
sheet.rect(0, 0, cw, ch, 0x28442eff);
let y = PAD;
for (const i of imgs) {
  sheet.blit(cropScaled(i, 0, 0, i.w, i.h, SCALE), 0, 0, i.w * SCALE, i.h * SCALE, PAD, y);
  y += i.h * SCALE + PAD;
}
const preview = path.join(process.env.TEMP ?? '.', 'compose-preview.png');
fs.writeFileSync(preview, sheet.toPng());
console.log('preview at', preview);
