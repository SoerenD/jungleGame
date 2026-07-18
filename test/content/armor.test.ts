import { describe, it, expect } from 'vitest';
import {
  isWeapon,
  gearOwns,
  armorBuff,
  isArmor,
  armorDef,
  sanitizeEquipped,
  armorOnly,
  ARMOR_SLOTS,
  WEAPON_SLOTS,
} from '../../src/content/armor';

describe('armor — gear predicates & buffs', () => {
  it('isWeapon recognises combat tools only', () => {
    expect(isWeapon('axe')).toBe(true);
    expect(isWeapon('bow')).toBe(true);
    expect(isWeapon('sword')).toBe(true);
    expect(isWeapon('wood')).toBe(false);
    expect(isWeapon('hammer')).toBe(false); // a tool with no combat profile
    expect(isWeapon(null)).toBe(false);
    expect(isWeapon(undefined)).toBe(false);
  });

  it('gearOwns counts the bag OR a weapon slot', () => {
    expect(gearOwns({ axe: 2 }, null, 'axe')).toBe(true); // in the bag
    expect(gearOwns({ axe: 0 }, { weapon1: 'axe' }, 'axe')).toBe(true); // slotted, left the bag
    expect(gearOwns({}, { weapon2: 'sword' }, 'sword')).toBe(true);
    expect(gearOwns({}, null, 'axe')).toBe(false);
    expect(gearOwns({}, { weapon1: 'bow' }, 'axe')).toBe(false);
  });

  it('armorDef / isArmor resolve worn pieces', () => {
    expect(isArmor('tideglass_boots')).toBe(true);
    expect(isArmor('axe')).toBe(false);
    expect(isArmor(null)).toBe(false);
    expect(armorDef('hushsteel_helm')?.slot).toBe('helm');
    expect(armorDef('nope')).toBeUndefined();
  });

  it('armorBuff sums worn armor and ignores weapon slots & junk', () => {
    expect(armorBuff(null)).toEqual({ moveSpeed: 0, attackSpeed: 0, bandMin: 0, bandMax: 0 });
    expect(armorBuff({ boots: 'tideglass_boots' })).toEqual({ moveSpeed: 0.08, attackSpeed: 0, bandMin: 0, bandMax: 0 });
    expect(armorBuff({ helm: 'hushsteel_helm' })).toEqual({ moveSpeed: 0, attackSpeed: 0, bandMin: 2, bandMax: 3 });
    const full = armorBuff({ boots: 'tideglass_boots', chest: 'verdant_cuirass', helm: 'hushsteel_helm', weapon1: 'axe' });
    expect(full).toEqual({ moveSpeed: 0.08, attackSpeed: 0.08, bandMin: 2, bandMax: 3 });
  });

  it('armorBuff ignores a piece worn in the wrong slot', () => {
    // a helm mis-recorded in the boots slot contributes nothing
    expect(armorBuff({ boots: 'hushsteel_helm' as never })).toEqual({ moveSpeed: 0, attackSpeed: 0, bandMin: 0, bandMax: 0 });
  });

  it('sanitizeEquipped drops unknown, slot-mismatched, and non-weapon entries', () => {
    const cleaned = sanitizeEquipped({
      boots: 'tideglass_boots', // valid
      helm: 'axe', // not armor → dropped
      chest: 'tideglass_boots', // wrong slot → dropped
      weapon1: 'sword', // valid weapon
      weapon2: 'wood', // not a weapon → dropped
      bogus: 'whatever', // unknown slot → dropped
    });
    expect(cleaned).toEqual({ boots: 'tideglass_boots', weapon1: 'sword' });
  });

  it('sanitizeEquipped returns an empty record for junk input', () => {
    expect(sanitizeEquipped(null)).toEqual({});
    expect(sanitizeEquipped('nonsense')).toEqual({});
    expect(sanitizeEquipped(42)).toEqual({});
  });

  it('armorOnly projects away the weapon slots for the presence wire', () => {
    const eq = { boots: 'tideglass_boots', helm: 'hushsteel_helm', weapon1: 'axe', weapon2: 'sword' } as const;
    expect(armorOnly(eq)).toEqual({ boots: 'tideglass_boots', helm: 'hushsteel_helm' });
    expect(armorOnly(null)).toEqual({});
  });

  it('the slot constants are the three armor slots and two weapon slots', () => {
    expect(ARMOR_SLOTS).toEqual(['boots', 'chest', 'helm']);
    expect(WEAPON_SLOTS).toEqual(['weapon1', 'weapon2']);
  });
});
