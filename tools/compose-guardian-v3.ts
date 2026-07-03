/**
 * Composes the v3 Guardian sheet: a 96x96 stone colossus with moss, cracked
 * glowing runes and ONE large amber eye — the eye-open frames are the weak-
 * point signal and must read at gameplay zoom. Derived, like
 * compose-v2-assets.ts, from the checked-in CC0 crops (see CREDITS.md), so
 * it is re-runnable anywhere.
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
import { decodePng, cropScaled } from './png-decode';

const root = path.resolve(import.meta.dirname, '..');
const obj = (name: string) => decodePng(path.join(root, 'public/assets/objects', name));
const write = (rel: string, img: Img) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, img.toPng());
  console.log('wrote', rel, `${img.w}x${img.h}`);
};

const rock = obj('rock.png');
const pillar = obj('ruin-pillar.png');

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

type EyeState = 'slumber' | 'closed' | 'closed2' | 'open' | 'open2';

/** the standing colossus, feet at y=95, composed from rock + pillar pieces */
function colossus(eye: EyeState): Img {
  const f = new Img(96, 96);
  // legs: pillar segments
  const leg = cropScaled(pillar, 4, 6, 8, 10, 3); // 24x30
  f.blit(leg, 0, 0, 24, 30, 20, 66);
  f.blit(leg, 0, 0, 24, 30, 52, 66, true);
  // arms: longer pillar shafts, hanging at the sides
  const arm = cropScaled(pillar, 4, 6, 8, 15, 3); // 24x45
  f.blit(arm, 0, 0, 24, 45, 0, 34);
  f.blit(arm, 0, 0, 24, 45, 72, 34, true);
  // torso: the twin boulders, tripled
  const torso = cropScaled(rock, 0, 0, 26, 16, 3); // 78x48
  f.blit(torso, 0, 0, 78, 48, 9, 30);
  // head: the left boulder alone, tripled
  const head = cropScaled(rock, 1, 2, 12, 12, 3); // 36x36
  f.blit(head, 0, 0, 36, 36, 30, 2);
  // mossy crown and shoulders (the jungle grows on it while it sleeps)
  for (const [x, y] of [
    [34, 3], [39, 1], [45, 2], [52, 1], [58, 3], [62, 5],
    [12, 36], [17, 34], [24, 33], [72, 34], [79, 35], [84, 37],
  ]) {
    f.rect(x, y, 3, 2, 0x4a9e52ff);
    f.rect(x + 1, y + 1, 2, 1, 0x2f7a3dff);
  }
  // cracked runes across torso and arms — lavender base; a runtime additive
  // glow tinted per fury phase sits over them (purple → orange → red)
  const rune = 0xcdb6f2ff;
  const runeDim = 0x8a6cc9ff;
  for (const [x, y, w, h] of [
    [46, 40, 2, 10], [42, 46, 10, 2], [30, 52, 2, 8], [64, 50, 2, 8],
    [24, 60, 8, 2], [64, 62, 8, 2], [8, 44, 2, 8], [86, 44, 2, 8],
  ]) {
    f.rect(x, y, w, h, rune);
  }
  for (const [x, y] of [[47, 38], [47, 51], [31, 50], [65, 48], [9, 42], [87, 42]]) {
    f.px(x, y, runeDim);
  }
  // ---- the ONE large amber eye, centered on the head
  // socket: a dark recess so every state reads against the stone
  f.rect(38, 12, 20, 12, 0x14141eff);
  f.rect(39, 11, 18, 1, 0x0d0d14ff);
  if (eye === 'slumber') {
    // sealed shut: a faint warm seam
    f.rect(41, 17, 14, 2, 0x54262aff);
  } else if (eye === 'closed' || eye === 'closed2') {
    // awake but shut: a smoldering slit (pulse variation on frame 2)
    const slit = eye === 'closed' ? 0xa8481eff : 0xc2551fff;
    f.rect(40, 16, 16, 3, slit);
    f.rect(43, 17, 10, 1, eye === 'closed' ? 0xd86a24ff : 0xf07c28ff);
  } else {
    // OPEN — the weak point: a blazing amber orb with iris and specular
    const bright = eye === 'open2';
    f.rect(39, 12, 18, 11, bright ? 0xffb437ff : 0xffa02fff);
    f.rect(41, 13, 14, 9, bright ? 0xffd35cff : 0xffc24aff);
    f.rect(45, 15, 6, 5, 0xb0480cff); // iris
    f.rect(46, 16, 2, 2, 0xffffffff); // specular
    // radiant rim so the state is unmistakable at ZOOM 2.5
    f.rect(36, 15, 2, 5, bright ? 0xffd35cff : 0xffb437ff);
    f.rect(58, 15, 2, 5, bright ? 0xffd35cff : 0xffb437ff);
    f.rect(45, 9, 6, 2, bright ? 0xffd35cff : 0xffb437ff);
    f.rect(45, 25, 6, 2, bright ? 0xffd35cff : 0xffb437ff);
  }
  return f;
}

/** draw `src` anchored bottom-center into a fresh 96x96 frame */
function anchored(src: Img, liftPx = 0): Img {
  const f = new Img(96, 96);
  f.blit(src, 0, 0, src.w, src.h, Math.floor((96 - src.w) / 2), 96 - src.h - liftPx);
  return f;
}

const frames: Img[] = [];
frames.push(colossus('slumber')); // 0
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

console.log('v3 guardian composed.');
