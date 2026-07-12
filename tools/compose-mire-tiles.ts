/**
 * The Sunken Mire's terrain strip + bog props (ADR-0017 rung 1).
 * Art direction (owner: "mature pixel art, never childish"): a drowned peat
 * bog — cold, desaturated, quiet. Dark olive peat, near-black teal water with
 * oily ripples, wet mud banks, half-sunken flagstones, pale dry reeds. No
 * saturated greens, no flowers.
 *
 * Output:
 *   public/assets/tiles/mire-tiles.png — 9 tiles of 16px, appended to the
 *     terrain strip AT RUNTIME (BootScene draws it at x=176 into the shared
 *     canvas tileset), so the downloaded terrain.png is never edited.
 *     Tile ids (0-based, continuing terrain.png's 0..10):
 *       11,12,13 peat variants · 14 murky water (animated in-game)
 *       15 mud bank · 16 drowned flagstone · 17 reeds · 18 cattails
 *       19 lily pads (decor 17-19 are transparent overlays)
 *   public/assets/objects/dead-tree.png — a gnarled bare bog tree (foliage)
 *
 * Deterministic (seeded scatter): re-running writes byte-identical files.
 * Run: npx --registry https://registry.npmjs.org/ tsx tools/compose-mire-tiles.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { Img } from './png';

const tilesDir = path.resolve(import.meta.dirname, '../public/assets/tiles');
const objsDir = path.resolve(import.meta.dirname, '../public/assets/objects');
fs.mkdirSync(tilesDir, { recursive: true });
fs.mkdirSync(objsDir, { recursive: true });
const rgb = (r: number, g: number, b: number, a = 255) => (((r & 255) << 24) | ((g & 255) << 16) | ((b & 255) << 8) | (a & 255)) >>> 0;

// the tools' shared deterministic RNG (generate-map.ts precedent)
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(42);
const ri = (n: number) => Math.floor(rng() * n);

const T = 16;
const strip = new Img(T * 9, T);
const tile = (i: number) => ({ x0: i * T });

// ---------------------------------------------------------------- 11..13 peat
// Dark olive-brown bog floor. Three variants so the fill never checkerboards:
// A plain mottle, B a moss shelf, C dry-grass specks. Edges stay near the base
// tone so tiling shows no seams.
const PEAT = rgb(0x3b, 0x36, 0x27);
const PEAT_LIT = rgb(0x45, 0x3f, 0x2d);
const PEAT_PIT = rgb(0x31, 0x2c, 0x1f);
for (let v = 0; v < 3; v++) {
  const { x0 } = tile(v);
  strip.rect(x0, 0, T, T, PEAT);
  for (let n = 0; n < 15; n++) strip.px(x0 + 1 + ri(14), 1 + ri(14), PEAT_LIT);
  for (let n = 0; n < 11; n++) strip.px(x0 + 1 + ri(14), 1 + ri(14), PEAT_PIT);
  if (v === 1) {
    // a low moss shelf, off-center
    const mx = 4 + ri(5);
    const my = 5 + ri(5);
    for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [1, -1], [3, 1]]) {
      strip.px(x0 + mx + dx, my + dy, rgb(0x48, 0x50, 0x2e));
    }
    strip.px(x0 + mx + 1, my, rgb(0x53, 0x5c, 0x36));
  }
  if (v === 2) {
    // sparse dry-grass specks — the bog's dead stubble
    for (let n = 0; n < 4; n++) {
      const gx = x0 + 2 + ri(12);
      const gy = 2 + ri(12);
      strip.px(gx, gy, rgb(0x6b, 0x64, 0x46));
      strip.px(gx, gy + 1, rgb(0x55, 0x4f, 0x38));
    }
  }
}

// ---------------------------------------------------------------- 14 murky water
// Near-black teal, two broken oily ripple lines, a couple of cold glints.
// (The game repaints this slot each water-anim tick with a darkened frame, so
// this static art is also the fallback when the frames are missing.)
{
  const { x0 } = tile(3);
  strip.rect(x0, 0, T, T, rgb(0x13, 0x27, 0x29));
  for (const [cx, cy] of [[0, 0], [15, 0], [0, 15], [15, 15]] as const) {
    strip.px(x0 + cx, cy, rgb(0x0f, 0x1f, 0x21));
  }
  for (const x of [3, 4, 5, 6, 9, 10, 11]) strip.px(x0 + x, 5, rgb(0x1d, 0x3a, 0x3a));
  for (const x of [2, 3, 4, 8, 9, 10, 11]) strip.px(x0 + x, 11, rgb(0x1b, 0x37, 0x37));
  strip.px(x0 + 6, 5, rgb(0x2a, 0x51, 0x48));
  strip.px(x0 + 10, 11, rgb(0x28, 0x4e, 0x46));
}

// ---------------------------------------------------------------- 15 mud bank
// Wet umber shore between peat and water — moisture streaks, a few pebbles.
{
  const { x0 } = tile(4);
  strip.rect(x0, 0, T, T, rgb(0x42, 0x38, 0x25));
  for (const x of [2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13]) strip.px(x0 + x, 4, rgb(0x4b, 0x40, 0x2b));
  for (const x of [1, 2, 3, 5, 6, 8, 9, 11, 12]) strip.px(x0 + x, 9, rgb(0x38, 0x2f, 0x1e));
  for (const x of [4, 5, 6, 8, 10, 11]) strip.px(x0 + x, 13, rgb(0x4b, 0x40, 0x2b));
  for (let n = 0; n < 3; n++) {
    const px = x0 + 2 + ri(12);
    const py = 2 + ri(11);
    strip.px(px, py, rgb(0x56, 0x4a, 0x30));
    strip.px(px + 1, py + 1, rgb(0x2d, 0x26, 0x17));
  }
  strip.px(x0 + 12, 7, rgb(0x2a, 0x24, 0x16));
  strip.px(x0 + 3, 12, rgb(0x2a, 0x24, 0x16));
}

// ---------------------------------------------------------------- 16 drowned flagstone
// Old grey-green slabs barely above the waterline — the causeway tile. Water
// shows in the seams; slab edges catch a wet sheen.
{
  const { x0 } = tile(5);
  strip.rect(x0, 0, T, T, rgb(0x13, 0x27, 0x29)); // the murky water beneath
  const slab = (sx: number, sy: number, w: number, h: number, tone: number) => {
    const top = rgb(0x57 + tone, 0x60 + tone, 0x4f + tone);
    strip.rect(x0 + sx, sy, w, h, top);
    for (let x = 0; x < w; x++) strip.px(x0 + sx + x, sy + h - 1, rgb(0x3d, 0x45, 0x39));
    for (let y = 0; y < h - 1; y++) strip.px(x0 + sx, sy + y, rgb(0x68 + tone, 0x71 + tone, 0x5f + tone));
  };
  slab(1, 2, 8, 7, 0);
  slab(10, 5, 5, 5, -6);
  slab(3, 11, 6, 4, -3);
  strip.px(x0 + 3, 3, rgb(0x7e, 0x88, 0x7a)); // wet sheen
  strip.px(x0 + 12, 6, rgb(0x78, 0x82, 0x74));
}

// ---------------------------------------------------------------- 17 reeds (decor, transparent)
// Dull dry reeds — deliberately MUTED ambience so the harvestable salt-reed
// bed Node (brine-crystal teal, below) stands apart from the scenery.
{
  const { x0 } = tile(6);
  const stalks: [number, number, number][] = [
    // [x, height, lean at the top]
    [3, 12, -1],
    [6, 9, 0],
    [9, 13, 1],
    [12, 10, 0],
    [14, 8, 1],
  ];
  for (const [sx, h, lean] of stalks) {
    for (let d = 0; d < h; d++) {
      const y = 15 - d;
      const x = x0 + sx + (d > h * 0.6 ? lean : 0);
      strip.px(x, y, d > h - 3 ? rgb(0x84, 0x7a, 0x52) : rgb(0x6e, 0x66, 0x44));
    }
  }
  strip.rect(x0 + 3 - 1, 15 - 12 - 1, 1, 2, rgb(0x45, 0x3e, 0x2c)); // seed heads
  strip.rect(x0 + 9 + 1, 15 - 13 - 1, 1, 2, rgb(0x45, 0x3e, 0x2c));
  for (const x of [2, 4, 7, 10, 13]) strip.px(x0 + x, 15, rgb(0x4c, 0x45, 0x30)); // base tuft
}

// ---------------------------------------------------------------- 18 cattails (decor, transparent)
// Muted like the reeds — scenery, not a Node.
{
  const { x0 } = tile(7);
  const stalks: [number, number][] = [
    [4, 12],
    [8, 14],
    [12, 10],
  ];
  for (const [sx, h] of stalks) {
    for (let d = 0; d < h; d++) strip.px(x0 + sx, 15 - d, rgb(0x67, 0x5f, 0x3e));
    strip.rect(x0 + sx - 1, 15 - h, 2, 3, rgb(0x5c, 0x40, 0x29)); // the brown head
    strip.px(x0 + sx, 15 - h - 1, rgb(0x84, 0x7a, 0x52)); // top spike
  }
  for (const x of [3, 5, 9, 11, 13]) strip.px(x0 + x, 15, rgb(0x4c, 0x45, 0x30));
}

// ---------------------------------------------------------------- 19 lily pads (decor, transparent)
{
  const { x0 } = tile(8);
  strip.disc(x0 + 5, 6, 3, rgb(0x3e, 0x5c, 0x33));
  strip.px(x0 + 7, 5, 0); // the notch
  strip.px(x0 + 8, 6, 0);
  for (const [dx, dy] of [[-2, -2], [-1, -3], [0, -3], [1, -3]]) strip.px(x0 + 5 + dx, 6 + dy, rgb(0x4d, 0x70, 0x40));
  strip.disc(x0 + 11, 12, 2, rgb(0x37, 0x52, 0x2d));
  strip.px(x0 + 12, 11, rgb(0x44, 0x63, 0x38));
  strip.px(x0 + 13, 12, 0);
}

fs.writeFileSync(path.join(tilesDir, 'mire-tiles.png'), strip.toPng());
console.log(`Wrote mire-tiles.png (${strip.w}x${strip.h})`);

// ---------------------------------------------------------------- the salt-reed bed
// The Sunken Mire's own Resource Node (ADR-0017 rung 1 chain: salt-reed →
// Brine Kiln → tideglass). It must read as HARVESTABLE against the muted
// decor reeds at a glance, so it owns the Realm's signal color: bright
// brine-crystal TEAL (#63e0b8 — the gate glyphs and the Mire Warden's eye
// speak the same language). Full: a dense bright clump crowned and rooted
// with glassy salt crystals. Depleted: stubble, the crystals gone dull.
{
  const W = 24;
  const H = 26;
  const STALK = rgb(0xa8, 0x9c, 0x66);
  const STALK_LIT = rgb(0xcf, 0xc2, 0x82);
  const STALK_DK = rgb(0x86, 0x7c, 0x50);
  const HEAD = rgb(0x55, 0x4b, 0x34);
  const SALT = rgb(0x63, 0xe0, 0xb8);
  const SALT_LIT = rgb(0xb9, 0xf5, 0xe2);
  const SALT_DK = rgb(0x35, 0x8f, 0x74);
  const BASE = rgb(0x5a, 0x52, 0x38);

  const full = new Img(W, H);
  // a dense sheaf: [x at base, height, lean, tone 0 dark/1 mid/2 lit]
  const stalks: [number, number, number, number][] = [
    [4, 14, -1, 0],
    [6, 18, -1, 1],
    [8, 21, 0, 2],
    [10, 16, 0, 1],
    [12, 22, 0, 2],
    [14, 17, 1, 1],
    [16, 20, 1, 2],
    [18, 14, 1, 1],
    [20, 11, 1, 0],
  ];
  for (const [sx, h, lean, tone] of stalks) {
    for (let d = 0; d < h; d++) {
      const y = H - 3 - d;
      const x = sx + (d > h * 0.55 ? lean : 0);
      full.px(x, y, d > h - 4 ? STALK_LIT : tone === 2 ? STALK : tone === 1 ? STALK_DK : rgb(0x6e, 0x66, 0x44));
    }
  }
  // seed heads on the two tallest stalks
  full.rect(12, H - 3 - 22 - 2, 1, 3, HEAD);
  full.rect(8, H - 3 - 21 - 2, 1, 3, HEAD);
  // brine crystals climbing the stalks — the harvest signal
  for (const [cx, cy] of [[7, 16], [13, 12], [11, 18], [17, 15], [15, 19], [9, 10]] as const) {
    full.px(cx, cy, SALT);
    full.px(cx, cy - 1, SALT_LIT);
  }
  // the crusted bed: a mound armored in glassy salt
  for (let x = 2; x < W - 2; x++) full.px(x, H - 3, BASE);
  for (let x = 1; x < W - 1; x++) full.px(x, H - 2, rgb(0x47, 0x40, 0x2c));
  for (let x = 3; x < W - 3; x++) full.px(x, H - 1, rgb(0x3a, 0x34, 0x24));
  for (const [cx, w] of [[3, 2], [7, 3], [12, 2], [16, 3], [20, 2]] as const) {
    full.rect(cx, H - 3, w, 1, SALT);
    full.px(cx + 1, H - 4, SALT_LIT);
  }
  for (const cx of [5, 10, 15, 19]) full.px(cx, H - 2, SALT_DK);
  fs.writeFileSync(path.join(objsDir, 'salt-reed-bed.png'), full.toPng());
  console.log(`Wrote salt-reed-bed.png (${W}x${H})`);

  const cut = new Img(W, H);
  // stubble where the sheaf stood; the crystals gone dull and broken
  for (const [sx] of stalks) {
    cut.px(sx, H - 4, STALK_DK);
    cut.px(sx, H - 5, STALK);
  }
  // fallen stalks lying across the bed
  for (let x = 5; x < 15; x++) cut.px(x, H - 7, x % 3 === 0 ? STALK_LIT : STALK);
  for (let x = 11; x < 20; x++) cut.px(x, H - 6, STALK_DK);
  for (let x = 2; x < W - 2; x++) cut.px(x, H - 3, BASE);
  for (let x = 1; x < W - 1; x++) cut.px(x, H - 2, rgb(0x47, 0x40, 0x2c));
  for (let x = 3; x < W - 3; x++) cut.px(x, H - 1, rgb(0x3a, 0x34, 0x24));
  for (const cx of [6, 13, 18]) cut.px(cx, H - 3, SALT_DK); // dull remnant crust
  fs.writeFileSync(path.join(objsDir, 'salt-reed-bed-depleted.png'), cut.toPng());
  console.log(`Wrote salt-reed-bed-depleted.png (${W}x${H})`);
}

// ---------------------------------------------------------------- the dead bog tree
// 22x30, transparent. A gnarled bare silhouette: S-curved trunk, crooked
// branches with broken stubs, flared root feet, a strand of hanging moss.
// Grey-brown, lit faintly from the left — reads as long-drowned wood.
{
  const W = 22;
  const H = 30;
  const i = new Img(W, H);
  const BARK = rgb(0x3a, 0x33, 0x2b);
  const DARK = rgb(0x2a, 0x25, 0x1e);
  const LIT = rgb(0x4c, 0x44, 0x37);
  const MOSS = rgb(0x48, 0x50, 0x2e);
  // trunk: 3px wide with an S-curve (x offset per row band)
  for (let y = 8; y < 28; y++) {
    const off = y < 13 ? 1 : y < 20 ? 0 : y < 25 ? -1 : 0;
    const x = 10 + off;
    i.px(x - 1, y, LIT);
    i.px(x, y, BARK);
    i.px(x + 1, y, DARK);
    if (y > 24) i.px(x + 2, y, DARK); // the base thickens
  }
  // root feet
  for (const [dx, dy] of [[-3, 0], [-2, 0], [-2, -1], [3, 0], [2, 0], [2, -1], [0, 0], [4, 0]]) {
    i.px(10 + dx, 28 + (dy === 0 ? 0 : dy), dx < 0 ? LIT : DARK);
  }
  i.px(6, 29, DARK);
  i.px(14, 29, DARK);
  // branches: crooked 1px lines [fromY, dirX, len, rise], one broken stub
  const branch = (y0: number, dir: number, len: number, rise: number, tone: number) => {
    let bx = 10 + (y0 < 13 ? 1 : 0);
    let by = y0;
    for (let s = 0; s < len; s++) {
      bx += dir;
      if (s % rise === rise - 1) by -= 1;
      i.px(bx, by, tone);
      if (s === 0) i.px(bx, by + 1, DARK);
    }
    return [bx, by] as const;
  };
  const tipA = branch(10, -1, 6, 2, BARK); // long west limb
  branch(9, 1, 5, 2, BARK); // east limb
  branch(13, 1, 3, 3, DARK); // broken stub
  branch(12, -1, 3, 2, LIT); // low west stub
  // crown: the trunk tapers to a snapped top
  i.px(10, 7, BARK);
  i.px(11, 7, DARK);
  i.px(10, 6, DARK);
  // hanging moss off the west limb tip
  const [mx, my] = tipA;
  for (let d = 1; d <= 3; d++) i.px(mx, my + d, MOSS);
  i.px(mx + 1, my + 1, MOSS);
  fs.writeFileSync(path.join(objsDir, 'dead-tree.png'), i.toPng());
  console.log(`Wrote dead-tree.png (${W}x${H})`);
}
