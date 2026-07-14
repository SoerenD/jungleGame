/**
 * The Green Terraces' Resource Node sprite (ADR-0017 rung 3 chain: wildgrain →
 * Verdant Loom → verdant fibre). A hillside bed of ripe wildgrain: golden ears on
 * green stalks rising from a soil mound. It must read as HARVESTABLE — and RIPE —
 * at a glance, so it owns the Realm's warm signal color: sunlit gold (#d8a83e /
 * #f0c95e / #ffe89a) on Verdant green stems, the same warm-gold-green the
 * Cultivation ripe window, the Verdant Loom and the gate glyphs speak.
 * Full: ripe golden ears. Depleted: cut stubble on bare soil, the grain reaped.
 *
 * Deterministic (no RNG): re-running writes byte-identical files.
 * Run: npx --registry https://registry.npmjs.org/ tsx tools/compose-wildgrain.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { Img } from './png';

const objsDir = path.resolve(import.meta.dirname, '../public/assets/objects');
fs.mkdirSync(objsDir, { recursive: true });
const rgb = (r: number, g: number, b: number, a = 255) => (((r & 255) << 24) | ((g & 255) << 16) | ((b & 255) << 8) | (a & 255)) >>> 0;

const W = 24;
const H = 26;
const SOIL_D = rgb(0x33, 0x28, 0x1a);
const SOIL = rgb(0x4a, 0x39, 0x22);
const SOIL_L = rgb(0x5e, 0x49, 0x2c);
const GRASS_D = rgb(0x46, 0x5f, 0x2e);
const GRASS = rgb(0x5c, 0x79, 0x3a);
const STEM_D = rgb(0x6a, 0x83, 0x38);
const STEM = rgb(0x86, 0xa0, 0x48);
const STEM_L = rgb(0x9d, 0xb8, 0x5a);
const GRAIN_D = rgb(0xb5, 0x87, 0x2e);
const GRAIN = rgb(0xd8, 0xa8, 0x3e);
const GRAIN_L = rgb(0xf0, 0xc9, 0x5e);
const GRAIN_H = rgb(0xff, 0xe8, 0x9a);

// a golden ear of grain: widest in the middle, tapering to a point top and bottom,
// crowned with two fine awns. cx = spine x, baseY = where the ear meets the stem.
function ear(img: Img, cx: number, baseY: number, hh: number, lit: boolean): void {
  for (let d = 0; d < hh; d++) {
    const y = baseY - d; // grows upward
    const t = d / (hh - 1); // 0 at stem → 1 at tip
    const w = Math.max(0, Math.round(Math.sin(t * Math.PI) * 1.6)); // 0..~1.6..0
    for (let dx = -w; dx <= w; dx++) {
      const edge = Math.abs(dx) === w && w > 0;
      const c = edge ? GRAIN_D : dx < 0 ? GRAIN : GRAIN_L;
      img.px(cx + dx, y, c);
    }
    if (lit && w > 0) img.px(cx + 1, y, GRAIN_H); // sunlit right flank
  }
  // two fine awns bristling from the tip
  img.px(cx, baseY - hh, GRAIN_L);
  img.px(cx - 1, baseY - hh + 1, GRAIN_D);
  img.px(cx + 1, baseY - hh + 1, GRAIN_D);
}

// one wildgrain stalk: base x, total height, lean, a lit/front stalk catches sun
function stalk(img: Img, bx: number, h: number, lean: number, lit: boolean): void {
  const headH = 7; // grain-ear height
  const stemH = h - headH; // green stem below the ear
  let cx = bx;
  for (let d = 0; d < stemH; d++) {
    const y = H - 4 - d;
    const t = d / h; // 0 base → 1 top
    cx = bx + Math.round(lean * t * h * 0.18);
    img.px(cx, y, d < stemH - 1 ? STEM_D : STEM);
    img.px(cx + 1, y, STEM); // 2px stem, lit side
    if (lit && d % 3 === 0) img.px(cx + 1, y, STEM_L);
  }
  ear(img, cx, H - 4 - stemH, headH, lit); // ear sits atop the stem
}

function base(img: Img): void {
  for (let x = 2; x < W - 2; x++) img.px(x, H - 3, SOIL_L);
  for (let x = 1; x < W - 1; x++) img.px(x, H - 2, SOIL);
  for (let x = 3; x < W - 3; x++) img.px(x, H - 1, SOIL_D);
  // grass tufts scattered along the soil line
  for (const x of [3, 7, 12, 16, 20]) {
    img.px(x, H - 4, GRASS_D);
    img.px(x, H - 5, GRASS);
  }
}

const full = new Img(W, H);
base(full);
// the wildgrain bed, back-to-front, tallest at centre
stalk(full, 5, 13, -1, false);
stalk(full, 19, 14, 1, false);
stalk(full, 8, 18, -1, true);
stalk(full, 16, 19, 1, true);
stalk(full, 12, 22, 0, true);
fs.writeFileSync(path.join(objsDir, 'wildgrain-bed.png'), full.toPng());
console.log(`Wrote wildgrain-bed.png (${W}x${H})`);

const cut = new Img(W, H);
base(cut);
// cut stubble where the stalks stood — the grain reaped away, stems shorn short
for (const [sx, hh] of [[5, 2], [8, 3], [12, 4], [16, 3], [19, 2]] as const) {
  for (let d = 0; d < hh; d++) cut.px(sx, H - 4 - d, d === hh - 1 ? STEM : STEM_D);
  cut.px(sx + 1, H - 4, STEM_D); // a bent broken stub
}
// a few reaped grains fallen dull on the soil
for (const x of [6, 14, 18]) cut.px(x, H - 4, GRAIN_D);
fs.writeFileSync(path.join(objsDir, 'wildgrain-bed-depleted.png'), cut.toPng());
console.log(`Wrote wildgrain-bed-depleted.png (${W}x${H})`);
