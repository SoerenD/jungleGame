/**
 * Composes the Verdant Warden sheet: a 96x96 stag-treant colossus for the
 * Overgrown Temple (rung 3, Verdant Terraces). Upright four-legged stance,
 * proud raised head and a huge branching antler crown of living wood — the
 * defining silhouette. Bark hide with lit ridges, a moss saddle across the
 * back, cracked terracotta chest plates (the temple's clay, its one warm
 * accent), vines hanging off the antlers, a few pale blossoms, and ONE
 * gold-green eye. The eye-open frames are the Eye Window weak-point signal
 * and must read at gameplay zoom. Drawn from primitives at 48x48 and
 * doubled, so it is re-runnable anywhere with no inputs.
 *
 * Frames (96x96 each, laid out horizontally):
 *   0 slumber (kneeling, head lowered — the crown reads as a gnarled dead
 *     tree growing from a moss mound)
 *   1-2 awake idle (eye closed) · 3-4 eye open (Eye Window)
 *   5 lunge windup (head low, antlers presented) · 6 airborne stag vault
 *   7 landing (forelegs planted wide, antlers swept up)
 *
 * Run: npx --registry https://registry.npmjs.org/ tsx tools/compose-verdant-warden.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { Img } from './png';

const root = path.resolve(import.meta.dirname, '..');
const SCRATCH =
  'C:/Users/SOEREN~1.DIE/AppData/Local/Temp/claude/C--Users-soeren-dierkes-littleGame/35dc675f-2ba0-41f0-86ac-1104a650ef11/scratchpad';

const write = (abs: string, img: Img) => {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, img.toPng());
  console.log('wrote', abs, `${img.w}x${img.h}`);
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

// living-wood palette, lit from the upper left
const OUT = 0x261f13ff; // silhouette outline — dark humus, not black
const BARK_D = 0x3a3327ff;
const BARK = 0x4c4232ff;
const BARK_L = 0x6b5d42ff; // lit bark ridges
const MOSS_D = 0x48502eff;
const MOSS = 0x5c6636ff;
const CLAY = 0x8a5a3cff; // temple terracotta, the one warm accent
const CLAY_L = 0xa4714aff;
const CLAY_D = 0x5e3d29ff;
const BLOSSOM = 0xc9c2a8ff;
const HOOF = 0x2e2717ff;
const CRACK = 0x2b2417ff;

type EyeState = 'slumber' | 'closed' | 'closed2' | 'open' | 'open2';
type Legs = 'stand' | 'windup' | 'tuck' | 'wide';

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

/**
 * One antler half (22x17), base at temp (18..20, 13..14); mirrored via blit
 * for the right side. Beams are 3px thick so the lit-wood core survives the
 * outline pass — these are tree boughs, not deer bone. `charge` is the
 * lowered, forward-presented variant for the lunge windup.
 */
function antlerHalf(charge: boolean): Img {
  const a = new Img(22, 17);
  const bough = (x: number, y: number) => {
    a.rect(x, y, 3, 2, BARK);
    a.px(x, y, BARK_L);
    a.px(x + 1, y, BARK_L);
    a.px(x + 2, y + 1, BARK_D);
  };
  const tine = (x: number, y: number, len: number) => {
    a.rect(x, y, 3, len, BARK);
    a.rect(x, y, 1, len, BARK_L);
    a.px(x + 2, y + len - 1, BARK_D);
  };
  if (!charge) {
    // main beam sweeping up and out, tines reaching for the canopy
    for (const [x, y] of [[18, 13], [16, 12], [14, 11], [12, 9], [10, 8], [8, 7], [6, 5], [4, 4]]) bough(x, y);
    tine(16, 7, 5);
    tine(11, 4, 5);
    tine(6, 1, 5);
    tine(3, 1, 4);
    a.rect(19, 10, 2, 3, BARK); // brow tine
    a.px(19, 10, BARK_L);
    a.px(14, 10, MOSS); // weathered moss flecks in the bark
    a.px(9, 8, MOSS);
  } else {
    // flattened, levelled at the foe like a charge
    for (const [x, y] of [[18, 13], [16, 13], [14, 12], [12, 12], [10, 11], [8, 11], [6, 10], [4, 10]]) bough(x, y);
    tine(14, 8, 5);
    tine(9, 7, 5);
    tine(4, 6, 5);
    a.rect(2, 8, 2, 3, BARK);
    a.px(2, 8, BARK_L);
    a.px(12, 11, MOSS);
  }
  return a;
}

/** the ONE gold-green eye, recessed in the wide forehead socket */
function drawEye(f: Img, hd: number, eye: EyeState): void {
  const y = 13 + hd;
  f.rect(20, y, 8, 5, 0x11150cff); // hollow socket
  f.rect(20, y, 8, 1, 0x0a0d07ff);
  if (eye === 'slumber') {
    // sealed shut: the faintest green seam of dormant sap
    f.rect(22, y + 3, 4, 1, 0x39441fff);
  } else if (eye === 'closed' || eye === 'closed2') {
    // awake but lidded: a smoldering slit (pulse variation on frame 2)
    const dim = eye === 'closed';
    f.rect(21, y + 2, 6, 2, dim ? 0x55702cff : 0x66852fff);
    f.rect(23, y + 2, 3, 1, dim ? 0x7d9c38ff : 0x93b542ff);
  } else {
    // OPEN — the weak point: gold-green blaze, warm core, dark pupil
    const b = eye === 'open2';
    f.rect(20, y, 8, 5, b ? 0xc9e455ff : 0xb8d848ff);
    f.rect(22, y + 1, 4, 3, b ? 0xf6f4bcff : 0xeeef9eff);
    f.rect(23, y + 2, 2, 2, 0x55601cff);
    f.px(22, y + 1, 0xffffffff); // specular
    // radiant rim inside the brow so the state is unmistakable at zoom
    const rim = b ? 0xdbf06aff : 0xc9e455ff;
    f.rect(18, y + 1, 2, 3, rim);
    f.rect(28, y + 1, 2, 3, rim);
    f.rect(22, y - 1, 4, 1, rim);
    f.rect(22, y + 5, 4, 1, rim);
  }
}

/**
 * The standing warden at 48x48 (hooves on the bottom rows), then doubled.
 * bd = body drop (crouch), hd = head drop (lowered head + antlers).
 */
function warden(
  eye: EyeState,
  opts: { bd?: number; hd?: number; legs?: Legs; charge?: boolean; breath?: number } = {},
): Img {
  const { bd: b = 0, hd = 0, legs = 'stand', charge = false, breath = 0 } = opts;
  const f = new Img(48, 48);

  // ---- hind legs (darker, set behind the body)
  if (legs === 'stand') {
    f.rect(9, 31 + b, 4, 14 - b, BARK_D);
    f.rect(35, 31 + b, 4, 14 - b, BARK_D);
    f.rect(8, 45, 5, 3, HOOF);
    f.rect(35, 45, 5, 3, HOOF);
  } else if (legs === 'windup') {
    // planted wide and thick — the mass gathers over them
    f.rect(7, 33, 5, 12, BARK_D);
    f.rect(36, 33, 5, 12, BARK_D);
    f.rect(6, 45, 6, 3, HOOF);
    f.rect(36, 45, 6, 3, HOOF);
  } else if (legs === 'tuck') {
    // trailing behind the vault
    f.rect(8, 31, 4, 10, BARK_D);
    f.rect(36, 31, 4, 10, BARK_D);
    f.rect(7, 41, 5, 2, HOOF);
    f.rect(36, 41, 5, 2, HOOF);
  } else {
    // wide: braced for the impact
    f.rect(8, 32, 4, 13, BARK_D);
    f.rect(36, 32, 4, 13, BARK_D);
    f.rect(7, 45, 5, 3, HOOF);
    f.rect(36, 45, 5, 3, HOOF);
  }

  // ---- bark body: broad chest, round shoulders, shaded haunches
  f.rect(13, 24 + b, 22, 14, BARK);
  f.disc(14, 28 + b, 5, BARK);
  f.disc(34, 28 + b, 5, BARK);
  f.disc(12, 32 + b, 4, BARK_D);
  f.disc(36, 32 + b, 4, BARK_D);
  f.rect(15, 35 + b, 18, 3, BARK_D); // belly shadow
  // lit bark ridges on the sunward flank, grooves on the far one
  f.rect(11, 26 + b, 1, 5, BARK_L);
  f.rect(13, 29 + b, 1, 4, BARK_L);
  f.rect(15, 27 + b, 1, 6, BARK_L);
  f.rect(17, 26 + b, 1, 3, BARK_L);
  f.rect(35, 27 + b, 1, 5, BARK_D);
  f.rect(33, 29 + b, 1, 5, BARK_D);
  for (const [x, y] of [
    [17, 31], [18, 32], [18, 33], [31, 29], [32, 30], [32, 31], [12, 34], [13, 35], [24, 26],
  ]) {
    f.px(x, y + b, CRACK);
  }

  // ---- moss saddle draped across the back (breath lifts it a hair)
  const sy = 22 + b - breath;
  f.rect(10, sy, 28, 4, MOSS_D);
  f.disc(11, sy + 2, 3, MOSS_D);
  f.disc(37, sy + 2, 3, MOSS_D);
  f.rect(11, sy, 10, 2, MOSS);
  f.rect(25, sy, 8, 1, MOSS);
  for (const [x, dy] of [[15, 2], [22, 1], [30, 2], [34, 1]]) f.px(x, sy + dy, MOSS);
  // moss creeping down the shoulders
  f.rect(10, sy + 4, 1, 3, MOSS_D);
  f.rect(16, sy + 4, 1, 2, MOSS_D);
  f.rect(31, sy + 4, 1, 2, MOSS_D);
  f.rect(37, sy + 4, 1, 3, MOSS_D);

  // ---- cracked terracotta chest plates, the temple's clay
  f.rect(19, 28 + b, 10, 4, CLAY);
  f.rect(19, 28 + b, 10, 1, CLAY_L);
  f.rect(28, 29 + b, 1, 3, CLAY_D);
  f.rect(19, 32 + b, 10, 1, BARK_D); // seam
  f.rect(20, 33 + b, 8, 4, CLAY);
  f.rect(20, 33 + b, 8, 1, CLAY_L);
  f.rect(27, 34 + b, 1, 3, CLAY_D);
  f.rect(20, 37 + b, 8, 1, BARK_D); // seam
  f.rect(21, 38 + b, 6, 2, CLAY);
  for (const [x, y] of [[23, 29], [24, 30], [26, 29], [22, 34], [25, 35], [24, 36], [23, 38]]) {
    f.px(x, y + b, CLAY_D);
  }

  // ---- front legs
  if (legs === 'stand') {
    f.rect(15, 30 + b, 4, 15 - b, BARK);
    f.rect(15, 30 + b, 1, 12 - b, BARK_L);
    f.rect(29, 30 + b, 4, 15 - b, BARK);
    f.rect(29, 30 + b, 1, 12 - b, BARK_L);
    f.px(17, 37 + b, BARK_D); // knee notch
    f.px(31, 37 + b, BARK_D);
    f.rect(14, 45, 6, 3, HOOF);
    f.rect(28, 45, 6, 3, HOOF);
  } else if (legs === 'windup') {
    // bent, loading the spring
    f.rect(16, 34, 4, 11, BARK);
    f.rect(16, 34, 1, 9, BARK_L);
    f.rect(28, 34, 4, 11, BARK);
    f.rect(28, 34, 1, 9, BARK_L);
    f.rect(15, 45, 5, 3, HOOF);
    f.rect(28, 45, 5, 3, HOOF);
  } else if (legs === 'tuck') {
    // folded up under the chest mid-vault
    f.rect(15, 30, 4, 7, BARK);
    f.rect(15, 30, 1, 6, BARK_L);
    f.rect(29, 30, 4, 7, BARK);
    f.rect(29, 30, 1, 6, BARK_L);
    f.rect(16, 37, 5, 2, HOOF);
    f.rect(27, 37, 5, 2, HOOF);
  } else {
    // wide: splayed out in a braced stagger
    f.rect(13, 30, 4, 8, BARK);
    f.rect(11, 37, 4, 8, BARK);
    f.rect(11, 37, 1, 8, BARK_L);
    f.rect(31, 30, 4, 8, BARK);
    f.rect(33, 37, 4, 8, BARK);
    f.rect(33, 37, 1, 8, BARK_L);
    f.rect(10, 45, 6, 3, HOOF);
    f.rect(32, 45, 6, 3, HOOF);
  }

  // ---- neck (skipped when the head is tucked low)
  if (hd <= 4) {
    f.rect(20, 18 + hd, 8, 10, BARK);
    f.rect(26, 20 + hd, 2, 8, BARK_D);
    f.px(20, 25 + hd, MOSS_D); // throat moss
  }

  // ---- the proud head: wide skull, ears, tapered muzzle
  f.rect(17, 11 + hd, 14, 9, BARK);
  f.rect(17, 11 + hd, 5, 2, BARK_L);
  f.rect(28, 12 + hd, 3, 7, BARK_D);
  f.rect(14, 13 + hd, 3, 2, BARK_D); // ears
  f.rect(31, 13 + hd, 3, 2, BARK_D);
  f.rect(21, 20 + hd, 6, 4, BARK); // muzzle
  f.rect(21, 20 + hd, 2, 3, BARK_L);
  f.rect(22, 23 + hd, 4, 1, HOOF); // nose
  f.px(22, 22 + hd, BARK_D);
  f.px(26, 22 + hd, BARK_D);

  drawEye(f, hd, eye);

  // ---- the antler crown, mirrored boughs of living wood
  const A = antlerHalf(charge);
  f.blit(A, 0, 0, A.w, A.h, 0, hd);
  f.blit(A, 0, 0, A.w, A.h, 26, hd, true);

  // ---- vines trailing off the beams (breath sways the tips)
  for (const [vx, vy, len] of [[9, 10, 7], [15, 13, 8], [38, 10, 6], [32, 13, 8]]) {
    f.rect(vx, vy + hd, 1, len, MOSS_D);
    f.px(vx, vy + hd + 1, MOSS); // lit strand pixels so it reads as hanging growth
    f.px(vx, vy + hd + 4, MOSS);
    f.px(vx + (vx < 24 ? -1 : 1), vy + hd + 3, MOSS); // leaf
    f.px(vx + (breath ? 1 : 0) * (vx < 24 ? 1 : -1), vy + hd + len, MOSS_D); // swaying tip
  }

  // ---- pale blossoms, sparingly and asymmetric: left tip, right beam, saddle
  const crownBloom: [number, number][] = charge
    ? [[5, 13], [6, 13], [5, 14], [36, 17], [37, 17]]
    : [[5, 2 + hd], [6, 2 + hd], [5, 3 + hd], [36, 7 + hd], [37, 7 + hd]];
  for (const [x, y] of crownBloom) f.px(x, y, BLOSSOM);
  f.px(12, sy, BLOSSOM);
  f.px(13, sy, BLOSSOM);
  f.px(12, sy + 1, BLOSSOM);

  outline(f);
  return scaleNN(f, 96, 96);
}

/**
 * Slumber: kneeling on folded legs, head lowered against the chest — the
 * crown reads as a gnarled dead tree growing out of a moss mound.
 */
function slumber(): Img {
  const f = new Img(48, 48);

  // folded legs and tucked hooves under the mound
  f.rect(11, 42, 7, 4, BARK_D);
  f.rect(30, 42, 7, 4, BARK_D);
  f.rect(15, 44, 4, 3, HOOF);
  f.rect(29, 44, 4, 3, HOOF);

  // the settled body mound
  f.rect(12, 31, 24, 13, BARK);
  f.disc(13, 36, 5, BARK);
  f.disc(35, 36, 5, BARK);
  f.rect(12, 41, 24, 3, BARK_D);
  f.rect(10, 34, 1, 5, BARK_L);
  for (const [x, y] of [[16, 36], [17, 37], [30, 35], [31, 36], [22, 40]]) f.px(x, y, CRACK);

  // moss has blanketed it in its sleep
  f.rect(9, 29, 30, 4, MOSS_D);
  f.disc(10, 31, 3, MOSS_D);
  f.disc(38, 31, 3, MOSS_D);
  f.rect(10, 29, 12, 2, MOSS);
  f.rect(26, 29, 7, 1, MOSS);
  for (const [x, y] of [[14, 33], [20, 34], [28, 33], [33, 35], [17, 37], [36, 34]]) f.rect(x, y, 2, 1, MOSS_D);

  // head sunk low, muzzle to the ground
  f.rect(17, 25, 14, 9, BARK);
  f.rect(17, 25, 5, 2, BARK_L);
  f.rect(28, 26, 3, 7, BARK_D);
  f.rect(14, 27, 3, 2, BARK_D); // ears drooped
  f.rect(31, 27, 3, 2, BARK_D);
  f.rect(21, 34, 6, 4, BARK);
  f.rect(22, 37, 4, 1, HOOF);
  drawEye(f, 14, 'slumber');

  // the dead-tree crown: halves pulled in tight so they rise like a gnarled
  // trunk pair from the mound instead of spreading like the waking stance
  const A = antlerHalf(false);
  f.blit(A, 0, 0, A.w, A.h, 3, 10);
  f.blit(A, 0, 0, A.w, A.h, 24, 10, true);

  // vines pooled slack along the lowered beams
  f.rect(13, 20, 1, 5, MOSS_D);
  f.rect(34, 20, 1, 5, MOSS_D);
  f.px(12, 22, MOSS);
  f.px(35, 22, MOSS);

  // a lone blossom persists on the sleeping crown
  f.px(8, 11, BLOSSOM);
  f.px(9, 11, BLOSSOM);
  f.px(8, 12, BLOSSOM);

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
// 0 slumber: settled a touch lower than the waking stance
frames.push(anchored(scaleNN(slumber(), 96, 90)));
frames.push(warden('closed')); // 1
frames.push(warden('closed2', { breath: 1 })); // 2
frames.push(warden('open')); // 3
frames.push(warden('open2', { breath: 1 })); // 4
// 5 windup: coiled low and wide, crown levelled like a charge
frames.push(anchored(scaleNN(warden('closed', { bd: 3, hd: 8, legs: 'windup', charge: true }), 100, 80)));
// 6 airborne: the heavy stag vault — narrower and taller than the stance,
// forelegs tucked, well clear of the ground
{
  const air = anchored(scaleNN(warden('closed2', { legs: 'tuck' }), 84, 90), 13);
  for (const [x, y] of [[16, 90], [36, 93], [58, 92], [78, 90]]) air.rect(x, y, 6, 1, 0xc9c2a877); // rush lines
  frames.push(air);
}
// 7 landing: slammed down, forelegs splayed, dust bursting at the hooves
{
  const land = anchored(scaleNN(warden('closed', { legs: 'wide' }), 96, 72));
  for (const [x, y] of [[5, 91], [12, 89], [80, 89], [87, 91], [26, 93], [66, 93]]) {
    land.rect(x, y, 3, 2, 0xbdb49ecc);
  }
  frames.push(land);
}

const sheet = new Img(96 * frames.length, 96);
frames.forEach((f, i) => sheet.blit(f, 0, 0, 96, 96, i * 96, 0));
write(path.join(root, 'public/assets/objects/verdant-warden.png'), sheet);

// review preview: 4x nearest-neighbour, row 1 transparent, row 2 on a dark
// backdrop for the readability check
const Z = 4;
const preview = new Img(96 * Z * frames.length, 96 * Z * 2);
preview.rect(0, 96 * Z, preview.w, 96 * Z, 0x1a2420ff);
frames.forEach((f, i) => {
  const big = scaleNN(f, 96 * Z, 96 * Z);
  preview.blit(big, 0, 0, big.w, big.h, i * 96 * Z, 0);
  preview.blit(big, 0, 0, big.w, big.h, i * 96 * Z, 96 * Z);
});
write(path.join(SCRATCH, 'verdant-warden-preview.png'), preview);

console.log('verdant warden composed.');
