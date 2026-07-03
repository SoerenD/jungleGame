/**
 * Composes public/assets/objects/altar.png (the grove altar) from the
 * checked-in CC0 crops in public/assets/objects/ (adapted from "Zelda-like
 * tilesets and sprites" by ArMM1998 — see CREDITS.md).
 *
 * The original v1 crop `tile(OW, 6, 24, 2, 2)` in compose-assets.ts hit an
 * empty region of the pack's Overworld.png, leaving altar.png fully
 * transparent. Like compose-v2-assets.ts, this script needs no pack
 * download — it derives everything from the checked-in crops.
 *
 * Run: npx tsx tools/compose-altar.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { Img } from './png';
import { decodePng, cropScaled } from './png-decode';

const root = path.resolve(import.meta.dirname, '..');
const obj = (name: string) => decodePng(path.join(root, 'public/assets/objects', name));
const write = (rel: string, img: Img) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, img.toPng());
  console.log('wrote', rel, `${img.w}x${img.h}`);
};

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

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** weathered grove stone: pale pillar marble pulled toward mossy gray-green */
const grovestone = (r: number, g: number, b: number, a: number): [number, number, number, number] => {
  const l = 0.3 * r + 0.5 * g + 0.2 * b;
  return [clamp(l * 0.62 + 28), clamp(l * 0.72 + 38), clamp(l * 0.6 + 30), a];
};

const pillar = obj('ruin-pillar.png'); // 16x32 white stone shaft
const stonePath = obj('stone-path.png'); // 16x16 pale slab

// grove altar: a low mossy stone table (2-tile footprint, bottom-anchored)
const altar = new Img(32, 32);

// legs: pillar-shaft crops, mirrored
const leg = recolor(cropScaled(pillar, 3, 8, 10, 15, 1), grovestone);
altar.blit(leg, 0, 0, 10, 15, 3, 17);
altar.blit(leg, 0, 0, 10, 15, 19, 17, true);

// tabletop: stone-path slab texture, two crops side by side with an overhang
const slab = recolor(cropScaled(stonePath, 1, 1, 14, 8, 1), grovestone);
altar.blit(slab, 0, 0, 14, 8, 2, 9);
altar.blit(slab, 0, 0, 14, 8, 16, 9, true);
altar.rect(2, 9, 28, 1, 0xc2d2c0ff); // lit top edge
altar.rect(2, 16, 28, 1, 0x3d4a3cff); // shadow under the overhang
altar.px(2, 9, 0x8fa38dff);
altar.px(29, 9, 0x8fa38dff);

// moss creeping over the slab edge and up the legs (same accent greens as the Guardian)
for (const [x, y] of [
  [3, 9],
  [8, 9],
  [14, 10],
  [21, 9],
  [27, 10],
  [2, 12],
  [29, 13],
  [4, 18],
  [11, 20],
  [20, 24],
  [27, 19],
]) {
  altar.px(x, y, 0x4a9e52ff);
  altar.px(x + 1, y, 0x2f7a3dff);
}

// the jungle's rune: an emerald offering-sigil glowing on the slab front
for (const [x, y] of [
  [15, 11],
  [16, 11],
  [14, 13],
  [17, 13],
  [15, 14],
  [16, 14],
]) {
  altar.px(x, y, 0x63e08cff);
}
altar.px(15, 12, 0xa8ffc4ff);
altar.px(16, 12, 0xa8ffc4ff);

write('public/assets/objects/altar.png', altar);

// verification contact sheet (8x) next to the other landmarks
const SCALE = 8;
const PAD = 12;
const names = ['altar.png', 'guardian-altar.png', 'seal-monument.png'];
const imgs = names.map((n) => obj(n));
let cw = PAD;
let ch = 0;
for (const i of imgs) {
  cw += i.w * SCALE + PAD;
  ch = Math.max(ch, i.h * SCALE + PAD * 2);
}
const sheet = new Img(cw, ch);
sheet.rect(0, 0, cw, ch, 0x28442eff);
let x = PAD;
for (const i of imgs) {
  sheet.blit(cropScaled(i, 0, 0, i.w, i.h, SCALE), 0, 0, i.w * SCALE, i.h * SCALE, x, PAD);
  x += i.w * SCALE + PAD;
}
const preview = path.join(process.env.TEMP ?? '.', 'altar-preview.png');
fs.writeFileSync(preview, sheet.toPng());
console.log('preview at', preview);
