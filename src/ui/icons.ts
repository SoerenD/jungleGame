/**
 * Item icons for the slot inventory. Structures reuse their real in-world
 * sprite (public/assets/objects); everything carried-only (Resources, Tools,
 * consumables) gets a hand-drawn 12x12 pixel icon rendered once to a data
 * URL. Icons stay pixel-crisp via `image-rendering: pixelated` in CSS.
 */
import { OBJECTS } from '../assetConfig';
import { asset } from '../paths';
import type { ItemId } from '../content/items';
import { FORGE_ART, VILLAGE_ART, type StructureArt } from '../content/village';
import { WILDLIFE_ART } from '../content/wildlife';

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
  // ADR-0011 — the Deep's drops (molten palette: c dark-red rim, o ember, m amber, f white-hot)
  cinder_shard: [
    '............',
    '....xxx.....',
    '...xcocx....',
    '..xcooocx...',
    '..xommmox...',
    '..xomfmox...',
    '..xommmox...',
    '..xcooocx...',
    '...xcocx....',
    '....xcx.....',
    '.....x......',
    '............',
  ],
  forge_core: [
    '............',
    '.....xx.....',
    '....xccx....',
    '...xcoocx...',
    '..xcomocx...',
    '..xomfmox...',
    '..xcomocx...',
    '...xcoocx...',
    '....xccx....',
    '.....xx.....',
    '............',
    '............',
  ],
  // ADR-0012 — open-world Wildlife loot (hide / meat / trophy) + the cooked meal
  hide: [
    '............',
    '............',
    '..xxxxxxxx..',
    '.xWwwwwnWx..',
    '.xwWnwwwwx..',
    '.xwwwwWwwx..',
    '.xwnwwwnWx..',
    '.xWwwnwwwx..',
    '..xxxxxxxx..',
    '............',
    '............',
    '............',
  ],
  meat: [
    '............',
    '............',
    '...xxxxx....',
    '..xRRrRrx...',
    '.xRrrrrRx...',
    '.xrrcrrrx...',
    '.xRrrrcrx...',
    'nxrrrRrx....',
    'nxxxxxxx....',
    '............',
    '............',
    '............',
  ],
  trophy: [
    '..S.....S...',
    '..S..S..S...',
    '.SS..S..SS..',
    '..SS.S.SS...',
    '...SSSSS....',
    '....xxx.....',
    '...xnnnx....',
    '...xmnmx....',
    '...xnnnx....',
    '....xxx.....',
    '............',
    '............',
  ],
  cooked_meat: [
    '............',
    '............',
    '...xwWwx....',
    '..xwWmWwx...',
    '..xwwWwwx...',
    '..xkwwwkx...',
    '..xwwkwwx...',
    '...xwwwx....',
    '....xnx.....',
    '.....nx.....',
    '......n.....',
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
  // ADR-0011 — the Forgebrand: a heavy molten two-hander (o ember edge, m amber
  // blade, c dark-red guard, h/k handle) — reads distinct from the Sword's steel
  forgebrand: [
    '.........xx.',
    '........xox.',
    '.......xmox.',
    '......xmmox.',
    '.....xmmox..',
    '....xmmox...',
    '...xmmox....',
    '..xccccx....',
    '...xhhx.....',
    '..xhhx......',
    '..xkx.......',
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

// ---------------------------------------------------------------------------
// Village / Wildlife structure art — hand-drawn "Rustic Timber" set (plus the
// Overgrown-Jungle vine arch and a grand bell-towered hall). Every id has its
// own recognizable silhouette rendered block-by-block with fillRect, so the
// in-world texture the scene bakes and the 12×12 HUD slot icon always match and
// A3 still ships no PNG assets. Coordinates are authored for the exact baked
// canvas sizes (2×2 building → 32×48, monument → 32×64, the hall → 32×80, …).
type Put = (x: number, y: number, w: number, h: number, c: string) => void;
type Clear = (x: number, y: number, w: number, h: number) => void;

const B_OUT = '#2b2118';
const B_PAL = {
  timber: '#4c3826',
  timberHi: '#6b4e30',
  plank: { base: '#96714a', hi: '#ab8459', lo: '#785838' },
  roof: { base: '#96543c', hi: '#b06f52', lo: '#6f3d2b' },
  stone: { base: '#847e6d', hi: '#9e9782', lo: '#635e4f' },
  moss: '#5d7440',
  mossLo: '#43552f',
  glow: '#e0b268',
  glowHi: '#f2d698',
  water: { base: '#537f8d', hi: '#7ba7b0', lo: '#3e626d', foam: '#c7dcdf' },
  bone: '#d8cdb2',
  boneLo: '#ab9f80',
  cloth: '#a65445',
  clothLo: '#84402f',
  cream: '#cfc0a0',
  creamLo: '#ada07f',
  soil: '#3b2c1d',
  rope: '#b39a6a',
  antler: '#5a4229',
  antlerHi: '#8f6a40',
  bloomR: '#a65445',
  bloomO: '#c49a4e',
};

const bHsh = (a: number, b: number): number => {
  let h = (a * 374761393 + b * 668265263) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
};

function bPlanks(R: Put, x: number, y: number, w: number, h: number): void {
  const p = B_PAL.plank;
  R(x, y, w, h, p.base);
  for (let yy = y; yy < y + h; yy++) if ((yy - y) % 3 === 2) R(x, yy, w, 1, p.lo);
  for (let band = 0; band * 3 < h; band++) {
    const by = y + band * 3;
    const bh = Math.min(2, y + h - by);
    if (bh <= 0) break;
    const off = bHsh(band, x) % 6;
    for (let xx = x + off; xx < x + w; xx += 7) R(xx, by, 1, bh, p.lo);
    for (let xx = x + (bHsh(band, 7) % 4); xx < x + w; xx += 5)
      if (bHsh(xx, band) % 3 === 0) R(xx, by, 1, 1, p.hi);
  }
}

function bStones(R: Put, x: number, y: number, w: number, h: number, mossy: boolean): void {
  const p = B_PAL.stone;
  R(x, y, w, h, p.base);
  for (let yy = y; yy < y + h; yy++) if ((yy - y) % 4 === 3) R(x, yy, w, 1, p.lo);
  for (let c = 0; c * 4 < h; c++) {
    const cy = y + c * 4;
    const ch = Math.min(3, y + h - cy);
    if (ch <= 0) break;
    const off = (c % 2) * 3 + (bHsh(c, x) % 2);
    for (let xx = x + off; xx < x + w; xx += 6) {
      R(xx, cy, 1, ch, p.lo);
      if (bHsh(xx, cy) % 2 === 0 && xx + 1 < x + w) R(xx + 1, cy, 2, 1, p.hi);
    }
  }
  if (mossy) {
    for (let xx = x; xx < x + w; xx++) {
      if (bHsh(xx, y + h) % 4 === 0) R(xx, y + h - 2, 1, 1, B_PAL.moss);
      if (bHsh(xx, y) % 7 === 0) R(xx, y + h - 3 - (bHsh(xx, 5) % 2), 1, 1, B_PAL.mossLo);
    }
  }
}

function bGable(R: Put, cxL: number, cxR: number, yTop: number, yBot: number, halfTop: number, halfBot: number): void {
  const p = B_PAL.roof;
  R(cxL - halfTop, yTop - 1, cxR + halfTop - (cxL - halfTop) + 1, 1, B_OUT);
  for (let yy = yTop; yy <= yBot; yy++) {
    const t = (yy - yTop) / (yBot - yTop);
    const half = Math.round(halfTop + t * (halfBot - halfTop));
    const xl = cxL - half, xr = cxR + half;
    R(xl, yy, 1, 1, B_OUT);
    R(xr, yy, 1, 1, B_OUT);
    const iw = xr - xl - 1;
    if (iw <= 0) continue;
    const r = yy - yTop;
    let col = p.base;
    if (r < 2) col = p.hi;
    else if (yy === yBot) col = p.lo;
    else if (r % 3 === 2) col = p.lo;
    R(xl + 1, yy, iw, 1, col);
    if (col === p.base) {
      for (let xx = xl + 1 + (bHsh(r, 1) % 4); xx < xr; xx += 4) R(xx, yy, 1, 1, p.lo);
      R(xl + 1, yy, 1, 1, p.hi);
    }
  }
}

// grand bell-towered civic hall (32×80, rises 3 tiles above its 2×2 footprint).
// ADR-0013: the Hall re-sprites per Village tier. drawHall(R, tier) draws the
// SAME building with blocks gated — Village (3) is the hall with no tower, Town
// (4) raises the tower, Capital (5) crowns it with the finial flag — plus a
// humbler hut/cottage for Camp/Hamlet. Tier 5 output is byte-identical to the
// original single-stage art. The blocks below are that art, split so each tier
// just chooses which run.
function hallStone(R: Put): void {
  R(1, 71, 30, 9, B_OUT);
  bStones(R, 2, 72, 28, 7, true);
  R(2, 72, 28, 1, B_PAL.stone.hi);
}
function hallBody(R: Put): void {
  const T = B_PAL.timber, TH = B_PAL.timberHi, G = B_PAL.glow, GH = B_PAL.glowHi;
  R(2, 44, 28, 28, B_OUT);
  bPlanks(R, 3, 45, 26, 26);
  R(3, 45, 2, 26, T); R(3, 45, 1, 26, TH);
  R(27, 45, 2, 26, T);
  R(3, 45, 26, 2, T); R(3, 45, 26, 1, TH);
  R(3, 69, 26, 2, T);
  R(3, 57, 26, 1, T);
  for (const wx of [4, 22]) {
    R(wx, 49, 6, 12, B_OUT);
    R(wx + 1, 48, 4, 1, B_OUT);
    R(wx + 1, 50, 4, 10, G); R(wx + 2, 50, 1, 1, GH);
    R(wx + 3, 50, 1, 10, B_OUT);
    R(wx + 1, 54, 4, 1, B_OUT);
    R(wx, 61, 6, 1, TH);
  }
}
function hallDoor(R: Put): void {
  const T = B_PAL.timber, TH = B_PAL.timberHi, G = B_PAL.glow, GH = B_PAL.glowHi;
  R(9, 53, 14, 1, B_OUT);
  R(9, 54, 14, 2, B_PAL.roof.base); R(9, 54, 14, 1, B_PAL.roof.hi);
  R(9, 56, 14, 1, B_PAL.roof.lo);
  R(11, 56, 10, 1, B_OUT);
  R(10, 57, 12, 2, T); R(10, 57, 12, 1, TH);
  R(11, 59, 10, 12, B_OUT);
  R(12, 60, 8, 11, T);
  R(12, 60, 8, 2, G); R(13, 60, 1, 1, GH);
  for (const xx of [14, 18]) R(xx, 62, 1, 9, '#3c2c1d');
  R(15, 60, 1, 11, B_OUT); R(16, 60, 1, 11, B_OUT);
  R(14, 66, 1, 1, G); R(17, 66, 1, 1, G);
}
function hallGable(R: Put): void {
  const T = B_PAL.timber, TH = B_PAL.timberHi, G = B_PAL.glow, GH = B_PAL.glowHi;
  bGable(R, 16, 16, 30, 44, 3, 15);
  R(11, 29, 10, 2, T); R(11, 29, 10, 1, TH);
  R(14, 35, 4, 5, B_OUT);
  R(15, 36, 2, 3, G); R(15, 36, 1, 1, GH);
  R(16, 35, 1, 1, B_OUT);
}
function hallTower(R: Put): void {
  const T = B_PAL.timber, TH = B_PAL.timberHi, G = B_PAL.glow, GH = B_PAL.glowHi;
  R(11, 18, 10, 12, B_OUT);
  bPlanks(R, 12, 19, 8, 11);
  R(12, 19, 1, 11, TH); R(19, 19, 1, 11, T);
  R(12, 19, 8, 1, TH);
  R(13, 21, 6, 7, B_OUT);
  R(14, 22, 4, 5, G); R(14, 22, 4, 1, GH);
  R(15, 21, 2, 1, B_OUT);
  R(15, 22, 2, 4, B_PAL.stone.lo);
  R(15, 22, 1, 3, B_PAL.stone.hi);
  R(15, 26, 2, 1, B_OUT);
  bGable(R, 16, 16, 7, 18, 1, 6);
  R(12, 18, 8, 1, B_OUT);
}
function hallFinial(R: Put): void {
  const GH = B_PAL.glowHi;
  R(15, 3, 2, 5, B_OUT);
  R(15, 3, 1, 1, GH);
  R(17, 4, 4, 1, B_OUT); R(17, 5, 3, 1, B_PAL.cloth); R(17, 5, 1, 2, B_PAL.clothLo);
  R(17, 6, 3, 1, B_OUT);
}
function hallPennants(R: Put): void {
  R(1, 44, 1, 5, B_OUT); R(2, 45, 2, 1, B_PAL.cloth); R(2, 46, 1, 1, B_PAL.clothLo);
  R(30, 44, 1, 5, B_OUT); R(28, 45, 2, 1, B_PAL.cloth); R(29, 46, 1, 1, B_PAL.clothLo);
}
// Camp: a founder's hut — same timber/stone/gable materials, much smaller
function drawHut(R: Put): void {
  const T = B_PAL.timber, TH = B_PAL.timberHi, G = B_PAL.glow, GH = B_PAL.glowHi;
  R(9, 72, 14, 8, B_OUT); bStones(R, 10, 73, 12, 6, true); R(10, 73, 12, 1, B_PAL.stone.hi);
  R(9, 58, 14, 14, B_OUT); bPlanks(R, 10, 59, 12, 13);
  R(10, 59, 1, 13, TH); R(21, 59, 1, 13, T); R(10, 59, 12, 1, TH); R(10, 70, 12, 1, T);
  bGable(R, 16, 16, 48, 58, 2, 9);
  R(13, 64, 6, 8, B_OUT); R(14, 65, 4, 7, '#3c2c1d'); R(14, 65, 1, 7, TH); R(17, 68, 1, 1, G);
  R(11, 61, 4, 4, B_OUT); R(12, 62, 2, 2, G); R(12, 62, 2, 1, GH);
  R(20, 52, 3, 7, B_OUT); bStones(R, 20, 53, 3, 6, false);
}
// Hamlet: a cottage — wider, two windows, a chimney, one pennant
function drawCottage(R: Put): void {
  const T = B_PAL.timber, TH = B_PAL.timberHi, G = B_PAL.glow, GH = B_PAL.glowHi;
  R(6, 71, 20, 9, B_OUT); bStones(R, 7, 72, 18, 7, true); R(7, 72, 18, 1, B_PAL.stone.hi);
  R(6, 53, 20, 18, B_OUT); bPlanks(R, 7, 54, 18, 17);
  R(7, 54, 1, 17, TH); R(24, 54, 1, 17, T); R(7, 54, 18, 1, TH); R(7, 69, 18, 1, T); R(7, 62, 18, 1, T);
  bGable(R, 16, 16, 40, 53, 3, 12);
  for (const wx of [8, 20]) { R(wx, 57, 4, 5, B_OUT); R(wx + 1, 58, 2, 3, G); R(wx + 1, 58, 2, 1, GH); }
  R(13, 63, 6, 8, B_OUT); R(14, 64, 4, 7, '#3c2c1d'); R(14, 64, 4, 1, G); R(14, 64, 1, 7, TH); R(17, 67, 1, 1, G);
  R(21, 47, 3, 7, B_OUT); bStones(R, 21, 48, 3, 6, false);
  R(6, 53, 1, 4, B_OUT); R(7, 54, 2, 1, B_PAL.cloth); R(7, 55, 1, 1, B_PAL.clothLo);
}
function drawHall(R: Put, tier = 5): void {
  if (tier <= 1) { drawHut(R); return; }
  if (tier === 2) { drawCottage(R); return; }
  hallStone(R); hallBody(R); hallDoor(R); hallGable(R); hallPennants(R);
  if (tier >= 4) hallTower(R);
  if (tier >= 5) hallFinial(R);
}

function drawWell(R: Put, C: Clear): void {
  bGable(R, 15, 16, 5, 12, 3, 15);
  for (const px of [3, 25]) {
    R(px, 12, 4, 26, B_OUT);
    R(px + 1, 13, 2, 24, B_PAL.timber);
    R(px + 1, 13, 1, 24, B_PAL.timberHi);
  }
  R(6, 14, 20, 3, B_OUT);
  R(7, 15, 18, 1, B_PAL.timberHi);
  R(26, 15, 3, 1, B_OUT); R(28, 16, 1, 3, B_OUT); R(28, 18, 1, 1, B_PAL.timberHi);
  R(15, 17, 1, 8, B_PAL.rope);
  R(13, 24, 6, 1, B_OUT); R(12, 25, 1, 1, B_OUT); R(18, 25, 1, 1, B_OUT);
  R(12, 26, 8, 7, B_OUT);
  R(13, 27, 6, 5, B_PAL.plank.base);
  R(14, 27, 1, 5, B_PAL.plank.hi); R(16, 27, 1, 5, B_PAL.plank.lo);
  R(13, 29, 6, 1, B_PAL.stone.lo);
  R(5, 34, 22, 1, B_OUT);
  R(3, 35, 26, 13, B_OUT);
  C(3, 35, 2, 1); C(27, 35, 2, 1);
  R(4, 35, 1, 1, B_OUT); R(27, 35, 1, 1, B_OUT);
  bStones(R, 4, 36, 24, 11, true);
  R(8, 33, 16, 4, B_OUT);
  R(9, 34, 14, 2, '#1d1712');
  R(9, 34, 14, 1, '#312720');
  R(5, 36, 22, 1, B_PAL.stone.hi);
}

function drawMarket(R: Put): void {
  R(4, 14, 24, 18, '#241b12');
  R(0, 4, 32, 10, B_OUT);
  for (let s = 0; s < 8; s++) {
    const sx = 1 + s * 4;
    const w = Math.min(4, 31 - sx);
    const isCloth = s % 2 === 0;
    R(sx, 5, w, 8, isCloth ? B_PAL.cloth : B_PAL.cream);
    R(sx, 11, w, 2, isCloth ? B_PAL.clothLo : B_PAL.creamLo);
    R(sx, 5, w, 1, isCloth ? '#b56b5a' : '#e0d4b6');
  }
  for (let s = 0; s < 8; s++) {
    const sx = 1 + s * 4 + 1;
    const w = Math.min(2, 31 - sx);
    if (w <= 0) break;
    R(sx - 1, 14, 1, 1, B_OUT); R(sx + w, 14, 1, 1, B_OUT);
    R(sx, 14, w, 1, s % 2 === 0 ? B_PAL.cloth : B_PAL.cream);
    R(sx, 15, w, 1, B_OUT);
  }
  for (const px of [1, 28]) {
    R(px, 12, 3, 36, B_OUT);
    R(px + 1, 13, 1, 34, B_PAL.timber);
  }
  R(4, 23, 7, 8, B_OUT);
  bPlanks(R, 5, 24, 5, 6);
  R(5, 24, 5, 1, B_PAL.timber);
  R(5, 23, 2, 1, '#c07a44'); R(8, 23, 2, 1, '#c07a44'); R(6, 23, 1, 1, '#d99a5e');
  R(12, 25, 8, 6, B_OUT);
  R(13, 26, 6, 4, B_PAL.moss);
  R(13, 26, 3, 1, '#74924f'); R(16, 28, 2, 2, B_PAL.mossLo);
  R(21, 24, 7, 7, B_OUT);
  R(22, 25, 5, 5, B_PAL.bone);
  R(23, 24, 2, 1, B_OUT); R(23, 23, 2, 1, B_PAL.boneLo);
  R(22, 28, 5, 1, B_PAL.boneLo); R(24, 25, 1, 3, B_PAL.boneLo);
  R(1, 30, 30, 12, B_OUT);
  R(2, 31, 28, 1, B_PAL.plank.hi);
  bPlanks(R, 2, 32, 28, 9);
  R(2, 32, 28, 1, B_PAL.timber);
  for (const lx of [3, 26]) {
    R(lx, 42, 3, 6, B_OUT);
    R(lx + 1, 42, 1, 5, B_PAL.timber);
  }
}

function drawKeep(R: Put): void {
  for (const mx of [2, 13, 25]) {
    R(mx, 5, 5, 6, B_OUT);
    bStones(R, mx + 1, 6, 3, 4, false);
  }
  R(2, 10, 28, 6, B_OUT);
  bStones(R, 3, 11, 26, 4, false);
  R(4, 14, 24, 44, B_OUT);
  bStones(R, 5, 15, 22, 42, true);
  R(3, 56, 1, 2, B_OUT); R(28, 56, 1, 2, B_OUT);
  R(2, 58, 28, 6, B_OUT);
  bStones(R, 3, 59, 26, 4, true);
  R(13, 18, 6, 7, B_OUT);
  R(14, 19, 4, 5, B_PAL.glow); R(14, 19, 1, 1, B_PAL.glowHi);
  R(15, 19, 1, 5, B_OUT); R(14, 21, 4, 1, B_OUT);
  R(14, 30, 4, 8, B_OUT); R(15, 31, 2, 6, '#1d1712');
  R(8, 42, 4, 7, B_OUT); R(9, 43, 2, 5, '#1d1712');
  R(13, 49, 6, 1, B_OUT); R(12, 50, 8, 2, B_OUT);
  R(11, 52, 10, 12, B_OUT);
  R(12, 53, 8, 10, B_PAL.timber);
  R(13, 51, 6, 2, B_PAL.timber);
  for (let xx = 13; xx <= 18; xx += 2) R(xx, 52, 1, 11, '#3c2c1d');
  R(12, 56, 8, 1, B_PAL.stone.lo); R(12, 60, 8, 1, B_PAL.stone.lo);
}

function drawMonument(R: Put): void {
  R(2, 57, 28, 7, B_OUT);
  bStones(R, 3, 58, 26, 5, true);
  R(5, 51, 22, 7, B_OUT);
  bStones(R, 6, 52, 20, 5, false);
  R(6, 52, 20, 1, B_PAL.stone.hi);
  R(11, 6, 10, 1, B_OUT);
  R(10, 7, 12, 1, B_OUT);
  R(9, 8, 14, 44, B_OUT);
  R(10, 9, 12, 42, B_PAL.stone.base);
  R(11, 7, 10, 2, B_PAL.stone.base);
  R(10, 9, 1, 42, B_PAL.stone.hi);
  R(21, 9, 1, 42, B_PAL.stone.lo);
  R(11, 7, 10, 1, B_PAL.stone.hi);
  R(15, 14, 2, 1, B_OUT); R(14, 15, 4, 1, B_OUT); R(13, 16, 6, 2, B_OUT);
  R(14, 18, 4, 1, B_OUT); R(15, 19, 2, 1, B_OUT);
  R(15, 15, 2, 1, B_PAL.glow); R(14, 16, 4, 2, B_PAL.glow); R(15, 18, 2, 1, B_PAL.glow);
  R(15, 16, 1, 1, B_PAL.glowHi);
  const glyphY = [24, 29, 34, 39, 44];
  for (let i = 0; i < glyphY.length; i++) {
    const gy = glyphY[i];
    const v = bHsh(i, 3) % 3;
    if (v === 0) { R(13, gy, 5, 1, B_PAL.mossLo); R(15, gy + 1, 1, 2, B_PAL.mossLo); }
    else if (v === 1) { R(13, gy, 2, 3, B_PAL.mossLo); R(17, gy, 2, 3, B_PAL.mossLo); R(14, gy + 1, 1, 1, B_PAL.moss); }
    else { R(14, gy, 4, 1, B_PAL.mossLo); R(13, gy + 2, 6, 1, B_PAL.mossLo); }
  }
  R(11, 22, 10, 1, B_PAL.stone.lo);
  R(11, 48, 10, 1, B_PAL.stone.lo);
  R(19, 30, 1, 3, B_PAL.stone.lo); R(20, 33, 1, 3, B_PAL.stone.lo); R(19, 36, 1, 2, B_PAL.stone.lo);
}

function drawFountain(R: Put, C: Clear): void {
  const W = B_PAL.water;
  R(14, 8, 4, 1, W.foam);
  R(13, 7, 1, 1, W.foam); R(18, 7, 1, 1, W.foam);
  R(15, 9, 2, 6, W.hi);
  R(14, 13, 4, 2, B_OUT);
  R(13, 15, 6, 6, B_OUT);
  R(14, 16, 4, 4, B_PAL.stone.base); R(14, 16, 1, 4, B_PAL.stone.hi);
  R(7, 20, 18, 5, B_OUT);
  R(8, 21, 16, 1, B_PAL.stone.hi);
  R(9, 22, 14, 2, W.base);
  R(9, 22, 3, 1, W.hi); R(18, 23, 3, 1, W.hi);
  R(9, 25, 14, 2, B_OUT);
  R(10, 25, 12, 1, B_PAL.stone.base);
  R(12, 26, 8, 1, B_PAL.stone.lo);
  R(12, 27, 8, 25, B_OUT);
  bStones(R, 13, 28, 6, 23, false);
  R(13, 28, 1, 23, B_PAL.stone.hi);
  R(1, 50, 30, 14, B_OUT);
  C(1, 50, 1, 1); C(30, 50, 1, 1);
  R(2, 51, 28, 1, B_PAL.stone.hi);
  R(3, 52, 26, 6, W.base);
  R(3, 52, 26, 1, W.lo);
  for (let xx = 4; xx < 28; xx += 3) if (bHsh(xx, 9) % 2 === 0) R(xx, 53 + (bHsh(xx, 2) % 3), 2, 1, W.hi);
  R(2, 58, 28, 1, B_PAL.stone.hi);
  bStones(R, 2, 59, 28, 4, true);
  for (let yy = 25; yy <= 53; yy++) {
    const c = yy % 3 === 0 ? W.base : W.hi;
    R(8, yy, 1, 1, c); R(23, yy, 1, 1, c);
  }
  R(7, 53, 1, 1, W.foam); R(9, 54, 1, 1, W.foam);
  R(22, 54, 1, 1, W.foam); R(24, 53, 1, 1, W.foam);
}

function drawBanner(R: Put): void {
  R(6, 2, 3, 28, B_OUT);
  R(7, 3, 1, 26, B_PAL.timber);
  R(6, 1, 3, 1, B_OUT); R(7, 0, 1, 1, B_PAL.timberHi);
  R(2, 4, 12, 3, B_OUT);
  R(3, 5, 10, 1, B_PAL.timberHi);
  R(2, 7, 12, 11, B_OUT);
  R(3, 8, 10, 9, B_PAL.cloth);
  R(3, 8, 10, 1, B_PAL.cream);
  R(5, 9, 1, 8, B_PAL.clothLo); R(9, 9, 1, 8, B_PAL.clothLo);
  R(3, 16, 10, 1, B_PAL.clothLo);
  R(7, 11, 2, 1, B_PAL.moss); R(6, 12, 4, 1, B_PAL.moss); R(7, 13, 2, 1, B_PAL.moss);
  R(7, 12, 1, 1, '#74924f');
  R(6, 18, 4, 1, B_OUT);
  for (let yy = 18; yy <= 20; yy++) {
    R(2, yy, 1, 1, B_OUT); R(3, yy, 3, 1, yy === 20 ? B_PAL.clothLo : B_PAL.cloth); R(6, yy, 1, 1, B_OUT);
    R(9, yy, 1, 1, B_OUT); R(10, yy, 3, 1, yy === 20 ? B_PAL.clothLo : B_PAL.cloth); R(13, yy, 1, 1, B_OUT);
  }
  R(2, 21, 5, 1, B_OUT); R(9, 21, 5, 1, B_OUT);
  R(4, 29, 7, 3, B_OUT);
  R(5, 30, 5, 1, B_PAL.stone.base); R(5, 30, 2, 1, B_PAL.stone.hi);
}

function drawLamp(R: Put): void {
  R(7, 0, 2, 1, B_OUT);
  R(4, 1, 8, 2, B_OUT);
  R(5, 1, 6, 1, B_PAL.timberHi);
  R(4, 3, 8, 8, B_OUT);
  R(5, 4, 6, 6, B_PAL.glow);
  R(5, 4, 2, 2, B_PAL.glowHi);
  R(7, 4, 1, 6, B_OUT);
  R(5, 10, 6, 1, B_PAL.timber);
  R(3, 5, 1, 4, 'rgba(224,178,104,0.30)'); R(12, 5, 1, 4, 'rgba(224,178,104,0.30)');
  R(6, 11, 4, 18, B_OUT);
  R(7, 12, 2, 16, B_PAL.timber);
  R(7, 12, 1, 16, B_PAL.timberHi);
  R(5, 13, 6, 2, B_OUT); R(6, 14, 4, 1, B_PAL.timber);
  R(4, 28, 8, 4, B_OUT);
  R(5, 29, 6, 2, B_PAL.stone.base);
  R(5, 29, 3, 1, B_PAL.stone.hi);
}

function drawFlowers(R: Put): void {
  R(1, 21, 14, 11, B_OUT);
  R(2, 22, 12, 1, B_PAL.timberHi);
  R(2, 23, 12, 6, B_PAL.soil);
  for (let xx = 2; xx < 14; xx += 2) if (bHsh(xx, 1) % 3 === 0) R(xx, 24 + (bHsh(xx, 4) % 4), 1, 1, '#2a1e13');
  R(2, 29, 12, 2, B_PAL.timber);
  R(2, 29, 12, 1, B_PAL.timberHi);
  const blooms = [
    { x: 2, y: 16, c: B_PAL.bloomR, hi: '#c47a6a' },
    { x: 6, y: 13, c: B_PAL.bloomO, hi: '#d9b76b' },
    { x: 10, y: 16, c: B_PAL.cream, hi: '#e5d9bc' },
  ];
  for (const b of blooms) {
    R(b.x + 1, b.y + 2, 1, 23 - b.y, B_PAL.mossLo);
    R(b.x + 2, b.y + 3, 2, 1, B_PAL.moss);
    R(b.x, b.y - 1, 3, 1, B_OUT); R(b.x, b.y + 2, 3, 1, B_OUT);
    R(b.x - 1, b.y, 1, 2, B_OUT); R(b.x + 3, b.y, 1, 2, B_OUT);
    R(b.x, b.y, 3, 2, b.c);
    R(b.x, b.y, 2, 1, b.hi);
    R(b.x + 1, b.y + 1, 1, 1, b.c === B_PAL.cream ? B_PAL.creamLo : (b.c === B_PAL.bloomR ? B_PAL.clothLo : '#9c7834'));
  }
  R(3, 25, 2, 1, B_PAL.moss); R(9, 26, 2, 1, B_PAL.moss);
  R(6, 25, 2, 1, B_PAL.bloomR); R(12, 24, 1, 1, B_PAL.bloomO);
  R(5, 24, 1, 1, B_PAL.moss); R(11, 25, 1, 1, B_PAL.mossLo);
}

function drawRug(R: Put): void {
  const rows: Record<number, [number, number][]> = {
    16: [[6, 9]], 17: [[5, 10]], 18: [[2, 13]], 19: [[1, 14]], 20: [[1, 14]],
    21: [[1, 14]], 22: [[2, 13]], 23: [[2, 13]], 24: [[2, 13]], 25: [[2, 13]],
    26: [[1, 14]], 27: [[1, 14]], 28: [[1, 14]],
    29: [[1, 4], [7, 8], [11, 14]], 30: [[1, 3], [7, 8], [12, 14]], 31: [[2, 3], [12, 13]],
  };
  const inMask = (x: number, y: number): boolean => {
    const r = rows[y];
    if (!r) return false;
    for (const [a, b] of r) if (x >= a && x <= b) return true;
    return false;
  };
  for (let y = 15; y <= 31; y++)
    for (let x = 0; x < 16; x++) {
      if (!inMask(x, y)) continue;
      const edge = !inMask(x - 1, y) || !inMask(x + 1, y) || !inMask(x, y - 1) || !inMask(x, y + 1);
      R(x, y, 1, 1, edge ? B_OUT : '#b08a58');
    }
  for (let y = 19; y <= 21; y++)
    for (let x = 2; x <= 13; x++)
      if (inMask(x, y) && !(!inMask(x - 1, y) || !inMask(x + 1, y) || !inMask(x, y - 1) || !inMask(x, y + 1)))
        if (y === 19 || x <= 3) R(x, y, 1, 1, '#c9a06c');
  R(3, 27, 9, 1, '#9d774a');
  R(7, 18, 2, 10, '#8f6a40');
  R(7, 18, 1, 10, '#9d774a');
  const spots: [number, number][] = [[3, 20], [11, 20], [4, 24], [10, 24], [12, 27], [3, 27]];
  for (const [sx, sy] of spots) {
    R(sx, sy, 1, 1, B_PAL.timber); R(sx + 1, sy + 1, 1, 1, B_PAL.timber);
    R(sx + 1, sy, 1, 1, '#6d5233');
  }
  R(7, 29, 2, 1, '#8f6a40');
}

function drawTrophy(R: Put, C: Clear): void {
  const blk = (x: number, y: number, w: number, h: number) => { R(x, y, w, h, B_PAL.antler); R(x, y, 1, 1, B_PAL.antlerHi); };
  blk(4, 6, 2, 2); blk(3, 4, 2, 3); blk(2, 2, 2, 3); blk(1, 0, 2, 3);
  blk(5, 2, 1, 3);
  blk(10, 6, 2, 2); blk(11, 4, 2, 3); blk(12, 2, 2, 3); blk(13, 0, 2, 3);
  blk(10, 2, 1, 3);
  R(3, 7, 10, 9, B_OUT);
  C(3, 7, 1, 1); C(12, 7, 1, 1); C(3, 15, 1, 1); C(12, 15, 1, 1);
  R(4, 8, 8, 7, B_PAL.bone);
  R(4, 8, 8, 1, '#e5dcc2');
  R(4, 8, 1, 6, '#e5dcc2');
  R(5, 11, 2, 2, B_OUT); R(9, 11, 2, 2, B_OUT);
  R(5, 11, 1, 1, '#443528'); R(9, 11, 1, 1, '#443528');
  R(7, 13, 2, 2, B_PAL.boneLo);
  R(5, 14, 6, 1, B_PAL.boneLo);
  R(3, 16, 10, 9, B_OUT);
  bPlanks(R, 4, 17, 8, 7);
  R(4, 17, 8, 1, B_PAL.timber);
  R(4, 23, 8, 1, B_PAL.timber);
  R(4, 17, 1, 1, B_PAL.timberHi); R(11, 23, 1, 1, B_PAL.timberHi);
  R(6, 25, 4, 20, B_OUT);
  R(7, 26, 2, 18, B_PAL.timber);
  R(7, 26, 1, 18, B_PAL.timberHi);
  R(4, 44, 8, 4, B_OUT);
  R(5, 45, 6, 2, B_PAL.stone.base);
  R(5, 45, 3, 1, B_PAL.stone.hi);
}

// The Forge: a stone furnace with a chimney and a bright fire mouth, an iron
// anvil on a timber stump beside it. Hot colours are literals (no B_PAL entry).
function drawForge(R: Put, C: Clear): void {
  const S = B_PAL.stone;
  const iron = '#4a4e54', ironHi = '#7d828a', ironFace = '#5b5f66';
  const emberD = '#c2531f', ember = '#e0763c', ember2 = '#f2b13c', core = '#ffe08a';
  // ground slab
  R(2, 43, 28, 5, B_OUT); bStones(R, 3, 44, 26, 3, true);
  // smoke + chimney stack
  R(8, 2, 2, 2, '#6f6a61'); R(9, 0, 3, 2, '#8f8a80'); R(11, 1, 2, 2, '#a49e94');
  R(6, 3, 8, 6, B_OUT); bStones(R, 7, 4, 6, 4, false); R(7, 4, 6, 1, S.hi);
  // hood widening down onto the body
  R(4, 9, 11, 4, B_OUT); bStones(R, 5, 10, 9, 2, false);
  // furnace body
  R(3, 13, 14, 30, B_OUT); bStones(R, 4, 14, 12, 28, true); R(4, 14, 12, 1, S.hi);
  // arched fire mouth, banked from deep ember to a white-hot core
  R(5, 25, 9, 15, B_OUT); C(5, 25, 1, 1); C(13, 25, 1, 1);
  R(6, 27, 7, 12, emberD); R(7, 29, 5, 9, ember); R(8, 31, 3, 6, ember2); R(9, 33, 1, 3, core);
  R(6, 38, 7, 1, ember2); R(7, 39, 5, 1, ember);
  R(15, 28, 1, 1, core); R(16, 31, 1, 1, ember2); R(14, 23, 1, 1, core); // sparks
  // anvil: horn, face, waist and base
  R(16, 27, 2, 2, B_OUT); R(16, 27, 1, 1, ironFace);
  R(18, 26, 12, 4, B_OUT); R(19, 27, 10, 2, ironFace); R(19, 27, 10, 1, ironHi);
  R(22, 30, 4, 3, B_OUT); R(23, 30, 2, 3, iron);
  R(19, 33, 12, 2, B_OUT); R(20, 33, 10, 1, iron);
  R(22, 25, 3, 1, ember2); R(23, 25, 1, 1, core); // glowing ingot on the face
  // timber stump under the anvil
  R(21, 35, 9, 8, B_OUT); R(22, 36, 7, 7, B_PAL.timber); R(22, 36, 1, 7, B_PAL.timberHi);
  R(24, 36, 1, 7, '#3c2c1d'); R(26, 36, 1, 7, '#3c2c1d'); R(28, 36, 1, 7, '#3c2c1d');
}

// Overgrown-Jungle vine arch (mossy stone + hanging vines)
const JP = {
  out: '#1c2018', stoneD: '#454b40', stoneM: '#5d6455', stone: '#78806e', stoneL: '#99a189',
  moss: '#4d6b3c', mossL: '#61854a', vine: '#3e5c34', leafL: '#628a4a',
  shadow: 'rgba(18,24,14,0.30)',
};
function jHsh(x: number, y: number): number {
  let h = ((x + 7) * 374761393 + (y + 13) * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
function jStone(R: Put, x0: number, y0: number, w: number, h: number, mossy: boolean): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = x0 + x, gy = y0 + y;
      const course = Math.floor(y / 4);
      let c = JP.stone;
      if (y % 4 === 3) c = JP.stoneM;
      else {
        const off = (course % 2) * 3;
        if ((x + off) % 6 === 5) c = JP.stoneM;
        else if (y % 4 === 0 && jHsh(gx, gy) % 4 === 0) c = JP.stoneL;
        else if (jHsh(gx, gy) % 17 === 0) c = JP.stoneD;
      }
      if (mossy) {
        const fromBot = h - 1 - y;
        const m = jHsh(gx, gy + 101) % (3 + fromBot * 2);
        if (m === 0) c = jHsh(gx, gy + 47) % 3 === 0 ? JP.mossL : JP.moss;
      }
      R(gx, gy, 1, 1, c);
    }
  }
}
function jVine(R: Put, x: number, y0: number, y1: number, seed: number): void {
  for (let y = y0; y <= y1; y++) {
    const wob = jHsh(seed, y) % 3 === 0 ? 1 : 0;
    R(x + wob, y, 1, 1, JP.vine);
    if (jHsh(seed + 3, y) % 4 === 0) R(x + wob - 1, y, 1, 1, JP.leafL);
  }
}
function drawArchJungle(R: Put): void {
  R(0, 47, 32, 1, JP.shadow);
  R(1, 13, 10, 30, JP.out); jStone(R, 2, 14, 8, 28, true); R(2, 14, 1, 28, JP.stoneL);
  R(21, 13, 10, 30, JP.out); jStone(R, 22, 14, 8, 28, true); R(29, 14, 1, 28, JP.stoneD);
  R(0, 42, 12, 6, JP.out); jStone(R, 1, 43, 10, 5, true); R(1, 43, 10, 1, JP.stoneL);
  R(20, 42, 12, 6, JP.out); jStone(R, 21, 43, 10, 5, true); R(21, 43, 10, 1, JP.stoneL);
  R(0, 4, 32, 11, JP.out); jStone(R, 1, 5, 30, 9, false);
  R(1, 5, 30, 1, JP.stoneL);
  for (let x = 3; x < 29; x += 4) R(x, 9, 2, 2, JP.stoneD);
  R(12, 2, 8, 13, JP.out); R(13, 3, 6, 11, JP.stone); R(13, 3, 6, 1, JP.stoneL); R(13, 3, 1, 11, JP.stoneL);
  R(15, 7, 2, 3, JP.stoneD);
  R(10, 14, 3, 3, JP.out); R(10, 14, 2, 2, JP.stone);
  R(19, 14, 3, 3, JP.out); R(20, 14, 2, 2, JP.stoneM);
  jVine(R, 12, 16, 47, 61); jVine(R, 16, 15, 47, 62); jVine(R, 18, 16, 47, 63);
}

// 12×12 HUD slot icons — a chunky glyph per kind that still reads at inventory size
function drawStructureIcon(R: Put, C: Clear, kind: StructureArt['kind']): void {
  const S = B_PAL.stone, F = B_PAL.roof;
  switch (kind) {
    case 'hall':
      R(1, 6, 10, 6, B_OUT); bPlanks(R, 2, 7, 8, 5);
      R(5, 9, 2, 3, B_OUT); R(5, 9, 2, 2, B_PAL.glow);
      R(1, 4, 10, 1, B_OUT); R(1, 5, 10, 1, F.base);
      for (let i = 0; i < 3; i++) { const in2 = 2 - i; R(2 + in2, 2 + i, 8 - in2 * 2, 1, F.base); }
      R(5, 0, 4, 3, B_OUT); R(6, 1, 2, 2, B_PAL.glow);
      R(6, 0, 2, 1, F.hi);
      break;
    case 'well':
      R(1, 0, 10, 2, B_OUT); R(2, 0, 8, 1, F.base);
      R(1, 2, 2, 6, B_OUT); R(9, 2, 2, 6, B_OUT);
      R(5, 3, 2, 3, B_PAL.rope);
      R(1, 7, 10, 5, B_OUT); bStones(R, 2, 8, 8, 3, false);
      R(4, 7, 4, 2, '#1d1712');
      break;
    case 'market':
      R(0, 1, 12, 4, B_OUT);
      for (let s = 0; s < 3; s++) R(1 + s * 4, 2, 4, 2, s % 2 ? B_PAL.cream : B_PAL.cloth);
      R(1, 5, 2, 7, B_OUT); R(9, 5, 2, 7, B_OUT);
      R(1, 7, 10, 4, B_OUT); bPlanks(R, 2, 8, 8, 2);
      break;
    case 'keep':
      R(1, 0, 3, 3, B_OUT); R(8, 0, 3, 3, B_OUT); R(5, 1, 2, 2, B_OUT);
      R(1, 3, 10, 9, B_OUT); bStones(R, 2, 4, 8, 7, false);
      R(5, 8, 2, 4, B_OUT); R(5, 9, 2, 3, B_PAL.timber);
      R(5, 5, 2, 2, B_PAL.glow);
      break;
    case 'monument':
      R(1, 10, 10, 2, B_OUT); R(2, 10, 8, 1, S.base);
      R(3, 0, 6, 10, B_OUT); R(4, 1, 4, 9, S.base); R(4, 1, 1, 9, S.hi);
      R(5, 3, 2, 2, B_PAL.glow);
      break;
    case 'fountain':
      R(5, 0, 2, 3, B_PAL.water.hi);
      R(4, 3, 4, 4, B_OUT); R(5, 4, 2, 2, S.base);
      R(1, 7, 10, 5, B_OUT); R(2, 8, 8, 2, B_PAL.water.base); R(3, 8, 3, 1, B_PAL.water.hi);
      R(2, 10, 8, 1, S.base);
      break;
    case 'archJungle':
      R(0, 0, 12, 3, JP.out); R(1, 1, 10, 1, JP.stone); R(1, 1, 10, 1, JP.stoneL);
      R(0, 3, 4, 9, JP.out); R(1, 4, 2, 7, JP.stone);
      R(8, 3, 4, 9, JP.out); R(9, 4, 2, 7, JP.stone);
      R(5, 3, 1, 4, JP.vine); R(6, 3, 1, 3, JP.vine);
      break;
    case 'banner':
      R(1, 0, 10, 2, B_OUT); R(2, 1, 8, 1, B_PAL.timberHi);
      R(2, 2, 8, 8, B_OUT); R(3, 3, 6, 6, B_PAL.cloth);
      R(3, 3, 6, 1, B_PAL.cream); R(5, 5, 2, 2, B_PAL.moss);
      C(5, 8, 2, 2); R(5, 8, 2, 1, B_OUT);
      break;
    case 'lamp':
      R(3, 0, 6, 6, B_OUT); R(4, 1, 4, 4, B_PAL.glow); R(4, 1, 2, 2, B_PAL.glowHi);
      R(5, 6, 2, 5, B_OUT);
      R(3, 10, 6, 2, B_OUT);
      break;
    case 'flowers':
      R(0, 6, 12, 6, B_OUT); R(1, 7, 10, 2, B_PAL.soil); R(1, 9, 10, 2, B_PAL.timber); R(1, 9, 10, 1, B_PAL.timberHi);
      R(1, 3, 3, 3, B_OUT); R(2, 4, 1, 1, B_PAL.bloomR);
      R(5, 1, 3, 3, B_OUT); R(6, 2, 1, 1, B_PAL.bloomO);
      R(8, 3, 3, 3, B_OUT); R(9, 4, 1, 1, B_PAL.cream);
      break;
    case 'trophy':
      R(1, 0, 2, 4, B_PAL.antler); R(9, 0, 2, 4, B_PAL.antler);
      R(3, 2, 1, 2, B_PAL.antler); R(8, 2, 1, 2, B_PAL.antler);
      R(1, 0, 1, 1, B_PAL.antlerHi); R(9, 0, 1, 1, B_PAL.antlerHi);
      R(3, 3, 6, 5, B_OUT); R(4, 4, 4, 3, B_PAL.bone);
      R(5, 5, 1, 1, B_OUT); R(7, 5, 1, 1, B_OUT);
      R(5, 8, 2, 4, B_OUT);
      break;
    case 'rug':
      R(1, 2, 10, 8, B_OUT); C(1, 2, 1, 1); C(10, 2, 1, 1); C(1, 9, 1, 1); C(10, 9, 1, 1);
      R(2, 3, 8, 6, '#b08a58'); R(2, 3, 8, 1, '#c9a06c');
      R(4, 4, 2, 1, B_PAL.timber); R(7, 6, 2, 1, B_PAL.timber); R(3, 7, 1, 1, B_PAL.timber);
      break;
    case 'forge':
      // stone furnace with a glowing fire mouth + short chimney, a small anvil beside it
      R(3, 0, 3, 2, B_OUT); R(4, 0, 1, 1, '#8f8a80'); // chimney + smoke
      R(1, 2, 7, 10, B_OUT); bStones(R, 2, 3, 5, 8, false);
      R(3, 6, 3, 5, B_OUT); R(3, 7, 3, 4, '#e0763c'); R(4, 8, 1, 3, '#ffe08a');
      R(8, 8, 4, 1, B_OUT); R(9, 9, 2, 1, B_OUT); R(8, 10, 4, 1, B_OUT); // anvil
      R(9, 9, 2, 1, S.hi);
      break;
  }
}

const STRUCTURE_DRAWERS: Record<StructureArt['kind'], (R: Put, C: Clear) => void> = {
  hall: (R) => drawHall(R),
  well: (R, C) => drawWell(R, C),
  market: (R) => drawMarket(R),
  keep: (R) => drawKeep(R),
  monument: (R) => drawMonument(R),
  fountain: (R, C) => drawFountain(R, C),
  archJungle: (R) => drawArchJungle(R),
  banner: (R) => drawBanner(R),
  lamp: (R) => drawLamp(R),
  flowers: (R) => drawFlowers(R),
  trophy: (R, C) => drawTrophy(R, C),
  rug: (R) => drawRug(R),
  forge: (R, C) => drawForge(R, C),
};

/**
 * Draw a Village / Wildlife Structure into a 2D context at any W×H — shared by the
 * slot icon here and the in-world texture the scene bakes, so they always match.
 * At the 12×12 HUD size it draws a simplified glyph; at full baked size (authored
 * per kind) it draws the detailed sprite. Ships no PNG assets.
 */
export function drawStructureArt(ctx: CanvasRenderingContext2D, W: number, H: number, art: StructureArt, tier = 5): void {
  ctx.clearRect(0, 0, W, H);
  const R: Put = (x, y, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(x | 0, y | 0, Math.max(1, w | 0), Math.max(1, h | 0));
  };
  const C: Clear = (x, y, w, h) => ctx.clearRect(x | 0, y | 0, w | 0, h | 0);
  if (W <= 12) { drawStructureIcon(R, C, art.kind); return; }
  // ADR-0013: the Hall draws a per-tier stage (hut / cottage / gated hall)
  if (art.kind === 'hall') { drawHall(R, tier); return; }
  STRUCTURE_DRAWERS[art.kind](R, C);
}

const cache = new Map<ItemId, string>();

/** icon URL for an item: a data URL for drawn icons, an asset URL for structures */
export function itemIcon(id: ItemId): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const grid = GRIDS[id];
  const villageArt: StructureArt | undefined =
    VILLAGE_ART[id as keyof typeof VILLAGE_ART] ??
    WILDLIFE_ART[id as keyof typeof WILDLIFE_ART] ??
    FORGE_ART[id as keyof typeof FORGE_ART];
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
