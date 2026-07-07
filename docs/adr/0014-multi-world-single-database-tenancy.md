# Several Worlds in one database, scoped by a world-id

Until now the game hard-coded a **single** World: the `world` table was a singleton row
(`check (id = 1)`), every other table lived in one global namespace (players keyed by name,
structures unique on `(tx,ty)`, one `jw-world` Realtime channel), and `createBackend` pointed at one
Supabase project. The designer wants to run **several independent Worlds** — e.g. one per friend
group, or a throwaway test World beside the real one — without standing up a Supabase project per
World. We tenant the existing single database with a `world_id` slug instead.

## Decision

1. **One database, many Worlds, scoped by `world_id`.** A `world_id text` column joins every mutable
   table (`players`, `nodes`, `structures`, `structure_tiles`, `crates`, `sawmills`, `chat`) and
   becomes part of each primary key / unique / foreign key. The `world` table goes from one row to
   **one row per World**, its `id` retyped from the `= 1` singleton int to the text slug. Only
   **mutable runtime state** is scoped — the static map (`public/map/*.json`: node layout, tablets,
   treasure spots, zones, arena) is **shared by every World**, overlaid client-side exactly as before
   (migration `0010`).
2. **A World is its own save.** `players` is keyed `(world_id, name)`, so the same person is an
   independent Player — separate inventory, journey, position, PIN check — in each World they join.
   A World's builds, Seal, Village, and Guardian fight are all its own.
3. **The world-id is a slug typed on the join screen.** A third **World** field sits beside name + PIN
   (`normalizeWorldId` in `src/world.ts` folds free text into a URL/channel-safe slug). An unknown
   slug is **created on first join** (`jw_join` upserts the `world` row from column defaults — gate
   closed, Seal intact, no Village/fight); a known slug is joined. The slug mirrors into `?world=<id>`
   so a refresh or shared link rejoins the same World. The original shared World is **`default`** — a
   blank field, no `?world=`, or the literal `default` all resolve to it, so every existing link and
   the live world keep working.
4. **Every gameplay RPC gains a `p_world` first argument**; the client injects it centrally in
   `SupabaseBackend.rpc`, so no call site threads it. The pure/immutable helpers (`jw_num`, `jw_add`,
   `jw_apply`, `jw_afford`, `jw_reconcile_fight`, `jw_sawmill_state`, `jw_village_recompute`) touch no
   tables and are untouched. The Realtime channel becomes `jw-world-<id>`, which isolates presence,
   the position stream, the chat relay, **and** the Delve/Wildlife peer-host traffic (ADR-0007/0012)
   per World for free — and puts fewer Players on each channel, easing the presence rate limit.
5. **A World is an ISOLATION boundary, not a SECURITY one.** ADR-0005's no-security posture is
   unchanged: anyone who knows a slug can join that World (the anon client still calls every
   `SECURITY DEFINER jw_*`; RLS stays off). Worlds separate *groups*, they do not *protect* one from
   another. Fine for a trusted friend group behind an invite link; do not treat a slug as a secret.
6. **MockBackend is multi-World too.** The single-player local backend namespaces its localStorage by
   `world_id` (the default World keeps the original key), so the World field is exercisable end-to-end
   in `npm run dev` without a database.

## Considered Options

- **One Supabase project per World.** Zero code change (each World is a separate deploy + env), and it
  is a true security boundary. Rejected as the primary model: N projects/migrations/URLs to operate,
  and the designer explicitly wanted "one database". Still available for anyone who needs hard
  isolation — this ADR does not preclude it.
- **A shared player identity across Worlds** (one identity, per-World state). Rejected: inventory /
  journey / position are inherently per-World, so it would mean splitting the players table for no
  benefit at ~8 friends. Separate-save-per-World is simpler and matches how the game already reads.
- **A fixed allowlist of Worlds** (unknown slugs rejected). Rejected in favour of implicit
  creation-on-join, matching the "goals stay implicit / no admin UI" ethos (ADR-0010); the deliberate
  join-screen field (vs. a typo-prone URL flag) already makes World choice intentional.

## Consequences

- **The live database migration recuts primary keys** (`0010`): existing rows backfill to
  `world_id = 'default'` and the singleton `world` row (id 1) becomes the `default` World, so the live
  shared world — all its players, ~100 builds, nodes, Seal, Village, fight — carries over unchanged.
  This is the one irreversible step and is applied only when explicitly promoted (deferred from local
  testing).
- **ADR-0001 (Supabase is the whole backend) still holds** — no game server appears; Worlds are rows,
  not processes. **ADR-0002's determinism is per-World** — each World's fight is still a pure function
  of its own `engagedAt`.
- **The graceful-degradation fallbacks** in `placeStructure`/`dismantle`/`openDelve`/`claimDelveLoot`
  (which retried pre-migration signatures) are now dead once `0010` is deployed, but stay harmless.
- **Glossary:** CONTEXT.md's **World** entry is updated — "World" is now one-of-many isolated
  instances sharing the static map, scoped by a world-id.
