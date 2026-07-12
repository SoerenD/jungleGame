// The character sheet (WoW-style paperdoll): the Player's EFFECTIVE combat
// profile with everything folded in — the in-hand weapon's band/crit/cadence,
// the worn Armor's attributes (ADR-0017 §3), and the Village's collective buffs
// (ADR-0013). This is the honest in-combat number, not the weapon-only tooltip:
// it is exactly what GameScene applies at runtime (moveSpeedFactor / atkCadence
// / rollGuardianDamage), gathered in one place for the character panel to show.
//
// PURE DATA + PURE FUNCTIONS — no browser globals, no backend imports — so the
// HUD (and anyone else) can derive the same sheet the scene fights with.

import type { EquippedArmor } from './armor';
import { armorBuff } from './armor';
import { BARE_HANDS, GUARDIAN_DISPLAY_SCALE, weaponCombat } from './guardian';
import type { ToolId } from './items';
import { villageBuff } from './village';

export interface CharacterSheet {
  /** is a real combat weapon in hand? (bare hands / non-combat Tool → false) */
  hasWeapon: boolean;
  /** fractional move-speed bonus from Armor + Village (food/festival are transient, excluded) */
  moveBonus: number;
  /** fractional attack-speed bonus from Armor + Village */
  attackBonus: number;
  /** effective damage band in DISPLAY units (weapon band + Helm band raise) */
  bandMin: number;
  bandMax: number;
  /** effective crit chance 0..1 (weapon crit + Village crit; 0 if the weapon can't crit) */
  critChance: number;
  critMult: number;
  /** effective attacks per second (weapon cadence sped by the attack-speed bonus) */
  aps: number;
  /** effective damage per second in DISPLAY units */
  dps: number;
}

/**
 * Derive the sheet for the in-hand `tool`, the worn `equipped` Armor and the
 * Village `tier`. Mirrors the runtime maths exactly: the band widens by the
 * Armor band BEFORE the crit factor (rollGuardianDamage), the cadence divides
 * by (1 + attackBonus) (atkCadence), and the crit chance adds the Village bonus
 * only when the weapon can already crit (rollGuardianDamage's bonusCrit rule).
 */
export function characterSheet(
  tool: ToolId | undefined,
  equipped: EquippedArmor | null | undefined,
  villageTier: number,
): CharacterSheet {
  const w = weaponCombat(tool);
  const armor = armorBuff(equipped);
  const vill = villageBuff(villageTier);
  const s = GUARDIAN_DISPLAY_SCALE;

  const moveBonus = armor.moveSpeed + vill.moveSpeed;
  const attackBonus = armor.attackSpeed + vill.attackSpeed;
  const critChance = w.critChance > 0 ? Math.min(1, w.critChance + vill.critChance) : 0;

  // effective band (base units) → display units
  const rawMin = w.min + armor.bandMin;
  const rawMax = w.max + armor.bandMax;
  const aps = (1000 / w.attackMs) * (1 + attackBonus);
  const critFactor = 1 + critChance * (w.critMult - 1);
  const dps = ((rawMin + rawMax) / 2) * critFactor * aps * s;

  return {
    // a real combat weapon in hand (bare hands / any non-combat Tool → BARE_HANDS)
    hasWeapon: !!tool && w !== BARE_HANDS,
    moveBonus,
    attackBonus,
    bandMin: rawMin * s,
    bandMax: rawMax * s,
    critChance,
    critMult: w.critMult,
    aps,
    dps: Math.round(dps),
  };
}
