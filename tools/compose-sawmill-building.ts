/**
 * Compose the Sawmill as the seed Building (ADR-0008): a 2×2 timber mill-house,
 * 32×36, feet at the bottom-centre origin so it depth-sorts like every object.
 * Overwrites public/assets/objects/sawmill.png. Not shipped in the game —
 * run once with `npx tsx tools/compose-sawmill-building.ts`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Img } from './png';

const W = 32;
const H = 36;
const img = new Img(W, H);

// palette (0xRRGGBBAA)
const OUTLINE = 0x2a2018ff;
const WALL = 0x9a6f3eff;
const WALL_L = 0xb98a52ff;
const WALL_D = 0x7a5834ff;
const PLANK = 0xc9a06aff;
const PLANK_DARK = 0xa87d4cff;
const ROOF = 0x8c5a3aff;
const ROOF_D = 0x6e4328ff;
const ROOF_L = 0xa9744aff;
const BLADE = 0xb8bfc6ff;
const TEETH = 0x8d949bff;
const HUB = 0x5c6b73ff;
const SAWDUST = 0xdfbe8aff;
const WIN = 0x24140bff;
const WIN_GLINT = 0x8ec7ffff;

// ---- walls: a 26-wide timber box on the 2-tile footprint (y 15..34)
img.rect(3, 15, 26, 20, WALL);
img.rect(3, 15, 2, 20, WALL_L); // lit left edge
img.rect(3, 21, 26, 1, WALL_D); // plank courses
img.rect(3, 27, 26, 1, WALL_D);
for (let x = 3; x < 29; x++) {
  img.px(x, 15, OUTLINE);
  img.px(x, 34, OUTLINE);
}
for (let y = 15; y <= 34; y++) {
  img.px(3, y, OUTLINE);
  img.px(28, y, OUTLINE);
}

// ---- gabled roof spilling past the eaves (y 1..15)
for (let y = 1; y <= 14; y++) {
  const spread = Math.round(((y - 1) / 13) * 15) + 1;
  const x0 = 16 - spread;
  const x1 = 16 + spread;
  for (let x = x0; x <= x1; x++) img.px(x, y, y < 4 ? ROOF_L : ROOF);
  if (y >= 12) for (let x = x0; x <= x1; x++) img.px(x, y, ROOF_D); // eave shadow
  img.px(x0, y, OUTLINE);
  img.px(x1, y, OUTLINE);
}
img.px(16, 1, OUTLINE);
img.rect(1, 15, 30, 1, ROOF_D); // eave line over the wall tops

// ---- work table across the front (y 22)
img.rect(1, 22, 30, 3, PLANK);
img.rect(1, 24, 30, 1, PLANK_DARK);
for (let x = 1; x < 31; x++) { img.px(x, 22, OUTLINE); img.px(x, 25, OUTLINE); }

// ---- the mill's big circular saw blade, half above the table (left of centre)
const cx = 11;
const cy = 22;
for (let a = 0; a < Math.PI * 2; a += 0.11) {
  const x = Math.round(cx + Math.cos(a) * 6);
  const y = Math.round(cy + Math.sin(a) * 6);
  if (y <= 21) img.px(x, y, BLADE);
}
for (let a = 0; a < Math.PI * 2; a += 0.32) {
  const x = Math.round(cx + Math.cos(a) * 7);
  const y = Math.round(cy + Math.sin(a) * 7);
  if (y <= 21) img.px(x, y, TEETH); // teeth on the rim
}
// blade face + hub
for (let dy = -5; dy <= -1; dy++) for (let dx = -4; dx <= 4; dx++) {
  if (dx * dx + dy * dy <= 20) img.px(cx + dx, cy + dy, BLADE);
}
img.rect(cx - 1, cy - 3, 3, 3, HUB);

// ---- fresh planks stacked to the right of the blade
img.rect(19, 27, 10, 2, PLANK);
img.rect(19, 29, 10, 2, PLANK_DARK);
img.rect(19, 31, 10, 2, PLANK);
img.rect(19, 27, 1, 6, OUTLINE);
img.rect(28, 27, 1, 6, OUTLINE);

// ---- a lit window upper-right + a little sawdust
img.rect(21, 17, 5, 4, WIN);
img.px(22, 18, WIN_GLINT);
img.px(23, 19, WIN_GLINT);
img.px(7, 26, SAWDUST);
img.px(9, 27, SAWDUST);
img.px(14, 26, PLANK);

const outDir = path.resolve(import.meta.dirname, '../public/assets/objects');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'sawmill.png'), img.toPng());
console.log(`Wrote sawmill.png (${W}x${H})`);
