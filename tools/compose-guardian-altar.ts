/**
 * The summoning altar — "Die Opferschale". A low, wide round field-stone basin
 * on a stepped masonry base (the Village fountain's family), the four offering
 * goods resting on the rim and a tiny warm shimmer rising from the center.
 *
 * HISTORY: this art was born as the SEAL monument (owner-picked from a
 * six-design village-style review, 2026-07-17), then promoted to the altar the
 * same day (owner request): the basin reads as the place you LAY something —
 * a totem, an offering — so every summoning altar (the Guardian's arena + the
 * three Warden courts, all sharing the `guardian_altar` texture) now wears it.
 * The Seal monument gets its own art in tools/compose-seal-monument.ts.
 *
 * Rustic-Timber palette (Village Hall wood/gold family + warm field-stone +
 * moss); deliberately no sigils, no eye motif, no arcane glow.
 *
 * Run: npx tsx tools/compose-guardian-altar.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { Img } from './png';

const OUTLINE = 0x1c1712ff;
const TIMBER = 0x96714aff;
const TIMBER_DK = 0x6b4f33ff;
const TIMBER_LT = 0xb8955fff;
const STONE = 0x8a8072ff;
const STONE_DK = 0x5f5749ff;
const STONE_LT = 0xb0a690ff;
const GOLD = 0xe0b268ff;
const GOLD_LT = 0xf5d99aff;
const MOSS = 0x4a9e52ff;
const MOSS_DK = 0x2f7a3dff;
const VINE = 0x3d8a47ff;
const GLOW = 0xffd35cff;
const FRUIT = 0xb5473bff;
// derived shades (stone family): dark basin interior + soft ground shadow
const BASIN_IN = 0x423b31ff;
const SHADOW = 0x1c171255;

const img = new Img(32, 32);
const hline = (y: number, x0: number, x1: number, c: number) => img.rect(x0, y, x1 - x0 + 1, 1, c);

// ---- soft ground shadow (baseline y=28; rows 29-31 stay mostly clear) ----
hline(29, 3, 28, SHADOW);
hline(30, 7, 24, SHADOW);

// ---- stepped base: two masonry steps, lit from the upper left ----
// lower step (y26-28)
hline(26, 3, 28, STONE_LT); // top face catches light
hline(27, 3, 9, STONE);
hline(27, 10, 24, STONE);
hline(27, 25, 28, STONE_DK);
hline(28, 3, 28, STONE_DK);
img.px(3, 26, OUTLINE); img.px(28, 26, OUTLINE);
img.px(2, 27, OUTLINE); img.px(29, 27, OUTLINE);
img.px(2, 28, OUTLINE); img.px(29, 28, OUTLINE);
hline(28, 3, 28, STONE_DK);
// mortar seams on the lower step front
img.px(11, 27, STONE_DK); img.px(19, 27, STONE_DK);
img.px(7, 28, OUTLINE); img.px(15, 28, OUTLINE); img.px(23, 28, OUTLINE);
// upper step (y23-25)
hline(23, 6, 25, STONE_LT);
hline(24, 6, 12, STONE);
hline(24, 13, 22, STONE);
hline(24, 23, 25, STONE_DK);
hline(25, 6, 25, STONE_DK);
img.px(5, 23, OUTLINE); img.px(26, 23, OUTLINE);
img.px(5, 24, OUTLINE); img.px(26, 24, OUTLINE);
img.px(5, 25, OUTLINE); img.px(26, 25, OUTLINE);
img.px(10, 24, STONE_DK); img.px(17, 24, STONE_DK); // mortar seams
img.px(13, 25, OUTLINE); img.px(21, 25, OUTLINE);

// ---- bowl outer wall: wide at the rim, curving in to the pedestal ----
// per-row spans [y, x0, x1]
const wall: Array<[number, number, number]> = [
  [16, 2, 29],
  [17, 2, 29],
  [18, 3, 28],
  [19, 4, 27],
  [20, 6, 25],
  [21, 8, 23],
  [22, 9, 22],
];
for (const [y, x0, x1] of wall) {
  img.px(x0, y, OUTLINE);
  img.px(x1, y, OUTLINE);
  const w = x1 - x0 - 1;
  const litEnd = x0 + Math.max(2, Math.floor(w * 0.3));
  const midEnd = x0 + Math.floor(w * 0.72);
  hline(y, x0 + 1, litEnd, STONE_LT);
  hline(y, litEnd + 1, midEnd, STONE);
  hline(y, midEnd + 1, x1 - 1, STONE_DK);
}
// carved gold inlay band around the bowl belly (sparing accent)
hline(18, 6, 25, GOLD);
img.px(7, 18, GOLD_LT); img.px(8, 18, GOLD_LT);
img.px(24, 18, TIMBER_DK); // band falls into shade on the right

// ---- rim: an open ring seen slightly from above ----
// back rim edge
hline(11, 10, 21, OUTLINE);
img.px(8, 12, OUTLINE); img.px(9, 12, OUTLINE);
img.px(22, 12, OUTLINE); img.px(23, 12, OUTLINE);
hline(12, 10, 21, STONE_LT); // lit back rim surface
// widening ring rows
img.px(5, 13, OUTLINE); img.px(6, 13, OUTLINE); img.px(7, 13, OUTLINE);
img.px(24, 13, OUTLINE); img.px(25, 13, OUTLINE); img.px(26, 13, OUTLINE);
hline(13, 8, 9, STONE_LT);
hline(13, 22, 23, STONE);
hline(13, 10, 21, BASIN_IN); // dark interior
img.px(3, 14, OUTLINE); img.px(4, 14, OUTLINE);
img.px(27, 14, OUTLINE); img.px(28, 14, OUTLINE);
hline(14, 5, 8, STONE_LT);
hline(14, 23, 26, STONE);
hline(14, 9, 22, BASIN_IN);
// widest rim row + front inner lip
img.px(2, 15, OUTLINE); img.px(29, 15, OUTLINE);
hline(15, 3, 7, STONE_LT);
hline(15, 24, 28, STONE_DK);
hline(15, 8, 23, STONE); // front inner wall of the bowl catching light
img.px(8, 15, STONE_LT); img.px(9, 15, STONE_LT);

// ---- warm shimmer rising from the basin (tiny accent, kept off-center) ----
img.px(17, 13, GLOW);
img.px(18, 13, GLOW);
img.px(16, 11, GLOW);
img.px(15, 9, GOLD_LT);

// ---- the four offering goods resting ON the rim (silhouette against sky) ----
// timber billet on the left rim (a tiny lying log, lit from the left)
img.px(4, 12, TIMBER_LT);
img.px(5, 12, TIMBER);
img.px(6, 12, TIMBER_DK);
// grey stone chip on the right rim edge (sits above the outline arc)
img.px(25, 12, STONE_LT);
img.px(26, 12, STONE);
// green fiber coil on the back rim, left
img.px(10, 11, VINE);
img.px(11, 11, MOSS);
img.px(10, 10, MOSS_DK);
img.px(11, 10, VINE);
// red fruit on the back rim, right
img.px(20, 11, FRUIT);
img.px(21, 11, FRUIT);
img.px(20, 10, FRUIT);

// ---- moss and vines (living green, ties it to the jungle) ----
img.px(4, 26, MOSS); img.px(5, 26, MOSS_DK);
img.px(24, 26, MOSS_DK);
img.px(8, 23, MOSS); img.px(9, 23, MOSS_DK);
img.px(3, 27, MOSS_DK);
// a vine creeping up the right of the bowl
img.px(27, 19, VINE);
img.px(28, 18, VINE);
img.px(28, 17, MOSS_DK);
img.px(27, 16, VINE);
img.px(26, 20, MOSS_DK);

const out = path.resolve(import.meta.dirname, '../public/assets/objects/guardian-altar.png');
fs.writeFileSync(out, img.toPng());
console.log('wrote', out, '32x32');
