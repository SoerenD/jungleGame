# src/backend/

The Backend abstraction — the single interface through which ALL game state flows (join, world
snapshot, every mutation as an RPC-shaped method, broadcast/presence). Scenes and UI talk only to
this interface so either implementation can be swapped in (ADR-0001).

- `types.ts` — source of truth: the `Backend` interface + every state/result shape.
- `createBackend.ts` — env factory: `VITE_SUPABASE_*` set → `SupabaseBackend` (shared world),
  else `MockBackend` (localStorage, single-player).
- **Parity rule:** any method added to `Backend` must be implemented in BOTH `MockBackend.ts` and
  `SupabaseBackend.ts`; game code must never import an implementation directly.
- `SupabaseBackend` calls Postgres `jw_*` RPCs (each injects `p_world`, ADR-0014) + Realtime;
  server order resolves conflicts; time-based mechanics derive lazily from timestamps (ADR-0001).
