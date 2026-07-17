/**
 * The Seal monument — the communal quota shrine outside the Guardian's arena
 * (the three Warden-court offering monuments reuse the same texture).
 *
 * Its first art, the "Opferschale" basin, was promoted to the summoning altar
 * (owner request 2026-07-17 — see tools/compose-guardian-altar.ts). This script
 * holds the SECOND six-design review round for the Seal itself: six candidates
 * in the same Rustic-Timber village palette (field-stone + timber + gold +
 * moss; deliberately no sigils, no violet, no eye motif), all 32x32 and
 * bottom-anchored on the shared baseline (ground y=28, soft shadow below).
 *
 * `CHOSEN` picks the design written to public/assets/objects/seal-monument.png.
 *
 * Run:  npx tsx tools/compose-seal-monument.ts               (write the chosen art)
 *       npx tsx tools/compose-seal-monument.ts --candidates <dir>
 *           (also render all six as 8x PNGs + a contact sheet for review)
 */
import fs from 'node:fs';
import path from 'node:path';
import { Img } from './png';
import { cropScaled } from './png-decode';

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
const DARK_IN = 0x423b31ff; // recessed stone (niches, interiors)
const SHADOW = 0x1c171255;

// ---------------------------------------------------------------- helpers
const hl = (i: Img, y: number, x0: number, x1: number, c: number) => i.rect(x0, y, x1 - x0 + 1, 1, c);

/** the soft ground shadow every monument sits on (baseline y=28) */
function groundShadow(i: Img, x0 = 4, x1 = 27): void {
  hl(i, 29, x0, x1, SHADOW);
  hl(i, 30, x0 + 3, x1 - 3, SHADOW);
}

// the four offering goods — tiny shared motifs (the Seal's identity: the
// wood/stone/fiber/fruit quotas made physical)
function billet(i: Img, x: number, y: number): void {
  i.px(x, y, TIMBER_LT); i.px(x + 1, y, TIMBER); i.px(x + 2, y, TIMBER_DK);
}
function stoneChip(i: Img, x: number, y: number): void {
  i.px(x, y, STONE_LT); i.px(x + 1, y, STONE);
}
function fiberCoil(i: Img, x: number, y: number): void {
  i.px(x, y, VINE); i.px(x + 1, y, MOSS);
  i.px(x, y - 1, MOSS_DK); i.px(x + 1, y - 1, VINE);
}
function fruitDot(i: Img, x: number, y: number): void {
  i.px(x, y, FRUIT); i.px(x + 1, y, FRUIT); i.px(x, y - 1, FRUIT);
}

/** fill one body row between outline ends, lit from the upper left */
function litRow(i: Img, y: number, x0: number, x1: number, litFrac = 0.3, midFrac = 0.72): void {
  i.px(x0, y, OUTLINE);
  i.px(x1, y, OUTLINE);
  const w = x1 - x0 - 1;
  if (w <= 0) return;
  const litEnd = x0 + Math.max(2, Math.floor(w * litFrac));
  const midEnd = x0 + Math.floor(w * midFrac);
  hl(i, y, x0 + 1, litEnd, STONE_LT);
  hl(i, y, litEnd + 1, midEnd, STONE);
  hl(i, y, midEnd + 1, x1 - 1, STONE_DK);
}

// ---------------------------------------------------------------- designs
/** 1 — Die Bruchsäule: a squat broken quota-pillar on masonry steps, its gold
 *  band half sunk in moss, the four goods laid on the steps around it */
function drawBruchsaeule(i: Img): void {
  groundShadow(i, 5, 26);
  // lower step y26-28
  hl(i, 26, 5, 26, STONE_LT);
  hl(i, 27, 5, 20, STONE);
  hl(i, 27, 21, 26, STONE_DK);
  hl(i, 28, 5, 26, STONE_DK);
  i.px(5, 26, OUTLINE); i.px(26, 26, OUTLINE);
  i.px(4, 27, OUTLINE); i.px(27, 27, OUTLINE);
  i.px(4, 28, OUTLINE); i.px(27, 28, OUTLINE);
  i.px(9, 28, OUTLINE); i.px(16, 28, OUTLINE); i.px(23, 28, OUTLINE); // mortar
  // upper step y24-25
  hl(i, 24, 8, 23, STONE_LT);
  hl(i, 25, 8, 18, STONE);
  hl(i, 25, 19, 23, STONE_DK);
  i.px(8, 24, OUTLINE); i.px(23, 24, OUTLINE);
  i.px(7, 25, OUTLINE); i.px(24, 25, OUTLINE);
  i.px(13, 25, OUTLINE); i.px(19, 25, OUTLINE); // mortar
  // shaft x11-20, broken top (jagged y6-8)
  const top: Array<[number, number]> = [
    [11, 8], [12, 7], [13, 8], [14, 6], [15, 7], [16, 6], [17, 7], [18, 8], [19, 7], [20, 8],
  ];
  for (const [x, y] of top) {
    i.px(x, y, OUTLINE);
    for (let yy = y + 1; yy <= 23; yy++) {
      const c = x <= 13 ? STONE_LT : x <= 17 ? STONE : STONE_DK;
      i.px(x, yy, c);
    }
  }
  for (let y = 9; y <= 23; y++) {
    i.px(10, y, OUTLINE);
    i.px(21, y, OUTLINE);
  }
  // the quota band: carved gold ring around the shaft belly
  hl(i, 13, 11, 20, GOLD);
  i.px(11, 13, GOLD_LT); i.px(12, 13, GOLD_LT);
  i.px(19, 13, TIMBER_DK); i.px(20, 13, TIMBER_DK);
  hl(i, 14, 11, 20, TIMBER_DK); // band's under-shadow
  // the crack, snaking from the break down past the band
  i.px(16, 9, OUTLINE); i.px(15, 10, OUTLINE); i.px(15, 11, OUTLINE);
  i.px(16, 12, OUTLINE); i.px(16, 15, OUTLINE); i.px(17, 16, OUTLINE);
  i.px(16, 17, OUTLINE); i.px(16, 18, OUTLINE); i.px(15, 19, OUTLINE);
  // the fallen crown chunk, mossy in the grass to the right
  i.px(28, 26, OUTLINE); i.px(29, 27, OUTLINE);
  i.px(28, 27, STONE); i.px(29, 26, STONE_LT);
  i.px(28, 25, MOSS_DK);
  // goods on the steps
  billet(i, 5, 25);
  stoneChip(i, 24, 24);
  fiberCoil(i, 11, 23);
  fruitDot(i, 18, 23);
  // moss + a climbing vine
  i.px(5, 27, MOSS_DK); i.px(6, 26, MOSS);
  i.px(21, 23, MOSS_DK); i.px(20, 24, MOSS);
  i.px(10, 20, VINE); i.px(9, 19, MOSS_DK); i.px(10, 18, VINE); i.px(10, 17, MOSS);
}

/** 2 — Der Schwurstein: one great rounded oath-stone, four carved niches each
 *  cradling one of the goods behind a gold lintel */
function drawSchwurstein(i: Img): void {
  groundShadow(i, 6, 25);
  // footing
  hl(i, 26, 7, 24, STONE_LT);
  hl(i, 27, 7, 24, STONE);
  hl(i, 28, 7, 24, STONE_DK);
  i.px(6, 27, OUTLINE); i.px(25, 27, OUTLINE);
  i.px(6, 28, OUTLINE); i.px(25, 28, OUTLINE);
  i.px(12, 28, OUTLINE); i.px(19, 28, OUTLINE);
  // the menhir (egg silhouette)
  const rows: Array<[number, number, number]> = [
    [5, 13, 18], [6, 11, 20], [7, 10, 21], [8, 9, 22],
    [9, 8, 23], [10, 8, 23], [11, 8, 23], [12, 8, 23], [13, 8, 23],
    [14, 8, 23], [15, 8, 23], [16, 8, 23], [17, 8, 23], [18, 8, 23],
    [19, 8, 23], [20, 8, 23], [21, 9, 22], [22, 9, 22], [23, 10, 21],
    [24, 10, 21], [25, 10, 21],
  ];
  hl(i, 4, 13, 18, OUTLINE);
  for (const [y, x0, x1] of rows) litRow(i, y, x0, x1);
  // four niches (recessed), gold lintels, one good in each
  const niche = (x: number, y: number): void => {
    i.rect(x, y, 3, 3, DARK_IN);
    hl(i, y - 1, x, x + 2, GOLD);
    i.px(x, y - 1, GOLD_LT);
  };
  niche(11, 10); billet(i, 11, 11);
  niche(18, 10); stoneChip(i, 18, 11); i.px(19, 12, STONE_DK);
  niche(11, 17); fiberCoil(i, 11, 18);
  niche(18, 17); fruitDot(i, 18, 18);
  // weathering: moss creeping over the shoulder + foot
  i.px(13, 5, MOSS_DK); i.px(14, 5, MOSS);
  i.px(9, 9, MOSS); i.px(8, 10, MOSS_DK);
  i.px(8, 26, MOSS); i.px(9, 26, MOSS_DK); i.px(23, 26, MOSS_DK);
  i.px(22, 21, VINE); i.px(23, 20, MOSS_DK);
}

/** 3 — Das Opfertor: a timber lych-gate with gold caps, the four goods hung
 *  from its tie-beam like harvest bundles */
function drawOpfertor(i: Img): void {
  groundShadow(i, 2, 29);
  // stone footings
  for (const fx of [3, 24]) {
    hl(i, 26, fx, fx + 4, STONE_LT);
    hl(i, 27, fx, fx + 4, STONE);
    hl(i, 28, fx, fx + 4, STONE_DK);
    i.px(fx - 1, 27, OUTLINE); i.px(fx + 5, 27, OUTLINE);
    i.px(fx - 1, 28, OUTLINE); i.px(fx + 5, 28, OUTLINE);
  }
  // posts
  for (const px of [4, 25]) {
    for (let y = 9; y <= 25; y++) {
      i.px(px - 1, y, OUTLINE);
      i.px(px, y, TIMBER_LT);
      i.px(px + 1, y, TIMBER);
      i.px(px + 2, y, TIMBER_DK);
      i.px(px + 3, y, OUTLINE);
    }
  }
  // top beam with upswept ends
  hl(i, 5, 1, 30, OUTLINE);
  hl(i, 6, 1, 30, TIMBER_LT);
  hl(i, 7, 2, 29, TIMBER);
  hl(i, 8, 2, 29, TIMBER_DK);
  i.px(1, 4, OUTLINE); i.px(30, 4, OUTLINE);
  i.px(1, 7, OUTLINE); i.px(30, 7, OUTLINE);
  // gold caps on the beam ends + a center plaque
  i.px(1, 5, GOLD); i.px(2, 5, GOLD_LT);
  i.px(30, 5, GOLD); i.px(29, 5, GOLD);
  i.px(15, 6, GOLD_LT); i.px(16, 6, GOLD);
  // tie-beam
  hl(i, 11, 4, 27, TIMBER_DK);
  hl(i, 12, 4, 27, OUTLINE);
  // the four goods hanging on cords
  i.px(9, 13, OUTLINE); i.px(9, 14, OUTLINE);
  billet(i, 8, 15);
  i.px(14, 13, OUTLINE);
  stoneChip(i, 13, 14);
  i.px(18, 13, OUTLINE); i.px(18, 14, OUTLINE);
  fiberCoil(i, 17, 16);
  i.px(23, 13, OUTLINE);
  fruitDot(i, 22, 15);
  // moss + a vine on the left post
  i.px(3, 26, MOSS); i.px(28, 26, MOSS_DK);
  i.px(4, 19, VINE); i.px(5, 18, MOSS_DK); i.px(4, 17, MOSS); i.px(5, 16, VINE);
}

/** 4 — Die Waage: a stone plinth bearing a timber balance, goods on both pans —
 *  the heavier left pan sunk (the quotas not yet met) */
function drawWaage(i: Img): void {
  groundShadow(i, 6, 25);
  // plinth
  hl(i, 26, 8, 23, STONE_LT);
  hl(i, 27, 8, 23, STONE);
  hl(i, 28, 8, 23, STONE_DK);
  i.px(7, 27, OUTLINE); i.px(24, 27, OUTLINE);
  i.px(7, 28, OUTLINE); i.px(24, 28, OUTLINE);
  for (let y = 21; y <= 25; y++) litRow(i, y, 11, 20);
  hl(i, 20, 12, 19, OUTLINE);
  // upright
  for (let y = 8; y <= 19; y++) {
    i.px(15, y, TIMBER);
    i.px(16, y, TIMBER_DK);
  }
  // cross-arm + gold pivot
  hl(i, 6, 4, 27, OUTLINE);
  hl(i, 7, 4, 27, TIMBER);
  i.px(4, 7, TIMBER_LT); i.px(5, 7, TIMBER_LT);
  i.px(15, 5, GOLD_LT); i.px(16, 5, GOLD);
  // cords — the left pan hangs LOWER (weighed down, still short of the quota)
  for (let y = 8; y <= 14; y++) i.px(5, y, OUTLINE);
  for (let y = 8; y <= 12; y++) i.px(26, y, OUTLINE);
  // left pan (low), timber + stone resting in it
  hl(i, 15, 2, 9, OUTLINE);
  hl(i, 16, 3, 8, STONE);
  i.px(3, 16, STONE_LT); i.px(8, 16, STONE_DK);
  billet(i, 3, 14);
  stoneChip(i, 7, 14);
  // right pan (high), fiber + fruit
  hl(i, 13, 22, 29, OUTLINE);
  hl(i, 14, 23, 28, STONE);
  i.px(23, 14, STONE_LT); i.px(28, 14, STONE_DK);
  fiberCoil(i, 23, 12);
  fruitDot(i, 27, 12);
  // moss
  i.px(9, 26, MOSS); i.px(22, 26, MOSS_DK); i.px(11, 21, MOSS);
  i.px(20, 24, MOSS_DK);
}

/** 5 — Der Hüterschrein: a tiny roofed village shrine, a warm bowl glowing on
 *  its stone shelf, the goods lined up on the platform before it */
function drawHueterschrein(i: Img): void {
  groundShadow(i, 3, 28);
  // platform
  hl(i, 25, 4, 27, STONE_LT);
  hl(i, 26, 4, 27, STONE);
  hl(i, 27, 4, 27, STONE_DK);
  hl(i, 28, 4, 27, STONE_DK);
  i.px(3, 26, OUTLINE); i.px(28, 26, OUTLINE);
  i.px(3, 27, OUTLINE); i.px(28, 27, OUTLINE);
  i.px(3, 28, OUTLINE); i.px(28, 28, OUTLINE);
  i.px(10, 28, OUTLINE); i.px(17, 28, OUTLINE); i.px(24, 28, OUTLINE);
  // the recessed interior between the posts
  i.rect(9, 13, 14, 12, DARK_IN);
  // posts
  for (const px of [7, 23]) {
    for (let y = 12; y <= 24; y++) {
      i.px(px - 1, y, OUTLINE);
      i.px(px, y, TIMBER);
      i.px(px + 1, y, TIMBER_DK);
    }
  }
  // pitched shingle roof, gold ridge
  const roof: Array<[number, number, number]> = [
    [7, 12, 19], [8, 10, 21], [9, 8, 23], [10, 6, 25], [11, 4, 27],
  ];
  hl(i, 6, 13, 18, OUTLINE);
  hl(i, 7, 13, 18, GOLD);
  i.px(13, 7, GOLD_LT); i.px(14, 7, GOLD_LT);
  for (const [y, x0, x1] of roof) {
    i.px(x0, y, OUTLINE);
    i.px(x1, y, OUTLINE);
    const mid = Math.floor((x0 + x1) / 2);
    hl(i, y, x0 + 1, mid - 1, TIMBER_LT);
    hl(i, y, mid, x1 - 1, TIMBER_DK);
  }
  hl(i, 12, 4, 27, OUTLINE); // eave line
  // stone shelf + the keeper's bowl, warm even at night
  hl(i, 19, 10, 21, STONE_LT);
  hl(i, 20, 10, 21, STONE_DK);
  hl(i, 18, 13, 18, GOLD);
  i.px(13, 18, GOLD_LT);
  i.px(15, 17, GLOW); i.px(16, 17, GLOW);
  i.px(15, 15, GLOW);
  i.px(16, 13, GOLD_LT);
  // the goods on the platform edge
  billet(i, 9, 24);
  stoneChip(i, 13, 24);
  fiberCoil(i, 16, 24);
  fruitDot(i, 20, 24);
  // moss + vine
  i.px(4, 25, MOSS); i.px(5, 25, MOSS_DK); i.px(26, 25, MOSS);
  i.px(24, 18, VINE); i.px(25, 17, MOSS_DK); i.px(24, 16, VINE);
}

/** 6 — Der Wurzelstein: a tall monolith the jungle has claimed back — root-clasped,
 *  vine-wrapped, a gold seam still glinting through the growth */
function drawWurzelstein(i: Img): void {
  groundShadow(i, 6, 25);
  // rough footing merging into roots
  hl(i, 26, 9, 22, STONE);
  hl(i, 27, 9, 22, STONE_DK);
  hl(i, 28, 10, 21, STONE_DK);
  i.px(8, 27, OUTLINE); i.px(23, 27, OUTLINE);
  i.px(9, 28, OUTLINE); i.px(22, 28, OUTLINE);
  // the monolith
  hl(i, 4, 13, 18, OUTLINE);
  litRow(i, 5, 12, 19);
  litRow(i, 6, 11, 20);
  for (let y = 7; y <= 25; y++) litRow(i, y, 10, 21);
  // the gold seam (an old carved fillet the moss has not swallowed)
  i.px(15, 8, GOLD_LT); i.px(15, 9, GOLD); i.px(16, 10, GOLD); i.px(16, 11, GOLD);
  // root clasps: old timber-dark roots gripping the base
  i.px(8, 25, TIMBER_DK); i.px(7, 26, TIMBER_DK); i.px(6, 27, TIMBER_DK); i.px(6, 28, OUTLINE);
  i.px(9, 24, TIMBER_DK); i.px(10, 23, TIMBER);
  i.px(23, 25, TIMBER_DK); i.px(24, 26, TIMBER_DK); i.px(25, 27, TIMBER_DK); i.px(25, 28, OUTLINE);
  i.px(22, 24, TIMBER_DK);
  // vine wraps: two living bands crossing the face
  const wrapLo: Array<[number, number]> = [
    [10, 22], [11, 21], [12, 21], [13, 20], [14, 20], [15, 19], [16, 19], [17, 18], [18, 18], [19, 17], [20, 17], [21, 16],
  ];
  const wrapHi: Array<[number, number]> = [
    [10, 15], [11, 14], [12, 14], [13, 13], [14, 13], [15, 12], [16, 12], [17, 11],
  ];
  for (const [x, y] of wrapLo) i.px(x, y, VINE);
  for (const [x, y] of wrapHi) i.px(x, y, VINE);
  i.px(12, 20, MOSS); i.px(16, 18, MOSS); i.px(19, 16, MOSS_DK);
  i.px(11, 13, MOSS); i.px(15, 11, MOSS_DK);
  // fruit ripening on the lower wrap; the other goods rest among the roots
  fruitDot(i, 18, 17);
  fiberCoil(i, 7, 24);
  billet(i, 23, 23);
  stoneChip(i, 12, 25);
  // moss crown
  i.px(13, 4, MOSS_DK); i.px(14, 4, MOSS); i.px(17, 4, MOSS_DK);
  i.px(12, 5, MOSS);
}

// ---------------------------------------------------------------- catalogue
interface SealDesign {
  key: string;
  name: string;
  draw: (i: Img) => void;
}

export const SEAL_DESIGNS: SealDesign[] = [
  { key: 'bruchsaeule', name: 'Die Bruchsäule', draw: drawBruchsaeule },
  { key: 'schwurstein', name: 'Der Schwurstein', draw: drawSchwurstein },
  { key: 'opfertor', name: 'Das Opfertor', draw: drawOpfertor },
  { key: 'waage', name: 'Die Waage', draw: drawWaage },
  { key: 'hueterschrein', name: 'Der Hüterschrein', draw: drawHueterschrein },
  { key: 'wurzelstein', name: 'Der Wurzelstein', draw: drawWurzelstein },
];

/** the design shipped as the Seal (1-based index into SEAL_DESIGNS) —
 *  owner-picked 2026-07-17: #1 Die Bruchsäule */
const CHOSEN = 1;

function render(d: SealDesign): Img {
  const img = new Img(32, 32);
  d.draw(img);
  return img;
}

const out = path.resolve(import.meta.dirname, '../public/assets/objects/seal-monument.png');
fs.writeFileSync(out, render(SEAL_DESIGNS[CHOSEN - 1]).toPng());
console.log('wrote', out, `32x32 (#${CHOSEN} ${SEAL_DESIGNS[CHOSEN - 1].name})`);

// ---- optional review render: all six at 8x + a contact sheet ----
const flag = process.argv.indexOf('--candidates');
if (flag !== -1) {
  const dir = process.argv[flag + 1] ?? (process.env.TEMP ?? '.');
  fs.mkdirSync(dir, { recursive: true });
  const SCALE = 8;
  const PAD = 12;
  const cw = PAD + SEAL_DESIGNS.length * (32 * SCALE + PAD);
  const ch = 32 * SCALE + PAD * 2;
  const sheet = new Img(cw, ch);
  sheet.rect(0, 0, cw, ch, 0x28442eff);
  SEAL_DESIGNS.forEach((d, n) => {
    const big = cropScaled(render(d), 0, 0, 32, 32, SCALE);
    fs.writeFileSync(path.join(dir, `seal-candidate-${n + 1}.png`), big.toPng());
    sheet.blit(big, 0, 0, 32 * SCALE, 32 * SCALE, PAD + n * (32 * SCALE + PAD), PAD);
  });
  const sheetPath = path.join(dir, 'seal-candidates-sheet.png');
  fs.writeFileSync(sheetPath, sheet.toPng());
  console.log('candidates at', dir);
}
