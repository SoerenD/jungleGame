/**
 * Faux-3D terrain sprites (the fix for "everything reads flat"), art-directed from
 * top-down tileset references + pixel-waterfall tutorials (lospec / pixilart):
 *   - a TALL striated CLIFF FACE with a bright rim,
 *   - FALLING WATER with VOLUME: distinct bright/dark strands (not a flat sheet),
 *     tileable vertically so a scrolling tileSprite reads as falling motion,
 *   - chunky WATER FOAM (whitewater) for the crest + plunge pool.
 * Drawn as depth-sorted OBJECTS over the flat ground. Not shipped —
 * run `npx tsx tools/compose-cliffs-water.ts`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Img } from './png';

const outDir = path.resolve(import.meta.dirname, '../public/assets/objects');
fs.mkdirSync(outDir, { recursive: true });
const write = (name: string, img: Img) => {
  fs.writeFileSync(path.join(outDir, name), img.toPng());
  console.log(`Wrote ${name} (${img.w}x${img.h})`);
};
const rgb = (r: number, g: number, b: number, a = 255) => (((r & 255) << 24) | ((g & 255) << 16) | ((b & 255) << 8) | (a & 255)) >>> 0;
const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

// ---------------------------------------------------------------- cliff face
// 16 wide × 34 tall, hung from a raised edge (origin top-centre in-game): a bright
// rocky rim, a tall striated rock wall (vertical strata + horizontal bands, lit
// left / shadowed right) darkening into a base shadow.
{
  const W = 16;
  const H = 34;
  const i = new Img(W, H);
  for (let y = 0; y < H; y++) {
    let base: [number, number, number];
    if (y === 0) base = [0xd8, 0xd0, 0xba];
    else if (y < 3) base = [0xa9, 0x9f, 0x88];
    else {
      const t = (y - 3) / (H - 3);
      base = [lerp(0x86, 0x22, t), lerp(0x79, 0x1e, t), lerp(0x63, 0x18, t)];
    }
    for (let x = 0; x < W; x++) {
      const edge = x <= 1 ? 20 : x === 2 ? 8 : x >= 14 ? -22 : x === 13 ? -10 : 0;
      i.px(x, y, rgb(base[0] + edge, base[1] + edge, base[2] + edge));
    }
  }
  const dark = 0x171310ff;
  const lite = 0x9a8f78ff;
  for (let y = 3; y < H - 2; y++) {
    i.px(3 + (y % 2), y, dark);
    i.px(8, y, dark);
    i.px(12 - (y % 2), y, dark);
  }
  for (const by of [8, 16, 24]) for (let x = 2; x < 14; x++) if ((x + by) % 3) i.px(x, by, lite);
  i.rect(0, H - 2, W, 2, 0x100c0aff);
  write('cliff-face.png', i);
}

// ---------------------------------------------------------------- falling water
// 16×16, TILEABLE vertically (period-8 → seamless scroll). VOLUME is the point:
// 4 vertical strands, each a bright white/light core flanked by mid-blue and a
// faint dark-teal gap between them, plus per-strand vertical shimmer + droplet
// highlights so it reads as ropes of falling water, not a flat sheet.
{
  const W = 16;
  const H = 16;
  const i = new Img(W, H);
  const cores = [2, 6, 10, 13];
  const phase = [0, 3.1, 1.4, 5.0];
  for (let x = 0; x < W; x++) {
    // distance to the nearest strand core + which core (for its shimmer phase)
    let d = 99;
    let ci = 0;
    for (let c = 0; c < cores.length; c++) {
      const dd = Math.abs(x - cores[c]);
      if (dd < d) { d = dd; ci = c; }
    }
    // brighter, cleaner cyan-blue (ref opengameart/itch waterfalls) than v1's muted tone
    let col: [number, number, number];
    let baseA: number;
    if (d === 0) { col = [0xf2, 0xfc, 0xff]; baseA = 245; }
    else if (d === 1) { col = [0xbf, 0xee, 0xff]; baseA = 228; }
    else if (d === 2) { col = [0x6f, 0xc4, 0xea]; baseA = 195; }
    else { col = [0x3a, 0x92, 0xc4]; baseA = 105; } // gap — faint, lets the pool show through
    for (let y = 0; y < H; y++) {
      const shimmer = 0.55 + 0.45 * Math.sin((y / 8) * Math.PI * 2 + phase[ci]);
      let a = Math.round(baseA * shimmer);
      let c = col;
      if (d <= 1 && shimmer > 0.9) { c = [0xff, 0xff, 0xff]; a = Math.min(255, a + 40); } // droplet clumps
      i.px(x, y, rgb(c[0], c[1], c[2], a));
    }
  }
  write('waterfall.png', i);
}

// ---------------------------------------------------------------- water foam
// 16×10 chunky whitewater: overlapping cauliflower blobs (white core + pale-blue
// edge), for the crest lip and the plunge-pool churn.
{
  const W = 16;
  const H = 10;
  const i = new Img(W, H);
  const blobs: [number, number, number][] = [
    [3, 4, 3], [7, 3, 4], [11, 4, 3], [14, 5, 2], [5, 7, 2], [9, 7, 3], [13, 8, 2],
  ];
  for (const [cx, cy, r] of blobs) i.disc(cx, cy, r, 0xcfeaffcc); // pale-blue base
  for (const [cx, cy, r] of blobs) i.disc(cx, cy - 1, Math.max(1, r - 1), 0xffffffff); // white core
  write('water-foam.png', i);
}

console.log('cliffs + water composed.');
