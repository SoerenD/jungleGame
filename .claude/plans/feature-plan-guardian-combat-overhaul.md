# Feature plan — Guardian Combat Overhaul

**One line:** Give the Guardian fight weapon identity and honest feedback — per-weapon damage bands,
passive crits, per-weapon attack speed (DPS is the balance axis), a fixed damage readout, a ¼-shorter
fight, cosmetically bigger numbers, and a positional melee tax — without a player-HP system and
without breaking the deterministic schedule.

> Source of truth: **ADR-0006** (`docs/adr/0006-guardian-combat-depth-weapon-dps-and-melee-tax.md`).
> Constrained by **ADR-0001** (no game server), **ADR-0002** (deterministic schedule), **ADR-0004**
> (roster/Ward/HP). Domain terms: CONTEXT "Guardian damage rule", "Eye Window", "Exhaustion".

This plan is **implementation-ready**. Dungeons (ADR-0007) are decided at the architecture level but
**not** ready to build — see the appendix; do not implement them under this plan.

---

## Resolved decisions (facts)

### 1. Feedback fix (the actual bug behind "damage decreases over time")
- The floating number after a Guardian hit was the Guardian's **remaining HP** (`res.hp`), which
  naturally counts down — misread as shrinking damage. It is also redundant with the HP **bar**.
- **Change:** float the **damage dealt** for the hit (positive number), not remaining HP. The HP
  bar (`fight-hpbar`, `hud.ts`) remains the sole "remaining pool" indicator. A **deflect** keeps its
  existing "clang" bounce.
- Source of the damage number: the server-returned `damage` (see §3), not a client guess.
- Code: `src/scenes/GameScene.ts:1039` (the `floatText(... ${res.hp} ...)` call) and the
  `fireGuardianHit` method at `src/scenes/GameScene.ts:1022`.

### 2. Per-weapon damage bands + passive crit (replaces the flat model)
- The old rule — flat **2**, or **3** with a matching axe/pickaxe in hand (silent flat **+1**) — is
  **removed**. A weapon's strength is now its **visible band**.
- Table (integers are **illustrative / tunable**; the **shape** is the decision — DPS is what to
  balance, not per-hit damage). Numbers below are at a ~×6 cosmetic display scale (see §5):

  | In hand | Damage band | Crit | Attack speed | ≈DPS | Personality |
  |---|---|---|---|---|---|
  | Bare hands / non-combat tool | 8–11 | **none** | 1.5/s (667 ms) | ~14 | never locked out; bring a weapon |
  | Bow | 11–14 (narrow) | 6% ×1.5 | 2.0/s (500 ms) | ~26 | safe from range, low ceiling |
  | Pickaxe | 12–20 | 10% ×1.8 | 2.5/s (400 ms) | ~43 | fast, steady, reliable |
  | Axe | 12–26 (wide) | 16% ×2.0 | 1.8/s (560 ms) | ~40 | slow big swings, feast-or-famine |
  | Ancient axe / pickaxe | ×1.6 band of each | same as base | same as base | ~×1.6 | payoff for beating it once |

- Intended relationships (hold these even when tuning integers): **Bow ≈ 60% of melee DPS** (safety
  tax); **axe ≈ pickaxe DPS, opposite feel** (axe wide/swingy/high-crit, pickaxe fast/steady); bare
  hands clearly weakest and **cannot crit**.
- Crit effect is a **bigger number in a different colour only** — no stun, no lifesteal.

### 3. Server-side roll; node-importable table
- Damage + crit are **rolled server-side** (shared authoritative HP hit by ≤8 clients concurrently).
- `src/content/guardian.ts` stays **node-importable** (no browser globals, no `../config`): it
  exports the **weapon table (pure data)** and `rollGuardianDamage(tool, rng)` taking an **injected**
  `rng: () => number`. `guardianDamage()` at `guardian.ts:32` is replaced by this.
- Backends supply `Math.random`. **Both** `MockBackend.hitGuardian` and
  `SupabaseBackend.hitGuardian` roll and apply.
- `GuardianHitResult` (`src/backend/types.ts:186`) gains `damage: number` and `crit: boolean`.

### 4. Attack speed is combat-only (decoupled from harvest)
- Per-weapon attack speed applies **only when striking the Guardian**. Harvesting keeps the uniform
  `SWING_CADENCE_MS` (300 ms, `config.ts:11`).
- Mechanism: reuse the existing per-action `cadenceMs` hook (`GameScene.ts:108`, already used by the
  Bow at `GameScene.ts:986`); the Guardian-hit action supplies the in-hand weapon's **combat**
  cadence. The swing gate is at `GameScene.ts:2379–2383`.

### 5. Cosmetic scale + ¼ HP cut
- **Cosmetic scale:** multiply on-screen **damage and HP by the same factor** (~×6 suggested) — pure
  juice, zero balance effect.
- **Balance cut:** `HP_PER_HEAD` (`config.ts:121`, currently 750) is cut **~¼** → pre-scale **~560**
  (post-scale, apply the same factor). Re-derive so **hits-to-kill per head ≈ 75%** of today's.
- `GUARDIAN_AWAKE_MS` (5 min, `config.ts:125`) is **unchanged** — the group just finishes sooner and
  rarely grinds deep into the fury phase.

### 6. Weapon tooltips show the stats
- Each weapon's craft/inventory tooltip gains a stat line: **damage band · crit · attack speed ·
  DPS**. Crafting card render: `src/ui/hud.ts:976–1027` (tooltip built at `hud.ts:1005`).

### 7. Positional melee tax (no player HP)
- Melee's higher DPS is taxed **positionally, never reactively**: an authored **melee danger-ring**
  hugging the Guardian's live footprint goes **hot on part of every wave** (e.g. during the
  wind-up). Camping in melee → more knockdowns; a bow user at range is safe but ~26 DPS.
- A slam that catches a melee attacker also **knocks them back** off the body (displacement juice) —
  an authored slam effect, client-side on a ring-caught knockdown.
- **No player HP is introduced.** Harm stays **knockdown → Exhaustion** (three knockdowns → out for
  the fight; ADR-0004).
- The ring is a **pure function of the schedule + position**, adjudicated like existing danger tiles
  (`isDangerousAt`, `guardian.ts:302`; danger geometry alongside `waveTiles`, `guardian.ts:130`).

---

## Acceptance criteria (Given / When / Then)

1. **Readout is damage, not HP.** *Given* a fight, *when* I land an axe hit in an Eye Window, *then*
   a positive damage number in the axe band (or a crit) floats up — never the remaining-HP value —
   and the HP **bar** reflects the drained pool.
2. **No systematic decay.** *Given* repeated in-window hits with one weapon, *then* the floated
   numbers vary only by band/crit and do **not** trend downward over the fight.
3. **Weapon identity holds.** *Given* the weapon table, *then* Bow DPS ≈ 60% of melee DPS and fires
   from range; axe and pickaxe DPS are within ~10% of each other with opposite variance; bare hands
   are weakest and never crit.
4. **Harvest untouched.** *Given* any weapon's combat attack speed, *when* I harvest a tree/rock,
   *then* the harvest swing cadence is still 300 ms.
5. **Shorter fight.** *Given* the ¼ HP cut, *when* a competent group fights, *then* total
   landing-hits-to-kill per head ≈ 75% of the pre-change value.
6. **Melee is riskier than bow.** *Given* the melee ring, *when* I stand adjacent to the Guardian's
   body during a wave, *then* I can be knocked down/back; a bow user at range in the same wave is not.
7. **Concurrent hits stay consistent.** *Given* two clients hitting in the same window, *then* HP is
   server-owned and never diverges.
8. **Build is green.** `npm run build` (`tsc && vite build`) passes — the project's only correctness
   check (there are no tests).

---

## Scope boundaries — do NOT build

- **Do NOT** flatten or change the Eye Window fury shrink (2.4 → 1.9 → 1.4 s) — it stays; it was
  never the problem.
- **Do NOT** add a player HP bar or any "damage to the player" — harm stays knockdown → Exhaustion.
- **Do NOT** make the Guardian react (no shove-on-approach / shove-on-attack) — the melee tax is
  authored and positional only (ADR-0002).
- **Do NOT** touch harvesting balance, node HP/regrow, or the Sawmill.
- **Do NOT** change the deterministic wave/lunge/eye schedule, except adding the melee-ring danger
  geometry (which is itself a pure function of the clock + position).
- **Do NOT** move damage rolling to the client — it is server-side.
- **Do NOT** break `guardian.ts` node-importability (no browser globals, no `../config`).
- **Do NOT** implement Dungeons (ADR-0007) — separate, content-incomplete (see appendix).

---

## Constraints & gotchas

- `npm`/`npx` here need `--registry https://registry.npmjs.org/`.
- Cosmetic scale must hit **both** damage and HP or the balance shifts — it is display only.
- **DPS**, not per-hit damage, is the number to balance; final integers land after a playtest.
- Both backends must implement the roll and return `{ damage, crit }`; keep the Mock (single-player,
  localStorage) and Supabase paths in sync.
- The HP bar already exists (`fight-hpbar`, `hud.ts:98` / fill at `hud.ts:658`) — reuse it; only the
  floating text changes.
- The melee ring must adjudicate knockdowns server-side with the same `ADJUDICATION_SLACK_MS`
  discipline as existing danger tiles.

---

## References

- **ADR-0006** — Guardian combat depth (this feature).
- **ADR-0002** — deterministic schedule (invariant this must not break).
- **ADR-0004** — roster/Ward/HP-per-head (HP model this cut plugs into).
- **CONTEXT.md** — "Guardian damage rule", "Eye Window", "Exhaustion" (all revised for this feature).

---

## Appendix — Dungeons v1: now fully planned

Dungeons v1 ("the Delve") is decided **and** speced. Content threads (progression gate, loot,
dedicated weapon, names) are resolved. **Full spec:**
[`feature-plan-dungeons-v1.md`](./feature-plan-dungeons-v1.md) (ADR-0007).

**Build order:** this combat overhaul **first** — Dungeons v1 reuses its per-weapon damage table +
`rollGuardianDamage(tool, rng)` for player→mob damage and the knockdown/Exhaustion model. Do not
start dungeon code until the weapon/roll system exists.
