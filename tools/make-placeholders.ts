/**
 * Draws simple pixel-art placeholder PNGs for object sprites that the
 * downloaded packs don't cover. Never overwrites an existing file, so real
 * assets always win. Each generated file must be listed as TODO in CREDITS.md.
 *
 * Run: npx tsx tools/make-placeholders.ts
 */
import { deflateSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------- tiny PNG writer
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf: Uint8Array): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type: string, data: Uint8Array): Buffer {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

class Img {
  data: Uint8Array;
  constructor(
    public w: number,
    public h: number,
  ) {
    this.data = new Uint8Array(w * h * 4);
  }
  px(x: number, y: number, rgba: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = (rgba >>> 24) & 0xff;
    this.data[i + 1] = (rgba >>> 16) & 0xff;
    this.data[i + 2] = (rgba >>> 8) & 0xff;
    this.data[i + 3] = rgba & 0xff;
  }
  rect(x0: number, y0: number, w: number, h: number, rgba: number): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.px(x, y, rgba);
  }
  disc(cx: number, cy: number, r: number, rgba: number): void {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.px(x, y, rgba);
  }
  toPng(): Buffer {
    const raw = Buffer.alloc((this.w * 4 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      raw[y * (this.w * 4 + 1)] = 0;
      Buffer.from(this.data.subarray(y * this.w * 4, (y + 1) * this.w * 4)).copy(raw, y * (this.w * 4 + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', new Uint8Array(0)),
    ]);
  }
}

// palette
const TRUNK = 0x6d4c33ff;
const TRUNK_D = 0x54392aff;
const LEAF = 0x2f7a3dff;
const LEAF_L = 0x4a9e52ff;
const LEAF_D = 0x235c30ff;
const GRAY = 0x8a8f98ff;
const GRAY_L = 0xb5bac2ff;
const GRAY_D = 0x5d6169ff;
const FRUIT = 0xe4484bff;
const FLAME = 0xffa02fff;
const FLAME_L = 0xffd35cff;
const WOOD = 0x9a6a3fff;
const WOOD_D = 0x7a5230ff;

const sprites: Record<string, () => Img> = {
  'tree.png': () => {
    const i = new Img(24, 32);
    i.rect(10, 22, 4, 9, TRUNK);
    i.rect(10, 22, 2, 9, TRUNK_D);
    i.disc(12, 12, 9, LEAF_D);
    i.disc(12, 11, 8, LEAF);
    i.disc(9, 9, 4, LEAF_L);
    i.disc(16, 13, 3, LEAF_L);
    return i;
  },
  'stump.png': () => {
    const i = new Img(16, 16);
    i.rect(5, 8, 6, 6, TRUNK);
    i.rect(5, 8, 2, 6, TRUNK_D);
    i.rect(5, 6, 6, 3, 0xc9a876ff);
    return i;
  },
  'rock.png': () => {
    const i = new Img(16, 16);
    i.disc(8, 10, 5.5, GRAY_D);
    i.disc(8, 9, 5, GRAY);
    i.disc(6, 7, 2, GRAY_L);
    return i;
  },
  'rock-depleted.png': () => {
    const i = new Img(16, 16);
    i.disc(5, 12, 2, GRAY_D);
    i.disc(10, 13, 1.7, GRAY);
    i.disc(12, 11, 1.2, GRAY_D);
    return i;
  },
  'bush-fruit.png': () => {
    const i = new Img(16, 16);
    i.disc(8, 10, 5.5, LEAF_D);
    i.disc(8, 9, 5, LEAF);
    i.px(6, 8, FRUIT);
    i.px(10, 7, FRUIT);
    i.px(8, 11, FRUIT);
    i.px(11, 10, FRUIT);
    return i;
  },
  'bush-empty.png': () => {
    const i = new Img(16, 16);
    i.disc(8, 10, 5, LEAF_D);
    i.disc(8, 10, 4, LEAF);
    return i;
  },
  'vine.png': () => {
    const i = new Img(16, 24);
    i.rect(3, 2, 2, 20, LEAF_D);
    i.rect(8, 0, 2, 22, LEAF);
    i.rect(12, 3, 2, 18, LEAF_D);
    i.px(4, 6, LEAF_L);
    i.px(9, 10, LEAF_L);
    i.px(13, 8, LEAF_L);
    i.px(4, 14, LEAF_L);
    i.px(9, 18, LEAF_L);
    return i;
  },
  'vine-cut.png': () => {
    const i = new Img(16, 24);
    i.rect(3, 18, 2, 4, LEAF_D);
    i.rect(8, 16, 2, 6, LEAF);
    i.rect(12, 19, 2, 3, LEAF_D);
    return i;
  },
  'ruin-pillar.png': () => {
    const i = new Img(16, 32);
    i.rect(4, 4, 8, 26, GRAY);
    i.rect(4, 4, 2, 26, GRAY_L);
    i.rect(10, 4, 2, 26, GRAY_D);
    i.rect(2, 2, 12, 4, GRAY_L);
    i.rect(3, 28, 10, 3, GRAY_D);
    i.px(7, 12, GRAY_D);
    i.px(8, 13, GRAY_D);
    i.px(7, 20, GRAY_D);
    return i;
  },
  'campfire.png': () => {
    const i = new Img(16, 16);
    i.rect(3, 12, 10, 2, TRUNK);
    i.rect(5, 13, 6, 2, TRUNK_D);
    i.disc(8, 9, 3, FLAME);
    i.disc(8, 8, 1.5, FLAME_L);
    return i;
  },
  'torch.png': () => {
    const i = new Img(16, 24);
    i.rect(7, 8, 2, 14, TRUNK);
    i.disc(8, 6, 2.5, FLAME);
    i.disc(8, 5, 1.2, FLAME_L);
    return i;
  },
  'hut-wall.png': () => {
    const i = new Img(16, 24);
    i.rect(1, 4, 14, 19, WOOD);
    for (let y = 4; y < 23; y += 4) i.rect(1, y, 14, 1, WOOD_D);
    i.rect(1, 4, 1, 19, WOOD_D);
    i.rect(14, 4, 1, 19, WOOD_D);
    return i;
  },
  'bridge.png': () => {
    const i = new Img(16, 16);
    i.rect(0, 0, 16, 16, WOOD);
    for (let y = 0; y < 16; y += 4) i.rect(0, y, 16, 1, WOOD_D);
    i.rect(0, 0, 1, 16, TRUNK_D);
    i.rect(15, 0, 1, 16, TRUNK_D);
    return i;
  },
  'crate.png': () => {
    const i = new Img(16, 16);
    i.rect(2, 4, 12, 11, WOOD);
    i.rect(2, 4, 12, 1, WOOD_D);
    i.rect(2, 14, 12, 1, WOOD_D);
    i.rect(2, 4, 1, 11, WOOD_D);
    i.rect(13, 4, 1, 11, WOOD_D);
    for (let k = 0; k < 10; k++) {
      i.px(3 + k, 5 + k, WOOD_D);
      i.px(13 - k, 5 + k, WOOD_D);
    }
    return i;
  },
  'statue.png': () => {
    const i = new Img(16, 24);
    i.rect(4, 14, 8, 8, GRAY_D);
    i.rect(5, 4, 6, 11, GRAY);
    i.rect(5, 6, 6, 2, GRAY_D);
    i.px(6, 9, 0x000000ff);
    i.px(9, 9, 0x000000ff);
    i.rect(6, 11, 4, 1, GRAY_D);
    i.rect(3, 2, 10, 3, GRAY_L);
    return i;
  },
  'fruit-basket.png': () => {
    const i = new Img(16, 16);
    i.rect(3, 9, 10, 5, WOOD);
    i.rect(3, 9, 10, 1, WOOD_D);
    i.disc(6, 8, 1.4, FRUIT);
    i.disc(9, 7, 1.4, 0xffd35cff);
    i.disc(11, 8, 1.2, FRUIT);
    return i;
  },
  'stone-path.png': () => {
    const i = new Img(16, 16);
    i.rect(0, 0, 16, 16, GRAY);
    i.rect(0, 0, 8, 8, GRAY_L);
    i.rect(8, 8, 8, 8, GRAY_L);
    i.rect(7, 0, 1, 16, GRAY_D);
    i.rect(0, 7, 16, 1, GRAY_D);
    return i;
  },
};

const outDir = path.resolve(import.meta.dirname, '../public/assets/objects');
fs.mkdirSync(outDir, { recursive: true });
const made: string[] = [];
for (const [file, draw] of Object.entries(sprites)) {
  const target = path.join(outDir, file);
  if (fs.existsSync(target)) continue;
  fs.writeFileSync(target, draw().toPng());
  made.push(file);
}
console.log(made.length ? `Placeholders drawn (add as TODO to CREDITS.md): ${made.join(', ')}` : 'Nothing missing — no placeholders drawn.');
