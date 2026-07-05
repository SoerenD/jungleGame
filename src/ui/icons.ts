/**
 * Item icons for the slot inventory. Structures reuse their real in-world
 * sprite (public/assets/objects); everything carried-only (Resources, Tools,
 * consumables) gets a hand-drawn 12x12 pixel icon rendered once to a data
 * URL. Icons stay pixel-crisp via `image-rendering: pixelated` in CSS.
 */
import { OBJECTS } from '../assetConfig';
import { asset } from '../paths';
import type { ItemId } from '../content/items';
import { VILLAGE_ART, type StructureArt } from '../content/village';

/** shared palette: char → CSS color ('.' and unknown chars are transparent) */
export const PAL: Record<string, string> = {
  x: '#23262c', // outline
  k: '#4a2f16', // dark wood
  w: '#8a5a2b', // wood
  W: '#b07a3e', // light wood
  n: '#d8b98a', // tan / parchment
  h: '#6b4a2a', // handle
  d: '#5b616a', // dark stone
  s: '#9aa0a8', // stone
  S: '#c3c9cf', // light stone
  e: '#2f7a3d', // dark green
  g: '#4a9e52', // green
  G: '#7cc96f', // light green
  r: '#d94f3d', // red
  R: '#ff8a70', // light red
  c: '#8c2f24', // dark red
  b: '#4a90d9', // blue
  B: '#8ec7ff', // light blue
  m: '#ffb437', // amber
  p: '#8a6cc9', // rune purple
  P: '#cdb6f2', // light rune purple
  f: '#f0f4f8', // near-white
  u: '#6b6058', // husk stone (Grasp Husk)
  U: '#8c8073', // husk stone, lit
  o: '#ff8c2a', // ember / molten glow (Husk core)
  v: '#3b2c57', // deep obsidian-violet (Deep Guardian)
  V: '#6a52a0', // obsidian-violet, lit
};

export const GRIDS: Partial<Record<ItemId, string[]>> = {
  wood: [
    '............',
    '............',
    '..xxxxxxxx..',
    '.xWWWWWWWWx.',
    'xnnxwwwwwwWx',
    'xnWnxwwwwwWx',
    'xnnxwwwwwwWx',
    '.xWWWWWWWWx.',
    '..xxxxxxxx..',
    '............',
    '............',
    '............',
  ],
  hardwood: [
    '............',
    '............',
    '..xxxxxxxx..',
    '.xwwwwwwwwx.',
    'xnnxkkkkkkwx',
    'xnwnxkkkkkwx',
    'xnnxkkkkkkwx',
    '.xwwwwwwwwx.',
    '..xxxxxxxx..',
    '............',
    '............',
    '............',
  ],
  plank: [
    '............',
    '............',
    '..xxxxxxxxx.',
    '..xWWWWWWWx.',
    '..xwwwwwwwx.',
    '..xxxxxxxxx.',
    '..xWWWWWWWx.',
    '..xwwwwwwwx.',
    '..xxxxxxxxx.',
    '............',
    '............',
    '............',
  ],
  stone: [
    '............',
    '............',
    '....xxxx....',
    '...xSSSsx...',
    '..xSSsssdx..',
    '.xSsssssddx.',
    '.xsssssdddx.',
    '.xssdddddx..',
    '..xxxxxxx...',
    '............',
    '............',
    '............',
  ],
  obsidian: [
    '............',
    '.....xxx....',
    '....xPppx...',
    '....xPppx...',
    '...xPpxppx..',
    '...xppxppx..',
    '..xppxxxppx.',
    '..xpxxxxxpx.',
    '..xxxxxxxxx.',
    '............',
    '............',
    '............',
  ],
  fiber: [
    '............',
    '...xxxxxx...',
    '..xGGggggx..',
    '.xGgxxxxggx.',
    '.xgx....xgx.',
    '.xgx....xgx.',
    '.xgx....xgx.',
    '.xGgxxxxggx.',
    '..xgggggGx..',
    '...xxxxxx...',
    '....xg......',
    '............',
  ],
  fruit: [
    '............',
    '.....gx.....',
    '....gex.....',
    '...xxrxx....',
    '..xrrRrrx...',
    '.xrRRrrrrx..',
    '.xrRrrrrrx..',
    '.xrrrrrrcx..',
    '.xrrrrrccx..',
    '..xrrrccx...',
    '...xxxxx....',
    '............',
  ],
  fish: [
    '............',
    '............',
    '....xxxx....',
    '..xxbBbbx...',
    '.xbfBbbbbxx.',
    '.xbbbbbbxbx.',
    '..xxbbbbxx..',
    '....xxxx....',
    '............',
    '............',
    '............',
    '............',
  ],
  cooked_fish: [
    '............',
    '....d..d....',
    '....xxxx....',
    '..xxwWwwx...',
    '.xwnWwwwwxx.',
    '.xwwwwwwxwx.',
    '..xxwwwwxx..',
    '....xxxx....',
    '............',
    '............',
    '............',
    '............',
  ],
  map_piece: [
    '............',
    '..xxxxxxx...',
    '..xnnnnnxx..',
    '..xnnnnnnx..',
    '..xnknnnnx..',
    '..xnnknnnx..',
    '..xnnnknnx..',
    '..xnnrnrnx..',
    '..xnnnrnnx..',
    '..xnnrnrnx..',
    '..xxxxxxxx..',
    '............',
  ],
  guardian_scale: [
    '............',
    '...xxxxxx...',
    '..xSSSSssx..',
    '..xSmSsssx..',
    '..xSSssssx..',
    '..xssssdsx..',
    '..xssssdsx..',
    '...xssddx...',
    '...xsddx....',
    '....xdx.....',
    '.....x......',
    '............',
  ],
  // Dungeons v1 — Delve drops (palettes echo the Husks + Deep Guardian)
  husk_shard: [
    '............',
    '....xxx.....',
    '...xUuux....',
    '..xuuuuUx...',
    '..xuoouux...',
    '..xuoouux...',
    '..xUuuuux...',
    '...xuuuux...',
    '...xUuudx...',
    '....xddx....',
    '.....xx.....',
    '............',
  ],
  deep_core: [
    '............',
    '.....xx.....',
    '....xvvx....',
    '...xvVVvx...',
    '..xvVmmVvx..',
    '..xVmoofVx..',
    '..xvVmmVvx..',
    '...xvVVvx...',
    '....xvvx....',
    '.....xx.....',
    '............',
    '............',
  ],
  sword: [
    '............',
    '.........xx.',
    '........xSx.',
    '.......xSsx.',
    '......xSsx..',
    '.....xSsx...',
    '....xSsx....',
    '...xmmmx....',
    '...xhhx.....',
    '..xhhx......',
    '..xmx.......',
    '............',
  ],
  axe: [
    '............',
    '.....xxxx...',
    '....xSSssx..',
    '....xSsssx..',
    '...xhxssx...',
    '...xhhxx....',
    '..xhhx......',
    '..xhhx......',
    '.xhhx.......',
    '.xhx........',
    '.xx.........',
    '............',
  ],
  ancient_axe: [
    '............',
    '.....xxxx...',
    '....xPPppx..',
    '....xPpppx..',
    '...xhxppx...',
    '...xhhxx....',
    '..xhhx......',
    '..xmhx......',
    '.xhhx.......',
    '.xhx........',
    '.xx.........',
    '............',
  ],
  pickaxe: [
    '............',
    '..xxxxxxxx..',
    '.xSSSSSSSSx.',
    '.xSxxhhxxSx.',
    '..x.xhhx.x..',
    '....xhhx....',
    '....xhhx....',
    '....xhhx....',
    '....xhhx....',
    '....xxxx....',
    '............',
    '............',
  ],
  ancient_pickaxe: [
    '............',
    '..xxxxxxxx..',
    '.xPPPPPPPPx.',
    '.xPxxhhxxPx.',
    '..x.xhhx.x..',
    '....xhhx....',
    '....xmmx....',
    '....xhhx....',
    '....xhhx....',
    '....xxxx....',
    '............',
    '............',
  ],
  machete: [
    '............',
    '........xx..',
    '.......xSSx.',
    '......xSSx..',
    '.....xSSx...',
    '....xSSx....',
    '...xSSx.....',
    '..xSSx......',
    '..xhx.......',
    '.xhhx.......',
    '.xxx........',
    '............',
  ],
  hammer: [
    '............',
    '..xxxxxxxx..',
    '..xSSSSSSx..',
    '..xSSSSSSx..',
    '..xxxhhxxx..',
    '....xhhx....',
    '....xhhx....',
    '....xhhx....',
    '....xhhx....',
    '....xxxx....',
    '............',
    '............',
  ],
  fishing_rod: [
    '............',
    '........xx..',
    '.......xwx..',
    '......xwx.x.',
    '.....xwx..x.',
    '....xwx...x.',
    '...xwx....x.',
    '..xwx....xx.',
    '..xx....xSx.',
    '.........x..',
    '............',
    '............',
  ],
  summon_totem: [
    '............',
    '...xxxxxx...',
    '..xWWWWWWx..',
    '..xWmxxmWx..',
    '..xWWWWWWx..',
    '..xWxWWxWx..',
    '..xWWxxWWx..',
    '..xkWWWWkx..',
    '...xxxxxx...',
    '....xkkx....',
    '....xxxx....',
    '............',
  ],
  bow: [
    '............',
    '....xx......',
    '...xkWx.....',
    '...f.xWx....',
    '...f..xWx...',
    '...f..xWx...',
    '...f..xWx...',
    '...f..xWx...',
    '...f.xWx....',
    '...xkWx.....',
    '....xx......',
    '............',
  ],
  hand_torch: [
    '....rr......',
    '...rmRr.....',
    '..rmRRmr....',
    '..rRmmRr....',
    '..rmRRmr....',
    '...rmRr.....',
    '....xhx.....',
    '....xhx.....',
    '....xhx.....',
    '....xhx.....',
    '....xhx.....',
    '.....x......',
  ],
};

/**
 * Draw a Village Building (ADR-0010) into a 2D context at any W×H — shared by the
 * slot icon here and the in-world texture the scene bakes, so they always match.
 * The whole silhouette is derived from the compact StructureArt spec, so A3 ships
 * no PNG assets yet every Building still reads as its own distinct object.
 */
export function drawStructureArt(ctx: CanvasRenderingContext2D, W: number, H: number, art: StructureArt): void {
  const O = '#23262c'; // shared outline
  const R = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  };
  ctx.clearRect(0, 0, W, H);
  const u = W / 12; // one "grid pixel" — keeps proportions across sizes
  const cx = W / 2;
  if (art.shape === 'decor') {
    // a post with a bright cap (banner / lamp / bloom read as "something raised")
    R(cx - u, H * 0.42, u * 2, H * 0.58, O);
    R(cx - u * 0.5, H * 0.44, u, H * 0.56, art.body);
    R(cx - u * 2, H * 0.1, u * 4, H * 0.34, O);
    R(cx - u * 1.5, H * 0.14, u * 3, H * 0.26, art.trim);
    return;
  }
  const wallTop = Math.round(H * 0.42);
  // walls
  R(u, wallTop, W - u * 2, H - wallTop, O);
  R(u * 1.5, wallTop + 1, W - u * 3, H - wallTop - 1, art.body);
  // roof: a spire+crown for monuments, a trapezoid for plain buildings
  if (art.shape === 'monument') {
    R(cx - u * 1.5, u, u * 3, wallTop, O);
    R(cx - u, u * 1.5, u * 2, wallTop - 1, art.roof);
    R(cx - u * 2.5, 0, u * 5, u * 2.6, O);
    R(cx - u * 2, u * 0.5, u * 4, u * 1.8, art.trim);
  } else {
    for (let i = 0; i < wallTop; i++) {
      const inset = (1 - i / wallTop) * (W * 0.34);
      R(inset, i, W - inset * 2, 1.2, art.roof);
    }
    R(u, wallTop - 1, W - u * 2, 1.5, O); // eave line
  }
  // door
  const doorH = (H - wallTop) * 0.6;
  R(cx - u * 1.3, H - doorH, u * 2.6, doorH, O);
  R(cx - u * 0.9, H - doorH + 1, u * 1.8, doorH - 1, art.trim);
  // windows flank the door on plain buildings
  if (art.shape === 'building') {
    const wy = wallTop + (H - wallTop) * 0.2;
    const s = u * 1.5;
    R(u * 2, wy, s, s, O);
    R(u * 2.3, wy + u * 0.3, s - u * 0.6, s - u * 0.6, art.trim);
    R(W - u * 3.5, wy, s, s, O);
    R(W - u * 3.2, wy + u * 0.3, s - u * 0.6, s - u * 0.6, art.trim);
  }
}

const cache = new Map<ItemId, string>();

/** icon URL for an item: a data URL for drawn icons, an asset URL for structures */
export function itemIcon(id: ItemId): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const grid = GRIDS[id];
  const villageArt: StructureArt | undefined = VILLAGE_ART[id as keyof typeof VILLAGE_ART];
  let url = '';
  if (grid) {
    const canvas = document.createElement('canvas');
    canvas.width = 12;
    canvas.height = 12;
    const ctx = canvas.getContext('2d')!;
    grid.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const color = PAL[row[x]];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    });
    url = canvas.toDataURL();
  } else if (villageArt) {
    // the Village's own Buildings (ADR-0010) have no PNG — draw their slot icon
    const canvas = document.createElement('canvas');
    canvas.width = 12;
    canvas.height = 12;
    drawStructureArt(canvas.getContext('2d')!, 12, 12, villageArt);
    url = canvas.toDataURL();
  } else {
    // structure sprites are runtime-loaded files: prefix with the base path so
    // they resolve under GitHub Pages' /jungleGame/ (like BootScene does)
    const raw = OBJECTS[`st_${id}`]?.url;
    url = raw ? asset(raw) : '';
  }
  cache.set(id, url);
  return url;
}
