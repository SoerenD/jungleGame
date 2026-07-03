/**
 * Composes the v2 (Guardian of the Ruins) sprites by recoloring and
 * recombining the CC0 crops already in public/assets/objects/ (themselves
 * adapted from "Zelda-like tilesets and sprites" by ArMM1998 — see
 * CREDITS.md, which must list every file written here).
 *
 * Unlike compose-assets.ts this needs no pack download — it derives
 * everything from the checked-in CC0 crops, so it is re-runnable anywhere.
 *
 * Run: npx tsx tools/compose-v2-assets.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { Img } from './png';
import { decodePng, cropScaled } from './png-decode';

const root = path.resolve(import.meta.dirname, '..');
const obj = (name: string) => decodePng(path.join(root, 'public/assets/objects', name));
const write = (rel: string, img: Img) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, img.toPng());
  console.log('wrote', rel, `${img.w}x${img.h}`);
};

function recolor(img: Img, fn: (r: number, g: number, b: number, a: number) => [number, number, number, number]): Img {
  const out = new Img(img.w, img.h);
  for (let i = 0; i < img.data.length; i += 4) {
    const [r, g, b, a] = fn(img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]);
    out.data[i] = r;
    out.data[i + 1] = g;
    out.data[i + 2] = b;
    out.data[i + 3] = a;
  }
  return out;
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** deep near-black volcanic glass with a violet sheen */
const obsidianize = (r: number, g: number, b: number, a: number): [number, number, number, number] => {
  const l = 0.3 * r + 0.5 * g + 0.2 * b;
  return [clamp(l * 0.22 + 14), clamp(l * 0.16 + 8), clamp(l * 0.3 + 30), a];
};

/** ancient, almost-black timber with warm highlights */
const hardwoodize = (r: number, g: number, b: number, a: number): [number, number, number, number] => {
  if (g > r && g > b) return [clamp(r * 0.35 + 10), clamp(g * 0.42 + 8), clamp(b * 0.3 + 6), a]; // leaves → deep pine
  return [clamp(r * 0.55 + 18), clamp(g * 0.4 + 8), clamp(b * 0.32), a]; // bark → dark umber
};

// ---------------------------------------------------------------- tier-2 nodes
const tree = obj('tree.png');
const stump = obj('stump.png');
const rock = obj('rock.png');
const rockDep = obj('rock-depleted.png');

const hardwoodTree = recolor(tree, hardwoodize);
// amber sap glints so it reads "ancient", not just dark
for (const [x, y] of [
  [11, 8],
  [20, 12],
  [15, 17],
  [24, 7],
]) {
  hardwoodTree.px(x, y, 0xffb84dff);
}
write('public/assets/objects/hardwood-tree.png', hardwoodTree);
write('public/assets/objects/hardwood-stump.png', recolor(stump, hardwoodize));

const obsidianRock = recolor(rock, obsidianize);
// glassy specular streaks
for (const [x, y] of [
  [6, 5],
  [7, 6],
  [18, 7],
  [19, 8],
]) {
  obsidianRock.px(x, y, 0xb08ce0ff);
}
write('public/assets/objects/obsidian-rock.png', obsidianRock);
write('public/assets/objects/obsidian-rubble.png', recolor(rockDep, obsidianize));

// fishing spot: ripple rings + a fish shadow on transparent ground (drawn —
// water itself is the tile below; listed under TODO/self-drawn in CREDITS.md)
function ripples(strong: boolean): Img {
  const i = new Img(16, 16);
  const ring = (cx: number, cy: number, r: number, alpha: number) => {
    for (let a = 0; a < Math.PI * 2; a += 0.12) {
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r * 0.55);
      i.px(x, y, (0xdcf4ff00 | alpha) >>> 0);
    }
  };
  if (strong) {
    ring(8, 9, 6, 150);
    ring(8, 9, 3.6, 110);
    // fish shadow
    i.rect(6, 8, 5, 2, 0x0a223088);
    i.px(11, 9, 0x0a223088);
    i.px(5, 8, 0x0a223088);
  } else {
    ring(8, 9, 4.5, 60);
  }
  return i;
}
write('public/assets/objects/fishing-spot.png', ripples(true));
write('public/assets/objects/fishing-spot-calm.png', ripples(false));

// ---------------------------------------------------------------- landmarks
// (the v2 landmarks are composed from the pillar and tablet pieces; the grove
// altar.png is likewise composed from checked-in crops by compose-altar.ts)
const tablet = obj('tablet.png');
const pillar = obj('ruin-pillar.png');

// Seal monument: twin rune-stone columns framing a mossy slab
const monument = new Img(32, 32);
const column = recolor(cropScaled(pillar, 2, 2, 12, 29, 1), (r, g, b, a) => [
  clamp(r * 0.75 + 6),
  clamp(g * 0.68 + 4),
  clamp(b * 0.95 + 24),
  a,
]);
monument.blit(column, 0, 0, 12, 29, 0, 3);
monument.blit(column, 0, 0, 12, 29, 20, 3, true);
const slab = recolor(cropScaled(tablet, 8, 6, 16, 22, 1), (r, g, b, a) => [
  clamp(r * 0.85 + 10),
  clamp(g * 0.75 + 6),
  clamp(b * 1.0 + 20),
  a,
]);
monument.blit(slab, 0, 0, 16, 22, 8, 10);
for (const [x, y] of [
  [4, 8],
  [27, 8],
  [15, 14],
  [16, 14],
  [13, 19],
  [18, 19],
  [15, 24],
  [16, 24],
]) {
  monument.px(x, y, 0xb478ffff); // the runes that fade as the Seal fills
}
write('public/assets/objects/seal-monument.png', monument);

// arena altar: a low stone table waiting for the Offering
const gAltar = new Img(32, 24);
const tableTop = cropScaled(tablet, 6, 8, 20, 10, 1);
gAltar.blit(tableTop, 0, 0, 20, 10, 6, 6);
const legs = cropScaled(pillar, 4, 24, 8, 7, 1);
gAltar.blit(legs, 0, 0, 8, 7, 6, 16);
gAltar.blit(legs, 0, 0, 8, 7, 18, 16);
for (const [x, y] of [
  [14, 9],
  [17, 9],
  [15, 11],
  [16, 11],
]) {
  gAltar.px(x, y, 0xffa02fff); // amber summoning sigil
}
write('public/assets/objects/guardian-altar.png', gAltar);

// Welcome Stone: the lore tablet re-cut in weathered gray stone
write(
  'public/assets/objects/welcome-stone.png',
  recolor(tablet, (r, g, b, a) => {
    const l = 0.3 * r + 0.5 * g + 0.2 * b;
    return [clamp(l * 0.75 + 30), clamp(l * 0.8 + 34), clamp(l * 0.9 + 40), a];
  }),
);

// ---------------------------------------------------------------- the Guardian
// A colossal stone golem composed from the rock, pillar and moss pieces.
// 3 frames of 48x48: 0 = slumbering (dark eyes), 1/2 = awake idle (glow pulses).
function golemFrame(mode: 0 | 1 | 2): Img {
  const f = new Img(48, 48);
  // arms: pillar shafts, mirrored
  const armSrc = cropScaled(pillar, 4, 6, 8, 15, 2); // 16x30
  f.blit(armSrc, 0, 0, 16, 30, 0, 16);
  f.blit(armSrc, 0, 0, 16, 30, 32, 16, true);
  // torso: the twin boulders, doubled in size
  const torso = cropScaled(rock, 0, 0, 26, 16, 2); // 52x32
  f.blit(torso, 2, 0, 48, 32, 0, 16);
  // head: the left boulder alone
  const head = cropScaled(rock, 1, 2, 12, 12, 2); // 24x24
  f.blit(head, 0, 0, 24, 24, 12, 0);
  // mossy crown and shoulders (the jungle grows on it while it sleeps)
  for (const [x, y] of [
    [14, 2],
    [17, 1],
    [21, 1],
    [26, 2],
    [30, 3],
    [4, 17],
    [8, 16],
    [40, 17],
    [43, 18],
  ]) {
    f.px(x, y, 0x4a9e52ff);
    f.px(x + 1, y, 0x2f7a3dff);
  }
  // eyes + chest sigil — the only part that changes between frames
  const eye = mode === 0 ? 0x54262aff : mode === 1 ? 0xffa02fff : 0xffd35cff;
  for (const [ex, ey] of [
    [17, 10],
    [26, 10],
  ]) {
    f.rect(ex - 1, ey - 1, 4, 4, 0x16161eff); // dark socket so the glow reads
    f.rect(ex, ey, 2, 2, eye);
    if (mode === 2) {
      f.px(ex - 1, ey, 0xffa02fcc);
      f.px(ex + 2, ey, 0xffa02fcc);
      f.px(ex, ey - 1, 0xffa02fcc);
    }
  }
  const sigil = mode === 0 ? 0x3a2a4eff : mode === 1 ? 0x8a5cd8ff : 0xb478ffff;
  f.rect(23, 26, 2, 4, sigil);
  f.rect(22, 27, 4, 2, sigil);
  return f;
}
const guardian = new Img(144, 48);
for (let m = 0; m < 3; m++) guardian.blit(golemFrame(m as 0 | 1 | 2), 0, 0, 48, 48, m * 48, 0);
write('public/assets/objects/guardian.png', guardian);

// ---------------------------------------------------------------- tier-2 structures
const statue = obj('statue.png');
const stonePath = obj('stone-path.png');
const campfire = obj('campfire.png');
const hutWall = obj('hut-wall.png');

const obsStatue = recolor(statue, obsidianize);
obsStatue.px(6, 9, 0xb478ffff);
obsStatue.px(9, 9, 0xb478ffff);
write('public/assets/objects/obsidian-statue.png', obsStatue);

write('public/assets/objects/obsidian-path.png', recolor(stonePath, obsidianize));

// brazier: keep the flame, turn the stone ring to black glass
write(
  'public/assets/objects/brazier.png',
  recolor(campfire, (r, g, b, a) => {
    if (r > b + 40) return [clamp(r * 1.05), clamp(g * 0.95), b, a]; // flame stays hot
    return obsidianize(r, g, b, a);
  }),
);

// hardwood arch: two dark posts (hut-wall planks) + a lintel
const arch = new Img(24, 32);
const post = recolor(cropScaled(hutWall, 1, 4, 5, 19, 1), hardwoodize);
arch.blit(post, 0, 0, 5, 19, 2, 12);
arch.blit(post, 0, 0, 5, 19, 17, 12, true);
const plank = recolor(cropScaled(hutWall, 1, 4, 14, 5, 1), hardwoodize);
arch.blit(plank, 0, 0, 14, 5, 1, 6);
arch.blit(plank, 0, 0, 14, 5, 9, 6);
arch.rect(1, 6, 22, 1, 0x120a06ff);
for (const [x, y] of [
  [4, 8],
  [12, 8],
  [19, 8],
]) {
  arch.px(x, y, 0xffb84dff); // amber inlay
}
write('public/assets/objects/hardwood-arch.png', arch);

// guardian trophy: a boulder "head" with amber eyes mounted on a pillar base
const trophy = new Img(16, 24);
const base = cropScaled(pillar, 3, 26, 10, 5, 1);
trophy.blit(base, 0, 0, 10, 5, 3, 19);
const headSmall = cropScaled(rock, 13, 4, 12, 11, 1);
trophy.blit(headSmall, 0, 0, 12, 11, 2, 8);
trophy.px(5, 12, 0xffa02fff);
trophy.px(9, 12, 0xffa02fff);
for (const [x, y] of [
  [6, 20],
  [8, 21],
  [10, 20],
]) {
  trophy.px(x, y, 0x62d0c8ff); // teal scale inlays
}
write('public/assets/objects/guardian-trophy.png', trophy);

console.log('v2 assets composed.');
