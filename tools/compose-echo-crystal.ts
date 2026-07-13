/**
 * The Hushdark's Resource Node sprite (ADR-0017 rung 2 chain: echo-crystal →
 * Chime Kiln → hushsteel). A cluster of cold blued crystal shards rising from a
 * dark cavern-rock base. It must read as HARVESTABLE against the grey stone floor
 * at a glance, so it owns the Hushdark's signal color: cold hushsteel blue
 * (#5a6b85 / #93a8c9) crowned with a pale ringing glint (the Chime Kiln, the Echo
 * Warden's eye and the gate glyphs all speak the same cold light). Full: a bright
 * shard cluster. Depleted: sheared stubs on the bare rock.
 *
 * Deterministic (no RNG): re-running writes byte-identical files.
 * Run: npx --registry https://registry.npmjs.org/ tsx tools/compose-echo-crystal.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { Img } from './png';

const objsDir = path.resolve(import.meta.dirname, '../public/assets/objects');
fs.mkdirSync(objsDir, { recursive: true });
const rgb = (r: number, g: number, b: number, a = 255) => (((r & 255) << 24) | ((g & 255) << 16) | ((b & 255) << 8) | (a & 255)) >>> 0;

const W = 24;
const H = 26;
const ROCK_D = rgb(0x2b, 0x31, 0x3f);
const ROCK = rgb(0x3c, 0x45, 0x58);
const ROCK_L = rgb(0x51, 0x5c, 0x72);
const CRY_D = rgb(0x4a, 0x5a, 0x78);
const CRY = rgb(0x5a, 0x6b, 0x85);
const CRY_M = rgb(0x93, 0xa8, 0xc9);
const CRY_L = rgb(0xd6, 0xe4, 0xf5);
const GLINT = rgb(0xe8, 0xf6, 0xff);

// one crystal shard: base x, height, half-width at base, lean, add a spine glint
function shard(img: Img, bx: number, h: number, hw: number, lean: number, lit: boolean): void {
  for (let d = 0; d < h; d++) {
    const y = H - 4 - d;
    const t = d / h; // 0 at base → 1 at tip
    const w = Math.max(0, Math.round(hw * (1 - t)));
    const cx = bx + Math.round(lean * t * h * 0.15);
    for (let dx = -w; dx <= w; dx++) {
      const edge = Math.abs(dx) === w && w > 0;
      let c = edge ? CRY_D : dx < 0 ? CRY : CRY_M;
      if (d > h - 3) c = CRY_L; // lit tip
      img.px(cx + dx, y, c);
    }
    if (lit && d > h - 6 && d < h - 1) img.px(cx, y, GLINT); // ringing glint down the spine
  }
}

function base(img: Img): void {
  for (let x = 2; x < W - 2; x++) img.px(x, H - 3, ROCK);
  for (let x = 1; x < W - 1; x++) img.px(x, H - 2, ROCK_D);
  for (let x = 3; x < W - 3; x++) img.px(x, H - 1, ROCK_D);
  for (const x of [4, 9, 14, 19]) img.px(x, H - 3, ROCK_L);
}

const full = new Img(W, H);
base(full);
// the shard cluster, back-to-front, tallest at centre
shard(full, 6, 10, 1, -1, false);
shard(full, 18, 11, 1, 1, false);
shard(full, 9, 15, 2, 0, true);
shard(full, 15, 18, 2, 0, true);
shard(full, 12, 21, 2, 0, true);
fs.writeFileSync(path.join(objsDir, 'echo-crystal-seam.png'), full.toPng());
console.log(`Wrote echo-crystal-seam.png (${W}x${H})`);

const cut = new Img(W, H);
base(cut);
// sheared stubs where the shards stood — the crystals broken off, gone dull
for (const [sx, hh] of [[9, 3], [12, 4], [15, 3]] as const) {
  for (let d = 0; d < hh; d++) cut.px(sx, H - 4 - d, d === hh - 1 ? CRY_M : CRY_D);
}
for (const x of [6, 18]) cut.px(x, H - 4, ROCK_L);
fs.writeFileSync(path.join(objsDir, 'echo-crystal-seam-depleted.png'), cut.toPng());
console.log(`Wrote echo-crystal-seam-depleted.png (${W}x${H})`);
