/**
 * Item icons for the slot inventory. Structures reuse their real in-world
 * sprite (public/assets/objects); everything carried-only (Resources, Tools,
 * consumables) gets a hand-drawn 12x12 pixel icon rendered once to a data
 * URL. Icons stay pixel-crisp via `image-rendering: pixelated` in CSS.
 */
import { OBJECTS } from '../assetConfig';
import { asset } from '../paths';
import type { ItemId } from '../content/items';

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

const cache = new Map<ItemId, string>();

/** icon URL for an item: a data URL for drawn icons, an asset URL for structures */
export function itemIcon(id: ItemId): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const grid = GRIDS[id];
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
  } else {
    // structure sprites are runtime-loaded files: prefix with the base path so
    // they resolve under GitHub Pages' /jungleGame/ (like BootScene does)
    const raw = OBJECTS[`st_${id}`]?.url;
    url = raw ? asset(raw) : '';
  }
  cache.set(id, url);
  return url;
}
