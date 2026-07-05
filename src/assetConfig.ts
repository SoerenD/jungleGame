/**
 * Single place that knows what the downloaded asset files look like.
 * Everything here is finalized against the files in public/assets/
 * (see CREDITS.md for sources and licenses).
 */

export const TILESET = {
  key: 'tiles',
  name: 'terrain', // must match the tileset name inside jungle-map.json
  url: '/assets/tiles/terrain.png',
  tileSize: 16,
};

// Player sprites are no longer loaded from a sheet: every Avatar is composed
// at runtime from four palette picks (src/avatars.ts) into its own texture.

export interface ObjectDef {
  url: string;
  /** set for spritesheets; omit for single images */
  frameWidth?: number;
  frameHeight?: number;
  frame?: number;
  /** display origin-y (1 = feet at position, for depth sorting) */
  originY?: number;
}

/** node visuals: `<type>` full and `<type>_depleted` */
export const OBJECTS: Record<string, ObjectDef> = {
  tree: { url: '/assets/objects/tree.png' },
  tree_depleted: { url: '/assets/objects/stump.png' },
  rock: { url: '/assets/objects/rock.png' },
  rock_depleted: { url: '/assets/objects/rock-depleted.png' },
  fruit_bush: { url: '/assets/objects/bush-fruit.png' },
  fruit_bush_depleted: { url: '/assets/objects/bush-empty.png' },
  fiber_vine: { url: '/assets/objects/vine.png' },
  fiber_vine_depleted: { url: '/assets/objects/vine-cut.png' },
  ruin_pillar: { url: '/assets/objects/ruin-pillar.png' },

  // v2 tier-2 nodes
  hardwood_tree: { url: '/assets/objects/hardwood-tree.png' },
  hardwood_tree_depleted: { url: '/assets/objects/hardwood-stump.png' },
  obsidian_rock: { url: '/assets/objects/obsidian-rock.png' },
  obsidian_rock_depleted: { url: '/assets/objects/obsidian-rubble.png' },
  fishing_spot: { url: '/assets/objects/fishing-spot.png' },
  fishing_spot_depleted: { url: '/assets/objects/fishing-spot-calm.png' },

  st_campfire: { url: '/assets/objects/campfire.png' },
  st_torch: { url: '/assets/objects/torch.png' },
  st_bridge: { url: '/assets/objects/bridge.png' },
  st_crate: { url: '/assets/objects/crate.png' },
  st_tiki_statue: { url: '/assets/objects/statue.png' },
  st_fruit_basket: { url: '/assets/objects/fruit-basket.png' },
  st_golden_idol: { url: '/assets/objects/golden-idol.png' },
  // v2 tier-2 structures
  st_obsidian_statue: { url: '/assets/objects/obsidian-statue.png' },
  st_hardwood_arch: { url: '/assets/objects/hardwood-arch.png' },
  st_guardian_trophy: { url: '/assets/objects/guardian-trophy.png' },
  st_obsidian_path: { url: '/assets/objects/obsidian-path.png' },
  st_brazier: { url: '/assets/objects/brazier.png' },
  // v3 functional structures + plank decor
  st_hammock: { url: '/assets/objects/hammock.png' },
  st_signpost: { url: '/assets/objects/signpost.png' },
  st_sawmill: { url: '/assets/objects/sawmill.png' },
  st_table: { url: '/assets/objects/table.png' },

  // faux-3D terrain: a tall cliff face hung below raised edges, and a tileable
  // falling-water streak scrolled down the waterfall drop (drawn as objects)
  cliff_face: { url: '/assets/objects/cliff-face.png' },
  water_foam: { url: '/assets/objects/water-foam.png' },
  // the falls: the user-supplied side-on waterfall animation. The sheet is a 6×2
  // grid of 96×193 cells; frames 0-3 (top row) are the four phases of the fall.
  // PROVENANCE UNCONFIRMED — likely RPG-Maker RTP-derived art (commercial, NOT
  // cleared for redistribution). Treat as a local mockup until the origin is
  // confirmed; the CC-BY Sevarihk sheet (waterfall-fall.png) is the safe fallback.
  // See CREDITS.md.
  waterfall_anim: { url: '/assets/objects/user-falls.png', frameWidth: 96, frameHeight: 193 },

  tablet: { url: '/assets/objects/tablet.png' },
  altar: { url: '/assets/objects/altar.png' },
  // v4: the arena Seal barrier — an authored rune-stone gate (16x32, tiles
  // horizontally; tools/compose-seal-barrier.ts)
  'seal-barrier': { url: '/assets/objects/seal-barrier.png' },
  // v2 landmarks
  seal_monument: { url: '/assets/objects/seal-monument.png' },
  guardian_altar: { url: '/assets/objects/guardian-altar.png' },
  welcome_stone: { url: '/assets/objects/welcome-stone.png' },
  /**
   * the Guardian: 8 frames of 96x96 — 0 slumber, 1..2 awake idle (eye
   * closed), 3..4 eye open (the Eye Window signal), 5 lunge windup,
   * 6 airborne, 7 landing
   */
  guardian: { url: '/assets/objects/guardian.png', frameWidth: 96, frameHeight: 96, frame: 0 },
};

export const AUDIO: Record<string, string> = {
  ambient: '/assets/audio/jungle-ambient.mp3',
  chop: '/assets/audio/chop.wav',
  harvest: '/assets/audio/harvest.wav',
  craft: '/assets/audio/craft.wav',
  place: '/assets/audio/place.wav',
  blip: '/assets/audio/blip.wav',
  // v2
  roar: '/assets/audio/roar.wav',
  seal_gong: '/assets/audio/seal-gong.wav',
  splash: '/assets/audio/splash.wav',
  munch: '/assets/audio/munch.wav',
  guardian_drums: '/assets/audio/guardian-drums.wav',
  // v4 — pickaxe-on-stone clink for rock / obsidian
  pick: '/assets/audio/pick.wav',
};
