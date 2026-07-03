/**
 * Crop a region from a PNG (tile coordinates) and save an upscaled preview,
 * with an optional 16px grid overlay for orientation.
 *
 * Usage: npx tsx tools/crop.ts <src.png> <tileX> <tileY> <tilesW> <tilesH> <scale> <out.png> [grid]
 */
import fs from 'node:fs';
import { decodePng, cropScaled } from './png-decode';

const [src, tx, ty, tw, th, scale, out, grid] = process.argv.slice(2);
const img = decodePng(src);
const s = Number(scale);
const crop = cropScaled(img, Number(tx) * 16, Number(ty) * 16, Number(tw) * 16, Number(th) * 16, s);
if (grid === 'grid') {
  for (let x = 0; x < crop.w; x += 16 * s) crop.rect(x, 0, 1, crop.h, 0xff00ffb0);
  for (let y = 0; y < crop.h; y += 16 * s) crop.rect(0, y, crop.w, 1, 0xff00ffb0);
}
fs.writeFileSync(out, crop.toPng());
console.log(`${src} (${img.w}x${img.h}) -> ${out} (${crop.w}x${crop.h})`);
