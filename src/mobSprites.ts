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
  // the Depth boss kits (ADR-0016) — five variant silhouettes, each shaped so its
  // mechanic reads from the doorway; drawn in the neutral obsidian-violet palette
  // (the per-Depth tint re-dresses them exactly like the recycled bosses)
  ram: 'boss-ram',
  warden: 'boss-warden',
  whirl: 'boss-whirl',
  bulwark: 'boss-bulwark',
  brood: 'boss-brood',
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
  ram: { w: 52, h: 44 },
  warden: { w: 40, h: 56 },
  whirl: { w: 54, h: 44 },
  bulwark: { w: 48, h: 50 },
  brood: { w: 46, h: 54 },
  // Wildlife: per-species side-profile sheets sized to their true silhouette
  // (capybara from "Naturalist"; deer/boar/jaguar from "Detailed Large-Frame").
  capybara: { w: 26, h: 18 },
  deer: { w: 34, h: 26 },
  boar: { w: 30, h: 20 },
  jaguar: { w: 34, h: 22 },
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

// ------------------------------------------ the Depth boss kits (ADR-0016)
// Five variant silhouettes, one per kit, each shaped so the mechanic reads at a
// glance and each with the house one-emissive-feature. All wear the neutral
// obsidian-violet BOSS palette — the per-Depth HSL tint re-dresses them in game.

// the Ram — all forward mass: a flat anvil skull-plate across the shoulders,
// huge planted knuckle columns. Telegraph: the plate drops low (head down,
// haunches up) and its seams flood white — a charge is coming.
function drawRam(ctx: Ctx, ox: number, f: number, P: typeof BOSS = BOSS): void {
  const oy = f === 0 ? 0 : f === 1 ? -1 : -3;
  const tel = f === 2;
  const Y = (v: number) => v + oy;
  R(ctx, ox + 8, 41, 36, 3, P.outline); // ground shadow (planted)
  R(ctx, ox + 10, 43, 32, 1, '#080610');
  // planted knuckle columns
  R(ctx, ox + 2, Y(16), 8, 18, P.base);
  R(ctx, ox + 0, Y(32), 12, 7, P.base);
  R(ctx, ox + 0, Y(32), 12, 1, P.highlight);
  R(ctx, ox + 42, Y(16), 8, 18, P.base);
  R(ctx, ox + 40, Y(32), 12, 7, P.base);
  R(ctx, ox + 40, Y(32), 12, 1, P.highlight);
  R(ctx, ox + 1, 40, 10, 2, P.shadow);
  R(ctx, ox + 41, 40, 10, 2, P.shadow);
  // wedge torso — broad shoulders narrowing to hips
  R(ctx, ox + 10, Y(8), 32, 16, P.base);
  R(ctx, ox + 10, Y(20), 32, 4, P.shadow);
  R(ctx, ox + 12, Y(8), 28, 1, P.highlight);
  R(ctx, ox + 10, Y(8), 1, 10, P.rim);
  R(ctx, ox + 15, Y(24), 22, 9, P.base);
  R(ctx, ox + 15, Y(30), 22, 3, P.shadow);
  R(ctx, ox + 17, Y(33), 7, 6, P.base);
  R(ctx, ox + 28, Y(33), 7, 6, P.base);
  // the RAM PLATE — drops low on the telegraph
  const py = Math.max(0, tel ? Y(9) : Y(0));
  R(ctx, ox + 8, py, 36, 9, P.base);
  R(ctx, ox + 8, py, 36, 1, P.rim);
  R(ctx, ox + 8, py, 2, 2, P.outline);
  R(ctx, ox + 42, py, 2, 2, P.outline);
  R(ctx, ox + 12, py + 9, 28, 3, P.shadow); // chin shade
  R(ctx, ox + 15, py + 10, 2, 1, P.outline); // dim eyes under the plate
  R(ctx, ox + 35, py + 10, 2, 1, P.outline);
  // emissive plate seams (the one glowing feature)
  R(ctx, ox + 16, py + 2, 2, 6, tel ? P.crackHot : P.crackMid);
  R(ctx, ox + 34, py + 2, 2, 6, tel ? P.crackHot : P.crackMid);
  R(ctx, ox + 25, py + 1, 2, 7, tel ? '#ffffff' : P.crackHot);
  R(ctx, ox + 25, py + 3, 2, 2, tel ? '#ffffff' : P.crackWhite);
  if (tel) {
    R(ctx, ox + 10, py + 8, 32, 1, P.crackHot); // bloom under the lowered plate
    R(ctx, ox + 8, py + 4, 1, 3, P.corona);
    R(ctx, ox + 43, py + 4, 1, 3, P.corona);
  }
}

// the Warden — a hovering legless monolith (gap above its shadow), a hooded eye
// slit, two detached hand shards, and three orbiting orbs that snap into an
// aligned blazing arc on the telegraph — the volley is coming.
function drawWarden(ctx: Ctx, ox: number, f: number, P: typeof BOSS = BOSS): void {
  const oy = f === 0 ? 0 : f === 1 ? -2 : -4; // floats — a bigger bob
  const tel = f === 2;
  const Y = (v: number) => v + oy;
  R(ctx, ox + 12, 52, 16, 2, P.outline); // hover shadow, gap below the taper
  // tapering monolith body
  R(ctx, ox + 11, Y(14), 18, 6, P.base);
  R(ctx, ox + 13, Y(14), 14, 1, P.highlight);
  R(ctx, ox + 11, Y(14), 1, 6, P.rim);
  R(ctx, ox + 13, Y(20), 14, 18, P.base);
  R(ctx, ox + 13, Y(34), 14, 4, P.shadow);
  R(ctx, ox + 15, Y(38), 10, 5, P.base);
  R(ctx, ox + 17, Y(43), 6, 4, P.shadow);
  // hooded head + the eye slit (emissive)
  R(ctx, ox + 14, Y(6), 12, 9, P.base);
  R(ctx, ox + 16, Y(4), 8, 3, P.base);
  R(ctx, ox + 14, Y(6), 12, 1, P.rim);
  R(ctx, ox + 16, Y(10), 8, 4, P.shadow);
  R(ctx, ox + 17, Y(11), 6, 2, tel ? '#ffffff' : P.coreCenter);
  R(ctx, ox + 19, Y(11), 2, 2, P.crackWhite);
  // detached hand shards (raised on the telegraph)
  const hy = tel ? Y(16) : Y(24);
  R(ctx, ox + 3, hy, 5, 7, P.base);
  R(ctx, ox + 3, hy, 5, 1, P.highlight);
  R(ctx, ox + 3, hy + 6, 5, 1, P.shadow);
  R(ctx, ox + 32, hy, 5, 7, P.base);
  R(ctx, ox + 32, hy, 5, 1, P.highlight);
  R(ctx, ox + 32, hy + 6, 5, 1, P.shadow);
  // rune vein down the torso
  R(ctx, ox + 19, Y(22), 2, 12, tel ? P.crackHot : P.crackMid);
  R(ctx, ox + 19, Y(26), 2, 4, tel ? P.crackWhite : P.crackHot);
  // the three orbs — loose in idle, an aligned blazing arc on the telegraph
  const orbs: [number, number][] = f === 0 ? [[5, 28], [33, 18], [9, 7]] : f === 1 ? [[6, 26], [32, 20], [10, 6]] : [[7, 2], [18, 1], [29, 2]];
  for (const [x, y] of orbs) {
    if (tel) {
      R(ctx, ox + x - 1, y - 1, 5, 5, P.corona);
      R(ctx, ox + x, y, 3, 3, P.coreBloom);
      R(ctx, ox + x + 1, y + 1, 1, 1, '#ffffff');
    } else {
      R(ctx, ox + x, y, 3, 3, P.coreBloom);
      R(ctx, ox + x + 1, y + 1, 1, 1, P.coreCenter);
    }
  }
}

// the Whirlwind — a compact core with two long scythe arms held straight out
// (edge glow underneath) and a wrap-around eye band; the telegraph TUCKS the
// blades against the body, edges blazing, a spin ring charging under its feet.
function drawWhirl(ctx: Ctx, ox: number, f: number, P: typeof BOSS = BOSS): void {
  const oy = f === 0 ? 0 : f === 1 ? -1 : -2;
  const tel = f === 2;
  const Y = (v: number) => v + oy;
  R(ctx, ox + 11, 41, 32, 3, P.outline);
  // wide braced legs
  R(ctx, ox + 16, Y(32), 7, 8, P.base);
  R(ctx, ox + 31, Y(32), 7, 8, P.base);
  R(ctx, ox + 15, 40, 9, 2, P.shadow);
  R(ctx, ox + 30, 40, 9, 2, P.shadow);
  // compact core body
  R(ctx, ox + 19, Y(13), 16, 20, P.base);
  R(ctx, ox + 19, Y(28), 16, 5, P.shadow);
  R(ctx, ox + 21, Y(13), 12, 1, P.highlight);
  R(ctx, ox + 19, Y(13), 1, 8, P.rim);
  // low head dome + the wrap-around eye band (it sees while it spins)
  R(ctx, ox + 22, Y(8), 10, 6, P.base);
  R(ctx, ox + 22, Y(8), 10, 1, P.rim);
  R(ctx, ox + 23, Y(11), 8, 2, tel ? '#ffffff' : P.coreCenter);
  R(ctx, ox + 24, Y(11), 1, 2, P.crackWhite);
  R(ctx, ox + 29, Y(11), 1, 2, P.crackWhite);
  if (!tel) {
    // blades out wide — shoulder roots, long flats, glowing under-edges
    R(ctx, ox + 13, Y(16), 6, 6, P.base);
    R(ctx, ox + 35, Y(16), 6, 6, P.base);
    R(ctx, ox + 1, Y(17), 13, 5, P.base);
    R(ctx, ox + 0, Y(18), 3, 3, P.base);
    R(ctx, ox + 1, Y(17), 13, 1, P.highlight);
    R(ctx, ox + 1, Y(21), 13, 1, P.crackHot);
    R(ctx, ox + 40, Y(17), 13, 5, P.base);
    R(ctx, ox + 51, Y(18), 3, 3, P.base);
    R(ctx, ox + 40, Y(17), 13, 1, P.highlight);
    R(ctx, ox + 40, Y(21), 13, 1, P.crackHot);
    // low counterweight blades
    R(ctx, ox + 9, Y(26), 9, 3, P.shadow);
    R(ctx, ox + 36, Y(26), 9, 3, P.shadow);
  } else {
    // tucked tight against the body, edges blazing — the spin is wound up
    R(ctx, ox + 12, Y(14), 8, 15, P.base);
    R(ctx, ox + 34, Y(14), 8, 15, P.base);
    R(ctx, ox + 12, Y(14), 8, 1, P.highlight);
    R(ctx, ox + 34, Y(14), 8, 1, P.highlight);
    R(ctx, ox + 19, Y(15), 1, 13, '#ffffff');
    R(ctx, ox + 34, Y(15), 1, 13, '#ffffff');
    R(ctx, ox + 12, Y(28), 8, 1, P.crackHot);
    R(ctx, ox + 34, Y(28), 8, 1, P.crackHot);
    R(ctx, ox + 9, 40, 36, 1, P.corona); // the spin ring charging underfoot
  }
}

// the Bulwark — two-thirds hidden behind a rune-carved tower slab (the runes ARE
// the guard: lit while hits bounce); one wary eye over the rim. Telegraph: the
// slab lifts high for the counter-slam, corona charging beneath it.
function drawBulwark(ctx: Ctx, ox: number, f: number, P: typeof BOSS = BOSS): void {
  const oy = f === 0 ? 0 : f === 1 ? -1 : -3;
  const tel = f === 2;
  const sl = tel ? -5 : 0; // the shield lifts on the telegraph
  const Y = (v: number) => v + oy;
  R(ctx, ox + 6, 46, 36, 3, P.outline);
  // body behind the slab
  R(ctx, ox + 27, Y(36), 6, 8, P.base);
  R(ctx, ox + 35, Y(36), 6, 8, P.base);
  R(ctx, ox + 26, 44, 8, 2, P.shadow);
  R(ctx, ox + 34, 44, 8, 2, P.shadow);
  R(ctx, ox + 24, Y(14), 16, 22, P.base);
  R(ctx, ox + 24, Y(31), 16, 5, P.shadow);
  R(ctx, ox + 26, Y(14), 14, 1, P.highlight);
  // head peeking over the rim — one wary emissive eye
  R(ctx, ox + 27, Y(6), 11, 9, P.base);
  R(ctx, ox + 27, Y(6), 11, 1, P.rim);
  R(ctx, ox + 29, Y(9), 7, 4, P.shadow);
  R(ctx, ox + 30, Y(10), 4, 2, tel ? '#ffffff' : P.coreCenter);
  // gripping arm over the shield rim
  R(ctx, ox + 22, Y(18) + sl, 5, 4, P.base);
  // THE SHIELD — a tower slab, most of the silhouette
  const sy = Y(8) + sl;
  R(ctx, ox + 4, sy, 20, 38, P.base);
  R(ctx, ox + 4, sy, 20, 2, P.rim);
  R(ctx, ox + 4, sy, 2, 38, P.highlight);
  R(ctx, ox + 22, sy, 2, 38, P.shadow);
  R(ctx, ox + 4, sy + 36, 20, 2, P.outline);
  R(ctx, ox + 4, sy, 2, 2, P.outline);
  R(ctx, ox + 22, sy, 2, 2, P.outline);
  // the carved WARD RUNES — lit while the guard holds, white at the slam
  const rc = tel ? '#ffffff' : P.crackHot;
  const rd = tel ? P.crackWhite : P.crackMid;
  R(ctx, ox + 12, sy + 5, 4, 2, rc);
  R(ctx, ox + 13, sy + 7, 2, 3, rd);
  R(ctx, ox + 8, sy + 13, 2, 5, rd);
  R(ctx, ox + 10, sy + 15, 4, 2, rc);
  R(ctx, ox + 15, sy + 21, 2, 6, rd);
  R(ctx, ox + 13, sy + 24, 2, 2, rc);
  R(ctx, ox + 9, sy + 30, 7, 2, rd);
  R(ctx, ox + 11, sy + 30, 3, 2, rc);
  if (tel) R(ctx, ox + 4, 44, 20, 1, P.corona); // the slam charging under the lifted slab
}

// the Broodmother — rooted on a trunk skirt: a hollow rib-cage torso with the
// BROOD glowing between the bars (the emissive feature), thin hanging arms, an
// antler-totem crown. Telegraph: the cage floods white and extra brood appear —
// the birth is coming.
function drawBrood(ctx: Ctx, ox: number, f: number, P: typeof BOSS = BOSS): void {
  const oy = f === 0 ? 0 : f === 1 ? -1 : -3;
  const tel = f === 2;
  const Y = (v: number) => v + oy;
  R(ctx, ox + 10, 51, 26, 3, P.outline);
  // rooted trunk base — she never walks
  R(ctx, ox + 15, Y(39), 16, 8, P.base);
  R(ctx, ox + 17, Y(47), 12, 3, P.shadow);
  R(ctx, ox + 12, Y(45), 4, 4, P.shadow);
  R(ctx, ox + 30, Y(45), 4, 4, P.shadow);
  // the cage torso — hollow, three rib bars
  R(ctx, ox + 12, Y(17), 22, 22, P.base);
  R(ctx, ox + 15, Y(20), 16, 16, P.outline);
  R(ctx, ox + 17, Y(20), 2, 16, P.base);
  R(ctx, ox + 22, Y(20), 2, 16, P.base);
  R(ctx, ox + 27, Y(20), 2, 16, P.base);
  R(ctx, ox + 14, Y(17), 18, 1, P.highlight);
  R(ctx, ox + 12, Y(17), 1, 10, P.rim);
  R(ctx, ox + 12, Y(36), 22, 3, P.shadow);
  // the BROOD between the bars
  const e1 = tel ? '#ffffff' : P.coreBloom;
  const e2 = tel ? P.crackWhite : P.crackMid;
  R(ctx, ox + 19, Y(24), 3, 4, e1);
  R(ctx, ox + 20, Y(25), 1, 2, tel ? '#ffffff' : P.coreCenter);
  R(ctx, ox + 24, Y(29), 3, 4, e2);
  R(ctx, ox + 25, Y(30), 1, 1, P.coreCenter);
  R(ctx, ox + 15, Y(22), 2, 3, e2);
  if (tel) {
    R(ctx, ox + 29, Y(23), 2, 3, e1);
    R(ctx, ox + 24, Y(20), 3, 3, e2);
  }
  // thin hanging arms
  R(ctx, ox + 8, Y(19), 4, 3, P.base);
  R(ctx, ox + 7, Y(22), 3, 10, P.base);
  R(ctx, ox + 7, Y(31), 3, 2, P.shadow);
  R(ctx, ox + 34, Y(19), 4, 3, P.base);
  R(ctx, ox + 36, Y(22), 3, 10, P.base);
  R(ctx, ox + 36, Y(31), 3, 2, P.shadow);
  // narrow head + antler-totem crown
  R(ctx, ox + 19, Y(10), 8, 7, P.base);
  R(ctx, ox + 19, Y(10), 8, 1, P.rim);
  R(ctx, ox + 21, Y(13), 1, 1, P.outline);
  R(ctx, ox + 24, Y(13), 1, 1, P.outline);
  R(ctx, ox + 22, Math.max(0, Y(3)), 2, 7, P.base);
  R(ctx, ox + 22, Math.max(0, Y(3)), 2, 1, P.rim);
  R(ctx, ox + 17, Math.max(0, Y(5)), 2, 6, P.base);
  R(ctx, ox + 15, Math.max(0, Y(4)), 2, 2, P.shadow);
  R(ctx, ox + 27, Math.max(0, Y(5)), 2, 6, P.base);
  R(ctx, ox + 29, Math.max(0, Y(4)), 2, 2, P.shadow);
  if (tel) {
    R(ctx, ox + 22, Math.max(0, Y(3)), 2, 2, P.crackHot);
    R(ctx, ox + 17, Math.max(0, Y(5)), 2, 2, P.crackHot);
    R(ctx, ox + 27, Math.max(0, Y(5)), 2, 2, P.crackHot);
  }
}

// -------------------------------------------------------- open-world Wildlife
// True per-species silhouettes drawn from hand-authored pixel grids. The capybara
// is the "Naturalist" set (a soft barrel with a blunt head); the deer, boar and
// jaguar are the "Detailed Large-Frame" set (real anatomy — jointed legs, arched
// neck + antler rack, humped tusked shoulders, low-slung rosetted cat). Each is a
// 3-frame sheet: f0 idle, f1 idle-heave (mass lifts 1px on planted legs), f2 alert.

// ---- Capybara ("Naturalist"): grid + auto silhouette outline ----
const CAPY_SHADOW = 'rgba(14,20,8,0.35)';
const CAPY_EXEMPT = new Set(['a', 'A', 'l', 'f', 'k', 'w', 't', 'T']);
const CAPY_PAL: Record<string, string> = {
  o: '#241708', s: '#5a4128', b: '#7c5c3a', h: '#96764e', r: '#a98a5e',
  n: '#8a7052', e: '#120c05', k: '#332312', l: '#4e3922', f: '#3a2a17', '.': CAPY_SHADOW,
};
const CAPY_LEGTOP = 12;
const CAPY_IDLE = [
  '',
  '',
  '                b   b',
  '               hhhhhhhh',
  '    hhrhhhrhhhhbbbbbbbbb',
  '   bbbbbbbbbbbbbbbbbennnk',
  '  bbbbbbbbbbbbbbbbbbbnnnn',
  '  bbbbbbbbbbbbbbbbbbbnnns',
  '  bbbbbbbbbbbbbbbbbbsssss',
  '  bbbrbbsbbbrbsbbbbbbb',
  '  bbbsbbbbbsbbbbbsbbbb',
  '   ssssssssssssssssss',
  '    ll f        ll f',
  '    ll f        ll f',
  '    ll f        ll f',
  '    kk f        kk f',
  '   ...................',
  '      ..............',
];
const CAPY_ALERT = [
  '                b   b',
  '               hhhhhhhh',
  '               bbbbbbbbbk',
  '               bbbbbennnn',
  '    hhrhhhrhhhhbbbbbbnnnn',
  '   bbbbbbbbbbbbbbbbbbsss',
  '  bbbbbbbbbbbbbbbbbbbss',
  '  bbbbbbbbbbbbbbbbbbb',
  '  bbbbbbsbbbbbsbbbbb',
  '  bbbbbbbbbbbbbbbbbbbb',
  '  bbbsbbbbbsbbbbbsbbbb',
  '   ssssssssssssssssss',
  '    ll f        ll f',
  '    ll f        ll f',
  '    ll f        ll f',
  '    kk f        kk f',
  '   ...................',
  '      ..............',
];

function drawCapybara(ctx: Ctx, ox: number, f: number): void {
  const grid = f === 2 ? CAPY_ALERT : CAPY_IDLE;
  const pal = CAPY_PAL;
  const legTop = CAPY_LEGTOP;
  const { w, h } = MOB_FRAME.capybara;
  const M: (string | null)[][] = [];
  for (let y = 0; y < h; y++) M.push(new Array(w).fill(null));
  for (let y = 0; y < h && y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length && x < w; x++) {
      const ch = row[x];
      if (ch === ' ') continue;
      const tx = f === 1 && ch === 'f' ? x - 1 : x;
      if (tx >= 0 && tx < w) M[y][tx] = ch;
    }
  }
  const isFill = (ch: string | null) => !!ch && ch !== '.';
  const O: boolean[][] = [];
  for (let y = 0; y < h; y++) {
    O.push(new Array(w).fill(false));
    for (let x = 0; x < w; x++) {
      if (isFill(M[y][x])) continue;
      const nb = [
        y > 0 ? M[y - 1][x] : null,
        y < h - 1 ? M[y + 1][x] : null,
        x > 0 ? M[y][x - 1] : null,
        x < w - 1 ? M[y][x + 1] : null,
      ];
      if (nb.some((c) => isFill(c) && !CAPY_EXEMPT.has(c as string))) O[y][x] = true;
    }
  }
  const put = (x: number, y: number, color: string) => { ctx.fillStyle = color; ctx.fillRect(ox + x, y, 1, 1); };
  const drawRow = (y: number, ty: number) => {
    if (ty < 0 || ty >= h) return;
    for (let x = 0; x < w; x++) {
      const ch = M[y][x];
      if (isFill(ch)) put(x, ty, pal[ch as string] || '#ff00ff');
      else if (O[y][x]) put(x, ty, pal.o);
      else if (ch === '.') put(x, ty, pal['.']);
    }
  };
  for (let y = 0; y < h; y++) {
    const ty = f === 1 && y < legTop ? y - 1 : y;
    drawRow(y, ty);
  }
  if (f === 1) drawRow(legTop - 1, legTop - 1);
}

// ---- Deer / Boar / Jaguar ("Detailed Large-Frame"): grids + soft cluster shading ----
interface LFSpec {
  liftRow: number;
  shadow: { x: number; w: number };
  stand: string[];
  alert: string[];
  pal: Record<string, string>;
}
type LFKind = 'deer' | 'boar' | 'jaguar';
// chars that never trigger the silhouette outline (thin appendages)
const LF_NO_OUTLINE: Record<string, number> = { q: 1, k: 1, F: 1, h: 1, A: 1, a: 1, t: 1, T: 1, u: 1 };
const LF_SHADOW = 'rgba(22,26,14,0.42)';

const LF_SPEC: Record<LFKind, LFSpec> = {
  deer: {
    liftRow: 17,
    shadow: { x: 7, w: 16 },
    stand: [
      '..................................',
      '.....................a.a.A...A....',
      '......................a..A...A....',
      '.......................a..A.A.....',
      '........................a..A......',
      '.....................dd.a..A......',
      '......................dbbbbb......',
      '.......................bebbbbn....',
      '........................bbb.......',
      '......................bbb.........',
      '.....................bbb..........',
      '....dww.lllllllllllllbbb..........',
      '.....wbbbbbbbbbbbbbbbbb...........',
      '.....dbbbbbbbbbbbbbbbbb...........',
      '.....dbbbbbbbbbbbbbbbdd...........',
      '......dbbbbbbbbbbbbbddd...........',
      '.......wwwwddddwwwwdd.............',
      '.......dqk..FF...FF.qk............',
      '........qk..FF...FF.qk............',
      '........qk..FF...FF.qk............',
      '........qk..FF...FF.qk............',
      '.........qk.FF...FF.qk............',
      '.........qk.FF...FF.qk............',
      '.........hh.hh...hh.hh............',
    ],
    alert: [
      '.....................a.a.A...A....',
      '......................a..A...A....',
      '.......................a..A.A.....',
      '........................a..A......',
      '.....................dd.a..A......',
      '......................dbbbbb......',
      '.......................bebbbbn....',
      '........................bbb.......',
      '.......................bbb........',
      '.......................bbb........',
      '......................bbb.........',
      '....dww..............bbb..........',
      '.....wbblllllllllllllbbb..........',
      '.....dbbbbbbbbbbbbbbbbb...........',
      '.....dbbbbbbbbbbbbbbbdd...........',
      '......dbbbbbbbbbbbbbddd...........',
      '.......wwwwddddwwwwdd.............',
      '.......dqk..FF...FF.qk............',
      '........qk..FF...FF.qk............',
      '........qk..FF...FF.qk............',
      '........qk..FF...FF.qk............',
      '.........qk.FF...FF.qk............',
      '.........qk.FF...FF.qk............',
      '.........hh.hh...hh.hh............',
    ],
    pal: {
      o: '#3d2c1c', d: '#7d5c3a', b: '#a37e51', l: '#c2a173', w: '#d6c39a',
      q: '#8f6a42', k: '#6f5232', F: '#59422a', h: '#2e2114',
      A: '#d9c8a2', a: '#a98f68', e: '#171009', n: '#241a10',
    },
  },
  boar: {
    liftRow: 13,
    shadow: { x: 3, w: 20 },
    stand: [
      '..............................',
      '..............................',
      '..........M..M.M..............',
      '.........MMMMMMMM..d..........',
      '.......MMlllllllMM.dd.........',
      '.....MMbbblllllbbbbd..........',
      '....Mbbbbbbbbbbbbbbbbb........',
      '..ddbbbbbbbbbbbbbbbbbebb......',
      '..dbbbbdbbbbbbbdbbbblbbd......',
      '..Mdbbbbbbdbbbbbbdbbbbbbbnn...',
      '...ddbbbbbbbbbbbbbbbbbbbtnn...',
      '....ddddddddddddddddddbtt.....',
      '....ddddddddddddddddd.........',
      '.....qk..FF....FF..qk.........',
      '.....qk..FF....FF..qk.........',
      '.....qk..FF....FF..qk.........',
      '.....qk..FF....FF..qk.........',
      '.....qkk.FF....FF..qkk........',
    ],
    alert: [
      '..............................',
      '.........M.M.M................',
      '........MMMMMMMMM.............',
      '.......MMllllllMM..d..........',
      '.....MMbbllllllbbb.dd.........',
      '....Mbbbbbbbbbbbbbbd..........',
      '...Mbbbbbbbbbbbbbbbbb.........',
      '..ddbbbbbbbbbbbbbbbbbb........',
      '..dbbbbdbbbbbbbdbbbbbebb......',
      '..Mdbbbbbbbbbbbbbbbbbbbb......',
      '...ddbbbbbbbbbbbbbbbbbbbbnn...',
      '....dddddddddddddddddddtnn....',
      '....ddddddddddddddddddtt......',
      '.....qk..FF....FF...qk........',
      '.....qk..FF....FF...qk........',
      '.....qk..FF....FF...qk........',
      '.....qk..FF....FF...qk........',
      '.....qkk.FF....FF...qkk.......',
    ],
    pal: {
      o: '#201812', d: '#3c2f20', b: '#52422e', l: '#6b5840', M: '#2a2114',
      q: '#4a3a28', k: '#352a1c', F: '#292014',
      t: '#e5d9bb', e: '#15100a', n: '#7d5f49',
    },
  },
  jaguar: {
    liftRow: 16,
    shadow: { x: 5, w: 21 },
    stand: [
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..........................bd..d...',
      '..........................lllllb..',
      '.........................bbbbbbbb.',
      '.........................bbbebwwn.',
      '.........................bbbbwww..',
      '....T.lllllllllllllllllllbbbww....',
      '.u..Tbbbbsbbsbbsbbbbbsbbbbd.......',
      '.T.T.bbbslsbbbslsbbbslsbbbd.......',
      '..T..dbbbsbbbbbsbbsbbsbbdd........',
      '......dbbbbbbbbbbbbbbbbbdd........',
      '.......dwwwwwwddwwwwwwdd..........',
      '.......qk.FF......FF.qk...........',
      '.......qk.FF......FF.qk...........',
      '.......qk.FF......FF.qk...........',
      '......qkk.FF......FF.qkk..........',
    ],
    alert: [
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..........................dd..dd..',
      '..........................llllll..',
      '.........................bbbbbbbb.',
      '.........................bbbebwwn.',
      '.uTTTT.llllllllllllllllllbbbww....',
      '......bbbsbbsbbsbbbbbsbbbbb.......',
      '......bbslsbbslsbbbslsbbbd........',
      '......dbbsbbbbsbbbbsbbbdd.........',
      '......ddwwwwwwddwwwwwwdd..........',
      '......qk..FF......FF..qk..........',
      '......qk..FF......FF..qk..........',
      '......qk..FF......FF..qk..........',
      '.....qkk..FF......FF..qkk.........',
    ],
    pal: {
      o: '#38270f', d: '#a07c38', b: '#bb9750', l: '#d8bc7c', w: '#e4d6ae',
      q: '#ab8944', k: '#8a6830', F: '#6f5326',
      T: '#a07c38', u: '#45310f', s: '#45310f', e: '#2c1f0a', n: '#38270f',
    },
  },
};

function lfParseGrid(rows: string[], w: number, h: number, tag: string): string[][] {
  if (rows.length > h - 1) throw new Error(tag + ': too many rows (' + rows.length + ')');
  const cells: string[][] = [];
  for (let y = 0; y < h; y++) {
    const row = rows[y] || '';
    if (row.length > w) throw new Error(tag + ' row ' + y + ': length ' + row.length + ' > ' + w);
    const line = new Array(w).fill('');
    for (let x = 0; x < row.length; x++) if (row[x] !== '.') line[x] = row[x];
    cells.push(line);
  }
  return cells;
}

function lfLiftGrid(cells: string[][], liftRow: number): string[][] {
  const H = cells.length, W = cells[0].length;
  const out: string[][] = [];
  for (let y = 0; y < H; y++) out.push(new Array(W).fill(''));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const ch = cells[y][x];
      if (!ch) continue;
      if (y < liftRow) { if (y - 1 >= 0) out[y - 1][x] = ch; }
      else out[y][x] = ch;
    }
  for (let x = 0; x < W; x++) {
    if (!out[liftRow - 1][x] && out[liftRow][x] && cells[liftRow - 1][x]) {
      out[liftRow - 1][x] = out[liftRow][x];
    }
  }
  return out;
}

function lfPaint(ctx: Ctx, ox: number, cells: string[][], pal: Record<string, string>): void {
  const H = cells.length, W = cells[0].length;
  const solid = (ch: string) => !!ch && !LF_NO_OUTLINE[ch];
  ctx.fillStyle = pal.o;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (cells[y][x]) continue;
      const n =
        (y > 0 && solid(cells[y - 1][x])) || (y < H - 1 && solid(cells[y + 1][x])) ||
        (x > 0 && solid(cells[y][x - 1])) || (x < W - 1 && solid(cells[y][x + 1]));
      if (n) ctx.fillRect(ox + x, y, 1, 1);
    }
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const ch = cells[y][x];
      if (!ch) { x++; continue; }
      let x2 = x + 1;
      while (x2 < W && cells[y][x2] === ch) x2++;
      const c = pal[ch];
      if (!c) throw new Error('missing palette char "' + ch + '"');
      ctx.fillStyle = c;
      ctx.fillRect(ox + x, y, x2 - x, 1);
      x = x2;
    }
  }
}

const LF_CACHE: Record<LFKind, { stand: string[][]; alert: string[][]; heave: string[][] }> = {} as never;
for (const kind of Object.keys(LF_SPEC) as LFKind[]) {
  const s = LF_SPEC[kind];
  const { w, h } = MOB_FRAME[kind];
  const stand = lfParseGrid(s.stand, w, h, kind + '.stand');
  const alert = lfParseGrid(s.alert, w, h, kind + '.alert');
  LF_CACHE[kind] = { stand, alert, heave: lfLiftGrid(stand, s.liftRow) };
}

function drawLargeFrame(ctx: Ctx, ox: number, f: number, kind: LFKind): void {
  const s = LF_SPEC[kind];
  const { h } = MOB_FRAME[kind];
  const cells = f === 2 ? LF_CACHE[kind].alert : f === 1 ? LF_CACHE[kind].heave : LF_CACHE[kind].stand;
  ctx.fillStyle = LF_SHADOW;
  ctx.fillRect(ox + s.shadow.x, h - 2, s.shadow.w, 1);
  ctx.fillRect(ox + s.shadow.x + 2, h - 1, s.shadow.w - 4, 1);
  lfPaint(ctx, ox, cells, s.pal);
}

const DRAW: Record<MobKind, (ctx: Ctx, ox: number, f: number) => void> = {
  grasp: drawGrasp,
  spit: drawSpit,
  boss: drawBoss,
  cinder: (c, ox, f) => drawGrasp(c, ox, f, CINDER),
  ember: (c, ox, f) => drawSpit(c, ox, f, EMBER),
  forgeborn: (c, ox, f) => drawBoss(c, ox, f, FORGEBORN),
  ram: drawRam,
  warden: drawWarden,
  whirl: drawWhirl,
  bulwark: drawBulwark,
  brood: drawBrood,
  capybara: (c, ox, f) => drawCapybara(c, ox, f),
  deer: (c, ox, f) => drawLargeFrame(c, ox, f, 'deer'),
  boar: (c, ox, f) => drawLargeFrame(c, ox, f, 'boar'),
  jaguar: (c, ox, f) => drawLargeFrame(c, ox, f, 'jaguar'),
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

// (which Stage fires which theme now lives on StageDef.shot — ADR-0015 made the
// Stage chain endless, so the mapping is content data, not a 1|2 branch here)

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
