import { describe, it, expect } from 'vitest';
import {
  ARENA_W,
  ARENA_H,
  BARE_HANDS,
  WEAPON_COMBAT,
  weaponCombat,
  rollGuardianDamage,
  weaponAvg,
  weaponDps,
  weaponStatLine,
  weaponStatParts,
  FURY_PHASES,
  FURY_THRESHOLDS,
  furyPhaseAt,
  waveInfoAt,
  waveTiles,
  lungeTarget,
  guardianSpotAt,
  guardianPoseAt,
  eyeWindowOf,
  eyeOpenAt,
  eyeOpenWithin,
  isDangerousAt,
  meleeRingWindow,
  inMeleeRing,
  inMeleeRingDangerAt,
  GUARDIAN_KIT,
} from '../../src/content/guardian';

/** a deterministic rng that replays a fixed sequence (cycling) */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

const AWAKE = 300_000; // ~5 min awake window

describe('guardian — combat rolls', () => {
  it('weaponCombat falls back to BARE_HANDS for undefined / non-combat tools', () => {
    expect(weaponCombat(undefined)).toBe(BARE_HANDS);
    // a real harvest-only tool (hammer has no WEAPON_COMBAT entry) → bare hands
    expect(weaponCombat('hammer' as never)).toBe(BARE_HANDS);
    expect(weaponCombat('axe')).toBe(WEAPON_COMBAT.axe);
  });

  it('rollGuardianDamage is deterministic under an injected rng', () => {
    // bare hands, rng=0 → the band minimum, never crits
    expect(rollGuardianDamage(undefined, seqRng([0]))).toEqual({ damage: 1, crit: false });
    // axe max roll + crit: first rng picks the top of the band, second triggers the crit
    const hi = rollGuardianDamage('axe', seqRng([0.999, 0]));
    expect(hi).toEqual({ damage: 8, crit: true }); // max 4 × critMult 2
    // axe min roll, crit check misses
    expect(rollGuardianDamage('axe', seqRng([0, 0.5]))).toEqual({ damage: 2, crit: false });
  });

  it('rollGuardianDamage widens the band by the Armor raise BEFORE the crit', () => {
    // helm band +2/+3 on bare hands: rng=0 → min 1+2 = 3, no crit (bare hands never crit)
    const r = rollGuardianDamage(undefined, seqRng([0]), 0, { bandMin: 2, bandMax: 3 });
    expect(r).toEqual({ damage: 3, crit: false });
  });

  it('rollGuardianDamage lifts crit chance by the Village bonus only when the weapon can crit', () => {
    // bare hands never crit even with a huge bonus
    expect(rollGuardianDamage(undefined, seqRng([0, 0]), 1).crit).toBe(false);
    // a bow (6% crit) with +100% bonus always crits (chance clamps to 1)
    expect(rollGuardianDamage('bow', seqRng([0, 0.99]), 1).crit).toBe(true);
    // damage never drops below 1
    expect(rollGuardianDamage(undefined, seqRng([0])).damage).toBeGreaterThanOrEqual(1);
  });

  it('the crafted ladder is a strict DPS climb: ancient axe < sword < forgebrand', () => {
    expect(weaponDps('ancient_axe')).toBeLessThan(weaponDps('sword'));
    expect(weaponDps('sword')).toBeLessThan(weaponDps('forgebrand'));
    // the bow pays a range tax: weaker than the axe
    expect(weaponDps('bow')).toBeLessThan(weaponDps('axe'));
    // the Fabled tier sits clearly above the crafted top
    expect(weaponDps('fabled_axe')).toBeGreaterThan(weaponDps('forgebrand'));
  });

  it('weaponAvg / stat helpers reflect the band and cadence', () => {
    expect(weaponAvg(WEAPON_COMBAT.axe!)).toBe(3); // (2+4)/2
    const line = weaponStatLine('axe');
    expect(line).toContain('DPS');
    expect(line).toContain('crit');
    const parts = weaponStatParts('bow');
    expect(parts.canCrit).toBe(true);
    expect(parts.critPct).toBe(6);
    expect(parts.dps).toBe(Math.round(weaponDps('bow')));
    // a single-value band renders without a dash (bow min==max)
    expect(weaponStatParts('bow').band).not.toContain('–');
  });
});

describe('guardian — the authored schedule (pure f(elapsed))', () => {
  it('fury escalates at fixed TIME fractions, never HP', () => {
    expect(furyPhaseAt(0, AWAKE)).toBe(FURY_PHASES[0]); // calm
    expect(furyPhaseAt(FURY_THRESHOLDS[0] * AWAKE, AWAKE)).toBe(FURY_PHASES[1]); // restless at 0.4
    expect(furyPhaseAt(0.5 * AWAKE, AWAKE)).toBe(FURY_PHASES[1]);
    expect(furyPhaseAt(FURY_THRESHOLDS[1] * AWAKE, AWAKE)).toBe(FURY_PHASES[2]); // fury at 0.75
    expect(furyPhaseAt(0.99 * AWAKE, AWAKE)).toBe(FURY_PHASES[2]);
  });

  it('waveInfoAt walks a reproducible wave sequence', () => {
    const w0 = waveInfoAt(0, AWAKE);
    expect(w0).toMatchObject({ index: 0, startMs: 0, msIntoWave: 0, kind: 'slam', lungeCount: 0 });
    // still wave 0 just before the calm period (5000ms) elapses
    expect(waveInfoAt(4999, AWAKE).index).toBe(0);
    // wave 1 starts exactly at the period boundary
    const w1 = waveInfoAt(5000, AWAKE);
    expect(w1).toMatchObject({ index: 1, startMs: 5000, msIntoWave: 0 });
    // every 5th wave in calm is a telegraphed lunge (lungeEvery = 5)
    expect(waveInfoAt(5 * 5000, AWAKE).kind).toBe('lunge');
    // msIntoWave stays within the wave period across a long fight
    for (let t = 0; t < AWAKE; t += 733) {
      const w = waveInfoAt(t, AWAKE);
      expect(w.msIntoWave).toBeGreaterThanOrEqual(0);
      expect(w.msIntoWave).toBeLessThan(w.phase.wavePeriodMs);
    }
  });

  it('lunge landings stay a full zone inside the arena border, deterministically', () => {
    for (let i = 1; i <= 12; i++) {
      const s = lungeTarget(i);
      expect(s.ax).toBeGreaterThanOrEqual(2);
      expect(s.ax).toBeLessThanOrEqual(ARENA_W - 3);
      expect(s.ay).toBeGreaterThanOrEqual(2);
      expect(s.ay).toBeLessThanOrEqual(ARENA_H - 3);
      expect(lungeTarget(i)).toEqual(s); // pure
    }
  });

  it('guardianSpotAt is home before any lunge, the lunge target after', () => {
    const home = { ax: 8, ay: 6 };
    expect(guardianSpotAt(0, home)).toBe(home);
    expect(guardianSpotAt(3, home)).toEqual(lungeTarget(3));
  });

  it('guardianPoseAt: stationary on a slam wave, airborne→landed on a lunge wave', () => {
    const home = { ax: 8, ay: 6 };
    const still = guardianPoseAt(0, AWAKE, home);
    expect(still).toMatchObject({ spot: home, airborne: false, windup: false });
    // wave 5 is a lunge; after its telegraph it has landed on the target
    const start = 5 * 5000;
    const teleg = FURY_PHASES[0].telegraphMs;
    const landed = guardianPoseAt(start + teleg + 10, AWAKE, home);
    expect(landed.leapT).toBe(1);
    expect(landed.spot).toEqual(lungeTarget(1));
    // early in the telegraph it rears up (windup)
    expect(guardianPoseAt(start + 10, AWAKE, home).windup).toBe(true);
  });
});

describe('guardian — Eye Windows & danger', () => {
  it('the Eye Window opens right after the slam and closes within the wave', () => {
    const e = eyeWindowOf(waveInfoAt(0, AWAKE));
    // calm: telegraph 1800 + slam 800 = 2600 open, +eye 2400 clamped to the 5000 period
    expect(e.openMs).toBe(2600);
    expect(e.closeMs).toBe(5000);
    expect(eyeOpenAt(2599, AWAKE)).toBe(false);
    expect(eyeOpenAt(2600, AWAKE)).toBe(true);
    expect(eyeOpenAt(4999, AWAKE)).toBe(true);
    expect(eyeOpenAt(5000, AWAKE)).toBe(false); // next wave
  });

  it('eyeOpenWithin looks BACK by the slack, never forward', () => {
    // exactly at open with no slack → open
    expect(eyeOpenWithin(2600, AWAKE, 0)).toBe(true);
    // 1ms before open, no slack → closed
    expect(eyeOpenWithin(2599, AWAKE, 0)).toBe(false);
    // 1ms before open WITH slack still closed (slack never predicts forward)
    expect(eyeOpenWithin(2599, AWAKE, 700)).toBe(false);
    // just after open, a late report within slack still lands
    expect(eyeOpenWithin(2650, AWAKE, 700)).toBe(true);
  });

  it('isDangerousAt rejects out-of-bounds tiles', () => {
    expect(isDangerousAt(2000, -1, 5, AWAKE)).toBe(false);
    expect(isDangerousAt(2000, ARENA_W, 5, AWAKE)).toBe(false);
    expect(isDangerousAt(2000, 5, ARENA_H, AWAKE)).toBe(false);
  });

  it('isDangerousAt agrees with the authored wave tiles during the slam window', () => {
    // wave 0 (no entrance), calm slam window [telegraph 1800, +slam 800] → 2000 is inside
    const density = FURY_PHASES[0].density;
    const tiles = waveTiles(0, density);
    for (let ay = 0; ay < ARENA_H; ay++) {
      for (let ax = 0; ax < ARENA_W; ax++) {
        expect(isDangerousAt(2000, ax, ay, AWAKE)).toBe(tiles[ay * ARENA_W + ax]);
      }
    }
  });

  it('wave 0 with an entrance makes the doorway (not the tiles) the danger', () => {
    const entrance = { ax: 8, ay: 12 };
    // during the engage slam window the entrance ±zone is dangerous
    expect(isDangerousAt(2000, 8, 12, AWAKE, 0, entrance)).toBe(true);
    expect(isDangerousAt(2000, 7, 11, AWAKE, 0, entrance)).toBe(true); // within lungeZone 1
    // a far tile is safe even if its authored slam tile would be set
    expect(isDangerousAt(2000, 0, 0, AWAKE, 0, entrance)).toBe(false);
  });

  it('waveTiles are deterministic and always leave safe ground', () => {
    const a = waveTiles(3, 1);
    const b = waveTiles(3, 1);
    expect(a).toEqual(b);
    expect(a.length).toBe(ARENA_W * ARENA_H);
    expect(a.some((t) => t)).toBe(true); // some danger
    expect(a.some((t) => !t)).toBe(true); // some safe ground to dodge into
  });
});

describe('guardian — the melee danger-ring', () => {
  it('inMeleeRing is the Chebyshev shell at distance 2..3', () => {
    const c = { ax: 8, ay: 6 };
    expect(inMeleeRing(8, 6, c)).toBe(false); // on the body
    expect(inMeleeRing(10, 6, c)).toBe(true); // distance 2
    expect(inMeleeRing(11, 6, c)).toBe(true); // distance 3
    expect(inMeleeRing(12, 6, c)).toBe(false); // distance 4 (bow range is clear)
  });

  it('meleeRingWindow is null on wave 0 and lunge waves, set on stationary slams', () => {
    expect(meleeRingWindow(waveInfoAt(0, AWAKE))).toBeNull(); // engage wave
    expect(meleeRingWindow(waveInfoAt(5 * 5000, AWAKE))).toBeNull(); // a lunge wave
    const ring = meleeRingWindow(waveInfoAt(5000, AWAKE)); // wave 1 slam
    expect(ring).not.toBeNull();
    expect(ring!.openMs).toBeLessThan(ring!.closeMs);
  });

  it('inMeleeRingDangerAt burns the ring only during the hot slice of a slam wave', () => {
    const home = { ax: 8, ay: 6 };
    const ring = meleeRingWindow(waveInfoAt(5000, AWAKE))!;
    const mid = (ring.openMs + ring.closeMs) / 2;
    expect(inMeleeRingDangerAt(mid, 10, 6, AWAKE, home)).toBe(true); // distance 2 in the hot ring
    expect(inMeleeRingDangerAt(mid, 8, 6, AWAKE, home)).toBe(false); // on the body, not the ring
    expect(inMeleeRingDangerAt(ring.openMs - 50, 10, 6, AWAKE, home)).toBe(false); // before hot
    expect(inMeleeRingDangerAt(mid, -1, 6, AWAKE, home)).toBe(false); // out of bounds
  });
});

describe('guardian — the engage leap (wave 0 with an entrance)', () => {
  const home = { ax: 8, ay: 6 };
  const entrance = { ax: 8, ay: 12 };
  const teleg = FURY_PHASES[0].telegraphMs; // 1800
  const wind = GUARDIAN_KIT.lungeWindupFrac; // 0.35

  it('rears up at home, then bounds out to slam the Ward shut', () => {
    // early telegraph: windup at home, targeting the entrance
    const up = guardianPoseAt(50, AWAKE, home, entrance);
    expect(up).toMatchObject({ spot: home, target: entrance, windup: true, airborne: false });
    // later in the telegraph: airborne toward the entrance
    const out = guardianPoseAt(teleg * (wind + 0.5), AWAKE, home, entrance);
    expect(out).toMatchObject({ spot: home, target: entrance, airborne: true });
    expect(out.leapT).toBeGreaterThan(0);
  });

  it('holds at the gate, then leaps back home, settling by the first Eye Window', () => {
    // just after the slam: held on the entrance
    const held = guardianPoseAt(teleg + 50, AWAKE, home, entrance);
    expect(held).toMatchObject({ spot: entrance, target: null, leapT: 1 });
    // returning: airborne from the entrance back toward home
    const back = guardianPoseAt(teleg + GUARDIAN_KIT.engageHoldMs + 100, AWAKE, home, entrance);
    expect(back).toMatchObject({ spot: entrance, target: home, airborne: true });
    // settled: home again, grounded
    const settled = guardianPoseAt(teleg + GUARDIAN_KIT.engageHoldMs + GUARDIAN_KIT.engageReturnMs + 50, AWAKE, home, entrance);
    expect(settled).toMatchObject({ spot: home, target: null, airborne: false, leapT: 0 });
  });
});

describe('guardian — every wave-tile family leaves safe ground', () => {
  it('produces danger AND dodgeable ground across all four families and fury densities', () => {
    for (let index = 0; index < 8; index++) {
      for (const density of [1, 1.35, 1.7]) {
        const tiles = waveTiles(index, density);
        expect(tiles.length).toBe(ARENA_W * ARENA_H);
        expect(tiles.some((t) => t), `index ${index} density ${density} has danger`).toBe(true);
        expect(tiles.some((t) => !t), `index ${index} density ${density} leaves safe ground`).toBe(true);
      }
    }
  });
});

describe('guardian — kit shape', () => {
  it('GUARDIAN_KIT bundles the authored tables', () => {
    expect(GUARDIAN_KIT.id).toBe('guardian');
    expect(GUARDIAN_KIT.arenaW).toBe(ARENA_W);
    expect(GUARDIAN_KIT.arenaH).toBe(ARENA_H);
    expect(GUARDIAN_KIT.phases).toBe(FURY_PHASES);
    expect(GUARDIAN_KIT.furyThresholds).toBe(FURY_THRESHOLDS);
    expect(GUARDIAN_KIT.phases).toHaveLength(3);
  });
});
