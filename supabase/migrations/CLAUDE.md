# supabase/migrations/

Ordered SQL migrations (`NNNN_name.sql`) defining the live Postgres schema and the RPCs that
`SupabaseBackend` calls. Applied in filename order; append-only, never edit a deployed file.

- Client is authoritative, server resolves conflicts (ADR-0005); time-based mechanics compute
  lazily from timestamps (ADR-0001) — no cron, no game loop in the DB.
- Live-deploy state is NOT tracked here — verify against the actual project before applying.
  Live RPCs require a `p_world` arg (multi-world, ADR-0014).
