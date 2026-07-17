/**
 * Delve interior painting (ADR-0018 helper split off DelveSystem): the
 * per-room textured floors, the authored prop dressing and their light pools
 * (ADR-0007 §10 / ADR-0015 per-Depth re-dress). Pure render construction —
 * the caller owns the object/texture-key registries for teardown.
 */
import Phaser from 'phaser';
import { TILE } from '../config';
import { PROP_LIGHT, type StageDef } from '../content/dungeon';
import { PROP_FLAT, PROP_TEX } from '../delveProps';

/** Delve overlay depth bands (duplicated from DelveSystem — same literals) */
const DELVE_DEPTH_FLOOR = 900_010;
const DELVE_DEPTH_ENTITY = 950_000; // + y (px) so player/mobs y-sort together

/** per-room textured stone floors: the mine→ruins ramp (Stage 1) or a uniform
 *  molten palette with glowing ember flecks (the Deep) — kills the flat fill */
export function paintDelveFloors(scene: Phaser.Scene, S: StageDef, objects: Phaser.GameObjects.GameObject[], floorKeys: string[]): void {
  const magma = S.palette === 'magma';
  // Stage 1 mine palette (with a ruins ramp east of ruinsFromX)
  const mine = {
    base: '#2a2620', toneA: '#221f1a', toneB: '#302b24', toneC: '#241f18',
    stain: '#1b1813', scuff: '#37312a', speckle: '#17140f',
    ruinTint: '#282430', ruinToneA: '#221f2a', ruinToneB: '#2f2a38',
    edgeMine: '#1e1a15', edgeRuin: '#1c1922',
  };
  // the Deep's magma palette — speckle is a bright ember fleck (a glowing floor)
  const lava = {
    toneA: '#301a14', base: '#3a221a', toneB: '#43271c', toneC: '#2a1712',
    stain: '#1e0f0a', scuff: '#4a2c1e', speckle: '#ff5a1e', edge: '#180d09',
  };
  // ADR-0015: a generated Depth paints its own per-Depth ramp (pure hue math
  // from the Depth number — identical on every client) instead of the two
  // authored palettes; the authored Stages keep their hand-picked colors.
  const gen = S.floor;
  // the corridor spine rows — keep specks out of the walking lane
  const spineRows = new Set<number>();
  for (const cor of S.corridors) for (let yy = cor.y; yy < cor.y + cor.h; yy++) spineRows.add(yy);
  for (const r of [...S.rooms, ...S.corridors]) {
    const ruins = !gen && !magma && r.x >= S.ruinsFromX;
    const ramp = gen
      ? [gen.toneA, gen.base, gen.toneB, gen.toneC]
      : magma
      ? [lava.toneA, lava.base, lava.toneB, lava.toneC]
      : ruins
      ? [mine.ruinToneA, mine.ruinTint, mine.ruinToneB, mine.toneC]
      : [mine.toneA, mine.base, mine.toneB, mine.toneC];
    const edge = gen ? gen.edge : magma ? lava.edge : ruins ? mine.edgeRuin : mine.edgeMine;
    const stain = gen ? gen.stain : magma ? lava.stain : mine.stain;
    const scuff = gen ? gen.scuff : magma ? lava.scuff : mine.scuff;
    const speckle = gen ? gen.speckle : magma ? lava.speckle : mine.speckle;
    const key = `delveFloor_${S.stage}_${r.x}_${r.y}`;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const tex = scene.textures.createCanvas(key, r.w * TILE, r.h * TILE);
    if (!tex) continue;
    const c = tex.context;
    for (let ty = r.y; ty < r.y + r.h; ty++) {
      for (let tx = r.x; tx < r.x + r.w; tx++) {
        const lx = (tx - r.x) * TILE;
        const ly = (ty - r.y) * TILE;
        const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
        const h2 = (h * 2654435761) >>> 0;
        c.fillStyle = ramp[h & 3];
        c.fillRect(lx, ly, TILE, TILE);
        const m = h % 100;
        if (m < 8) {
          c.fillStyle = stain;
          c.fillRect(lx, ly, TILE, TILE);
        } else if (m < 13) {
          c.fillStyle = scuff;
          c.fillRect(lx, ly, TILE, TILE);
        }
        c.fillStyle = edge; // wall-cast edge shade (recessed look)
        if (S.isWall(tx, ty - 1)) c.fillRect(lx, ly, TILE, 3);
        if (S.isWall(tx, ty + 1)) c.fillRect(lx, ly + TILE - 3, TILE, 3);
        if (S.isWall(tx - 1, ty)) c.fillRect(lx, ly, 3, TILE);
        if (S.isWall(tx + 1, ty)) c.fillRect(lx + TILE - 3, ly, 3, TILE);
        if (h2 % 10 < 3) {
          const spine = spineRows.has(ty); // keep the walking lane clean
          c.fillStyle = speckle;
          const sx = 2 + (h2 % 12);
          const sy = 3 + ((h2 >> 4) % 11);
          if (!(spine && sx > 4 && sx < 10)) c.fillRect(lx + sx, ly + sy, 1, 1);
          const sx2 = 8 + ((h2 >> 8) % 6);
          const sy2 = 6 + ((h2 >> 12) % 8);
          if (!(spine && sx2 > 4 && sx2 < 10)) c.fillRect(lx + sx2, ly + sy2, 1, 1);
        }
      }
    }
    tex.refresh();
    const img = scene.add.image(r.x * TILE, r.y * TILE, key).setOrigin(0, 0).setDepth(DELVE_DEPTH_FLOOR);
    objects.push(img);
    floorKeys.push(key);
  }
}

/** place every authored prop + its light pool (ADR-0007 §10 dressing) */
export function buildDelveProps(scene: Phaser.Scene, S: StageDef, objects: Phaser.GameObjects.GameObject[]): void {
  for (const p of S.props) {
    const flat = PROP_FLAT[p.kind];
    const px = (p.tx + 0.5) * TILE;
    const py = flat ? (p.ty + 0.5) * TILE : (p.ty + 1) * TILE; // upright props stand on the tile
    const img = scene.add.image(px, py, PROP_TEX[p.kind]).setOrigin(0.5, flat ? 0.5 : 1);
    img.setDepth(flat ? DELVE_DEPTH_FLOOR + 1 : DELVE_DEPTH_ENTITY + py);
    if (S.tint) img.setTint(S.tint.prop); // ADR-0015: re-dress the recycled dressing per Depth
    objects.push(img);
    const light = PROP_LIGHT[p.kind];
    if (light) addDelveLight(scene, objects, (p.tx + 0.5) * TILE, (p.ty + 0.5) * TILE - (flat ? 0 : TILE * 0.4), light.color, light.scale, light.alpha, light.flicker);
  }
  for (const l of S.lights) addDelveLight(scene, objects, (l.tx + 0.5) * TILE, (l.ty + 0.5) * TILE, l.color, l.scale, l.alpha, false);
}

/** an additive glow pool above the floor, below entities — the room's light */
function addDelveLight(scene: Phaser.Scene, objects: Phaser.GameObjects.GameObject[], x: number, y: number, color: number, scale: number, alpha: number, flicker: boolean): void {
  const glow = scene.add
    .image(x, y, 'glow')
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(color)
    .setScale(scale)
    .setAlpha(alpha)
    .setDepth(DELVE_DEPTH_FLOOR + 2);
  objects.push(glow);
  if (flicker) scene.tweens.add({ targets: glow, alpha: Math.max(0.08, alpha - 0.06), duration: 900, yoyo: true, repeat: -1, ease: 'sine.inout' });
}

