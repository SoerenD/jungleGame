# Guardian combat depth: per-weapon damage bands, passive crits, attack-speed DPS, and a positional melee tax

The Guardian fight's damage model was deliberately flat — every landing hit dealt 2, or 3 with an
axe/pickaxe in hand (a hidden flat +1) — and after each hit the client floated the Guardian's
*remaining HP*. In play this read as "my damage is shrinking" (the remaining-HP number counts down
toward 0), weapon choice carried almost no texture, and the fight ran long. We add an RPG-lite damage
layer that gives weapons personality and makes numbers feel meaty, while preserving the fight's
timing-puzzle core and every ADR-0002 / ADR-0004 invariant.

## Decision

1. **Per-weapon damage bands replace the flat +1.** Each weapon that can strike the Guardian has a
   min–max damage band, a passive crit chance/multiplier, and a combat-only attack speed. **DPS =
   avg band × attack speed × crit factor** is the balance axis. Shape: bare hands / non-combat tools
   a weak **no-crit** baseline; the **Bow** low, narrow band on a slow cadence (safe from range,
   lowest DPS); the **pickaxe** fast, steady, mid band; the **axe** slow, wide, feast-or-famine band
   (≈ pickaxe DPS, opposite feel); the **ancient axe/pickaxe** a tier-2 ~×1.6 scale-up. The hidden
   "+1 for the matching Tool" bonus is retired — a weapon's strength now lives in its visible band.

2. **The roll is server-side.** Shared, authoritative Guardian HP is hit concurrently by up to 8
   clients, so the server owns the damage + crit roll and returns `{ damage, crit }` on
   `hitGuardian`. `src/content/guardian.ts` stays node-importable: it exports the **weapon table
   (pure data)** plus `rollGuardianDamage(tool, rng)` taking an *injected* `rng`; the backend
   supplies `Math.random`. Both `MockBackend` and `SupabaseBackend` get it.

3. **The client floats damage dealt, not remaining HP.** The misleading remaining-HP float is
   removed; the existing HP **bar** (`fight-hpbar`) shows the pool, and the float shows the hit's
   damage — a crit pops bigger and in a different colour.

4. **Attack speed is combat-only.** The swing loop is shared with harvesting, so a weapon's combat
   cadence applies **only** when striking the Guardian; harvesting keeps the uniform
   `SWING_CADENCE_MS`. This reuses the existing per-action `cadenceMs` hook (the Bow already
   overrode it), so a slow axe never chops trees slower.

5. **Cosmetic number scale, plus a ¼ HP cut.** On-screen damage and HP are scaled up by a common
   factor (bigger numbers, zero balance effect); separately, `HP_PER_HEAD` is cut ~¼ (750 → ~560,
   pre-scale) so a competent group finishes ~25% sooner and rarely grinds deep into the fury phase.
   HP is re-derived so hits-to-kill per head ≈ 75% of the old value.

6. **Melee's higher DPS is taxed positionally, never reactively.** An authored **melee danger-ring**
   hugging the Guardian's live footprint goes hot on part of every wave; camping in melee to maximize
   DPS costs knockdowns, while the Bow stays outside it — safe but lower DPS. A slam that catches a
   melee attacker also **knocks them back** off the body (displacement juice, an authored slam
   effect). **No player HP is introduced** — harm stays the knockdown → Exhaustion currency. The tax
   is a pure function of the authored schedule + player position, so the Guardian still never reacts.

**Why this does not break ADR-0002.** Damage variance lives entirely on the HP axis, which ADR-0002
already excludes from the deterministic schedule (*"nothing depends on HP"*). Waves, Eye Windows,
lunges and the melee-ring are all still pure functions of `engagedAt + elapsed`, re-derived
identically by every client and the server. Crits change the numbers that pop off the puzzle, never
the puzzle itself; the fight is still frame-identical for everyone.

## Considered Options

- **Keep the flat model, only fix the float** — rejected: silences the false "damage shrinks" alarm
  but leaves weapon choice textureless, which was the deeper complaint.
- **Flatten the Eye Windows for constant DPS** — rejected: the shrinking window is the fight's
  escalation identity. The real drags were *length* (fixed by the ¼ cut) and the misread float, not
  the taper.
- **Client-rolled crits** (trust the friend group) — rejected: shared authoritative HP hit by 8
  clients must be server-computed to stay consistent; the trusted-friends security posture doesn't
  change who *owns* the HP.
- **A player HP bar / chip damage to melee** — rejected: reverses the load-bearing "no death, harm =
  knockdown" pillar and adds a whole subsystem. The knockdown-currency melee-ring achieves the same
  melee tax inside the existing model.
- **A reactive shove** (Guardian pushes whoever attacks / gets close) — rejected: reactive AI is
  exactly what ADR-0002 forbids. The authored ring + slam-knockback is positional, not reactive.

## Consequences

- **Damage is no longer reproducible from `engagedAt`** — but it never was part of the schedule, and
  the schedule still is. The server can log rolls if an audit is ever needed.
- **`GuardianHitResult` gains `damage` and `crit`;** the client float and hit SFX key off them.
- **The weapon table is new tunable content.** Exact integers land after a playtest; **DPS**, not
  per-hit damage, is the number to balance. Bow ≈ 60% of melee DPS is the intended safety tax.
- **Weapon tooltips gain a stat line** (band · crit · attack speed · DPS) in the craft/inventory UI.
- **The melee-ring is new authored danger geometry** — a ring around the Guardian's live footprint,
  hot on a schedule slice — plus client-side knockback on a ring-caught knockdown.
- **CONTEXT is revised:** the Guardian damage rule and the Eye Window entry are rewritten, and
  *"Avoid: DPS window"* is dropped — DPS is now a real concept, though the Eye Window remains a
  timing gate (miss it, zero).
