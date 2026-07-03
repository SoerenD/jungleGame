/**
 * Avatars (CONTEXT.md): every Player's look is a blocky, big-headed pixel
 * sprite composed at runtime from four color choices — skin, hair, shirt,
 * pants — each picked from a curated palette. No free color picking. Each
 * client composes one spritesheet texture per Player (canvas → Phaser
 * texture) from the choices carried in presence/state payloads; Phaser tint
 * is no longer used for identity.
 */
import type Phaser from 'phaser';
import type { Appearance, Dir } from './backend/types';

export const AVATAR_W = 16;
export const AVATAR_H = 32;

/** sheet rows top→bottom: down, right, up, left — 4 walk frames each */
export const AVATAR_WALK: Record<Dir, { start: number; end: number }> = {
  down: { start: 0, end: 3 },
  right: { start: 4, end: 7 },
  up: { start: 8, end: 11 },
  left: { start: 12, end: 15 },
};
export const AVATAR_IDLE: Record<Dir, number> = { down: 0, right: 4, up: 8, left: 12 };

export interface Swatch {
  name: string;
  hex: string;
}

/** curated palettes — 8 swatches per slot keep the World's pixel art coherent */
export const PALETTES: Record<keyof Appearance, Swatch[]> = {
  skin: [
    { name: 'Fair', hex: '#f2d3ae' },
    { name: 'Peach', hex: '#eab88a' },
    { name: 'Tan', hex: '#d1975a' },
    { name: 'Bronze', hex: '#b0713c' },
    { name: 'Brown', hex: '#8a512b' },
    { name: 'Deep', hex: '#5f3a22' },
    { name: 'Olive', hex: '#c2b280' },
    { name: 'Ash', hex: '#9aa0a8' },
  ],
  hair: [
    { name: 'Black', hex: '#26211f' },
    { name: 'Brown', hex: '#5b3a21' },
    { name: 'Chestnut', hex: '#8a5a2b' },
    { name: 'Blonde', hex: '#e0b64f' },
    { name: 'Ginger', hex: '#c25e2c' },
    { name: 'Gray', hex: '#b9b9b9' },
    { name: 'Moss', hex: '#4a7a3d' },
    { name: 'Violet', hex: '#7a4fd0' },
  ],
  shirt: [
    { name: 'Amber', hex: '#e8a33d' },
    { name: 'Jade', hex: '#3f9e57' },
    { name: 'Sky', hex: '#3f7fc2' },
    { name: 'Rose', hex: '#d2607e' },
    { name: 'Sand', hex: '#cbb37a' },
    { name: 'Rust', hex: '#b0432b' },
    { name: 'Plum', hex: '#7d4a8f' },
    { name: 'Slate', hex: '#5c6b73' },
  ],
  pants: [
    { name: 'Walnut', hex: '#6b4a2b' },
    { name: 'Charcoal', hex: '#3a3a42' },
    { name: 'Navy', hex: '#2d4a6b' },
    { name: 'Forest', hex: '#3b5a35' },
    { name: 'Khaki', hex: '#a08c5a' },
    { name: 'Wine', hex: '#6e3244' },
    { name: 'Stone', hex: '#7d8288' },
    { name: 'Sage', hex: '#8fae8a' },
  ],
};

export const DEFAULT_APPEARANCE: Appearance = { skin: 1, hair: 1, shirt: 1, pants: 0 };

/** clamp every slot into its palette — the backend trusts no client indices */
export function sanitizeAppearance(a: Partial<Appearance> | null | undefined): Appearance {
  const clamp = (v: unknown, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max - 1, Math.floor(v))) : 0;
  return {
    skin: clamp(a?.skin, PALETTES.skin.length),
    hair: clamp(a?.hair, PALETTES.hair.length),
    shirt: clamp(a?.shirt, PALETTES.shirt.length),
    pants: clamp(a?.pants, PALETTES.pants.length),
  };
}

/**
 * Pre-update Players carried one of four tint presets (Amber, Jade, Sky,
 * Rose). Their first post-update look maps that tint onto the shirt slot.
 */
export function legacyAppearance(avatarId: number): Appearance {
  const shirtByTint = [0, 1, 2, 3]; // Amber, Jade, Sky, Rose — same order as the old AVATARS
  return { ...DEFAULT_APPEARANCE, shirt: shirtByTint[avatarId % 4] ?? 0 };
}

const shade = (hex: string, f: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 0xff)},${c(n & 0xff)})`;
};

/**
 * Draw the 16-frame blockhead sheet (4 directions × 4 walk poses) onto a
 * fresh canvas. One fixed shape — cubic head about half the sprite height,
 * boxy body and limbs; only the four colors vary.
 */
export function drawBlockheadSheet(a: Appearance): HTMLCanvasElement {
  const skin = PALETTES.skin[a.skin].hex;
  const hair = PALETTES.hair[a.hair].hex;
  const shirt = PALETTES.shirt[a.shirt].hex;
  const pants = PALETTES.pants[a.pants].hex;
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_W * 4;
  canvas.height = AVATAR_H * 4;
  const ctx = canvas.getContext('2d')!;
  const px = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };

  const dirs: Dir[] = ['down', 'right', 'up', 'left'];
  for (let row = 0; row < 4; row++) {
    const dir = dirs[row];
    for (let pose = 0; pose < 4; pose++) {
      ctx.save();
      ctx.translate(pose * AVATAR_W, row * AVATAR_H);
      if (dir === 'left') {
        // left is the mirrored right row
        ctx.translate(AVATAR_W, 0);
        ctx.scale(-1, 1);
      }
      const d: Dir = dir === 'left' ? 'right' : dir;
      const step = pose === 1 ? 1 : pose === 3 ? -1 : 0; // stride phase
      const bob = step !== 0 ? 1 : 0; // torso bobs down mid-step

      // ---- legs (pants) — alternate with the stride
      if (d === 'down' || d === 'up') {
        px(4, 25, 3, 5 - (step === 1 ? 1 : 0), pants);
        px(9, 25, 3, 5 - (step === -1 ? 1 : 0), pants);
        px(4, 29 - (step === 1 ? 1 : 0), 3, 1, shade(pants, 0.55)); // feet
        px(9, 29 - (step === -1 ? 1 : 0), 3, 1, shade(pants, 0.55));
      } else {
        // side view: legs stride along x
        px(5 + step, 25, 3, 5, pants);
        px(8 - step, 25, 3, 4, shade(pants, 0.8));
        px(5 + step, 29, 3, 1, shade(pants, 0.55));
        px(8 - step, 28, 3, 1, shade(pants, 0.5));
      }

      // ---- torso (shirt)
      if (d === 'down' || d === 'up') {
        px(3, 18 + bob, 10, 7 - bob, shirt);
        px(3, 23, 10, 2, shade(shirt, 0.8)); // hem
        // arms swing opposite the legs
        px(1, 18 + bob + (step === -1 ? 1 : 0), 2, 6, shirt);
        px(13, 18 + bob + (step === 1 ? 1 : 0), 2, 6, shirt);
        px(1, 23 + bob + (step === -1 ? 1 : 0), 2, 1, skin); // hands
        px(13, 23 + bob + (step === 1 ? 1 : 0), 2, 1, skin);
      } else {
        px(4, 18 + bob, 8, 7 - bob, shirt);
        px(4, 23, 8, 2, shade(shirt, 0.8));
        px(7 - step, 18 + bob, 2, 6, shade(shirt, 0.9)); // the near arm
        px(7 - step, 23 + bob, 2, 1, skin);
      }

      // ---- cubic head (about half the sprite height)
      const hy = 5 + bob;
      px(2, hy, 12, 12, skin);
      px(2, hy + 11, 12, 1, shade(skin, 0.8)); // jaw shading
      // hair: cap on every side; the back view is all hair
      if (d === 'up') {
        px(2, hy, 12, 10, hair);
        px(2, hy + 9, 12, 1, shade(hair, 0.75));
      } else {
        px(2, hy, 12, 4, hair);
        px(2, hy + 3, 12, 1, shade(hair, 0.8)); // fringe
        px(2, hy + 4, 1, 3, hair); // sideburns
        px(13, hy + 4, 1, 3, hair);
      }
      // face
      if (d === 'down') {
        px(4, hy + 6, 2, 2, '#1c1c26'); // eyes
        px(10, hy + 6, 2, 2, '#1c1c26');
        px(7, hy + 9, 2, 1, shade(skin, 0.7)); // mouth
      } else if (d === 'right') {
        px(8, hy + 6, 2, 2, '#1c1c26');
        px(12, hy + 6, 2, 2, '#1c1c26');
        px(2, hy + 4, 2, 7, hair); // hair trails on the far side
      }
      ctx.restore();
    }
  }
  return canvas;
}

/**
 * (Re)build the spritesheet texture and walk animations for one Player.
 * Called on join and again whenever that Player's appearance changes —
 * the old texture and animations are destroyed first.
 */
export function ensureAvatarTexture(scene: Phaser.Scene, key: string, a: Appearance): void {
  const dirs: Dir[] = ['down', 'right', 'up', 'left'];
  if (scene.textures.exists(key)) {
    for (const dir of dirs) scene.anims.remove(`${key}-walk-${dir}`);
    scene.textures.remove(key);
  }
  const canvas = drawBlockheadSheet(a);
  const tex = scene.textures.addCanvas(key, canvas)!;
  let frame = 0;
  for (let y = 0; y + AVATAR_H <= canvas.height; y += AVATAR_H) {
    for (let x = 0; x + AVATAR_W <= canvas.width; x += AVATAR_W) {
      tex.add(frame++, 0, x, y, AVATAR_W, AVATAR_H);
    }
  }
  for (const dir of dirs) {
    scene.anims.create({
      key: `${key}-walk-${dir}`,
      frames: scene.anims.generateFrameNumbers(key, AVATAR_WALK[dir]),
      frameRate: 8,
      repeat: -1,
    });
  }
}
