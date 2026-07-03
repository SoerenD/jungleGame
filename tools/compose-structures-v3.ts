/**
 * Composes the v3 functional Structures — Hammock, signpost, Sawmill — and
 * the plank decor (plank floor, table). Like compose-v2-assets.ts they are
 * derived from the checked-in CC0 crops plus drawn pixels (see CREDITS.md),
 * so the script is re-runnable anywhere.
 *
 * Run: npx tsx tools/compose-structures-v3.ts
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

const hutWall = obj('hut-wall.png');

// plank tones (fresh-sawn, lighter than hut-wall timber)
const PLANK = 0xc9a06aff;
const PLANK_DARK = 0xa87d4cff;
const PLANK_EDGE = 0x7a5834ff;
const POST = 0x6b4a2bff;

// ---------------------------------------------------------------- hammock
// two posts with a fiber sling swinging between them (16x20)
{
  const i = new Img(16, 20);
  i.rect(1, 6, 2, 13, POST);
  i.rect(13, 6, 2, 13, POST);
  i.rect(1, 18, 2, 1, 0x4a3018ff);
  i.rect(13, 18, 2, 1, 0x4a3018ff);
  // the sling: a woven curve
  for (let x = 2; x <= 13; x++) {
    const sag = Math.round(Math.sin(((x - 2) / 11) * Math.PI) * 3);
    i.px(x, 9 + sag, 0xdcc98aff);
    i.px(x, 10 + sag, 0xc9b273ff);
    if (x % 2 === 0) i.px(x, 11 + sag, 0xb09c5eff);
  }
  // knots at the posts
  i.px(2, 8, 0x8a7440ff);
  i.px(13, 8, 0x8a7440ff);
  write('public/assets/objects/hammock.png', i);
}

// ---------------------------------------------------------------- signpost
// a post carrying a blank plank board — the writing renders in-game (16x20)
{
  const i = new Img(16, 20);
  i.rect(7, 4, 2, 15, POST);
  i.rect(7, 18, 2, 1, 0x4a3018ff);
  i.rect(2, 3, 12, 7, PLANK);
  i.rect(2, 3, 12, 1, 0xdfbe8aff);
  i.rect(2, 9, 12, 1, PLANK_DARK);
  i.rect(2, 3, 1, 7, PLANK_EDGE);
  i.rect(13, 3, 1, 7, PLANK_EDGE);
  // faint scribble lines suggest writing
  i.rect(4, 5, 8, 1, 0x7a5834aa);
  i.rect(4, 7, 6, 1, 0x7a583488);
  write('public/assets/objects/signpost.png', i);
}

// ---------------------------------------------------------------- sawmill
// timber frame (from the hut wall) with a big circular saw blade (20x22)
{
  const i = new Img(20, 22);
  const frame = cropScaled(hutWall, 0, 2, 16, 20, 1);
  i.blit(frame, 0, 0, 16, 20, 2, 2);
  // work table across the middle
  i.rect(1, 12, 18, 3, PLANK);
  i.rect(1, 14, 18, 1, PLANK_DARK);
  // the saw blade, half above the table
  const cx = 10;
  const cy = 12;
  for (let a = 0; a < Math.PI * 2; a += 0.13) {
    const x = Math.round(cx + Math.cos(a) * 5);
    const y = Math.round(cy + Math.sin(a) * 5);
    if (y <= 12) i.px(x, y, 0xb8bfc6ff);
  }
  for (let a = 0; a < Math.PI * 2; a += 0.35) {
    const x = Math.round(cx + Math.cos(a) * 6);
    const y = Math.round(cy + Math.sin(a) * 6);
    if (y <= 12) i.px(x, y, 0x8d949bff); // teeth
  }
  i.rect(9, 9, 3, 3, 0x5c6b73ff); // hub
  // fresh planks stacked beside the blade
  i.rect(2, 16, 7, 2, PLANK);
  i.rect(2, 18, 7, 2, PLANK_DARK);
  // sawdust
  i.px(15, 16, 0xdfbe8aff);
  i.px(16, 18, 0xdfbe8aff);
  i.px(14, 19, 0xc9a06aff);
  write('public/assets/objects/sawmill.png', i);
}

// ---------------------------------------------------------------- plank floor
// a flat 16x16 floor tile of laid planks
{
  const i = new Img(16, 16);
  i.rect(0, 0, 16, 16, PLANK);
  for (const y of [0, 5, 10, 15]) i.rect(0, y, 16, 1, PLANK_DARK);
  for (const [x, y0] of [
    [5, 1],
    [11, 6],
    [3, 11],
  ]) {
    i.rect(x, y0, 1, 4, PLANK_EDGE); // board seams
  }
  i.px(8, 3, 0x8a6a42ff); // nail heads
  i.px(13, 8, 0x8a6a42ff);
  i.px(6, 13, 0x8a6a42ff);
  write('public/assets/objects/plank-floor.png', i);
}

// ---------------------------------------------------------------- table
// a solid plank table (16x16)
{
  const i = new Img(16, 16);
  i.rect(2, 11, 2, 5, POST);
  i.rect(12, 11, 2, 5, POST);
  i.rect(1, 4, 14, 5, PLANK);
  i.rect(1, 4, 14, 1, 0xdfbe8aff);
  i.rect(1, 8, 14, 1, PLANK_DARK);
  i.rect(1, 9, 14, 1, PLANK_EDGE);
  i.px(3, 6, 0x8a6a42ff);
  i.px(12, 6, 0x8a6a42ff);
  write('public/assets/objects/table.png', i);
}

console.log('v3 structures composed.');
