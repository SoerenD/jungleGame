# SupabaseBackend — the real backend, client-authoritative with atomic RPCs

ADR-0001 committed the game to Supabase as its entire backend but left `MockBackend`
(localStorage, single-browser) as the only implementation. This ADR records the actual
`SupabaseBackend` that makes the World shared and persistent for the friend group, and the
one deliberate simplification it makes.

The backend maps the `Backend` interface (`src/backend/types.ts`) onto Supabase as follows:

- **Persistent state** — Postgres tables (`players`, `nodes`, `structures`, `crates`,
  `sawmills`, `chat`, and a single-row `world`). Only *touched* Nodes are stored; the client
  overlays them on `world-data.json` and computes lazy regrow, exactly as the Mock did.
- **Mutations** — a set of `SECURITY DEFINER` `jw_*` Postgres functions (see
  `supabase/migrations/0001_jungle_world.sql`), each doing an atomic read-modify-write. This is
  what ADR-0001 called for: the finishing hit gets the yield, first placement on a tile wins
  (a `unique (tx, ty)` constraint), Seal counters/crates/Sawmills/Guardian HP never race.
- **Realtime** — one Supabase channel: **presence** for the live roster (join/leave), and
  **broadcast** for the position stream and every game event. The acting client emits an event
  locally (mirroring `MockBackend`) *and* broadcasts it; peers emit on receipt. So GameScene
  and the HUD are unchanged — they cannot tell which backend is running. Late joiners get the
  truth from `loadWorld`.

## Considered Options

- **Thin client, thick RPCs (full ADR-0001 letter)** — reimplement every rule, *including the
  Guardian schedule* (`guardian.ts`: Eye Windows, danger tiles, fury phases), in PL/pgSQL.
  Rejected: it duplicates authored, deterministic TypeScript in SQL where it would silently
  drift, for no benefit to a trusted group.
- **Single world-document + optimistic concurrency** — store the whole world as one JSON row.
  Rejected: harvest fires every ~300 ms per player; 8 players serializing on one row's version
  would thrash. Per-entity RPCs keep contention local.
- **Chosen: client-authoritative adjudication + atomic RPCs.** The client computes yields,
  damage, and the deterministic Guardian adjudication (is the Eye open? is this tile
  dangerous?) and passes the result to the RPC, which enforces only the atomic invariant
  (decrement HP, credit the one finisher, record participation). Keeps all game logic in one
  place (TypeScript) and the database small and fast.

## Consequences

- **No security.** RLS is disabled; the anon key can read every table and call every `jw_*`
  function, and the client is trusted for adjudication. This is acceptable *only* for the
  invite-only friend group ADR-0001 assumed, and it is the explicit reason the Supabase
  security advisor reports `rls_disabled_in_public` (7×) and
  `anon_security_definer_function_executable`. Opening this World to untrusted players requires
  auth + RLS + moving adjudication server-side first.
- The backend is selected by env at runtime (`createBackend.ts`): `VITE_SUPABASE_URL` +
  `VITE_SUPABASE_ANON_KEY` present → `SupabaseBackend`, else `MockBackend`. `npm run dev` with
  no `.env` still works single-player.
- Participation loot for the *non-killing* Guardian participants lands in the DB immediately but
  only reflects in their HUD on their next inventory-returning action or reload (there is no
  inventory-push event in the `Backend` interface). Acceptable for a rare, self-healing case.
- Positions never touch Postgres — they stream over broadcast — so there is no server-side
  anti-cheat on movement, consistent with ADR-0001.
