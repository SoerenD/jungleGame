/**
 * Composes the Guardian sheet: a 96x96 hunched stone colossus — gorilla
 * stance on knuckled forearms, heavy brow, broken horns, mossy back,
 * cracked rune seams and ONE large amber eye. The eye-open frames are the
 * weak-point signal and must read at gameplay zoom. Drawn from primitives
 * at 48x48 and doubled, so it is re-runnable anywhere with no inputs.
 *
 * Frames (96x96 each, laid out horizontally):
 *   0 slumber · 1-2 awake idle (eye closed) · 3-4 eye open (Eye Window)
 *   5 lunge windup · 6 airborne · 7 landing
 *
 * Run: npx tsx tools/compose-guardian-v3.ts
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

/** nearest-neighbour free resize (for squash/stretch poses) */
function scaleNN(src: Img, w: number, h: number): Img {
  const out = new Img(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.w - 1, Math.floor((x / w) * src.w));
      const sy = Math.min(src.h - 1, Math.floor((y / h) * src.h));
      const i = (sy * src.w + sx) * 4;
      if (src.data[i + 3] === 0) continue;
      out.px(x, y, ((src.data[i] << 24) | (src.data[i + 1] << 16) | (src.data[i + 2] << 8) | src.data[i + 3]) >>> 0);
    }
  }
  return out;
}

// stone palette, lit from the upper left
const OUT = 0x23262cff; // silhouette outline
const DK = 0x4d5259ff;
const MDK = 0x5b616aff;
const MID = 0x6e747dff;
const LT = 0x9aa1a8ff;
const HI = 0xc2c8cfff;
const MOSS = 0x3f8f4aff;
const MOSSD = 0x2f7a3dff;
const RUNE = 0xcdb6f2ff;
const RUNED = 0x8a6cc9ff;
const CRACK = 0x33363cff;

type EyeState = 'slumber' | 'closed' | 'closed2' | 'open' | 'open2';

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

/** the hunched colossus at 48x48 (feet on the bottom row), then doubled */
function colossus(eye: EyeState): Img {
  const f = new Img(48, 48);

  // hind legs, mostly hidden under the dome of the back
  f.rect(16, 36, 5, 10, DK);
  f.rect(27, 36, 5, 10, DK);
  f.rect(15, 44, 7, 3, MDK);
  f.rect(26, 44, 7, 3, MDK);

  // the great stone back — a shaded boulder dome
  f.disc(24, 27, 15.5, DK);
  f.disc(23, 26, 14, MID);
  f.disc(20, 22, 10, LT);
  f.disc(26, 31, 11, MID);
  f.disc(17, 18, 4, HI);

  // slabbed chest under the dome
  f.rect(15, 30, 18, 11, DK);
  f.rect(16, 31, 16, 9, MDK);
  f.rect(16, 34, 16, 1, DK);
  f.rect(16, 37, 16, 1, DK);

  // forearms planted like a gorilla's, fists as knuckled boulders
  // left
  f.disc(9, 23, 6, MID);
  f.disc(8, 21, 4, LT);
  f.rect(4, 26, 10, 16, MID);
  f.rect(12, 26, 2, 14, MDK);
  f.rect(5, 26, 2, 12, LT);
  f.disc(8, 42, 5, MID);
  f.rect(5, 38, 7, 2, LT);
  f.rect(4, 43, 2, 3, LT);
  f.rect(7, 43, 2, 3, LT);
  f.rect(10, 43, 2, 3, LT);
  // right
  f.disc(38, 23, 6, MID);
  f.disc(36, 21, 4, LT);
  f.rect(34, 26, 10, 16, MID);
  f.rect(41, 26, 2, 14, MDK);
  f.rect(35, 26, 2, 12, LT);
  f.disc(39, 42, 5, MID);
  f.rect(36, 38, 7, 2, LT);
  f.rect(36, 43, 2, 3, LT);
  f.rect(39, 43, 2, 3, LT);
  f.rect(42, 43, 2, 3, LT);

  // head sunk between the shoulders — no neck, all brow
  f.disc(24, 13, 8.5, MID);
  f.disc(22, 11, 5, LT);
  // broken horns curving in
  f.rect(12, 6, 2, 3, LT);
  f.rect(13, 8, 2, 3, MID);
  f.rect(14, 10, 2, 3, MDK);
  f.rect(34, 6, 2, 3, LT);
  f.rect(33, 8, 2, 3, MID);
  f.rect(32, 10, 2, 3, MDK);
  // the heavy brow ledge over the socket
  f.rect(17, 12, 14, 3, MDK);
  f.rect(17, 14, 14, 1, DK);
  // stone jaw
  f.rect(18, 21, 12, 3, MDK);
  f.rect(19, 23, 10, 1, DK);

  // the jungle grows on it while it sleeps
  for (const [x, y] of [
    [20, 4], [25, 5], [15, 15], [30, 13], [34, 18], [12, 20], [21, 8], [28, 8],
  ]) {
    f.rect(x, y, 3, 2, MOSS);
    f.rect(x + 1, y + 1, 2, 1, MOSSD);
  }
  f.rect(6, 19, 2, 2, MOSS);
  f.rect(40, 19, 2, 2, MOSS);

  // cracks in the old stone
  for (const [x, y] of [
    [33, 24], [34, 25], [34, 26], [33, 27], [34, 28],
    [13, 32], [14, 33], [14, 34],
    [24, 32], [25, 33], [25, 34],
    [29, 17], [30, 18],
  ]) {
    f.px(x, y, CRACK);
  }

  // rune seams — lavender base; the runtime additive glow tints them per
  // fury phase (purple → orange → red)
  f.rect(8, 29, 2, 6, RUNE);
  f.px(8, 35, RUNED);
  f.rect(38, 29, 2, 6, RUNE);
  f.px(39, 35, RUNED);
  f.rect(21, 32, 2, 6, RUNE);
  f.rect(25, 36, 5, 2, RUNE);
  f.px(21, 31, RUNED);
  f.px(30, 36, RUNED);

  // ---- the ONE large amber eye, recessed under the brow
  f.rect(19, 15, 10, 6, 0x14141eff);
  f.rect(19, 15, 10, 1, 0x0d0d14ff);
  if (eye === 'slumber') {
    // sealed shut: a faint warm seam
    f.rect(21, 18, 6, 1, 0x54262aff);
  } else if (eye === 'closed' || eye === 'closed2') {
    // awake but shut: a smoldering slit (pulse variation on frame 2)
    f.rect(20, 17, 8, 2, eye === 'closed' ? 0xa8481eff : 0xc2551fff);
    f.rect(22, 17, 4, 1, eye === 'closed' ? 0xd86a24ff : 0xf07c28ff);
  } else {
    // OPEN — the weak point: a blazing amber orb with iris and specular
    const bright = eye === 'open2';
    f.rect(19, 15, 10, 6, bright ? 0xffb437ff : 0xffa02fff);
    f.rect(21, 16, 6, 4, bright ? 0xffd35cff : 0xffc24aff);
    f.rect(23, 17, 2, 2, 0xb0480cff); // iris
    f.px(22, 16, 0xffffffff); // specular
    // radiant rim so the state is unmistakable at ZOOM 2.5
    const rim = bright ? 0xffd35cff : 0xffb437ff;
    f.rect(17, 16, 2, 3, rim);
    f.rect(29, 16, 2, 3, rim);
    f.rect(22, 13, 4, 1, rim);
    f.rect(22, 21, 4, 1, rim);
  }

  outline(f);
  return scaleNN(f, 96, 96);
}

/** draw `src` anchored bottom-center into a fresh 96x96 frame */
function anchored(src: Img, liftPx = 0): Img {
  const f = new Img(96, 96);
  f.blit(src, 0, 0, src.w, src.h, Math.floor((96 - src.w) / 2), 96 - src.h - liftPx);
  return f;
}

const frames: Img[] = [];
// 0 slumber: slumped a touch lower than the awake stance
frames.push(anchored(scaleNN(colossus('slumber'), 96, 86)));
frames.push(colossus('closed')); // 1
frames.push(colossus('closed2')); // 2
frames.push(colossus('open')); // 3
frames.push(colossus('open2')); // 4
// 5 windup: crouched, gathering the leap
frames.push(anchored(scaleNN(colossus('closed'), 100, 78)));
// 6 airborne: tucked and lifted clear of the ground
{
  const air = anchored(scaleNN(colossus('closed2'), 86, 84), 10);
  for (const [x, y] of [[20, 92], [40, 94], [58, 93], [76, 92]]) air.rect(x, y, 4, 1, 0xdcd6c855); // rush lines
  frames.push(air);
}
// 7 landing: slammed flat, dust bursting at the feet
{
  const land = anchored(scaleNN(colossus('closed'), 96, 68));
  for (const [x, y] of [[6, 92], [12, 90], [82, 90], [88, 92], [26, 94], [68, 94]]) {
    land.rect(x, y, 3, 2, 0xcfc6b4cc);
  }
  frames.push(land);
}

const sheet = new Img(96 * frames.length, 96);
frames.forEach((f, i) => sheet.blit(f, 0, 0, 96, 96, i * 96, 0));
write('public/assets/objects/guardian.png', sheet);

console.log('guardian composed.');
