/**
 * Procedural pixel-art sprites for the Delve's Husks + boss (ADR-0007), drawn
 * the same way as the Avatars (src/avatars.ts) and the BootScene FX: block-by-
 * block with ctx.fillRect onto a canvas, then registered as a Phaser texture.
 * No external art — every pixel is code, so the mobs match the game's look and
 * ship in the bundle. Designs follow art-directed specs (silhouette + limited
 * palette + one emissive feature that pops on the dark Delve floor).
 *
 * Each mob is a 3-frame sheet: frame 0/1 are a gentle idle heave (the `*-idle`
 * anim — the whole mass lifts 1px while the feet stay planted, and the glow dims
 * on the exhale), frame 2 is the TELEGRAPH pose (reared up, glow blazing white)
 * the renderer snaps to during a wind-up. They face the camera; the renderer
 * flips them for left/right.
 */
import type Phaser from 'phaser';
import type { MobKind } from './content/dungeon';

export const MOB_TEX: Record<MobKind, string> = {
  grasp: 'husk-grasp',
  spit: 'husk-spit',
  boss: 'deep-guardian',
  // the Deep (Stage 2, ADR-0011) — molten reskins of the same silhouettes
  cinder: 'husk-cinder',
  ember: 'husk-ember',
  forgeborn: 'forgeborn',
  // open-world Wildlife (ADR-0012) — side-view quadrupeds, one drawBeast reskinned
  capybara: 'wild-capybara',
  deer: 'wild-deer',
  boar: 'wild-boar',
  jaguar: 'wild-jaguar',
};

/** per-mob sheet frame size (px). Bosses are far bigger — a boss silhouette. */
export const MOB_FRAME: Record<MobKind, { w: number; h: number }> = {
  grasp: { w: 20, h: 22 },
  spit: { w: 20, h: 24 },
  boss: { w: 46, h: 50 },
  cinder: { w: 20, h: 22 },
  ember: { w: 20, h: 24 },
  forgeborn: { w: 48, h: 52 },
  // Wildlife share the 24×18 quadruped sheet (wider than tall — a side profile)
  capybara: { w: 24, h: 18 },
  deer: { w: 24, h: 18 },
  boar: { w: 24, h: 18 },
  jaguar: { w: 24, h: 18 },
};

type Ctx = CanvasRenderingContext2D;
const R = (ctx: Ctx, x: number, y: number, w: number, h: number, c: string) => {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

// -------------------------------------------------------- Grasp Husk (melee brute)
// Wide, low, top-heavy clay brute: hunched shoulders, two mismatched grasping
// fists hanging past the hips, a single warm amber crack-core in the chest.
const GRASP = {
  outline: '#2b2622',
  shadow: '#4a423b',
  base: '#6b6058',
  highlight: '#8c8073',
  rim: '#b3a493',
  moss: '#7a7a5e',
  glowCore: '#ffcf5c',
  glowHot: '#ff8c2a',
  glowEdge: '#c43a12',
};
function drawGrasp(ctx: Ctx, ox: number, f: number, P: typeof GRASP = GRASP): void {
  const oy = f === 0 ? 0 : -1; // idleB/telegraph heave the mass up; feet stay
  const tel = f === 2;
  const Y = (v: number) => v + oy;
  R(ctx, ox + 4, 20, 12, 2, P.outline); // ground shadow (planted)
  // legs / plinth
  R(ctx, ox + 4, Y(16), 12, 4, P.base);
  R(ctx, ox + 4, 19, 12, 2, P.shadow); // feet planted
  R(ctx, ox + 4, Y(16), 12, 1, P.highlight);
  // torso / shoulder mass
  R(ctx, ox + 3, Y(7), 14, 10, P.base);
  R(ctx, ox + 3, Y(7), 2, 1, P.outline); // chip notch L
  R(ctx, ox + 15, Y(7), 2, 1, P.outline); // chip notch R
  R(ctx, ox + 3, Y(14), 14, 2, P.shadow);
  // moss on top faces
  R(ctx, ox + 4, Y(7), 12, 1, P.moss);
  R(ctx, ox + 5, Y(8), 3, 1, P.moss);
  // rim light (top-left)
  R(ctx, ox + 3, Y(7), 10, 1, P.rim);
  R(ctx, ox + 3, Y(7), 1, 4, P.highlight);
  // sunk head
  R(ctx, ox + 7, Y(3), 6, 5, P.base);
  R(ctx, ox + 7, Y(3), 6, 1, P.shadow);
  R(ctx, ox + 7, Y(3), 4, 1, P.highlight);
  R(ctx, ox + 8, Y(5), 1, 1, P.outline); // dim eyes
  R(ctx, ox + 11, Y(5), 1, 1, P.outline);
  // arms + mismatched fists (raised on telegraph)
  const fy = tel ? Y(10) : Y(13);
  const uy = tel ? Y(6) : Y(8);
  R(ctx, ox + 1, uy, 3, 6, P.base); // L upper (bigger)
  R(ctx, ox + 0, fy, 4, 4, P.base); // L fist
  R(ctx, ox + 0, fy, 4, 1, P.highlight);
  R(ctx, ox + 16, uy, 3, 5, P.base); // R upper (smaller)
  R(ctx, ox + 16, fy, 4, 3, P.base); // R fist
  R(ctx, ox + 16, fy, 4, 1, P.highlight);
  R(ctx, ox + 0, fy + 3, 4, 1, P.shadow);
  R(ctx, ox + 16, fy + 2, 4, 1, P.shadow);
  if (tel) {
    R(ctx, ox + 2, uy, 1, 6, P.glowEdge); // charging arm seams
    R(ctx, ox + 17, uy, 1, 5, P.glowEdge);
  }
  // chest core (the one emissive feature)
  const gy = Y(10);
  if (tel) {
    R(ctx, ox + 7, gy, 6, 6, P.glowHot); // flare into shoulder cracks
    R(ctx, ox + 8, gy, 4, 5, '#ffbf6a');
    R(ctx, ox + 9, gy + 1, 2, 2, '#ffffff');
  } else {
    R(ctx, ox + 9, gy, 2, 4, P.glowEdge); // crack seam
    R(ctx, ox + 9, gy + 1, 2, 2, P.glowHot);
    if (f === 0) R(ctx, ox + 9, gy + 1, 1, 1, P.glowCore); // white pip (dims on exhale)
    R(ctx, ox + 8, gy + 2, 1, 1, P.glowEdge);
    R(ctx, ox + 11, gy + 2, 1, 1, P.glowEdge);
  }
}

// -------------------------------------------------------- Spit Husk (ranged kiter)
// Lean and tall, hunched around a bulbous glowing acid throat-sac carried high;
// spindly limbs. Cool grey-green so it reads instantly apart from the brute.
const SPIT = {
  outline: '#2b3327',
  shadow: '#3f4d38',
  base: '#556a49',
  highlight: '#6d855c',
  sacShadow: '#0e3d2f',
  sacBody: '#1f9e6b',
  sacBright: '#39e467',
  sacCore: '#b6ffcf',
};
function drawSpit(ctx: Ctx, ox: number, f: number, P: typeof SPIT = SPIT): void {
  const oy = f === 0 ? 0 : f === 1 ? -1 : -2; // telegraph rears the sac up 2px
  const swell = f === 0 ? 0 : f === 1 ? 1 : 2; // sac inhale / bulge
  const tel = f === 2;
  const Y = (v: number) => v + oy;
  R(ctx, ox + 6, 22, 8, 1, P.sacShadow); // ground emissive oval (planted)
  R(ctx, ox + 7, 23, 6, 1, '#13563b');
  // gaunt legs
  R(ctx, ox + 6, Y(17), 3, 5, P.base);
  R(ctx, ox + 11, Y(17), 3, 5, P.base);
  R(ctx, ox + 6, 21, 3, 1, P.shadow);
  R(ctx, ox + 11, 21, 3, 1, P.shadow);
  // narrow torso
  R(ctx, ox + 6, Y(10), 8, 8, P.base);
  R(ctx, ox + 6, Y(15), 8, 2, P.shadow);
  R(ctx, ox + 6, Y(10), 6, 1, P.highlight);
  // spindly arms (kept 1px off the torso)
  R(ctx, ox + 4, Y(11), 2, 6, P.shadow);
  R(ctx, ox + 3, Y(16), 2, 2, P.base);
  R(ctx, ox + 14, Y(11), 2, 5, P.shadow);
  R(ctx, ox + 15, Y(15), 2, 2, P.base);
  // gaunt head high on a thin neck
  R(ctx, ox + 8, Y(4), 4, 4, P.base);
  R(ctx, ox + 8, Y(4), 4, 1, P.shadow);
  R(ctx, ox + 8, Y(6), 1, 1, P.outline);
  R(ctx, ox + 11, Y(6), 1, 1, P.outline);
  R(ctx, ox + 9, Y(8), 2, 2, P.shadow);
  // throat-sac (the one glow), swelling with the frame
  const sx = 6 - swell;
  const sy = Y(7) - swell;
  const sw = 8 + swell * 2;
  const sh = 7 + swell * 2;
  R(ctx, ox + sx, sy, sw, sh, P.sacShadow); // seat ring = its own outline
  R(ctx, ox + sx + 1, sy + 1, sw - 2, sh - 2, P.sacBody);
  R(ctx, ox + sx + 2, sy + 2, sw - 4, sh - 4, tel ? '#7dff9f' : P.sacBright);
  if (f !== 1) {
    R(ctx, ox + 9, Y(9), 2, 2, P.sacCore);
    R(ctx, ox + 10, Y(9), 1, 1, tel ? '#ffffff' : P.sacCore);
  }
  // corrosion drips
  R(ctx, ox + 9, Y(13), 1, 2, P.sacBright);
  R(ctx, ox + 10, Y(15), 1, 1, P.sacBody);
  if (tel) R(ctx, ox + 9, Y(14), 1, 1, P.sacBright);
  // rim light
  R(ctx, ox + 6, Y(4), 1, 4, P.highlight);
  R(ctx, ox + 6, Y(10), 1, 3, P.highlight);
}

// -------------------------------------------------------- Deep Guardian (boss)
// A massive crowned obsidian-violet colossus: horns over a blazing recessed
// core-eye, a branching molten vein network — a scaled-up, cursed husk.
const BOSS = {
  outline: '#0d0a14',
  shadow: '#1a1426',
  base: '#2a1f3d',
  highlight: '#3d2d59',
  rim: '#5a3f82',
  crackRoot: '#4a0d1f',
  crackMid: '#c2381a',
  crackHot: '#ff7a2a',
  crackWhite: '#ffe08a',
  coreCenter: '#ffd24a',
  coreBloom: '#ff8a2a',
  corona: '#7e1dfb',
};
function drawBoss(ctx: Ctx, ox: number, f: number, P: typeof BOSS = BOSS): void {
  const oy = f === 0 ? 0 : f === 1 ? -1 : -3; // telegraph rears the whole colossus
  const tel = f === 2;
  const aL = tel ? 3 : 0; // arms/shoulders lift extra on the wind-up
  const Y = (v: number) => v + oy;
  R(ctx, ox + 8, 46, 30, 3, P.outline); // ground shadow (planted)
  R(ctx, ox + 10, 48, 26, 1, '#080610');
  // stubby legs
  R(ctx, ox + 9, Y(36), 12, 10, P.base);
  R(ctx, ox + 25, Y(36), 12, 10, P.base);
  R(ctx, ox + 8, 44, 14, 2, P.shadow);
  R(ctx, ox + 24, 44, 14, 2, P.shadow);
  R(ctx, ox + 9, Y(36), 12, 1, P.highlight);
  R(ctx, ox + 25, Y(36), 12, 1, P.highlight);
  // heavy trapezoid torso
  R(ctx, ox + 6, Y(14), 34, 24, P.base);
  R(ctx, ox + 6, Y(30), 34, 6, P.shadow);
  R(ctx, ox + 8, Y(14), 30, 1, P.highlight);
  R(ctx, ox + 10, Y(16), 10, 8, P.highlight);
  R(ctx, ox + 6, Y(14), 2, 2, P.outline);
  R(ctx, ox + 38, Y(14), 2, 2, P.outline);
  // knuckle-dragging arms + fists
  R(ctx, ox + 2, Y(16) - aL, 6, 14, P.base);
  R(ctx, ox + 0, Y(28) - aL, 8, 8, P.base);
  R(ctx, ox + 0, Y(28) - aL, 8, 1, P.highlight);
  R(ctx, ox + 38, Y(16) - aL, 6, 13, P.base);
  R(ctx, ox + 38, Y(27) - aL, 8, 8, P.base);
  R(ctx, ox + 38, Y(27) - aL, 8, 1, P.highlight);
  R(ctx, ox + 0, Y(35) - aL, 8, 1, P.shadow);
  R(ctx, ox + 38, Y(34) - aL, 8, 1, P.shadow);
  // head + shadowed brow socket
  R(ctx, ox + 15, Y(6), 16, 12, P.base);
  R(ctx, ox + 17, Y(10), 12, 5, P.shadow);
  // forward horns over the brow
  R(ctx, ox + 13, Y(7), 3, 3, P.base);
  R(ctx, ox + 11, Y(9), 3, 3, P.base);
  R(ctx, ox + 10, Y(11), 2, 3, P.shadow);
  R(ctx, ox + 30, Y(7), 3, 3, P.base);
  R(ctx, ox + 33, Y(9), 3, 3, P.base);
  R(ctx, ox + 35, Y(11), 2, 3, P.shadow);
  // asymmetric crown shards
  R(ctx, ox + 17, Y(0), 3, 6, P.base);
  R(ctx, ox + 17, Y(0), 3, 1, P.rim);
  R(ctx, ox + 21, Y(2), 3, 4, P.shadow);
  R(ctx, ox + 25, Math.max(0, Y(0)), 3, 7, P.base);
  R(ctx, ox + 25, Math.max(0, Y(0)), 3, 1, P.rim);
  R(ctx, ox + 29, Y(3), 2, 3, P.shadow);
  R(ctx, ox + 14, Y(3), 2, 3, P.shadow);
  // rim light (violet, top-left)
  R(ctx, ox + 6, Y(14), 1, 10, P.rim);
  R(ctx, ox + 15, Y(6), 1, 6, P.rim);
  R(ctx, ox + 10, Y(16), 1, 1, P.rim);
  // molten vein network (branching, feeding the brow)
  const ch = tel ? P.crackWhite : P.crackHot;
  const cm = tel ? P.crackHot : P.crackMid;
  R(ctx, ox + 22, Y(18), 2, 14, cm); // trunk
  R(ctx, ox + 16, Y(24), 6, 1, cm);
  R(ctx, ox + 16, Y(24), 3, 1, ch);
  R(ctx, ox + 24, Y(28), 7, 1, cm);
  R(ctx, ox + 28, Y(28), 3, 1, ch);
  R(ctx, ox + 22, Y(32), 2, 2, P.crackRoot);
  R(ctx, ox + 22, Y(20), 1, 10, ch);
  R(ctx, ox + 22, Y(22), 1, 4, tel ? '#ffffff' : P.crackWhite);
  R(ctx, ox + 12, Y(10), 1, 3, cm);
  R(ctx, ox + 34, Y(10), 1, 3, cm);
  if (tel) {
    R(ctx, ox + 18, Y(2), 1, 4, P.crackHot); // seams flood the crown
    R(ctx, ox + 27, Y(1), 1, 4, P.crackHot);
  }
  // blazing core-eye in the brow socket (the dominant glow)
  const cs = tel ? 2 : 0;
  R(ctx, ox + 20 - cs, Y(10) - cs, 7 + cs * 2, 5 + cs * 2, P.corona);
  R(ctx, ox + 21 - cs, Y(11) - cs, 5 + cs * 2, 3 + cs * 2, P.coreBloom);
  if (f !== 1) {
    R(ctx, ox + 22, Y(11), 3, 2, tel ? '#ffffff' : P.coreCenter);
    R(ctx, ox + 23, Y(12), 1, 1, P.crackWhite);
  }
}

// -------------------------------------------------------- the Deep: molten reskins
// Same silhouettes/geometry (drawGrasp/drawSpit/drawBoss), swapped to a molten
// cinder-and-basalt palette so they read instantly as the Deep's harder kin
// (ADR-0011): charred rock bodies, hotter orange cores, no violet.
const CINDER: typeof GRASP = {
  outline: '#1a0f0a',
  shadow: '#3a201a',
  base: '#5a2f22', // molten-rock red-brown
  highlight: '#7a4030',
  rim: '#a85a3a',
  moss: '#8a3a20', // charred crust on the top faces
  glowCore: '#ffe08a',
  glowHot: '#ff8c2a',
  glowEdge: '#ff4a12',
};
const EMBER: typeof SPIT = {
  outline: '#241410',
  shadow: '#3a2018',
  base: '#4a2a22',
  highlight: '#6a3a2a',
  sacShadow: '#5a1a08',
  sacBody: '#e0561f', // a blazing ember throat-sac instead of acid
  sacBright: '#ff9a4d',
  sacCore: '#ffe0a0',
};
const FORGEBORN: typeof BOSS = {
  outline: '#0a0806',
  shadow: '#1c130e',
  base: '#2e1d14', // dark basalt-brown colossus
  highlight: '#45291b',
  rim: '#7a4a2a',
  crackRoot: '#5a1405',
  crackMid: '#e0431a',
  crackHot: '#ff8c2a',
  crackWhite: '#ffe0a0',
  coreCenter: '#fff0c0',
  coreBloom: '#ff8c2a',
  corona: '#ff5a1e', // molten-orange corona, not violet
};

// -------------------------------------------------------- open-world Wildlife
// A single side-view quadruped (drawBeast), reskinned per kind by a palette + one
// distinguishing feature (antlers / tusks / spots) — the SAME reskin discipline as
// the Deep's Husks. Peaceful kinds read soft and round with dark calm eyes;
// predators sit lower and leaner with a hot eye-glint. 3-frame sheet: f0 idle, f1
// idle-heave (mass lifts 1px, legs swing, tail flicks), f2 the alert/telegraph pose.
interface BeastSpec {
  outline: string;
  shadow: string;
  base: string;
  highlight: string;
  belly: string;
  feature: 'antler' | 'tusk' | 'spots' | 'plain';
  featureColor: string;
  eye: string;
  predator: boolean;
}

function drawBeast(ctx: Ctx, ox: number, f: number, S: BeastSpec): void {
  const oy = f === 1 ? -1 : 0; // idle heave lifts the whole mass 1px (feet stay)
  const alert = f === 2; // telegraph / alert pose
  const Y = (v: number) => v + oy;
  const gait = f === 1 ? 1 : 0; // a small leg swing on the heave frame

  R(ctx, ox + 4, 16, 15, 2, S.outline); // ground shadow (planted)

  // legs — front + hind pair; a predator crouches low on the alert frame
  const legTop = Y(alert && S.predator ? 13 : 12);
  for (const lx of [5 + gait, 8 + gait, 14 - gait, 17 - gait]) {
    R(ctx, ox + lx, legTop, 2, 16 - legTop, S.shadow);
    R(ctx, ox + lx, 15, 2, 1, S.outline);
  }

  // tail stub (flicks up on the heave)
  R(ctx, ox + 2, Y(8) + (f === 1 ? 1 : 0), 2, 4, S.base);
  R(ctx, ox + 2, Y(8), 2, 1, S.outline);

  // body mass
  const bodyTop = Y(alert && S.predator ? 8 : 6);
  const bodyBot = Y(13);
  R(ctx, ox + 3, bodyTop, 15, bodyBot - bodyTop, S.base);
  R(ctx, ox + 3, bodyTop, 15, 1, S.outline);
  R(ctx, ox + 4, bodyTop + 1, 13, 1, S.highlight);
  R(ctx, ox + 3, bodyBot - 2, 15, 2, S.belly);
  R(ctx, ox + 3, bodyTop, 1, bodyBot - bodyTop, S.shadow); // rump edge
  if (S.feature === 'spots') {
    for (const [sx, sy] of [[6, 8], [10, 9], [13, 7], [9, 11], [15, 10]] as [number, number][]) {
      R(ctx, ox + sx, Y(sy), 2, 2, S.featureColor);
      R(ctx, ox + sx + 1, Y(sy), 1, 1, S.base);
    }
  }

  // neck + head to the right (renderer flips the whole sprite for facing)
  const headTop = Y(alert ? (S.predator ? 8 : 3) : 5);
  R(ctx, ox + 15, Y(alert && !S.predator ? 6 : 8), 4, 5, S.base); // neck
  R(ctx, ox + 17, headTop, 6, 6, S.base); // head
  R(ctx, ox + 17, headTop, 6, 1, S.highlight);
  R(ctx, ox + 22, headTop + 2, 2, 3, S.base); // snout
  R(ctx, ox + 22, headTop + 4, 2, 1, S.shadow);
  R(ctx, ox + 20, headTop + 2, 1, 1, S.eye);
  if (S.predator && alert) R(ctx, ox + 20, headTop + 1, 1, 1, '#ffffff'); // glint

  if (S.feature === 'antler') {
    R(ctx, ox + 17, headTop - 3, 1, 3, S.featureColor);
    R(ctx, ox + 16, headTop - 4, 1, 2, S.featureColor);
    R(ctx, ox + 20, headTop - 4, 1, 4, S.featureColor);
    R(ctx, ox + 21, headTop - 5, 1, 2, S.featureColor);
    R(ctx, ox + 19, headTop - 2, 1, 1, S.featureColor);
  } else if (S.feature === 'tusk') {
    R(ctx, ox + 21, headTop + 5, 2, 1, S.featureColor); // tusk from the snout
    R(ctx, ox + 22, headTop + 4, 1, 1, S.featureColor);
    R(ctx, ox + 17, headTop - 2, 2, 2, S.base); // bristly ear
    R(ctx, ox + 17, headTop - 2, 1, 1, S.outline);
  } else {
    R(ctx, ox + 17, headTop - 2, 2, 2, alert ? S.highlight : S.base); // ears
    R(ctx, ox + 20, headTop - 2, 2, 2, alert ? S.highlight : S.base);
    R(ctx, ox + 17, headTop - 2, 1, 1, S.outline);
  }
}

const CAPYBARA: BeastSpec = {
  outline: '#2a1c12', shadow: '#4a3323', base: '#7a5638', highlight: '#9a7350', belly: '#5a3d28',
  feature: 'plain', featureColor: '#9a7350', eye: '#1a120a', predator: false,
};
const DEER: BeastSpec = {
  outline: '#33251a', shadow: '#5a4230', base: '#9a7a52', highlight: '#c0a074', belly: '#cbb48c',
  feature: 'antler', featureColor: '#e0cfa8', eye: '#1a120a', predator: false,
};
const BOAR: BeastSpec = {
  outline: '#1a140f', shadow: '#33261c', base: '#4a3a2c', highlight: '#63503c', belly: '#3a2c20',
  feature: 'tusk', featureColor: '#eadfc4', eye: '#ff7a2a', predator: true,
};
const JAGUAR: BeastSpec = {
  outline: '#2a1c08', shadow: '#7a5a20', base: '#c99a3e', highlight: '#e6c060', belly: '#e8dcc0',
  feature: 'spots', featureColor: '#2a1c08', eye: '#ffd24a', predator: true,
};

const DRAW: Record<MobKind, (ctx: Ctx, ox: number, f: number) => void> = {
  grasp: drawGrasp,
  spit: drawSpit,
  boss: drawBoss,
  cinder: (c, ox, f) => drawGrasp(c, ox, f, CINDER),
  ember: (c, ox, f) => drawSpit(c, ox, f, EMBER),
  forgeborn: (c, ox, f) => drawBoss(c, ox, f, FORGEBORN),
  capybara: (c, ox, f) => drawBeast(c, ox, f, CAPYBARA),
  deer: (c, ox, f) => drawBeast(c, ox, f, DEER),
  boar: (c, ox, f) => drawBeast(c, ox, f, BOAR),
  jaguar: (c, ox, f) => drawBeast(c, ox, f, JAGUAR),
};

/** draw one mob frame at an x-offset — exported so it can be rasterized/previewed
 *  outside the browser (the functions only touch fillStyle + fillRect). */
export function drawMobFrame(ctx: Ctx, kind: MobKind, ox: number, frame: number): void {
  DRAW[kind](ctx, ox, frame);
}

/**
 * Build the three mob textures (3-frame sheets) + their idle animations. Global
 * (game-level) textures/anims, so calling this once in BootScene makes them
 * available to GameScene. Idempotent.
 */
export function ensureMobTextures(scene: Phaser.Scene): void {
  (Object.keys(MOB_TEX) as MobKind[]).forEach((kind) => {
    const key = MOB_TEX[kind];
    const { w, h } = MOB_FRAME[kind];
    if (!scene.textures.exists(key)) {
      const canvas = document.createElement('canvas');
      canvas.width = w * 3;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      for (let f = 0; f < 3; f++) DRAW[kind](ctx, f * w, f);
      const tex = scene.textures.addCanvas(key, canvas)!;
      for (let f = 0; f < 3; f++) tex.add(f, 0, f * w, 0, w, h);
    }
    const animKey = `${key}-idle`;
    if (!scene.anims.exists(animKey)) {
      scene.anims.create({
        key: animKey,
        frames: scene.anims.generateFrameNumbers(key, { start: 0, end: 1 }),
        frameRate: 2.5,
        repeat: -1,
      });
    }
  });
}

// -------------------------------------------------------- Delve projectiles
// The ranged Husks' spat shots (ADR-0007 / ADR-0011) — NOT a generic ball. Stage
// 1's Spit Husk hurls a corrosive ACID glob (its green throat-sac bile, dripping);
// Stage 2's Ember Husk / Forgeborn spit a molten CINDER (a jagged white-hot core
// that sparks). Each is a 3-frame flicker LOOP in the mob's own throat-sac
// palette, drawn the same fillRect→texture way as the sprites. Deliberately RADIAL
// / direction-agnostic: a peer renders these from host snapshots that carry
// position only (no velocity), so a comet-tail that points a fixed way is out —
// the drips/sparks/core hop between frames to sell motion regardless of heading.
export type ProjTheme = 'acid' | 'ember';

export const PROJ_TEX: Record<ProjTheme, string> = {
  acid: 'delve-proj-acid',
  ember: 'delve-proj-ember',
};

/** additive-glow tint + alpha per theme (halo scale is derived from the radius) */
export const PROJ_GLOW: Record<ProjTheme, { color: number; alpha: number; scale: number }> = {
  acid: { color: 0x39e467, alpha: 0.42, scale: 0.65 }, // sacBright green
  ember: { color: 0xff8c2a, alpha: 0.5, scale: 0.7 }, // molten crackHot orange
};

/** which Delve Stage fires which projectile theme (Stage 1 acid, the Deep molten) */
export function projTheme(stage: 1 | 2): ProjTheme {
  return stage === 1 ? 'acid' : 'ember';
}

const PROJ_LEGEND: Record<ProjTheme, Record<string, string>> = {
  acid: { o: '#0e3d2f', d: '#13563b', b: '#1f9e6b', B: '#39e467', c: '#b6ffcf' },
  ember: { o: '#5a1a08', d: '#c43a12', e: '#e0561f', E: '#ff9a4d', c: '#ffe0a0', w: '#ffffff' },
};

// 3-frame 12×12 sheets; the drips (acid) / sparks + notched crown (ember) shift
// each frame so the loop shimmers and never reads as a static dot.
const PROJ_FRAMES: Record<ProjTheme, string[][]> = {
  acid: [
    [
      '............',
      '....oo......',
      '...odbbdo...',
      '..odbBBbo...',
      '..obBccBdo..',
      '.odBcccBbo..',
      '..obBccBbdo.',
      '..odbBBbbo..',
      '...obbbdo...',
      '....odbo....',
      '.....bo.....',
      '......d.....',
    ],
    [
      '............',
      '....oo......',
      '...obbbo....',
      '..odBBBbdo..',
      '.odBccccBo..',
      '.obBccccBbo.',
      '..obBccBbo..',
      '...obBBbdo..',
      '...oddbo....',
      '....obo.....',
      '............',
      '......b.....',
    ],
    [
      '............',
      '.....oo.....',
      '...odbbdo...',
      '..obbBBdo...',
      '..odBccBbo..',
      '.obBcccBbdo.',
      '..odBccBbo..',
      '..obbBBbo...',
      '...obbdo....',
      '....odo.....',
      '....b.......',
      '.....b......',
    ],
  ],
  ember: [
    [
      '............',
      '....o.o.....',
      '...oeEeeo...',
      '..odEcwEeo..',
      '.oeEcwwcEo..',
      '..oEcwwwEe..',
      '.oedEwwEeo..',
      '..oeEEEeeo..',
      '...oeeeo....',
      '..e..o..e...',
      '.....e......',
      '............',
    ],
    [
      '............',
      '...o.oe.....',
      '..oeEEeeo...',
      '..oeEwwEeo..',
      '.oedcwwwcEo.',
      '.oEcwwwwcEo.',
      '..oeEwwwEo..',
      '...oeEEEeo..',
      '..o.oeeo.e..',
      '....e.o.....',
      '...e....e...',
      '............',
    ],
    [
      '............',
      '....oeo.....',
      '...oeEeeo...',
      '..oeEcwwEo..',
      '.oedEwwwEe..',
      '..oEcwwwcEo.',
      '.oeEwwcEeo..',
      '..odeEEeeo..',
      '...oeeed....',
      '..e..o..e...',
      '......e.....',
      '....e.......',
    ],
  ],
};

function drawProjFrame(ctx: Ctx, ox: number, rows: string[], map: Record<string, string>): void {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const col = map[row[x]];
      if (col) R(ctx, ox + x, y, 1, 1, col);
    }
  }
}

/**
 * Build the two Delve projectile textures (3-frame 12×12 sheets) + their looping
 * "fly" animations. Global textures/anims like ensureMobTextures — call once in
 * BootScene. Idempotent.
 */
export function ensureProjectileTextures(scene: Phaser.Scene): void {
  (Object.keys(PROJ_TEX) as ProjTheme[]).forEach((theme) => {
    const key = PROJ_TEX[theme];
    const frames = PROJ_FRAMES[theme];
    const map = PROJ_LEGEND[theme];
    const W = 12;
    const H = 12;
    if (!scene.textures.exists(key)) {
      const canvas = document.createElement('canvas');
      canvas.width = W * frames.length;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;
      frames.forEach((rows, f) => drawProjFrame(ctx, f * W, rows, map));
      const tex = scene.textures.addCanvas(key, canvas)!;
      frames.forEach((_, f) => tex.add(f, 0, f * W, 0, W, H));
    }
    const animKey = `${key}-fly`;
    if (!scene.anims.exists(animKey)) {
      scene.anims.create({
        key: animKey,
        frames: scene.anims.generateFrameNumbers(key, { start: 0, end: frames.length - 1 }),
        frameRate: 7,
        repeat: -1,
      });
    }
  });
}
