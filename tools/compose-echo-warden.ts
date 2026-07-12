/**
 * Composes the Echo Warden sheet (ADR-0017 rung 2 — fought at The Cavern
 * Mouth, warder of the lightless Hushdark Realm): a 96x96 TALL, GAUNT
 * chiropteran silhouette — long thin folded limbs, hunched narrow
 * shoulders, a smooth MOUTHLESS face, and its defining shape: a huge
 * RESONATOR CREST, twin ear-cones sweeping up and outward like a tuning
 * fork. Charcoal-violet chitin plates, dusty membrane folds, and faint
 * concentric ring engravings on the crest that light up with the ONE pale
 * violet-white eye (the Eye Window weak-point signal).
 *
 * Frames (96x96 each, laid out horizontally):
 *   0 slumber (wrapped standing cocoon, crest drooped)
 *   1-2 awake idle, eye closed (breathing)
 *   3-4 eye OPEN — the Eye Window (flicker)
 *   5 lunge windup (coiled low, crest pulled back, rings flaring)
 *   6 airborne (membranes snapped wide)
 *   7 landing (crumpled fold, crest forward, mass low and wide)
 *
 * Drawn from primitives at 48x48 and doubled — re-runnable, no inputs.
 * Run: npx --registry https://registry.npmjs.org/ tsx tools/compose-echo-warden.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { Img } from './png';

const root = path.resolve(import.meta.dirname, '..');
const PREVIEW =
  'C:/Users/SOEREN~1.DIE/AppData/Local/Temp/claude/C--Users-soeren-dierkes-littleGame/35dc675f-2ba0-41f0-86ac-1104a650ef11/scratchpad/echo-warden-preview.png';

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

// charcoal-violet chitin, lit from the upper left
const OUT = 0x1a1622ff; // silhouette outline (dark, never black)
const DK = 0x2a2433ff; // chitin shadow
const MID = 0x3c3350ff; // chitin base
const LT = 0x5c5075ff; // lit plate edges
const HI = 0x7a6c99ff; // rare gleam
const MEM = 0x4a4458ff; // membrane
const MEMD = 0x36314aff; // membrane fold shadow
const RINGD = 0x241e2eff; // dormant crest engraving
const SLIT = 0x554b70ff; // closed-eye seam
const RUNE = 0xcdb6f2ff; // violet-white blaze
const RUNED = 0x8a6cc9ff; // blaze falloff
const CORE = 0xf2ecffff; // near-white eye core

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

/** filled triangle (scanline) — membranes are triangles of skin */
function tri(f: Img, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, rgba: number): void {
  const minY = Math.min(ay, by, cy);
  const maxY = Math.max(ay, by, cy);
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    const edge = (x1: number, y1: number, x2: number, y2: number) => {
      if (y1 === y2) return;
      if (y < Math.min(y1, y2) || y > Math.max(y1, y2)) return;
      xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
    };
    edge(ax, ay, bx, by);
    edge(bx, by, cx, cy);
    edge(cx, cy, ax, ay);
    if (xs.length < 2) continue;
    const x0 = Math.round(Math.min(...xs));
    const x1 = Math.round(Math.max(...xs));
    for (let x = x0; x <= x1; x++) f.px(x, y, rgba);
  }
}

/** thin bone/spar line */
function line(f: Img, x0: number, y0: number, x1: number, y1: number, rgba: number, t = 1): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    f.rect(x, y, t, t, rgba);
  }
}

/** cone centerline: base (bx,by) walked by per-step offsets */
const conePath = (bx: number, by: number, dxs: number[], dys: number[]): number[][] =>
  dxs.map((dx, i) => [bx + dx, by + dys[i]]);
const mirX = (dxs: number[]): number[] => dxs.map((v) => -v);

/**
 * One resonator cone: horizontal spans stacked along a path (base -> tip),
 * tapering from w0 down to 2px, banded with the concentric ring engravings
 * that light up with the eye. A 1px OUT backing halo is laid first so the
 * cone separates cleanly from whatever it overlaps (head, shroud, wings).
 */
function cone(f: Img, path: number[][], w0: number, lit: boolean): void {
  const n = path.length;
  const spans = path.map(([x, y], i) => {
    const w = Math.max(2, Math.round(w0 - ((w0 - 2) * i) / (n - 1)));
    return [x - (w >> 1), y, w];
  });
  for (const [x, y, w] of spans) f.rect(x - 1, y - 1, w + 2, 3, OUT);
  for (const [x, y, w] of spans) {
    f.rect(x, y, w, 1, MID);
    f.px(x, y, LT); // left face lit
    f.px(x + w - 1, y, DK); // right face shaded
  }
  spans.forEach(([x, y, w], i) => {
    if (i % 3 === 1) f.rect(x, y, w, 1, lit ? RUNE : RINGD);
  });
  const [tx, ty, tw] = spans[n - 1];
  if (lit) {
    f.rect(tx, ty, tw, 1, RUNED);
    f.px(tx, ty, CORE);
  } else {
    f.rect(tx, ty, tw, 1, LT); // lit tip edge
  }
}

/** the ONE eye on the smooth mouthless face, centered on row cy */
function drawEye(f: Img, cy: number, eye: EyeState): void {
  if (eye === 'slumber') return; // sealed inside the cocoon
  if (eye === 'closed' || eye === 'closed2') {
    f.rect(22, cy, 5, 1, SLIT); // a dormant seam, nothing more
    return;
  }
  // OPEN — the Eye Window: a cold round violet-white blaze, unmistakable
  const bright = eye === 'open2';
  f.disc(24, cy, bright ? 4.6 : 4.2, RUNED); // halo
  f.disc(24, cy, 3.4, 0x120f1aff); // recessed socket
  f.disc(24, cy, 2.6, bright ? 0xdccbf9ff : RUNE);
  if (bright) f.rect(22, cy - 1, 4, 2, CORE);
  else f.rect(23, cy - 1, 2, 2, CORE);
  // glow ticks bleeding past the face
  f.px(18, cy, RUNED);
  f.px(30, cy, RUNED);
  f.px(24, cy + 6, RUNED);
}

// ---------------------------------------------------------------- poses

// standing crest sweep: up and outward like a tuning fork
const CREST_UP_X = [0, 0, -1, -2, -3, -4, -5, -6, -7];
const CREST_UP_Y = [0, -1, -2, -3, -4, -5, -6, -7, -8];

/** awake idle — the full tall gaunt stance; b=1 raises the upper body 1px */
function standing(eye: EyeState, b: number): Img {
  const f = new Img(48, 48);
  const hb = -b; // breath lift
  const lit = eye === 'open' || eye === 'open2';

  // long digitigrade legs, thin as reeds
  f.rect(20, 32, 3, 5, DK); // L thigh
  f.rect(25, 32, 3, 5, DK); // R thigh
  f.rect(19, 37, 2, 8, MID); // L shin
  f.rect(19, 37, 1, 8, LT);
  f.rect(27, 37, 2, 8, MID); // R shin
  f.rect(27, 37, 1, 8, LT);
  f.rect(16, 45, 6, 2, MID); // L foot
  f.rect(26, 45, 6, 2, MID); // R foot
  f.px(18, 45, DK); // toe notches
  f.px(20, 45, DK);
  f.px(28, 45, DK);
  f.px(30, 45, DK);

  // gaunt plated torso, lit left / shaded right
  f.rect(20, 30, 8, 3, MID); // hips
  f.rect(21, 25, 6, 5, MID); // pinched waist
  f.rect(20, 19, 8, 6, MID); // chest
  f.rect(20, 21, 8, 1, DK); // plate seams
  f.rect(21, 27, 6, 1, DK);
  f.rect(20, 31, 8, 1, DK);
  f.px(21, 24, DK); // rib pits — it is starving-thin
  f.px(26, 24, DK);
  f.px(22, 29, DK);
  f.rect(20, 19, 1, 6, LT);
  f.rect(21, 25, 1, 5, LT);
  f.rect(20, 30, 1, 3, LT);
  f.rect(27, 19, 1, 6, DK);
  f.rect(26, 25, 1, 5, DK);
  f.rect(27, 30, 1, 3, DK);

  // hunched shoulder hump swallowing the neck
  f.disc(24, 18 + hb, 5.5, DK);
  f.disc(23, 17 + hb, 4.5, MID);
  f.px(19, 16 + hb, HI);
  f.px(20, 15 + hb, LT);

  // folded wing limbs — two thin rails down the flanks
  f.rect(16, 19 + hb, 2, 6, DK); // L upper
  f.rect(15, 25, 2, 6, DK); // L forearm
  f.rect(14, 31, 2, 7, DK); // L folded finger
  f.px(16, 19 + hb, LT);
  f.px(15, 25, LT);
  f.px(14, 31, LT);
  f.rect(13, 38, 2, 3, MID); // L claw
  f.px(12, 40, LT);
  f.px(12, 41, LT);
  f.rect(30, 19 + hb, 2, 6, DK); // R upper
  f.rect(31, 25, 2, 6, DK); // R forearm
  f.rect(32, 31, 2, 7, DK); // R folded finger
  f.px(30, 19 + hb, LT);
  f.px(31, 25, LT);
  f.px(32, 31, LT);
  f.rect(33, 38, 2, 3, MID); // R claw
  f.px(35, 40, LT);
  f.px(35, 41, LT);

  // membrane slivers sagging between limb and flank
  tri(f, 18, 21 + hb, 15, 31, 20, 30, MEM);
  tri(f, 29, 21 + hb, 32, 31, 27, 30, MEM);
  f.px(17, 25, MEMD);
  f.px(18, 28, MEMD);
  f.px(30, 25, MEMD);
  f.px(29, 28, MEMD);

  // smooth mouthless head sunk between the shoulders
  f.disc(24, 12 + hb, 5, MID);
  f.rect(22, 16 + hb, 4, 1, DK); // soft chin shadow — no mouth, ever

  // the resonator crest — twin cones sweeping up and outward
  cone(f, conePath(21, 9 + hb, CREST_UP_X, CREST_UP_Y), 5, lit);
  cone(f, conePath(27, 9 + hb, mirX(CREST_UP_X), CREST_UP_Y), 5, lit);

  // relight the skull's left curve after the cones settle over it
  f.px(20, 10 + hb, LT);
  f.px(20, 11 + hb, LT);
  f.px(19, 12 + hb, LT);
  f.px(21, 9 + hb, HI);

  drawEye(f, 12 + hb, eye);
  outline(f);
  return scaleNN(f, 96, 96);
}

/** frame 0 — wrapped standing cocoon, membranes shrouding it, crest drooped */
function slumber(): Img {
  const f = new Img(48, 48);

  // the shroud column
  f.disc(24, 15, 5.5, MEM);
  f.disc(24, 22, 6.5, MEM);
  f.disc(24, 30, 7, MEM);
  f.disc(24, 37, 7, MEM);
  f.rect(18, 37, 13, 8, MEM); // to y44
  f.rect(19, 45, 11, 1, MEM); // tapered base
  f.rect(20, 46, 3, 1, MID); // claw tips peeking out
  f.rect(26, 46, 3, 1, MID);

  // wrap seams + hanging folds
  line(f, 17, 33, 30, 24, MEMD);
  line(f, 18, 41, 31, 31, MEMD);
  line(f, 29, 18, 19, 13, MEMD);
  line(f, 17, 27, 30, 19, MEMD);
  for (let y = 16; y <= 43; y += 3) {
    f.px(21, y, MEMD);
    f.px(27, y + 1, MEMD);
  }
  // moonlit left rim
  for (let y = 14; y <= 20; y += 2) f.px(18, y, LT);
  for (let y = 24; y <= 40; y += 2) f.px(17, y, LT);

  // bowed smooth skull above the wrap
  f.disc(24, 9, 4, MID);
  f.rect(22, 6, 3, 1, LT);
  f.px(21, 7, LT);

  // crest drooped — the fork hangs dead down the shroud's shoulders
  const dx = [0, -1, -1, -2, -2, -3, -3, -4];
  const dy = [0, 1, 2, 3, 4, 5, 6, 7];
  cone(f, conePath(19, 11, dx, dy), 4, false);
  cone(f, conePath(29, 11, mirX(dx), dy), 4, false);

  outline(f);
  return scaleNN(f, 96, 96);
}

/** frame 5 — coiled low, mass back, crest pulled flat, rings flaring */
function windup(): Img {
  const f = new Img(48, 48);

  // rear mass gathered low and back
  f.disc(24, 33, 7, DK);

  // legs folded deep, feet planted wide
  line(f, 15, 39, 20, 35, DK, 2);
  line(f, 31, 39, 26, 35, DK, 2);
  f.rect(14, 38, 2, 8, MID);
  f.rect(14, 38, 1, 8, LT);
  f.rect(32, 38, 2, 8, MID);
  f.rect(32, 38, 1, 8, LT);
  f.rect(12, 45, 6, 2, MID);
  f.rect(30, 45, 6, 2, MID);
  f.px(14, 45, DK);
  f.px(16, 45, DK);
  f.px(32, 45, DK);
  f.px(34, 45, DK);

  // compressed torso
  f.rect(19, 32, 10, 4, MID); // hips
  f.rect(19, 34, 10, 1, DK);
  f.rect(19, 26, 10, 6, MID); // chest
  f.rect(19, 29, 10, 1, DK);
  f.rect(19, 26, 1, 6, LT);
  f.rect(19, 32, 1, 4, LT);
  f.rect(28, 26, 1, 6, DK);
  f.rect(28, 32, 1, 4, DK);
  f.px(21, 28, DK);
  f.px(26, 31, DK);

  // wing limbs half-drawn, claws braced beside the coil
  line(f, 17, 27, 9, 35, DK, 2);
  line(f, 29, 27, 37, 35, DK, 2);
  tri(f, 18, 28, 10, 35, 19, 33, MEM);
  tri(f, 29, 28, 37, 35, 28, 33, MEM);
  f.px(14, 32, MEMD);
  f.px(16, 30, MEMD);
  f.px(33, 32, MEMD);
  f.px(31, 30, MEMD);
  f.rect(8, 35, 2, 3, MID);
  f.px(7, 37, LT);
  f.rect(38, 35, 2, 3, MID);
  f.px(40, 37, LT);

  // head tucked low
  f.disc(24, 22, 4.5, MID);
  f.rect(21, 18, 3, 1, LT);
  f.px(20, 19, LT);
  f.rect(22, 25, 4, 1, DK);

  // crest pulled back flat — and the rings FLARE
  const dx = [0, -1, -2, -4, -5, -6, -8, -9];
  const dy = [0, 0, -1, -1, -2, -2, -3, -3];
  cone(f, conePath(20, 18, dx, dy), 5, true);
  cone(f, conePath(28, 18, mirX(dx), dy), 5, true);

  // charging seam where the eye will blaze
  f.rect(22, 22, 5, 1, RUNED);
  f.px(24, 22, RUNE);

  outline(f);
  return scaleNN(f, 96, 96);
}

/** frame 6 — membranes snapped wide: the gaunt thing becomes a wall */
function airborne(): Img {
  const f = new Img(48, 48);

  // membranes first (bones ride over them)
  // left wing: wrist (8,7); fingertips (1,17)(6,22)(13,25); body (20,24)
  tri(f, 8, 7, 1, 17, 6, 22, MEM);
  tri(f, 8, 7, 6, 22, 13, 25, MEM);
  tri(f, 8, 7, 13, 25, 20, 24, MEM);
  tri(f, 8, 7, 20, 24, 20, 15, MEM);
  // right wing mirrored about x=23.5
  tri(f, 39, 7, 46, 17, 41, 22, MEM);
  tri(f, 39, 7, 41, 22, 34, 25, MEM);
  tri(f, 39, 7, 34, 25, 27, 24, MEM);
  tri(f, 39, 7, 27, 24, 27, 15, MEM);

  // scallop the trailing edge (notch between fingertips)
  f.px(3, 19, 0);
  f.px(4, 20, 0);
  f.px(9, 24, 0);
  f.px(10, 23, 0);
  f.px(16, 25, 0);
  f.px(17, 24, 0);
  f.px(44, 19, 0);
  f.px(43, 20, 0);
  f.px(38, 24, 0);
  f.px(37, 23, 0);
  f.px(31, 25, 0);
  f.px(30, 24, 0);

  // finger struts + membrane shading
  line(f, 8, 7, 1, 17, DK);
  line(f, 8, 7, 6, 22, DK);
  line(f, 8, 7, 13, 25, DK);
  line(f, 39, 7, 46, 17, DK);
  line(f, 39, 7, 41, 22, DK);
  line(f, 39, 7, 34, 25, DK);
  f.px(5, 15, MEMD);
  f.px(9, 19, MEMD);
  f.px(15, 21, MEMD);
  f.px(42, 15, MEMD);
  f.px(38, 19, MEMD);
  f.px(32, 21, MEMD);

  // arm bones, lit along the top
  line(f, 20, 15, 8, 7, DK, 2);
  line(f, 27, 15, 39, 7, DK, 2);
  line(f, 20, 14, 8, 6, LT);
  line(f, 27, 14, 39, 6, LT);
  f.px(8, 6, HI);
  f.px(39, 6, HI);

  // tucked body
  f.rect(21, 13, 7, 12, MID);
  f.rect(21, 17, 7, 1, DK);
  f.rect(21, 21, 7, 1, DK);
  f.rect(21, 13, 1, 12, LT);
  f.rect(27, 13, 1, 12, DK);
  f.rect(21, 25, 3, 4, DK); // legs drawn up
  f.rect(25, 25, 3, 4, DK);
  f.rect(20, 29, 3, 2, MID);
  f.rect(26, 29, 3, 2, MID);
  f.px(19, 30, LT);
  f.px(29, 30, LT);

  // head + crest riding the leap
  f.disc(24, 9, 4, MID);
  f.rect(22, 6, 3, 1, LT);
  f.px(21, 7, LT);
  const dx = [0, 0, -1, -1, -2, -2, -3];
  const dy = [0, -1, -2, -3, -4, -5, -6];
  cone(f, conePath(21, 7, dx, dy), 4, false);
  cone(f, conePath(27, 7, mirX(dx), dy), 4, false);
  f.rect(22, 9, 5, 1, SLIT);

  outline(f);
  const out = scaleNN(f, 96, 96);
  // thin fall-streaks under the wingtips — it drops in silence
  out.rect(8, 60, 1, 8, 0x8a6cc94d);
  out.rect(87, 60, 1, 8, 0x8a6cc94d);
  out.rect(46, 74, 1, 6, 0x8a6cc933);
  return out;
}

/** frame 7 — crumpled fold: mass slammed low and wide, crest forward */
function landing(): Img {
  const f = new Img(48, 48);

  // crumpled wing skirts draped to the ground
  tri(f, 17, 31, 3, 46, 16, 46, MEM);
  tri(f, 31, 31, 44, 46, 32, 46, MEM);
  line(f, 16, 31, 3, 45, DK);
  line(f, 31, 31, 44, 45, DK);
  line(f, 15, 32, 4, 44, LT); // lit fold along the crumple's spine
  line(f, 12, 37, 9, 45, MEMD);
  line(f, 35, 37, 38, 45, MEMD);
  line(f, 33, 35, 35, 45, MEMD);
  f.px(2, 44, LT); // wing claws bitten into the ground
  f.px(2, 45, LT);
  f.px(45, 44, LT);
  f.px(45, 45, LT);

  // legs splayed wide under the impact
  line(f, 13, 38, 18, 34, DK, 2);
  line(f, 33, 38, 29, 34, DK, 2);
  line(f, 13, 38, 9, 44, MID, 2);
  line(f, 33, 38, 37, 44, MID, 2);
  f.rect(7, 45, 7, 2, MID);
  f.rect(34, 45, 7, 2, MID);
  f.px(9, 45, DK);
  f.px(11, 45, DK);
  f.px(36, 45, DK);
  f.px(38, 45, DK);

  // mass low: rear hump, then the squashed plated body
  f.disc(24, 32, 6, DK);
  f.rect(18, 31, 12, 5, MID); // chest
  f.rect(17, 36, 14, 6, MID); // hips/belly
  f.rect(18, 34, 12, 1, DK);
  f.rect(17, 39, 14, 1, DK);
  f.rect(18, 31, 1, 5, LT);
  f.rect(17, 36, 1, 6, LT);
  f.rect(29, 31, 1, 5, DK);
  f.rect(30, 36, 1, 6, DK);
  f.px(20, 33, DK);
  f.px(27, 38, DK);

  // head thrown low and forward
  f.disc(24, 28, 4.5, MID);
  f.rect(21, 24, 3, 1, LT);
  f.px(20, 25, LT);
  f.rect(22, 31, 4, 1, DK);

  // crest pitched forward past the face by the impact
  const dx = [0, -2, -4, -5, -7, -8];
  const dy = [0, 1, 1, 2, 3, 4];
  cone(f, conePath(21, 24, dx, dy), 5, false);
  cone(f, conePath(27, 24, mirX(dx), dy), 5, false);

  f.rect(22, 28, 5, 1, SLIT);

  outline(f);
  const out = scaleNN(f, 96, 96);
  // impact: cavern dust + a ground-hugging echo ripple
  for (const [x, y] of [
    [6, 88],
    [12, 86],
    [80, 86],
    [88, 88],
    [24, 92],
    [70, 92],
  ]) {
    out.rect(x, y, 3, 2, 0x9a92b0cc);
  }
  out.rect(4, 92, 10, 1, 0x8a6cc955);
  out.rect(82, 92, 10, 1, 0x8a6cc955);
  return out;
}

// ---------------------------------------------------------------- sheet

const frames: Img[] = [
  slumber(), // 0
  standing('closed', 0), // 1
  standing('closed2', 1), // 2
  standing('open', 0), // 3
  standing('open2', 1), // 4
  windup(), // 5
  airborne(), // 6
  landing(), // 7
];

const sheet = new Img(96 * frames.length, 96);
frames.forEach((f, i) => sheet.blit(f, 0, 0, 96, 96, i * 96, 0));
write('public/assets/objects/echo-warden.png', sheet);

// ---------------------------------------------------------------- preview
// 8 frames at 4x in two rows: transparent, then over cavern-dark backdrop

/** alpha-blend src over dst (blit() overwrites; the backdrop row needs blending) */
function blendOnto(dst: Img, src: Img, dx: number, dy: number): void {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const si = (y * src.w + x) * 4;
      const a = src.data[si + 3];
      if (a === 0) continue;
      const di = ((dy + y) * dst.w + (dx + x)) * 4;
      const t = a / 255;
      dst.data[di] = Math.round(src.data[si] * t + dst.data[di] * (1 - t));
      dst.data[di + 1] = Math.round(src.data[si + 1] * t + dst.data[di + 1] * (1 - t));
      dst.data[di + 2] = Math.round(src.data[si + 2] * t + dst.data[di + 2] * (1 - t));
      dst.data[di + 3] = 255;
    }
  }
}

const S = 4;
const prev = new Img(96 * S * frames.length, 96 * S * 2);
prev.rect(0, 96 * S, prev.w, 96 * S, 0x1a2420ff);
frames.forEach((f, i) => {
  const big = scaleNN(f, 96 * S, 96 * S);
  prev.blit(big, 0, 0, big.w, big.h, i * 96 * S, 0);
  blendOnto(prev, big, i * 96 * S, 96 * S);
});
fs.mkdirSync(path.dirname(PREVIEW), { recursive: true });
fs.writeFileSync(PREVIEW, prev.toPng());
console.log('wrote preview', `${prev.w}x${prev.h}`);

console.log('echo warden composed.');
