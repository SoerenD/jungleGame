import { describe, it, expect } from 'vitest';
import { characterSheet } from '../../src/content/stats';
import { weaponDps } from '../../src/content/guardian';

describe('stats — the effective character sheet', () => {
  it('bare hands with no armor and no Village is the weakest honest profile', () => {
    const s = characterSheet(undefined, null, 0);
    expect(s.hasWeapon).toBe(false);
    expect(s.moveBonus).toBe(0);
    expect(s.attackBonus).toBe(0);
    expect(s.critChance).toBe(0);
    expect(s.bandMin).toBe(6); // BARE_HANDS min 1 × display scale 6
    expect(s.bandMax).toBe(12); // max 2 × 6
  });

  it('an axe in hand mirrors the weapon table in display units', () => {
    const s = characterSheet('axe', null, 0);
    expect(s.hasWeapon).toBe(true);
    expect(s.bandMin).toBe(12); // 2 × 6
    expect(s.bandMax).toBe(24); // 4 × 6
    expect(s.critChance).toBeCloseTo(0.16, 6);
    expect(s.critMult).toBe(2);
    expect(s.dps).toBe(Math.round(weaponDps('axe'))); // no bonuses → identical to the weapon DPS
  });

  it('the Hushsteel Helm widens the band before crit, even bare-handed', () => {
    const s = characterSheet(undefined, { helm: 'hushsteel_helm' }, 0);
    // BARE_HANDS 1..2 + helm 2/3 = 3..5, in display units ×6
    expect(s.bandMin).toBe(18);
    expect(s.bandMax).toBe(30);
    expect(s.critChance).toBe(0); // bare hands still cannot crit
  });

  it('Village tiers fold collective move/attack/crit bonuses in', () => {
    const s = characterSheet('axe', null, 5); // Capital: +6% move/attack/crit
    expect(s.moveBonus).toBeCloseTo(0.06, 6);
    expect(s.attackBonus).toBeCloseTo(0.06, 6);
    expect(s.critChance).toBeCloseTo(0.22, 6); // axe 0.16 + village 0.06
    // faster cadence than the un-buffed axe
    expect(s.aps).toBeGreaterThan(characterSheet('axe', null, 0).aps);
  });

  it('the Village crit buff never gives crit to a weapon that cannot crit', () => {
    const s = characterSheet(undefined, null, 4); // Town grants +4% crit
    expect(s.critChance).toBe(0);
  });

  it('armor + Village bonuses stack additively', () => {
    const s = characterSheet('axe', { boots: 'tideglass_boots', chest: 'verdant_cuirass' }, 2);
    expect(s.moveBonus).toBeCloseTo(0.08 + 0.04, 6); // boots + Hamlet
    expect(s.attackBonus).toBeCloseTo(0.08 + 0, 6); // cuirass + Hamlet (no attack)
  });
});
