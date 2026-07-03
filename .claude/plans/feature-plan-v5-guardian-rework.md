# Feature plan: Jungle World v5 — Guardian rework (roster HP, the Ward, hard Exhaustion, first-strike engage)

The Guardian stops being a headcount faceroll. HP scales to the party sealed inside a **Ward**,
Exhaustion removes a fighter for the whole fight, and the encounter re-anchors from summon to the
first strike. Resolved in a grilling session on 2026-07-03.

Read first — this plan does not repeat them:
- CONTEXT.md — new **Ward** term; rewritten **Exhaustion**; updated **Guardian** awake-window and
  damage-rule relationships (per-head HP, first-strike anchor, dormant state).
- docs/adr/0004-guardian-difficulty-roster-ward-engage.md — the rework and the trade-offs behind it.
- docs/adr/0002 (amended #2) — the fight clock's origin moves `summonedAt → engagedAt`; the
  determinism invariant is preserved, only re-anchored.
- docs/adr/0001 — no game server; lazy timestamps; all state through the `Backend` interface.

## Resolved decisions

1. **Per-head HP, no floor.** Guardian HP is `HP_PER_HEAD × roster size`, with `HP_PER_HEAD = 750`,
   set at the first strike and stored on the fight row — replacing the flat `GUARDIAN_MAX_HP = 2250`.
   n=3 → 2250 (unchanged), n=8 → 6000, solo → 750. `?fight` (`DEV_FIGHT`) stays trivial. Do **not**
   add a minimum-roster clamp; pure per-head is intentional.
2. **Constant per-capita difficulty.** More friends make the fight no *faster* but more survivable (a
   fixed HP pool absorbs a lost fighter). Solo is a brutal-but-possible hardcore feat. "Solo
   near-impossible" and "more friends make it winnable (faster)" are retired.
3. **The Ward.** A stone barrier the Guardian slams across the arena entrance ~2s after the first
   strike; drops at victory/slumber. Blocks outsiders and Exhausted members from entering. Distinct
   from the permanent Seal; rises fresh in every fight.
4. **Hard Exhaustion.** `EXHAUSTION_KNOCKDOWNS` (3) knockdowns → out for the rest of that fight; the
   Ward bars re-entry. Wake at spawn/Hammock, inventory intact, prior hits still count for loot,
   rejoin only next summon. Whole roster exhausted before HP 0 = fight lost.
5. **First-strike engage / clock re-anchor.** Summon wakes the Guardian *dormant* (roams harmlessly,
   arena open, no danger tiles, no Eye Windows). The first landed hit sets `engagedAt`; the entire
   danger schedule becomes a pure function of `engagedAt + elapsed`. Wave 0 = leap-to-entrance + Ward
   slam (existing lunge system, wave-0 target forced to the entrance). Awake window (~5 min) runs
   from `engagedAt`.
6. **Roster lock.** Roster = Players inside the arena rect (`ARENA_W × ARENA_H`) at the first strike.
   HP and roster snapshot at that instant.
7. **Dormant timeout.** No strike within ~90s of summon → re-slumber, totem spent (no refund).
8. **First hit is not Eye-gated** (no schedule exists yet); it engages and deals its normal damage.
   All later hits gate on Eye Windows exactly as today.
9. **Danger schedule unchanged.** `FURY_PHASES`, `FURY_THRESHOLDS`, and the Eye/slam/lunge/density
   numbers stay byte-for-byte as-is. Retune only after a real playtest.

## Likely touch points (verify against current code)

- `src/config.ts` — replace flat `GUARDIAN_MAX_HP` with `HP_PER_HEAD = 750`; add
  `DORMANT_TIMEOUT_MS ≈ 90_000`. Keep `?fight` trivial. `GUARDIAN_AWAKE_MS`, `KNOCKDOWN_STUN_MS`,
  `EXHAUSTION_KNOCKDOWNS`, `GUARDIAN_SCALE_DROP` unchanged.
- `src/backend/types.ts` — `DbFight`/`FightState`: add `engagedAt: number | null` and
  `roster: string[]`; `maxHp` now computed at engage. Add a `guardianEngaged`/re-anchor event or fold
  `engagedAt` into the existing `guardianHit`/`FightState` broadcast so clients re-anchor their clock.
- `src/backend/MockBackend.ts` — `summonGuardian` (~L861): create the fight in the **dormant** state
  (`engagedAt: null`, `hp/maxHp` not yet fixed, empty roster); schedule the ~90s dormant timeout
  re-slumber. `hitGuardian` (~L886): on the *first* hit set `engagedAt = Date.now()`, snapshot the
  roster from Players inside the arena rect, set `hp = maxHp = 750 × roster.length`, then apply the
  hit; on later hits adjudicate Eye Windows against `elapsed = now − engagedAt`. Reject/deflect hits
  and knockdowns from non-roster (and Exhausted) Players. Slumber/timeout paths spend the totem.
- `src/content/guardian.ts` — schedule functions already take `elapsedMs` and `awakeMs` as args, so
  they need no origin change *internally*; callers pass `now − engagedAt`. Add a way to force wave 0's
  lunge target to the arena entrance (rest of `lungeTarget`/`waveInfoAt` untouched). **Keep this file
  node-importable** (no `../config`, no browser globals); `HP_PER_HEAD` lives in `config.ts`.
- `src/scenes/GameScene.ts` — dormant vs engaged rendering; the Ward barrier (collision + draw) at
  the entrance with per-player permeability; the doorway slam knockdown; drive damage against
  `engagedAt`; Exhausted-out handling (can't re-enter). Reuse `seal-barrier` art / `epicSealBreak`
  FX for the slam where sensible.
- `src/ui/hud.ts` — dormant prompt ("strike to begin"), roster/HP readout that appears at engage.

## Acceptance criteria (Given / When / Then)

- **Dormant.** Given a summoned, unstruck Guardian, then there are no danger tiles, no Eye Windows,
  the arena is open, and the ~5-min clock has not started.
- **Engage.** Given a dormant Guardian, when any Player lands a hit, then `engagedAt` is set, the
  Guardian leaps to the entrance over ~2s and slams the Ward shut, `maxHp == 750 × (Players inside
  the arena at that instant)`, that hit's damage is applied, and the striker is recorded as a
  participant.
- **No join.** Given a fight in progress (Ward up), when a Player who was outside the arena at the
  first strike tries to enter, then the Ward blocks them and they deal no damage.
- **Per-head HP.** Given N Players inside at the first strike, then `maxHp == 750 × N` (3 → 2250,
  8 → 6000, 1 → 750); `?fight` stays trivial.
- **Hard Exhaustion.** Given a roster member knocked down 3 times, then they wake at spawn/Hammock
  with inventory intact, cannot re-enter this fight, keep loot eligibility for prior hits, and rejoin
  only on the next summon.
- **Wipe.** Given the whole roster is Exhausted before HP hits 0, then no one can damage the Guardian
  and it re-slumbers at the timer, totem spent.
- **Timeout.** Given a Guardian summoned but never struck, when ~90s pass, then it re-slumbers and the
  totem is not refunded.
- **Determinism.** Given `engagedAt`, every client and the server derive the identical
  wave/Eye/lunge/fury schedule from `engagedAt + elapsed`; nothing keys on HP or on any post-engage
  Player action.
- **Schedule intact.** `FURY_PHASES`, `FURY_THRESHOLDS`, and Eye/slam/lunge numbers are unchanged
  from today.
- `npm run build` (`tsc && vite build`) passes — the correctness check (no tests).

## Scope boundaries — do NOT build

- No changes to wave patterns, Eye/slam/fury numbers, or lunge families (playtest first).
- No reactive AI, aiming, chasing, or targeting — the *sole* reaction anywhere is the one-time
  first-strike engage (a discrete world event, not adaptive AI).
- No HP floor / minimum-roster clamp.
- No totem refund on loss or timeout.
- Don't touch the permanent **Seal** mechanic, Offerings, the Journey, fishing/cooking, the Sawmill,
  crates, the Avatar, or the v4 Loadout/Bow/Torch systems beyond what engage + Ward require.
- Don't persist roster/loadout server-side beyond the fight row (`engagedAt`, `roster`, per-fight
  `maxHp`).

## Constraints and gotchas

- `src/content/guardian.ts` must stay node-importable (generate-map imports it): pass elapsed as
  `now − engagedAt`; keep `HP_PER_HEAD` out of this file.
- Server adjudicates hits/knockdowns against `engagedAt + server time` (`ADJUDICATION_SLACK_MS`
  unchanged); before `engagedAt` there is no adjudication (dormant, harmless).
- Broadcast `engagedAt` so every client re-anchors; clock skew shifts only *rendering*, never
  adjudication (ADR-0002).
- Wave 0's lunge target is forced to the entrance; the rest of the lunge system is untouched.
- Simultaneous first hits: the server orders them; the first sets `engagedAt`; others adjudicate
  against the now-live (eye-closed, mid-leap) schedule and typically deflect.
- Ward permeability: roster-and-not-exhausted may pass; outsiders and Exhausted are blocked; the
  doorway slam knocks down anyone caught in it.
- The hidden-preview RAF freeze still applies — drive dev via `?pump&canvas` and the `__jw`/`__game`
  handles.

## References

- CONTEXT.md — **Ward**, **Exhaustion**, **Guardian** (awake-window + damage-rule relationships).
- docs/adr/0004-guardian-difficulty-roster-ward-engage.md — this rework.
- docs/adr/0002-guardian-runs-on-deterministic-schedule.md (amendment #2) — clock re-anchor.
- docs/adr/0001-supabase-as-entire-backend.md — no game server; lazy timestamps; Backend interface.
