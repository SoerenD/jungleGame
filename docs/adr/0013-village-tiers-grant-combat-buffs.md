# The Village grants collective combat buffs (retiring the one-buff rule)

Until now the game had **exactly one buff** — cooked fish/meat, +20% move speed (ADR-0012 reaffirmed
it, CONTEXT §Cooking). The **Village** (ADR-0010) was deliberately kept **parallel, never power**:
its tier-ups delivered decor, grandeur, and non-combat QoL, so "any stat perk reopens the one-buff
rule" (ADR-0010 §3). The designer has chosen to change that: each **Village tier** should now grant a
tangible **combat/movement attribute**, so raising the Village *feels* like getting stronger, not just
prettier. This ADR records that reversal and its blast radius.

## Decision

1. **The Village becomes a shared combat ladder.** Each collective **tier** (Camp → … → Capital)
   grants **one new thing per stage**, kept deliberately small — the ladder lives in `VILLAGE_BUFFS`
   / `villageBuff(tier)` in `content/village.ts` (node-pure, the tuning surface). **Camp** grants an
   extra **inventory row** (pack capacity 18→24, `inventoryCapacity` in `content/village.ts`,
   enforced client-side on harvest — a full pack leaves the resource in the world, no loss);
   **Hamlet/Village/Town** each add **+4% to a single combat attribute** (move
   speed / attack speed / crit); **Capital** adds **+2% to everything** (→ +6% each). An earlier, much
   larger all-three-at-once ladder (up to +20% move) was cut as too strong.
2. **Collective, not competitive.** The tier is **shared by the whole World**, so every Player gets the
   **same** buffs at the same time — there is no per-player power gap and no individual tracking. This
   keeps the anti-competitive, no-leaderboard ethos (ADR-0010 §5) intact even though the Village now
   confers power. It stacks additively with the cooked-food move buff.
3. **The one-buff rule is retired.** CONTEXT's "first and only buff" and "one-buff rule holds/​inviolate"
   statements no longer bind. The **no-HP / no-death / no-item-loss** contract is untouched and remains
   inviolate — harm is still only a knockdown; these buffs add *player power*, never *player fragility*.
4. **Where the buffs apply.** Move speed is global (all movement). Attack speed folds into the client
   **combat swing cadence** for the Guardian, the Delve, and Wildlife. Crit is applied in the
   server-boundary `rollGuardianDamage` **crit roll for the Guardian fight** (both backends read their
   own cached `village.tier` — client-authoritative, no RPC, **no migration**). Crit only sharpens
   weapons that *already* crit — **bare hands stay crit-less** by design. (Delve/Wildlife crit is left
   unbuffed for now — a noted follow-up, since that damage is host-simulated in `content/dungeon.ts`.)
5. **The Hall re-sprites per tier.** Reinforcing the "you got stronger" read, the Hall art now grows
   with the tier (`drawHall(R, tier)` in `ui/icons.ts`: a hut at Camp → the current grand bell-towered
   hall at Capital, which is byte-identical to the prior single-stage art). Pure art, no backend.

## Considered Options

- **Keep the one-buff rule; tier perks are QoL abilities** (recall, Trade Post, Bell) — the ADR-0010
  design. Rejected by the designer: they want tangible *power* per tier, not only conveniences.
- **Individual/earned combat stats** — rejected: cuts against the collective, anti-competitive ethos.
  Collective tier buffs give the "stronger" feeling with no per-player gap.
- **Buff only movement (the least balance-disruptive stat)** — considered; the designer explicitly
  wanted crit and attack speed too, so all three ship (numbers kept modest and centrally tunable).

## Consequences

- **Guardian balance shifts with Village tier.** Crit + attack-speed raise player DPS, and move speed
  aids dodging, so a high-tier Village makes the Guardian faster/safer to kill. The fight tuning
  (`HP_PER_HEAD`, ADR-0004/0006) may want revisiting once the ladder is playtested; the buff numbers
  are the first lever. ADR-0002's determinism is unaffected — the schedule still keys on time, only the
  HP axis (already excluded from the schedule) moves faster.
- **Supersedes** ADR-0010 §3's "non-combat QoL only / one-buff rule holds" and the CONTEXT one-buff
  statements (§Cooking, §Village meta-loop, §Wildlife). Updated in CONTEXT.md alongside this ADR.
- **No new persistent state, no migration.** The buffs are pure functions of the existing collective
  `village.tier`; both backends already cache it. The Hall textures bake client-side per tier.
- **Tuning surface:** `VILLAGE_BUFFS` in `content/village.ts` — one row per tier.
