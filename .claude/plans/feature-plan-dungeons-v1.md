# Feature plan — Dungeons v1 ("the Delve")

**One line:** A reactive co-op dungeon — the Delve — entered from a sealed mine shaft in the World,
run by **peer host-authority** (no server), populated by **Husk** mobs (a melee chaser + a ranged
kiter) and a **Deep Guardian** boss, with headcount scaling, knockdown→Exhaustion wipes, co-op
participation loot, and the game's first **pure-combat weapon (the Sword)**. v1 has **no host
migration**.

> Source of truth: **ADR-0007** (`docs/adr/0007-reactive-coop-dungeons-peer-host-authority.md`).
> Reuses **ADR-0006** (weapon damage table + roll), **ADR-0004** (Ward-style roster lock,
> participation loot), **ADR-0001** (no server — the host is a peer). Domain terms: CONTEXT
> "Dungeon", "Husk", "Exhaustion".

### ⚠ Dependency & size
- **Depends on the Guardian Combat Overhaul** (`feature-plan-guardian-combat-overhaul.md`,
  ADR-0006): dungeon combat **reuses the per-weapon damage table + `rollGuardianDamage(tool, rng)`**
  for player→mob damage, and the knockdown/Exhaustion model. **Build the combat overhaul first.**
- This is a **large, multi-session feature** (instancing, host-authority netcode, mob AI, a boss,
  new items, a new interior layout). `npm run build` green is **necessary, not sufficient** — the
  netcode/AI criteria need a **manual multiplayer playtest** to verify.

---

## Resolved decisions (facts)

### 1. Entrance & gating (post-Guardian)
- A fixed **mine-shaft entrance** placed at an authored World location (a rocky/ruins Zone). Visible
  from day 1 but **sealed by rubble**.
- The rubble is a Resource-Node-like obstacle **cleared once, permanently, by harvesting it with an
  Ancient Pickaxe in hand** — i.e. you must have beaten the Guardian to hold one. After clearing,
  the shaft is **freely re-enterable by anyone, forever** (server-ordered, like the vine gate).
- **Dev flag `?dungeon`** bypasses the gate and drops you at the entrance for playtesting.

### 2. Instance lifecycle
- Interacting with the open shaft **creates an instanced run**: the party present is teleported into
  the **Delve interior** (a separate authored tile layout — v1: one fixed layout, entrance room → 2–3
  Husk rooms → boss room).
- **Roster locks at entry** (like the Ward) — no late join, no roster change mid-run.
- The instance exists **only while ≥1 player is inside**; empty → it evaporates (this is the whole
  "no one calcs them when no one's there" win).

### 3. Peer host-authority (ADR-0007)
- The initiating player is the **host**: their client sims all Husks + the boss (position, AI, HP),
  **broadcasts** state over the Realtime channel, and **adjudicates** player→mob and mob→player hits.
- **Mob HP lives in host memory** — never a DB row (no write storms). Only **loot** persists.
- **Host leaves/disconnects → the run ends:** remaining players are booted back to the World
  entrance, **no loot**. (v1 has **no migration** — deliberate; the hardest piece, deferred to v2.)

### 4. Mobs — Husks (reactive)
- **Grasp Husk (melee chaser):** steers toward the nearest in-instance player; in range, a
  **telegraphed lunge** that **knocks down** on contact. v1 AI = straight-line steering + basic
  wall-tile avoidance (no full pathfinding).
- **Spit Husk (ranged kiter):** keeps distance; fires a **telegraphed projectile** that knocks down
  on hit; repositions when a player closes.
- Husks have HP; players damage them with the **ADR-0006 weapon roll** (host adjudicates
  range/ownership, trusted-friends loose validation). Die at 0 → drop common loot.
- Inert until a player enters aggro range (spatial index drives aggro/targeting).

### 5. Boss — the Deep Guardian
- A larger, **reactive, host-simmed** Husk in the boss room with **2–3 scripted phases** (attack
  cadence / telegraph density ramps per phase). **Reuses the Husk AI + telegraph system, scaled up**
  — v1 does **not** build a second combat engine.
- Boss HP scales with roster. On death: drops the **rare material** and **completes the run**.

### 6. Scaling
- At entry, scale **Husk count + HP and boss HP** by headcount; keep **per-mob damage/knockdown
  ~constant** so per-person tension is flat (the `HP_PER_HEAD` philosophy). No late join.

### 7. Harm / wipe (no death)
- Mob hits **knock down** (~5s, reuse `KNOCKDOWN_STUN_MS`). **3 knockdowns → Exhaustion** → out of
  the run (booted to the World entrance, landed-hit loot eligibility kept).
- **Whole party Exhausted → run fails**, everyone booted out, the Delve resets. **No player HP, no
  death, ever.**

### 8. Loot (co-op participation)
- Per-Husk-kill: **common material** (the farm loop). Boss: **rare material**, guaranteed.
- **Participation loot** like the Guardian: every player who landed ≥1 hit **in the run** gets the
  drop set. Written to inventories on the finishing kill / run completion — the **only** DB write.

### 9. New items
- **Resources:** a common drop (working name **"husk shard"**) and a rare boss drop (working name
  **"deep core"**) — new `ResourceId`s.
- **Sword** — new `ToolId`, the game's **first pure-combat weapon (no gathering use)**; crafted from
  dungeon materials + planks/stone; plugs into the **ADR-0006 weapon table** (a melee band above the
  axe, its own crit + attack speed). Works vs **Husks, the boss, AND the Guardian**.
- Taxonomy: keep the Sword as `kind: 'tool'` in `ITEMS` (don't churn the type union) — it simply has
  **no harvest capability**; describe it as combat-only. Its tooltip shows the ADR-0006 stat line.

### 10. Interior & rendering
- The Delve interior is a distinct authored tile layout; reuse the tilemap + collision system. Wall
  tiles block. The **spatial index** (#7) covers mob targeting, collision, and **broadcast culling**
  (only nearby/changed mobs on the wire).

---

## Acceptance criteria (Given / When / Then)

1. **Gate.** *Given* an Ancient Pickaxe, *when* I harvest the sealed rubble, *then* the Delve
   entrance opens permanently for everyone (persisted, server-ordered).
2. **Enter & lock.** *Given* a party at the open shaft, *when* we enter, *then* we're teleported into
   an instanced Delve, the roster locks, and Husk/boss count+HP scale to our headcount.
3. **Melee chaser.** *Given* a Grasp Husk, *when* I'm in its aggro range, *then* it chases and
   telegraphs a lunge that knocks me down on contact.
4. **Ranged kiter.** *Given* a Spit Husk, *when* I approach, *then* it kites and fires telegraphed
   projectiles that knock down on hit.
5. **Damage model reused.** *Given* I hit a Husk with a weapon in the ADR-0006 table, *then* it takes
   host-rolled damage and dies at 0, dropping common loot.
6. **Boss + participation loot.** *Given* the Deep Guardian dies, *then* every player who landed ≥1
   hit in the run receives the rare drop, and the run completes.
7. **Wipe/exhaustion.** *Given* 3 knockdowns, *then* I'm Exhausted and out of the run; *given* the
   whole party is Exhausted, *then* the run fails and the Delve resets.
8. **Host-leave (v1).** *Given* the host leaves mid-run, *then* the run ends and remaining players are
   booted to the World entrance with no loot.
9. **Sword.** *Given* dungeon materials, *when* I craft a Sword, *then* it's a pure-combat weapon
   (no harvesting) usable vs Husks, boss, and Guardian, with its stat line in the tooltip.
10. **No open-world change.** *Given* I'm in the open World, *then* nothing chases or attacks me —
    Husks exist only inside the Delve.
11. **Build.** `npm run build` passes.

---

## Scope boundaries — do NOT build

- **No host migration** — v1 host-leave ends the run.
- **No roaming mobs in the open World** — Husks live only in the Delve.
- **No player HP / no death** — harm is knockdown → Exhaustion only.
- **No DB-persisted mob HP** — host memory only; only loot persists.
- **One** interior layout, **two** Husk types, **one** boss, **one** Sword for v1 — no more.
- **No deterministic Delve mobs** — they are reactive/host-simmed (the explicit choice).
- **No late join / mid-run roster change.**
- **No second combat engine** for the boss — it reuses the Husk AI scaled up.

---

## Constraints & gotchas

- **Order:** land the Guardian Combat Overhaul (ADR-0006) first — dungeon combat reuses its weapon
  table + `rollGuardianDamage`.
- **Realtime budget:** the host broadcasts mob state — cull by spatial index and rate-cap; respect
  the `POS_BROADCAST_MS` cadence and the presence rate limits (see the realtime notes).
- **Security:** trusted-friends posture — the host validates hits loosely (range + ownership);
  acceptable per ADR-0005.
- **`guardian.ts` stays node-importable** — the weapon table it exports is reused for mob damage;
  keep it clean (no browser globals, no `../config`).
- **Dungeon knockdown adjudication is host-side**, not the DB/deterministic path the Guardian uses —
  a deliberate ADR-0007 departure.
- `npm`/`npx` need `--registry https://registry.npmjs.org/`.
- Build-green is necessary, not sufficient — verify the AI/netcode criteria by **manual multiplayer
  playtest**.

---

## References

- **ADR-0007** — reactive co-op dungeons on peer host-authority (architecture).
- **ADR-0006** — weapon damage table + roll (reused for mob damage; the Sword plugs in).
- **ADR-0004** — Ward roster lock + participation loot (patterns reused).
- **ADR-0001** — no game server (the host is a peer).
- **CONTEXT.md** — "Dungeon", "Husk", "Exhaustion".
