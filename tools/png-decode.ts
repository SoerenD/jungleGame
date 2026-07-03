/** Minimal PNG decoder (8-bit RGBA/RGB/palette, non-interlaced) for the tools scripts. */
import { inflateSync } from 'node:zlib';
import fs from 'node:fs';
import { Img } from './png';

export function decodePng(file: string): Img {
  const buf = fs.readFileSync(file);
  let off = 8;
  let w = 0;
  let h = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  let palette: Buffer | null = null;
  let trns: Buffer | null = null;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNG not supported');
      if (bitDepth !== 8) throw new Error(`bit depth ${bitDepth} not supported`);
    } else if (type === 'PLTE') {
      palette = Buffer.from(data);
    } else if (type === 'tRNS') {
      trns = Buffer.from(data);
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 0 ? 1 : 0;
  if (!channels) throw new Error(`color type ${colorType} not supported`);
  const stride = w * channels;
  const img = new Img(w, h);
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    raw.copy(cur, 0, y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      if (filter === 1) cur[i] = (cur[i] + a) & 0xff;
      else if (filter === 2) cur[i] = (cur[i] + b) & 0xff;
      else if (filter === 3) cur[i] = (cur[i] + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        cur[i] = (cur[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
    }
    cur.copy(prev);
    for (let x = 0; x < w; x++) {
      let r: number, g: number, bl: number, al: number;
      if (colorType === 6) {
        r = cur[x * 4];
        g = cur[x * 4 + 1];
        bl = cur[x * 4 + 2];
        al = cur[x * 4 + 3];
      } else if (colorType === 2) {
        r = cur[x * 3];
        g = cur[x * 3 + 1];
        bl = cur[x * 3 + 2];
        al = 255;
      } else if (colorType === 3) {
        const p = cur[x];
        r = palette![p * 3];
        g = palette![p * 3 + 1];
        bl = palette![p * 3 + 2];
        al = trns && p < trns.length ? trns[p] : 255;
      } else {
        r = g = bl = cur[x];
        al = 255;
      }
      img.px(x, y, ((r << 24) | (g << 16) | (bl << 8) | al) >>> 0);
    }
  }
  return img;
}

/** nearest-neighbour crop+scale helper for visual verification */
export function cropScaled(src: Img, x: number, y: number, w: number, h: number, scale: number): Img {
  const out = new Img(w * scale, h * scale);
  for (let yy = 0; yy < h * scale; yy++) {
    for (let xx = 0; xx < w * scale; xx++) {
      const sx = x + Math.floor(xx / scale);
      const sy = y + Math.floor(yy / scale);
      if (sx < 0 || sy < 0 || sx >= src.w || sy >= src.h) continue;
      const i = (sy * src.w + sx) * 4;
      out.px(
        xx,
        yy,
        ((src.data[i] << 24) | (src.data[i + 1] << 16) | (src.data[i + 2] << 8) | src.data[i + 3]) >>> 0,
      );
    }
  }
  return out;
}
