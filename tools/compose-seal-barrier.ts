/**
 * Composes the Seal barrier sprite: an authored rune-stone gate segment
 * (16x32, tiles horizontally across the arena entrance) — carved violet-toned
 * stone with stacked-block seams and a glowing violet seal sigil. Kept violet
 * so the epic break FX (violet particles) and the minimap dot still read the
 * same. Drawn from primitives, so it re-runs anywhere with no inputs.
 *
 * Run: npx tsx tools/compose-seal-barrier.ts
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

// violet-toned stone, lit from the upper left
const OUT = 0x140f20ff; // silhouette outline
const STONE_D = 0x342f4aff;
const STONE = 0x453f63ff;
const STONE_L = 0x655a86ff;
const SEAM = 0x241d38ff;
const RUNE = 0xb478ffff;
const RUNE_L = 0xe6d2ffff;

const f = new Img(16, 32);

// carved stone slab body (a 14-wide segment, feet on the bottom row)
f.rect(1, 0, 14, 32, STONE);
f.rect(1, 0, 3, 32, STONE_L); // left-lit face
f.rect(12, 0, 3, 32, STONE_D); // right shade

// stacked-block seams with a bevel highlight beneath each
f.rect(1, 10, 14, 1, SEAM);
f.rect(1, 11, 14, 1, STONE_L);
f.rect(1, 21, 14, 1, SEAM);
f.rect(1, 22, 14, 1, STONE_L);

// glowing violet seal sigil — a vertical diamond eye at the center
[
  [1, 13],
  [3, 14],
  [5, 15],
  [3, 16],
  [1, 17],
].forEach(([w, y]) => f.rect(8 - (w >> 1), y, w, 1, RUNE));
f.rect(7, 15, 3, 1, RUNE_L); // bright core
f.px(8, 14, RUNE_L);
f.px(8, 16, RUNE_L);

// small rune ticks above and below the sigil
f.rect(7, 5, 2, 2, RUNE);
f.rect(7, 25, 2, 2, RUNE);
f.px(8, 3, RUNE_L);
f.px(8, 28, RUNE_L);

// dark silhouette outline
f.rect(1, 0, 1, 32, OUT);
f.rect(14, 0, 1, 32, OUT);
f.rect(1, 0, 14, 1, OUT);
f.rect(1, 31, 14, 1, OUT);

write('public/assets/objects/seal-barrier.png', f);
console.log('seal barrier composed.');
