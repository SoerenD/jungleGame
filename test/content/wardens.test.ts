import { describe, it, expect } from 'vitest';
import { WARDENS, wardenDef, kitOf, wardenForRealm } from '../../src/content/wardens';
import { GUARDIAN_KIT, ARENA_W, ARENA_H } from '../../src/content/guardian';
import { ITEMS, type ItemId } from '../../src/content/items';

describe('wardens — the ladder above the Guardian', () => {
  it('wardenDef resolves known wardens and nothing else', () => {
    expect(wardenDef('mire')?.id).toBe('mire');
    expect(wardenDef('bogus')).toBeUndefined();
    expect(wardenDef(null)).toBeUndefined();
    expect(wardenDef(undefined)).toBeUndefined();
  });

  it('kitOf falls back to the Guardian kit for absent/unknown ids', () => {
    expect(kitOf(null)).toBe(GUARDIAN_KIT);
    expect(kitOf('bogus')).toBe(GUARDIAN_KIT);
    expect(kitOf('mire')).toBe(WARDENS.mire.kit);
    expect(kitOf('verdant')).toBe(WARDENS.verdant.kit);
  });

  it('wardenForRealm maps each opened district back to its warden', () => {
    expect(wardenForRealm('sunken_mire')?.id).toBe('mire');
    expect(wardenForRealm('the_hushdark')?.id).toBe('echo');
    expect(wardenForRealm('green_terraces')?.id).toBe('verdant');
    expect(wardenForRealm('nowhere')).toBeUndefined();
  });

  it('every warden kit shares the arena dimensions and has three fury phases', () => {
    for (const [id, def] of Object.entries(WARDENS)) {
      expect(def.kit.arenaW, id).toBe(ARENA_W);
      expect(def.kit.arenaH, id).toBe(ARENA_H);
      expect(def.kit.phases, id).toHaveLength(3);
      expect(def.kit.furyThresholds.length, id).toBeGreaterThan(0);
      // waveTiles is a working factory: a full grid with danger AND safe ground
      const tiles = def.kit.waveTiles(1, 1);
      expect(tiles.length, id).toBe(ARENA_W * ARENA_H);
      expect(tiles.some((t) => t), id).toBe(true);
      expect(tiles.some((t) => !t), id).toBe(true);
    }
  });

  it('every warden totem and gate key is a real item', () => {
    for (const [id, def] of Object.entries(WARDENS)) {
      expect(ITEMS[def.totem as ItemId], `${id} totem`).toBeDefined();
      expect(ITEMS[def.gateKey as ItemId], `${id} gateKey`).toBeDefined();
      for (const drop of Object.keys(def.drops)) {
        expect(ITEMS[drop as ItemId], `${id} drop ${drop}`).toBeDefined();
      }
    }
  });

  it('the Reverberant is a summoned side-boss: it opens no realm', () => {
    expect(WARDENS.reverb.realm).toBe('');
    expect(Object.keys(WARDENS.reverb.drops)).toHaveLength(0); // reward flows through the guarded claim
  });
});
