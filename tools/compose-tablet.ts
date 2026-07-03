/**
 * Composes the Ancient Tablet sprite: an upright carved rune stele (32x48, a
 * standing slab with a rounded top, weathered gray-violet stone and glowing
 * engraved violet runes) — readable at gameplay zoom and distinct from rocks.
 * GameScene draws it at ~0.55 scale with feet on the bottom row. Drawn from
 * primitives, so it re-runs anywhere with no inputs.
 *
 * Run: npx tsx tools/compose-tablet.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { Img } from './png';

const root = path.resolve(import.meta.dirname, '..');
const write = (rel: string, img: Img) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, img.toPng());
  console.log('wrote', rel, `${img.w}x${img.h}`);
};

// weathered gray-violet stone, lit from the upper left
const OUT = 0x1c1a22ff;
const DK = 0x484150ff;
const MID = 0x5c5568ff;
const LT = 0x7d7488ff;
const HI = 0x9a91a6ff;
const RUNE = 0xb478ffff;
const RUNE_L = 0xe6d2ffff;

/** 1px inner outline wherever an opaque pixel meets transparency */
function outline(f: Img): void {
  const solid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < f.w && y < f.h && f.data[(y * f.w + x) * 4 + 3] !== 0;
  const edges: [number, number][] = [];
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      if (!solid(x, y)) continue;
      if (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1)) edges.push([x, y]);
    }
  }
  for (const [x, y] of edges) f.px(x, y, OUT);
}

const T = new Img(32, 48);

// standing slab body with a rounded top (feet a couple px above the bottom)
T.rect(7, 7, 18, 39, MID);
T.disc(16, 8, 9, MID);
// lit / shaded faces
T.rect(7, 7, 4, 39, LT);
T.rect(21, 7, 4, 39, DK);
T.disc(13, 7, 4, HI); // top-left catch light
// stone base plinth
T.rect(4, 43, 24, 3, DK);
T.rect(4, 43, 24, 1, LT);

// a central sigil near the crown
T.rect(14, 11, 4, 4, RUNE);
T.rect(15, 12, 2, 2, RUNE_L);

// rows of engraved glowing runes down the face
for (const y of [19, 25, 31, 37]) {
  T.rect(11, y, 10, 1, RUNE);
  T.px(12, y, RUNE_L);
  T.px(16, y, RUNE_L);
  T.px(19, y, RUNE_L);
}

outline(T);
write('public/assets/objects/tablet.png', T);
console.log('tablet composed.');
