/**
 * TEMPORARY dev scaffold: draws a minimal terrain tileset and a 4-direction
 * walk-animated character sheet so the game can boot before the downloaded
 * art is wired in. Never overwrites existing files. These two files are
 * expected to be REPLACED by downloaded assets (see CREDITS.md).
 *
 * Tileset layout (16x16, 11 tiles, 1 row):
 *   0 grass, 1 water, 2 sand, 3 dirt, 4 swamp, 5 cliff, 6 stone_floor,
 *   7 flower (transparent), 8 plant (transparent), 9 grass2, 10 grass3
 *
 * Character sheet: 16x32 frames, 4 cols x 4 rows (rows: down, up, left, right)
 *
 * Run: npx tsx tools/make-dev-scaffold.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { Img } from './png';

let seed = 99;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

// ---------------------------------------------------------------- terrain
function tileInto(sheet: Img, index: number, draw: (i: Img) => void): void {
  const t = new Img(16, 16);
  draw(t);
  sheet.blit(t, 0, 0, 16, 16, index * 16, 0);
}

function makeTerrain(): Img {
  const sheet = new Img(11 * 16, 16);
  tileInto(sheet, 0, (t) => {
    t.rect(0, 0, 16, 16, 0x3e7c44ff);
    for (let k = 0; k < 12; k++) t.px(Math.floor(rnd() * 16), Math.floor(rnd() * 16), 0x489150ff);
  });
  tileInto(sheet, 1, (t) => {
    t.rect(0, 0, 16, 16, 0x2b6cb0ff);
    for (let k = 0; k < 5; k++) t.rect(Math.floor(rnd() * 12), Math.floor(rnd() * 14), 4, 1, 0x3f83c9ff);
  });
  tileInto(sheet, 2, (t) => {
    t.rect(0, 0, 16, 16, 0xd9c07eff);
    for (let k = 0; k < 8; k++) t.px(Math.floor(rnd() * 16), Math.floor(rnd() * 16), 0xc4a960ff);
  });
  tileInto(sheet, 3, (t) => {
    t.rect(0, 0, 16, 16, 0x8a6a44ff);
    for (let k = 0; k < 8; k++) t.px(Math.floor(rnd() * 16), Math.floor(rnd() * 16), 0x7a5c39ff);
  });
  tileInto(sheet, 4, (t) => {
    t.rect(0, 0, 16, 16, 0x4a5d3aff);
    for (let k = 0; k < 10; k++) t.px(Math.floor(rnd() * 16), Math.floor(rnd() * 16), 0x3c4d2fff);
  });
  tileInto(sheet, 5, (t) => {
    t.rect(0, 0, 16, 16, 0x4e4a45ff);
    t.rect(0, 0, 16, 3, 0x625d57ff);
    for (let k = 0; k < 6; k++) t.px(Math.floor(rnd() * 16), 4 + Math.floor(rnd() * 12), 0x3a3733ff);
  });
  tileInto(sheet, 6, (t) => {
    t.rect(0, 0, 16, 16, 0x9aa0a8ff);
    t.rect(7, 0, 1, 16, 0x7c828aff);
    t.rect(0, 7, 16, 1, 0x7c828aff);
  });
  tileInto(sheet, 7, (t) => {
    t.px(7, 7, 0xf28ab5ff);
    t.px(8, 7, 0xf28ab5ff);
    t.px(7, 8, 0xf28ab5ff);
    t.px(8, 8, 0xffd35cff);
    t.px(8, 10, 0x2f7a3dff);
  });
  tileInto(sheet, 8, (t) => {
    t.px(8, 10, 0x2f7a3dff);
    t.px(8, 9, 0x4a9e52ff);
    t.px(7, 8, 0x4a9e52ff);
    t.px(9, 8, 0x4a9e52ff);
  });
  tileInto(sheet, 9, (t) => {
    t.rect(0, 0, 16, 16, 0x417f47ff);
    for (let k = 0; k < 10; k++) t.px(Math.floor(rnd() * 16), Math.floor(rnd() * 16), 0x4b9553ff);
  });
  tileInto(sheet, 10, (t) => {
    t.rect(0, 0, 16, 16, 0x3e7c44ff);
    t.px(7, 6, 0x59a861ff);
    t.px(8, 7, 0x59a861ff);
    t.px(6, 8, 0x59a861ff);
    t.px(9, 9, 0x59a861ff);
  });
  return sheet;
}

// ---------------------------------------------------------------- character
const SKIN = 0xe8b88aff;
const SHIRT = 0xd8d8e8ff; // light so avatar tints read well
const PANTS = 0x5a6070ff;
const HAIR = 0x4a3524ff;

function drawFigure(dir: 'down' | 'up' | 'right', step: number): Img {
  // step: 0 stand, 1 left leg forward, 2 stand, 3 right leg forward
  const i = new Img(16, 32);
  const legL = step === 1 ? 1 : 0;
  const legR = step === 3 ? 1 : 0;
  // legs
  i.rect(5, 26 - legL, 2, 5 + legL, PANTS);
  i.rect(9, 26 - legR, 2, 5 + legR, PANTS);
  // body
  i.rect(4, 18, 8, 8, SHIRT);
  // arms swing with steps
  i.rect(3, 19 + legR, 1, 5, SHIRT);
  i.rect(12, 19 + legL, 1, 5, SHIRT);
  // head
  i.rect(4, 8, 8, 9, SKIN);
  if (dir === 'down') {
    i.rect(4, 8, 8, 3, HAIR);
    i.px(6, 13, 0x222222ff);
    i.px(9, 13, 0x222222ff);
  } else if (dir === 'up') {
    i.rect(4, 8, 8, 7, HAIR);
  } else {
    i.rect(4, 8, 8, 3, HAIR);
    i.rect(4, 10, 2, 4, HAIR);
    i.px(10, 13, 0x222222ff);
  }
  return i;
}

function makeCharacter(): Img {
  const sheet = new Img(4 * 16, 4 * 32);
  const rows: ('down' | 'up' | 'left' | 'right')[] = ['down', 'up', 'left', 'right'];
  rows.forEach((dir, row) => {
    for (let step = 0; step < 4; step++) {
      const mirror = dir === 'left';
      const fig = drawFigure(dir === 'left' ? 'right' : dir, step);
      sheet.blit(fig, 0, 0, 16, 32, step * 16, row * 32, mirror);
    }
  });
  return sheet;
}

// ---------------------------------------------------------------- write
const tilesDir = path.resolve(import.meta.dirname, '../public/assets/tiles');
const charDir = path.resolve(import.meta.dirname, '../public/assets/characters');
fs.mkdirSync(tilesDir, { recursive: true });
fs.mkdirSync(charDir, { recursive: true });

const terrainPath = path.join(tilesDir, 'terrain.png');
const charPath = path.join(charDir, 'character.png');
const made: string[] = [];
if (!fs.existsSync(terrainPath)) {
  fs.writeFileSync(terrainPath, makeTerrain().toPng());
  made.push('terrain.png (11x1 tiles, 176x16)');
}
if (!fs.existsSync(charPath)) {
  fs.writeFileSync(charPath, makeCharacter().toPng());
  made.push('character.png (4x4 frames of 16x32)');
}
console.log(made.length ? `Dev scaffold drawn: ${made.join(', ')}` : 'Scaffold files already exist.');
