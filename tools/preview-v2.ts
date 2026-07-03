/** dev-only: writes a 4x contact sheet of the v2 sprites to the temp dir */
import fs from 'node:fs';
import path from 'node:path';
import { Img } from './png';
import { decodePng, cropScaled } from './png-decode';

const root = path.resolve(import.meta.dirname, '..');
const files = [
  'guardian.png',
  'seal-monument.png',
  'altar.png',
  'welcome-stone.png',
  'hardwood-tree.png',
  'hardwood-stump.png',
  'obsidian-rock.png',
  'obsidian-rubble.png',
  'fishing-spot.png',
  'fishing-spot-calm.png',
  'obsidian-statue.png',
  'obsidian-path.png',
  'brazier.png',
  'hardwood-arch.png',
  'guardian-trophy.png',
];
const SCALE = 4;
const PAD = 8;
const imgs = files.map((f) => decodePng(path.join(root, 'public/assets/objects', f)));
let cw = 0;
let ch = PAD;
for (const i of imgs) {
  cw = Math.max(cw, i.w * SCALE + PAD * 2);
  ch += i.h * SCALE + PAD;
}
const sheet = new Img(cw, ch);
sheet.rect(0, 0, cw, ch, 0x28442eff);
let y = PAD;
for (const i of imgs) {
  sheet.blit(cropScaled(i, 0, 0, i.w, i.h, SCALE), 0, 0, i.w * SCALE, i.h * SCALE, PAD, y);
  y += i.h * SCALE + PAD;
}
const out = process.argv[2] ?? path.join(process.env.TEMP ?? '.', 'v2-preview.png');
fs.writeFileSync(out, sheet.toPng());
console.log('preview at', out);
