// Armor (ADR-0017 §3/§4): three worn pieces — Boots, Gloves, Helm — each
// crafted from one Warden Realm's refined chain and granting exactly ONE small
// attribute. Armor is individual power, deliberately bounded: it gates
// nothing, has no defense/HP semantics (there is no HP to protect), and the
// full-set gap stays modest. Numbers are a node-pure tuning table like
// VILLAGE_BUFFS (village.ts precedent); stats apply client-side exactly like
// the Village buffs (no SQL knows the values).
//
// PURE DATA + PURE FUNCTIONS — no browser globals, no backend imports — so
// both backends, the avatar composer, the HUD and the scene share one truth.

import type { ItemId } from './items';

/**
 * The three armor slots. Rung 3's piece is a CHEST cuirass (not gloves): a
 * plated torso reads as a genuinely different silhouette, where tiny gloves
 * barely changed the sprite (owner call, 2026-07-12 — supersedes ADR-0017 §3's
 * "chest armor cut"; a V-neck keeps a sliver of the shirt-colour identity).
 */
export type ArmorSlot = 'boots' | 'chest' | 'helm';
export const ARMOR_SLOTS: ArmorSlot[] = ['boots', 'chest', 'helm'];

/** what a Player wears: at most one piece per slot, synced like `held` */
export type EquippedArmor = Partial<Record<ArmorSlot, ItemId>>;

/** the combined attribute bonus a worn set grants (all zeros when bare) */
export interface ArmorBuff {
  /** fractional move-speed bonus (0.08 = +8%); stacks with food/festival/Village */
  moveSpeed: number;
  /** fractional combat attack-speed bonus (a faster swing cadence) */
  attackSpeed: number;
  /** flat raise on the held weapon's damage band, base units (min / max) */
  bandMin: number;
  bandMax: number;
}

export interface ArmorDef extends ArmorBuff {
  slot: ArmorSlot;
  /** overlay palette the avatar composer bakes onto the 20-frame sheet. `glow` is
   *  an optional 4th hue for the epic silhouette's lit accents (e.g. the violet
   *  horn-tips); the composer falls back to `accent` when it is absent. */
  art: { base: string; shade: string; accent: string; glow?: string };
  /** cosmetic: draw the EPIC crested/glowing helm silhouette (same slot + stats) */
  epic?: boolean;
}

/**
 * The tuning table (owner-confirmed at sign-off): Boots +8% move, Gloves +8%
 * attack speed, Helm +2/+3 flat band raise. Art hues carry each Realm's
 * signal color (the Mire's teal tideglass; hushsteel's cold blued steel;
 * the Terraces' living green weave).
 */
export const ARMOR_BUFFS: Partial<Record<ItemId, ArmorDef>> = {
  tideglass_boots: {
    slot: 'boots', moveSpeed: 0.08, attackSpeed: 0, bandMin: 0, bandMax: 0,
    art: { base: '#63e0b8', shade: '#2f8f74', accent: '#c8fbe8' },
  },
  verdant_cuirass: {
    slot: 'chest', moveSpeed: 0, attackSpeed: 0.08, bandMin: 0, bandMax: 0,
    art: { base: '#4a7a3d', shade: '#2f5228', accent: '#9ec457' },
  },
  hushsteel_helm: {
    slot: 'helm', moveSpeed: 0, attackSpeed: 0, bandMin: 2, bandMax: 3,
    art: { base: '#5a6b85', shade: '#39445a', accent: '#93a8c9' },
  },
  // the Reverberant's transfiguration: SAME slot + SAME band as the plain helm,
  // but drawn as the epic "Spread Horns" crown (avatars.ts branches on `epic`) —
  // a dark blued-steel helm with heavy horns to the frame edges, tips lit violet
  hushsteel_helm_epic: {
    slot: 'helm', moveSpeed: 0, attackSpeed: 0, bandMin: 2, bandMax: 3,
    art: { base: '#454f68', shade: '#2a3245', accent: '#93a8c9', glow: '#c9a0ff' },
    epic: true,
  },
};

export function isArmor(item: string | null | undefined): boolean {
  return !!item && !!ARMOR_BUFFS[item as ItemId];
}

export function armorDef(item: string | null | undefined): ArmorDef | undefined {
  return item ? ARMOR_BUFFS[item as ItemId] : undefined;
}

/** the combined buff of everything worn — safe on undefined/junk input */
export function armorBuff(eq: EquippedArmor | undefined | null): ArmorBuff {
  const out: ArmorBuff = { moveSpeed: 0, attackSpeed: 0, bandMin: 0, bandMax: 0 };
  if (!eq) return out;
  for (const slot of ARMOR_SLOTS) {
    const def = armorDef(eq[slot]);
    if (!def || def.slot !== slot) continue;
    out.moveSpeed += def.moveSpeed;
    out.attackSpeed += def.attackSpeed;
    out.bandMin += def.bandMin;
    out.bandMax += def.bandMax;
  }
  return out;
}

/**
 * Drop unknown slots, slot-mismatched pieces and — when an inventory is given
 * (the backends' ownership check) — anything not actually owned. The wire and
 * the DB both pass through here, so junk never reaches a texture or a roll.
 */
export function sanitizeEquipped(
  eq: unknown,
  inv?: Partial<Record<string, number>>,
): EquippedArmor {
  const out: EquippedArmor = {};
  if (!eq || typeof eq !== 'object') return out;
  for (const slot of ARMOR_SLOTS) {
    const item = (eq as Record<string, unknown>)[slot];
    if (typeof item !== 'string') continue;
    const def = armorDef(item);
    if (!def || def.slot !== slot) continue;
    if (inv && (inv[item] ?? 0) <= 0) continue;
    out[slot] = item as ItemId;
  }
  return out;
}
