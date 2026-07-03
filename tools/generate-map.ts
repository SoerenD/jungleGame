/**
 * One-time map-building script for Jungle World v1 (does not ship in the game).
 * Outputs:
 *   public/map/jungle-map.json  — Tiled JSON (ground + decor tile layers)
 *   public/map/world-data.json  — spawn, zones, resource nodes, foliage, blocked grid
 *
 * Run: npm run genmap
 */
import fs from 'node:fs';
import path from 'node:path';
import { ARENA_W, ARENA_H } from '../src/content/guardian';

const W = 200;
const H = 200;

// ---------------------------------------------------------------- tileset mapping
// Indices into public/assets/tiles/terrain.png (0-based tile ids; gid = id + 1).
// Finalized against the downloaded tileset — see CREDITS.md.
// These constants are set from the tileset image dimensions:
const TILESET = {
  name: 'terrain',
  image: '../assets/tiles/terrain.png',
  tileSize: 16,
  columns: 11,
  imagewidth: 176,
  imageheight: 16,
};

// logical -> tile id (0-based). Arrays = random variants.
const T: Record<string, number[]> = {
  grass: [0, 0, 0, 9, 10],
  water: [1],
  sand: [2],
  dirt: [3],
  swamp: [4],
  cliff: [5],
  stone_floor: [6],
  flower: [7],
  plant: [8],
};

// ---------------------------------------------------------------- deterministic RNG
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(7);
const rand = (min: number, max: number) => min + rng() * (max - min);
const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

// ---------------------------------------------------------------- grid
type Ground =
  | 'grass'
  | 'water'
  | 'sand'
  | 'dirt'
  | 'swamp'
  | 'cliff'
  | 'stone_floor';

const ground: Ground[][] = Array.from({ length: H }, () => Array<Ground>(W).fill('grass'));
const decor: (string | null)[][] = Array.from({ length: H }, () => Array<string | null>(W).fill(null));

const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

function fillCircle(cx: number, cy: number, r: number, kind: Ground, over?: Ground[]) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (!inBounds(x, y)) continue;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
        if (!over || over.includes(ground[y][x])) ground[y][x] = kind;
      }
    }
  }
}

function fillRect(x0: number, y0: number, w: number, h: number, kind: Ground) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (inBounds(x, y)) ground[y][x] = kind;
    }
  }
}

// ---------------------------------------------------------------- authoring

// 1. northern cliff range (frame for the waterfall)
fillRect(0, 0, W, 6, 'cliff');

// 2. waterfall pouring through the cliff into a pool
fillRect(96, 0, 9, 22, 'water');
fillCircle(100, 28, 9, 'water');

// 3. river: pool -> meander south -> delta in the south-west
function carveRiver(points: [number, number][], width: number) {
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = x0 + (x1 - x0) * t + Math.sin(t * Math.PI * 3 + i) * 1.5;
      const y = y0 + (y1 - y0) * t;
      fillCircle(x, y, width, 'water');
    }
  }
}
carveRiver(
  [
    [100, 34],
    [92, 55],
    [80, 75],
    [72, 95],
    [66, 115],
    [58, 135],
    [48, 155],
    [40, 175],
    [34, 199],
  ],
  2.4,
);
// delta branches
carveRiver(
  [
    [58, 135],
    [45, 150],
    [30, 170],
    [22, 199],
  ],
  2.0,
);
carveRiver(
  [
    [48, 155],
    [55, 175],
    [58, 199],
  ],
  1.8,
);

// 4. sunken swamp — south-east
for (let i = 0; i < 26; i++) {
  fillCircle(rand(132, 184), rand(140, 182), rand(1.5, 4.5), 'swamp');
}
for (let i = 0; i < 14; i++) {
  fillCircle(rand(134, 182), rand(142, 180), rand(1, 3), 'water');
}

// 5. ancient ruins — north-east: broken stone floors
for (let i = 0; i < 12; i++) {
  fillCircle(rand(146, 178), rand(20, 52), rand(2, 5), 'stone_floor', ['grass']);
}
fillRect(154, 30, 14, 12, 'stone_floor');

// 6. dirt paths from the spawn clearing to every zone
function carvePath(points: [number, number][]) {
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = Math.round(x0 + (x1 - x0) * t + Math.sin(t * 7 + i * 2) * 1.2);
      const y = Math.round(y0 + (y1 - y0) * t);
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = 0; dx <= 1; dx++) {
          if (!inBounds(x + dx, y + dy)) continue;
          const g = ground[y + dy][x + dx];
          if (g === 'grass' || g === 'swamp' || g === 'stone_floor') ground[y + dy][x + dx] = 'dirt';
          else if (g === 'water') ground[y + dy][x + dx] = 'sand'; // ford
        }
      }
    }
  }
}
carvePath([
  [100, 100],
  [100, 60],
  [100, 40],
]); // → waterfall
carvePath([
  [100, 100],
  [125, 80],
  [150, 55],
  [162, 38],
]); // → ruins
carvePath([
  [100, 100],
  [130, 100],
  [158, 100],
]); // → dense grove
carvePath([
  [100, 100],
  [120, 130],
  [150, 158],
]); // → swamp
carvePath([
  [100, 100],
  [75, 120],
  [55, 145],
  [42, 160],
]); // → river delta (crosses the river at a ford)
carvePath([
  [100, 100],
  [70, 90],
  [45, 80],
  [32, 75],
]); // → hidden grove entrance

// 7. beaches: grass adjacent to water becomes sand
const sandify: [number, number][] = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (ground[y][x] !== 'grass') continue;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      if (inBounds(x + dx, y + dy) && ground[y + dy][x + dx] === 'water') {
        sandify.push([x, y]);
        break;
      }
    }
  }
}
for (const [x, y] of sandify) ground[y][x] = 'sand';

// 8. v2: the Guardian's arena — a cliff-walled court in the north-east ruins.
// Terrain is written BEFORE node generation so no node lands inside, and the
// arena consumes no RNG — v1 node ids stay byte-stable for existing saves.
const ARENA = { x: 169, y: 15, w: ARENA_W, h: ARENA_H };
const GUARDIAN_HOME = { tx: ARENA.x + Math.floor(ARENA_W / 2) - 1, ty: ARENA.y + 1 }; // 3x3, top-center
const SEAL_GATE = [ARENA.x + 7, ARENA.x + 8, ARENA.x + 9].map((tx) => ({ tx, ty: ARENA.y + ARENA.h })); // south entrance
for (let y = ARENA.y - 1; y <= ARENA.y + ARENA.h; y++) {
  for (let x = ARENA.x - 1; x <= ARENA.x + ARENA.w; x++) {
    const isWall = x === ARENA.x - 1 || x === ARENA.x + ARENA.w || y === ARENA.y - 1 || y === ARENA.y + ARENA.h;
    ground[y][x] = isWall ? 'cliff' : 'stone_floor';
  }
}
for (const g of SEAL_GATE) ground[g.ty][g.tx] = 'stone_floor'; // the entrance gap the Seal blocks
carvePath([
  [162, 38],
  [170, 34],
  [SEAL_GATE[1].tx, SEAL_GATE[1].ty + 2],
]); // → arena entrance

// 8b. spawn clearing — keep it open
const SPAWN = { tx: 100, ty: 100 };

// ---------------------------------------------------------------- zones
const zones = [
  { name: 'Spawn Clearing', x: 88, y: 88, w: 24, h: 24 },
  { name: 'Thundering Falls', x: 86, y: 6, w: 30, h: 34 },
  { name: 'Ancient Ruins', x: 140, y: 14, w: 48, h: 44 },
  { name: 'Dense Grove', x: 128, y: 66, w: 62, h: 62 },
  { name: 'Sunken Swamp', x: 126, y: 134, w: 64, h: 56 },
  { name: 'River Delta', x: 12, y: 120, w: 70, h: 74 },
  { name: 'Hidden Grove', x: 6, y: 56, w: 30, h: 40 },
];

function zoneAt(x: number, y: number): string {
  for (const z of zones) {
    if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) return z.name;
  }
  return 'Deep Jungle';
}

// ---------------------------------------------------------------- resource nodes + foliage
interface NodeOut {
  id: string;
  type: 'tree' | 'rock' | 'fruit_bush' | 'fiber_vine' | 'hardwood_tree' | 'obsidian_rock' | 'fishing_spot';
  tx: number;
  ty: number;
}

const inArenaOuter = (x: number, y: number) =>
  x >= ARENA.x - 1 && x <= ARENA.x + ARENA.w && y >= ARENA.y - 1 && y <= ARENA.y + ARENA.h;
const nodes: NodeOut[] = [];
const foliage: { kind: string; tx: number; ty: number }[] = [];
const occupied = new Set<string>();

const treeDensity: Record<string, number> = {
  'Dense Grove': 0.4,
  'Deep Jungle': 0.16,
  'Spawn Clearing': 0.015,
  'Thundering Falls': 0.06,
  'Ancient Ruins': 0.05,
  'Sunken Swamp': 0.09,
  'River Delta': 0.07,
  'Hidden Grove': 0.1,
};
const rockDensity: Record<string, number> = {
  'Ancient Ruins': 0.09,
  'Thundering Falls': 0.1,
  'Deep Jungle': 0.012,
  'Dense Grove': 0.015,
  'Sunken Swamp': 0.02,
  'River Delta': 0.015,
  'Spawn Clearing': 0.004,
  'Hidden Grove': 0.01,
};
const bushDensity: Record<string, number> = {
  'Spawn Clearing': 0.05,
  'Hidden Grove': 0.22,
  'River Delta': 0.055,
  'Deep Jungle': 0.012,
  'Dense Grove': 0.01,
  'Ancient Ruins': 0.01,
  'Thundering Falls': 0.015,
  'Sunken Swamp': 0.008,
};
const vineDensity: Record<string, number> = {
  'Sunken Swamp': 0.12,
  'Dense Grove': 0.07,
  'River Delta': 0.02,
  'Deep Jungle': 0.006,
  'Hidden Grove': 0.02,
  'Ancient Ruins': 0.008,
  'Spawn Clearing': 0,
  'Thundering Falls': 0.005,
};

function nearWater(x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (inBounds(x + dx, y + dy) && ground[y + dy][x + dx] === 'water') return true;
    }
  }
  return false;
}

let nodeId = 0;
function tryPlaceNode(type: NodeOut['type'], x: number, y: number): void {
  if (!inBounds(x, y)) return;
  const key = `${x},${y}`;
  if (occupied.has(key)) return;
  const g = ground[y][x];
  if (g !== 'grass' && g !== 'swamp' && !((type === 'rock' || type === 'obsidian_rock') && g === 'stone_floor')) return;
  if (Math.abs(x - SPAWN.tx) <= 2 && Math.abs(y - SPAWN.ty) <= 2) return;
  if ((type === 'tree' || type === 'hardwood_tree') && nearWater(x, y)) return;
  occupied.add(key);
  nodes.push({ id: `n${nodeId++}`, type, tx: x, ty: y });
}

// jittered 2x2 grid keeps nodes from clumping into unreadable blobs
for (let gy = 1; gy < H - 1; gy += 2) {
  for (let gx = 1; gx < W - 1; gx += 2) {
    const x = gx + Math.floor(rand(0, 2));
    const y = gy + Math.floor(rand(0, 2));
    if (!inBounds(x, y)) continue;
    const zone = zoneAt(x, y);
    const roll = rng();
    if (roll < (treeDensity[zone] ?? 0.1)) tryPlaceNode('tree', x, y);
    else if (roll < (treeDensity[zone] ?? 0.1) + (rockDensity[zone] ?? 0.01)) tryPlaceNode('rock', x, y);
    else if (roll < (treeDensity[zone] ?? 0.1) + (rockDensity[zone] ?? 0.01) + (bushDensity[zone] ?? 0.01))
      tryPlaceNode('fruit_bush', x, y);
    else if (
      roll <
      (treeDensity[zone] ?? 0.1) + (rockDensity[zone] ?? 0.01) + (bushDensity[zone] ?? 0.01) + (vineDensity[zone] ?? 0.005)
    )
      tryPlaceNode('fiber_vine', x, y);
  }
}

// hidden grove: dense tree ring with a single eastern entrance
for (let a = 0; a < Math.PI * 2; a += 0.09) {
  const rx = Math.round(20 + Math.cos(a) * 13);
  const ry = Math.round(75 + Math.sin(a) * 15);
  if (Math.abs(ry - 75) < 3 && rx > 26) continue; // entrance gap
  tryPlaceNode('tree', rx, ry);
  tryPlaceNode('tree', rx + 1, ry);
}

// ruin pillars (decorative, solid) — none inside the v2 arena
const pillarSpots: [number, number][] = [
  [154, 30],
  [167, 30],
  [154, 41],
  [167, 41],
  [148, 24],
  [174, 24],
  [160, 48],
  [150, 50],
];
for (const [x, y] of pillarSpots) {
  if (occupied.has(`${x},${y}`) || inArenaOuter(x, y)) continue;
  occupied.add(`${x},${y}`);
  foliage.push({ kind: 'ruin_pillar', tx: x, ty: y });
}

// ---------------------------------------------------------------- v2 nodes
// Placed AFTER the main loop with no RNG so v1 node ids stay stable.
// Tier-2 nodes are visible from day one and taunt until the tools exist.

/** place at the first valid tile spiralling out from (cx, cy) */
function placeNodeNear(type: NodeOut['type'], cx: number, cy: number, maxR = 8): void {
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (!inBounds(x, y) || inArenaOuter(x, y)) continue;
        const before = nodes.length;
        tryPlaceNode(type, x, y);
        if (nodes.length > before) return;
      }
    }
  }
  console.warn(`! could not place ${type} near ${cx},${cy}`);
}

/** fishing spots sit ON water, castable from an adjacent shore tile */
function placeFishingSpotNear(cx: number, cy: number, maxR = 12): void {
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (!inBounds(x, y) || occupied.has(`${x},${y}`) || ground[y][x] !== 'water') continue;
        let shore = false;
        for (let ny = -1; ny <= 1 && !shore; ny++) {
          for (let nx = -1; nx <= 1 && !shore; nx++) {
            if (!inBounds(x + nx, y + ny)) continue;
            const g = ground[y + ny][x + nx];
            if (g === 'grass' || g === 'sand' || g === 'dirt' || g === 'stone_floor' || g === 'swamp') shore = true;
          }
        }
        if (!shore) continue;
        occupied.add(`${x},${y}`);
        nodes.push({ id: `n${nodeId++}`, type: 'fishing_spot', tx: x, ty: y });
        return;
      }
    }
  }
  console.warn(`! could not place fishing_spot near ${cx},${cy}`);
}

// ancient hardwood trees — scattered so every Zone route passes one
for (const [x, y] of [
  [104, 96], // taunts right at the spawn clearing
  [95, 107],
  [135, 90],
  [150, 105],
  [168, 78],
  [172, 120],
  [60, 60],
  [75, 130],
  [145, 60],
  [88, 32],
  [140, 148],
  [48, 146],
] as [number, number][]) {
  placeNodeNear('hardwood_tree', x, y);
}

// obsidian rocks — clustered toward ruins, cliffs and swamp
for (const [x, y] of [
  [150, 35],
  [160, 44],
  [173, 42],
  [146, 20],
  [90, 10],
  [110, 9],
  [150, 160],
  [165, 175],
  [120, 40],
  [55, 100],
] as [number, number][]) {
  placeNodeNear('obsidian_rock', x, y);
}

// fishing spots — falls pool, river bends, delta branches
for (const [x, y] of [
  [98, 33],
  [104, 29],
  [88, 60],
  [76, 92],
  [68, 112],
  [52, 145],
  [38, 168],
  [56, 178],
  [24, 182],
] as [number, number][]) {
  placeFishingSpotNear(x, y);
}

// decor: flowers and small plants on open grass
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (ground[y][x] === 'grass' && !occupied.has(`${x},${y}`) && rng() < 0.035) {
      decor[y][x] = rng() < 0.5 ? 'flower' : 'plant';
    }
  }
}

// ---------------------------------------------------------------- secrets
// Placed AFTER node generation on purpose: nodes standing on these tiles are
// evicted (already-assigned node ids stay stable for existing saves).
const tablets = [
  { id: 't0', tx: 160, ty: 36 }, // ruins center
  { id: 't1', tx: 149, ty: 25 }, // ruins north
  { id: 't2', tx: 93, ty: 39 }, // falls shore
  { id: 't3', tx: 45, ty: 158 }, // river delta
  { id: 't4', tx: 152, ty: 162 }, // swamp edge
  { id: 't5', tx: 166, ty: 32 }, // v2: Tablet of the Seal, on the arena approach
];
const altar = { tx: 35, ty: 75 }; // watches the hidden grove entrance
const gate = [73, 74, 75, 76, 77].map((y) => ({ tx: 32, ty: y }));
const treasureSpots = [
  { tx: 44, ty: 162 }, // delta sands
  { tx: 92, ty: 13 }, // beneath the northern cliffs
  { tx: 168, ty: 48 }, // ruins
  { tx: 148, ty: 172 }, // swamp
  { tx: 20, ty: 75 }, // heart of the hidden grove
  { tx: 64, ty: 58 }, // deep jungle west
];
// v2 landmarks
const sealMonument = { tx: 173, ty: 31 }; // 2 tiles wide, watches the arena entrance
const guardianAltar = { tx: ARENA.x + 7, ty: ARENA.y + 10 }; // 2 tiles, inside the arena near the gate
const welcomeStone = { tx: 98, ty: 97 }; // beside spawn — re-read the intro here
const reservedTiles = new Set(
  [
    ...tablets,
    altar,
    { tx: altar.tx + 1, ty: altar.ty },
    ...gate,
    ...treasureSpots,
    sealMonument,
    { tx: sealMonument.tx + 1, ty: sealMonument.ty },
    guardianAltar,
    { tx: guardianAltar.tx + 1, ty: guardianAltar.ty },
    welcomeStone,
    ...SEAL_GATE,
  ].map((s) => `${s.tx},${s.ty}`),
);
for (const key of reservedTiles) {
  const [x, y] = key.split(',').map(Number);
  const g = ground[y][x];
  if (g === 'water' || g === 'cliff') ground[y][x] = 'grass';
  decor[y][x] = null;
}
const keptNodes = nodes.filter((n) => !reservedTiles.has(`${n.tx},${n.ty}`) && !inArenaOuter(n.tx, n.ty));

// ---------------------------------------------------------------- outputs
const blocked = new Array<number>(W * H).fill(0);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const g = ground[y][x];
    blocked[y * W + x] = g === 'water' ? 1 : g === 'cliff' ? 2 : 0;
  }
}
// the Guardian's 3x3 resting place is solid — it is always physically there
for (let dy = 0; dy < 3; dy++) {
  for (let dx = 0; dx < 3; dx++) {
    blocked[(GUARDIAN_HOME.ty + dy) * W + (GUARDIAN_HOME.tx + dx)] = 2;
  }
}

const groundData: number[] = [];
const decorData: number[] = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    groundData.push(pick(T[ground[y][x]]) + 1);
    const d = decor[y][x];
    decorData.push(d ? pick(T[d]) + 1 : 0);
  }
}

const collide = [...new Set([...T.water, ...T.cliff])].map((i) => i + 1);

const tiledMap = {
  type: 'map',
  version: '1.10',
  tiledversion: '1.10.2',
  orientation: 'orthogonal',
  renderorder: 'right-down',
  infinite: false,
  width: W,
  height: H,
  tilewidth: TILESET.tileSize,
  tileheight: TILESET.tileSize,
  nextlayerid: 3,
  nextobjectid: 1,
  layers: [
    { type: 'tilelayer', id: 1, name: 'ground', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: groundData },
    { type: 'tilelayer', id: 2, name: 'decor', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: decorData },
  ],
  tilesets: [
    {
      firstgid: 1,
      name: TILESET.name,
      tilewidth: TILESET.tileSize,
      tileheight: TILESET.tileSize,
      spacing: 0,
      margin: 0,
      columns: TILESET.columns,
      tilecount: (TILESET.imagewidth / TILESET.tileSize) * (TILESET.imageheight / TILESET.tileSize),
      image: TILESET.image,
      imagewidth: TILESET.imagewidth,
      imageheight: TILESET.imageheight,
    },
  ],
};

const worldData = {
  spawn: SPAWN,
  zones,
  nodes: keptNodes,
  foliage,
  blocked,
  collide,
  tablets,
  gate,
  altar,
  treasureSpots,
  arena: ARENA,
  guardianHome: GUARDIAN_HOME,
  sealMonument,
  guardianAltar,
  sealGate: SEAL_GATE,
  welcomeStone,
};

const outDir = path.resolve(import.meta.dirname, '../public/map');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'jungle-map.json'), JSON.stringify(tiledMap));
fs.writeFileSync(path.join(outDir, 'world-data.json'), JSON.stringify(worldData));

const counts: Record<string, number> = {};
for (const n of keptNodes) counts[n.type] = (counts[n.type] ?? 0) + 1;
console.log(`Map written: ${W}x${H}, ${keptNodes.length} nodes`, counts);
console.log(`Secrets: ${tablets.length} tablets, ${gate.length} gate tiles, ${treasureSpots.length} treasure spots`);
console.log(`Arena at (${ARENA.x},${ARENA.y}) ${ARENA.w}x${ARENA.h}, seal gate ${SEAL_GATE.map((g) => `${g.tx},${g.ty}`).join(' ')}`);
console.log(`Zones: ${zones.map((z) => z.name).join(', ')}`);
