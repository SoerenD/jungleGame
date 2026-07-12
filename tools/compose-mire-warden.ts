/**
 * Composes the Mire Warden sheet (ADR-0017 rung 1, fought at the Mangrove
 * Coast): a SQUAT, WIDE amphibian leviathan — giant-salamander/toad bulk kept
 * LOW to the ground, the anti-vertical counterpart to the Guardian colossus.
 * Broad flat head merging straight into the body, wide mouth line, pale
 * mottled umber throat pouch, rust gill frills at the jaw, webbed splayed
 * forefeet, and a back crusted with barnacles, moss, drowned kelp and pale
 * dry salt-reeds (the Realm's signature accent, tools/compose-mire-tiles.ts).
 *
 * The ONE large PALE-TEAL eye (#63e0b8, the Realm's gate-glyph color) is the
 * Eye Window weak-point signal: open frames blaze with a spill glow so the
 * state reads instantly at gameplay zoom.
 *
 * Frames (96x96 each, laid out horizontally, base on the bottom rows):
 *   0 slumber (half-sunk mossy mound in a black-water film — near-terrain)
 *   1-2 awake idle, eye closed (breathing back-swell on 2)
 *   3-4 eye OPEN (blazing; brighter flicker on 4)
 *   5 lunge windup (coiled low on swollen haunches, throat pouch inflated)
 *   6 airborne (explosive spread-limbed leap, bog droplets trailing)
 *   7 landing (belly-flop squash, splash at the base)
 *
 * Drawn from primitives at 48x48 and doubled (compose-guardian-v3.ts
 * technique). Deterministic: re-running writes byte-identical files.
 * Run: npx --registry https://registry.npmjs.org/ tsx tools/compose-mire-warden.ts
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

// bog-hide palette, lit from the upper left (mire realm family, tiles script)
const OUT = 0x17251eff; // silhouette outline — dark teal-black, not pure black
const DK = 0x2e4a3eff;
const MID = 0x3d5c4cff;
const LT = 0x55786aff;
const HI = 0x6d9282ff; // wet-sheen glints
const BELLY_D = 0x483a26ff;
const BELLY = 0x5a4a32ff;
const BELLY_L = 0x6f5d3fff;
const REED = 0x8f855aff; // the Realm's pale dry-reed accent
const REED_L = 0xb3a76eff;
const REED_D = 0x4f4632ff;
const MOSS = 0x4a5433ff;
const KELP = 0x39442cff;
const BARN = 0x99a08bff; // barnacle crust
const BARN_D = 0x39423aff;
const GILL = 0x6e4437ff; // muted rust gill frills
const GILL_L = 0x8f5c49ff;
const MOUTH = 0x1c2b23ff;
// the pale-teal eye (matches the Realm's gate glyphs)
const EYE = 0x63e0b8ff;
const EYE2 = 0x74edc4ff;
const CORE = 0xaef4d8ff;
const CORE2 = 0xc9fbe6ff;
const PUPIL = 0x0e4034ff;
const WATER = 0x142829ff;
const WATER_L = 0x1e3c3aff;
const SPLASH = 0x9fd8c4ee; // pale bog-water burst
const DROP = 0x5aa38fbb;
const RUSH = 0x9fd8c455;

type EyeState = 'closed' | 'closed2' | 'open' | 'open2';
type Pose = 'idle' | 'breath' | 'windup' | 'leap';

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

/** a standing dry salt-reed (drawn post-outline so it keeps its pale color) */
function reed(f: Img, x: number, baseY: number, h: number, lean: number, seed = false): void {
  for (let d = 0; d < h; d++) {
    const y = baseY - 1 - d;
    const xx = x + (d > h * 0.6 ? lean : 0);
    f.px(xx, y, d >= h - 2 ? REED_L : REED);
  }
  if (seed) f.rect(x + lean, baseY - h - 2, 1, 2, REED_D);
}

/** barnacle crust speck: pale 2x2 ring with a dark hollow */
function barnacle(f: Img, x: number, y: number): void {
  f.rect(x, y, 2, 2, BARN);
  f.px(x + 1, y + 1, BARN_D);
}

/** a strand of drowned kelp draped down the back */
function kelp(f: Img, pts: [number, number][]): void {
  for (const [x, y] of pts) f.px(x, y, KELP);
}

/** the squat leviathan at 48x48 (base on the bottom row), then doubled */
function warden(eye: EyeState, pose: Pose = 'idle'): Img {
  const f = new Img(48, 48);
  const b = pose === 'breath' ? 1 : 0; // the back swells up 1px mid-breath
  const windup = pose === 'windup';
  const leap = pose === 'leap';

  // folded hind haunches bulging at the sides (swollen when coiling)
  const hr = windup ? 8.5 : 7.5;
  const hy = windup ? 39 : 40;
  f.disc(8, hy, hr, DK);
  f.disc(40, hy, hr, DK);
  // lit crease along the left haunch top (light source side)
  for (const [x, y] of [
    [2, 38], [3, 36], [4, 35], [5, 34], [6, 34],
  ]) f.px(x, y - (windup ? 1 : 0), MID);
  f.px(43, 35 - (windup ? 1 : 0), MID);
  f.px(44, 36 - (windup ? 1 : 0), MID);

  // the low wide back dome — slick bog-hide, shaded like a wet boulder
  f.disc(24, 35 - b, 17, DK);
  f.disc(23, 34 - b, 15, MID);
  f.disc(19, 30 - b, 10, LT);
  f.disc(29, 39 - b, 12, MID);
  // wet sheen along the top-left of the dome
  for (const [x, y] of [
    [15, 21], [16, 21], [17, 20], [19, 20], [21, 19], [23, 19],
  ]) f.px(x, y - b, LT);
  f.px(18, 20 - b, HI);
  f.px(20, 19 - b, HI);
  f.px(14, 22 - b, HI);
  // hide warts on the dome band and haunches
  for (const [x, y] of [
    [17, 21], [25, 20], [31, 21], [34, 23],
  ]) f.rect(x, y - b, 2, 1, DK);
  for (const [x, y] of [
    [4, 38], [5, 42], [43, 39], [42, 43],
  ]) f.px(x, y, MID);

  // back crust: moss shelves, drowned kelp strands, barnacle specks
  f.rect(22, 19 - b, 3, 2, MOSS);
  f.px(23, 20 - b, KELP);
  f.rect(29, 21 - b, 2, 1, MOSS);
  f.rect(12, 24 - b, 2, 2, MOSS);
  kelp(f, [[15, 19 - b], [15, 20 - b], [14, 21 - b], [14, 22 - b], [14, 23 - b]]);
  kelp(f, [[31, 18 - b], [31, 19 - b], [32, 20 - b], [32, 21 - b], [33, 22 - b]]);
  barnacle(f, 13, 21 - b);
  barnacle(f, 19, 18 - b);
  barnacle(f, 27, 19 - b);
  barnacle(f, 33, 22 - b);
  barnacle(f, 3, 34);
  barnacle(f, 43, 35);

  // broad flat head merging straight into the body — no neck, all jaw
  f.rect(14, 24, 20, 10, MID);
  f.disc(15, 29, 5.2, MID);
  f.disc(32, 29, 5.2, MID);
  f.rect(12, 24, 10, 2, LT); // top-lit skull, broken so it doesn't band
  f.rect(22, 24, 4, 1, LT);
  f.px(12, 24, HI);
  f.px(13, 24, HI);
  f.px(10, 27, LT);
  f.px(10, 28, LT);
  f.px(12, 30, LT); // lit cheek
  f.px(36, 26, DK); // shadow side of the head
  f.px(37, 27, DK);
  f.px(37, 28, DK);
  f.px(36, 30, DK);
  f.rect(13, 32, 3, 1, DK); // jaw-corner shading only — keep the mouth crisp
  f.rect(32, 32, 3, 1, DK);
  // head mottle
  f.px(13, 26, DK);
  f.px(14, 27, DK);
  f.px(34, 26, DK);
  f.px(31, 30, DK);
  f.px(16, 29, LT);

  // throat pouch — pale mottled umber, rounded shoulders, sagging low;
  // inflated huge on the windup
  if (windup) {
    f.rect(17, 32, 14, 2, BELLY);
    f.rect(15, 34, 18, 3, BELLY);
    f.disc(24, 41, 10.5, BELLY);
    f.disc(27, 43, 8, BELLY_D);
    f.rect(31, 36, 3, 5, BELLY_D);
    f.disc(19, 37, 4.5, BELLY_L);
    f.rect(17, 33, 8, 2, BELLY_L);
  } else {
    f.rect(19, 34, 10, 1, BELLY);
    f.rect(17, 35, 14, 1, BELLY);
    f.rect(16, 36, 16, 5, BELLY);
    f.disc(24, 41, 8, BELLY);
    f.disc(27, 43, 6.5, BELLY_D);
    f.rect(30, 37, 2, 4, BELLY_D);
    f.rect(18, 35, 6, 2 + b, BELLY_L);
    f.disc(20, 38, 3, BELLY_L);
  }
  // pouch sag crease + mottling
  f.rect(19, 43, 9, 1, BELLY_D);
  for (const [x, y] of [
    [19, 38], [23, 41], [27, 37], [21, 44], [28, 43], [25, 39], [18, 42],
  ]) f.px(x, y, BELLY_D);
  f.px(18, 36, BELLY_L);
  f.px(22, 35, BELLY_L);

  // the wide mouth line, sagging at the corners
  f.rect(11, 33, 26, 1, MOUTH);
  f.px(10, 34, MOUTH);
  f.px(37, 34, MOUTH);
  f.px(14, 32, LT); // wet lip sheen above the line
  f.px(21, 32, LT);
  // nostril pits
  f.px(17, 31, MOUTH);
  f.px(30, 31, MOUTH);

  if (!leap) {
    // planted forelegs angling outward (toad stance), webbed 5-toe fans
    // left leg: two offset segments so the limb splays out from the shoulder
    f.rect(6, 33, 6, 5, MID);
    f.rect(4, 38, 7, 5, MID);
    f.rect(6, 33, 2, 5, LT);
    f.rect(4, 38, 2, 5, LT);
    f.rect(11, 33, 1, 5, DK);
    f.rect(10, 38, 1, 5, DK);
    f.rect(0, 42, 14, 4, MID);
    f.rect(0, 42, 7, 1, LT);
    for (const tx of [0, 3, 6, 9, 12]) {
      f.rect(tx, 46, 2, 2, MID);
      f.px(tx, 46, LT); // lit toe knuckle
    }
    for (const wx of [2, 5, 8, 11]) f.px(wx, 46, DK); // webbing between toes
    // right leg (shadow side, thinner light edge)
    f.rect(36, 33, 6, 5, MID);
    f.rect(37, 38, 7, 5, MID);
    f.rect(36, 33, 1, 5, LT);
    f.rect(37, 38, 1, 5, LT);
    f.rect(41, 33, 1, 5, DK);
    f.rect(43, 38, 1, 5, DK);
    f.rect(34, 42, 14, 4, MID);
    f.rect(34, 42, 4, 1, LT);
    for (const tx of [34, 37, 40, 43, 46]) f.rect(tx, 46, 2, 2, MID);
    f.px(34, 46, LT);
    for (const wx of [36, 39, 42, 45]) f.px(wx, 46, DK);
  } else {
    // spread-limbed leap: forelimbs flung out from above the haunches so
    // they break the silhouette, webbed feet fanned wide
    // left limb
    f.rect(5, 28, 5, 3, MID);
    f.rect(2, 31, 5, 3, MID);
    f.rect(0, 34, 4, 3, MID);
    f.rect(5, 28, 3, 1, LT);
    f.rect(2, 31, 2, 1, LT);
    f.rect(0, 34, 2, 1, LT);
    f.rect(9, 28, 1, 3, DK); // seam where the limb leaves the body
    f.rect(0, 37, 5, 2, MID);
    f.rect(0, 39, 2, 2, MID);
    f.rect(3, 39, 2, 2, MID);
    f.px(0, 39, LT);
    f.px(3, 39, LT);
    f.px(2, 39, DK);
    f.px(5, 38, MID);
    f.px(6, 39, MID);
    // right limb
    f.rect(38, 28, 5, 3, MID);
    f.rect(41, 31, 5, 3, MID);
    f.rect(44, 34, 4, 3, MID);
    f.rect(38, 28, 3, 1, LT);
    f.rect(38, 28, 1, 3, DK);
    f.rect(43, 37, 5, 2, MID);
    f.rect(43, 39, 2, 2, MID);
    f.rect(46, 39, 2, 2, MID);
    f.px(45, 39, DK);
    f.px(42, 38, MID);
    f.px(41, 39, MID);
    // trailing hind feet under the body
    f.rect(12, 42, 6, 3, DK);
    f.rect(12, 42, 6, 1, MID);
    f.rect(12, 45, 2, 2, DK);
    f.rect(15, 45, 2, 2, DK);
    f.rect(30, 42, 6, 3, DK);
    f.rect(30, 42, 6, 1, MID);
    f.rect(30, 45, 2, 2, DK);
    f.rect(33, 45, 2, 2, DK);
  }

  // ---- the ONE large pale-teal eye, high on the flat skull.
  // Rounded socket (corners eased into the skull) so it reads organic.
  const socket = (c: number) => {
    f.rect(19, 25, 10, 6, c);
    f.px(19, 25, MID);
    f.px(28, 25, MID);
    f.px(19, 30, MID);
    f.px(28, 30, MID);
  };
  f.rect(26, 24, 4, 1, MID); // brow ridge continues on the shadow side
  if (eye === 'closed' || eye === 'closed2') {
    // shut: a heavy skin lid with a dark seam — clearly NOT the Eye Window
    const pulse = eye === 'closed2';
    socket(MID);
    f.rect(20, 26, 8, 1, LT); // lid sheen
    f.rect(20, 28, 8, 1, MOUTH); // the shut seam
    f.px(19, 29, MOUTH);
    f.px(28, 29, MOUTH);
    if (pulse) f.rect(22, 28, 4, 1, 0x2e7a62ff); // smolder through the seam
  } else {
    // OPEN — the Eye Window: blazing pale teal, horizontal amphibian pupil
    const bright = eye === 'open2';
    socket(bright ? EYE2 : EYE);
    f.rect(21, 26, 6, 3, bright ? CORE2 : CORE);
    f.rect(22, 25, 4, 1, bright ? CORE2 : CORE);
    f.rect(21, 27, 6, 1, PUPIL);
    f.px(21, 26, 0xffffffff); // specular
    // rounded radiant halo hugging the socket — unmistakable at gameplay zoom
    const rim = bright ? 0x8fefd2ff : EYE;
    f.rect(20, 24, 8, 1, rim);
    f.rect(20, 31, 8, 1, rim);
    f.rect(17, 26, 2, 3, rim);
    f.px(18, 25, rim);
    f.px(18, 29, rim);
    f.rect(29, 26, 2, 3, rim);
    f.px(29, 25, rim);
    f.px(29, 29, rim);
  }

  outline(f);

  // post-outline accents (1px work the outline pass would swallow)
  // rust gill frills fanning off the jaw corners
  for (const [x, y, c] of [
    [8, 26, GILL], [7, 27, GILL], [6, 28, GILL_L], [5, 28, GILL_L],
    [9, 29, GILL], [8, 30, GILL], [7, 31, GILL_L], [6, 31, GILL_L],
    [9, 32, GILL], [8, 33, GILL_L], [7, 33, GILL_L],
    [39, 26, GILL], [40, 27, GILL], [41, 28, GILL_L], [42, 28, GILL_L],
    [38, 29, GILL], [39, 30, GILL], [40, 31, GILL_L], [41, 31, GILL_L],
    [38, 32, GILL], [39, 33, GILL_L], [40, 33, GILL_L],
  ] as [number, number, number][]) f.px(x, y, c);
  // dry salt-reeds rooted in the back crust
  reed(f, 17, 20 - b, 5, -1);
  reed(f, 22, 18 - b, 6, 0, true);
  reed(f, 28, 19 - b, 5, 1);
  reed(f, 33, 21 - b, 4, 1);

  return scaleNN(f, 96, 96);
}

/** slumber: half-sunk in a black-water film — a mossy mound, near-terrain */
function mound(): Img {
  const f = new Img(48, 48);

  // the sunken bulk
  f.disc(24, 46, 18, DK);
  f.disc(8, 46, 7, DK);
  f.disc(40, 46, 7, DK);
  f.disc(22, 45, 15, MID);
  f.disc(18, 42, 9, LT);
  f.disc(30, 47, 11, MID);
  // wet sheen on the crown
  f.px(15, 30, HI);
  f.px(22, 29, HI);
  f.px(11, 33, HI);
  f.px(16, 31, LT);
  f.px(20, 30, LT);

  // the flat head barely breaking the surface, front-center
  f.rect(15, 38, 18, 4, MID);
  f.rect(15, 38, 7, 1, LT);
  f.rect(15, 42, 18, 1, DK);
  // mouth seam and the barely-visible eye seam
  f.rect(16, 43, 16, 1, DK);
  f.rect(20, 39, 6, 1, 0x2a5748ff);
  f.px(19, 39, 0x1f4438ff);
  f.px(26, 39, 0x1f4438ff);

  // heavy overgrowth — it has slept here a long time
  f.rect(12, 34, 3, 2, MOSS);
  f.rect(20, 30, 4, 2, MOSS);
  f.px(21, 31, KELP);
  f.rect(30, 33, 3, 2, MOSS);
  f.rect(36, 38, 3, 2, MOSS);
  f.rect(8, 40, 3, 2, MOSS);
  kelp(f, [[14, 31], [14, 32], [13, 33], [13, 34]]);
  kelp(f, [[32, 30], [33, 31], [33, 32], [34, 33]]);
  barnacle(f, 16, 32);
  barnacle(f, 27, 30);
  barnacle(f, 38, 40);
  barnacle(f, 6, 42);

  // the black-water film it is sunk into (drawn over the bulk = half-sunk)
  f.rect(0, 45, 8, 1, WATER);
  f.rect(40, 45, 8, 1, WATER);
  f.rect(0, 46, 48, 2, WATER);
  for (const [x, y] of [
    [3, 46], [14, 47], [24, 46], [33, 47], [43, 46], [9, 46],
  ]) f.px(x, y, WATER_L);

  outline(f);

  // reeds growing straight out of its back
  reed(f, 11, 34, 4, -1);
  reed(f, 19, 29, 6, 0, true);
  reed(f, 27, 29, 5, 1);
  reed(f, 35, 32, 4, 1);
  reed(f, 42, 40, 3, 1);

  return scaleNN(f, 96, 96);
}

/** draw `src` anchored bottom-center into a fresh 96x96 frame */
function anchored(src: Img, liftPx = 0): Img {
  const f = new Img(96, 96);
  f.blit(src, 0, 0, src.w, src.h, Math.floor((96 - src.w) / 2), 96 - src.h - liftPx);
  return f;
}

const frames: Img[] = [];
frames.push(mound()); // 0 slumber
frames.push(warden('closed', 'idle')); // 1
frames.push(warden('closed2', 'breath')); // 2
frames.push(warden('open', 'idle')); // 3
frames.push(warden('open2', 'breath')); // 4
// 5 windup: coiled low on the haunches, pouch inflated
frames.push(anchored(scaleNN(warden('closed', 'windup'), 96, 82)));
// 6 airborne: the explosive spread-limbed leap, lifted clear of the base
{
  const air = anchored(scaleNN(warden('closed2', 'leap'), 88, 86), 8);
  for (const [x, y] of [[24, 88], [30, 91], [66, 89], [72, 92], [48, 93]]) air.px(x, y, DROP);
  for (const [x, y] of [[16, 93], [38, 94], [58, 93], [78, 94]]) air.rect(x, y, 5, 1, RUSH);
  frames.push(air);
}
// 7 landing: belly-flop squash, bog water bursting at the base
{
  const land = anchored(scaleNN(warden('closed', 'idle'), 96, 58));
  // water thrown up in two side arcs by the impact
  for (const [x, y] of [
    [1, 90], [4, 86], [7, 82], [10, 79], [88, 79], [91, 82], [93, 86], [94, 90],
  ]) land.rect(x, y, 2, 2, SPLASH);
  for (const [x, y] of [[13, 76], [3, 78], [85, 75], [94, 78], [16, 81], [80, 82]]) {
    land.px(x, y, DROP);
  }
  land.rect(10, 94, 8, 1, DROP);
  land.rect(76, 94, 8, 1, DROP);
  frames.push(land);
}

const sheet = new Img(96 * frames.length, 96);
frames.forEach((f, i) => sheet.blit(f, 0, 0, 96, 96, i * 96, 0));
write(path.join(root, 'public/assets/objects/mire-warden.png'), sheet);

// review preview: 4x upscale, row 1 transparent, row 2 on a dark backdrop
{
  const up = scaleNN(sheet, sheet.w * 4, sheet.h * 4);
  const prev = new Img(up.w, up.h * 2);
  prev.blit(up, 0, 0, up.w, up.h, 0, 0);
  prev.rect(0, up.h, up.w, up.h, 0x1a2420ff);
  prev.blit(up, 0, 0, up.w, up.h, 0, up.h);
  write(path.join(SCRATCH, 'mire-warden-preview.png'), prev);
}

console.log('mire warden composed.');
