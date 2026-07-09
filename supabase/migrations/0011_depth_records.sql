-- 0011 — Depth Records (ADR-0015): the endless Delve's per-World record keeping.
--
-- The Delve's Stage chain no longer ends at the Forgeborn: every Stage-boss fall
-- is a cleared DEPTH, and the World remembers it. Two append/upsert-only tables
-- (never pruned — the client displays a top slice), both scoped per World like
-- everything since 0010:
--   * depth_records — one row per DESCENT (keyed by the Stage-1 runId carried
--     through the chain): its deepest cleared Depth, the roster that cleared
--     that Depth (the participation-loot set), and when.
--   * depth_bests   — one row per Player: their personal best (the deepest
--     Stage they helped clear), and when they set it.
--
-- The write RIDES THE EXISTING per-Stage participation-loot RPC (ADR-0015 §5):
-- jw_claim_delve_loot gains three optional record parameters. No second
-- bookkeeping, no new write path — "present without hitting earns nothing"
-- extends to the ranking because only participation-loot claimants call it.
-- Client-authoritative like everything else (ADR-0005, trusted friends).
--
-- Deploy order matters (first schema change since 0010): this migration ships
-- BEFORE the client that writes records — the live DB rejects unknown RPC shapes.

-- ============================================================ 1. the record tables
create table if not exists public.depth_records (
  world_id    text        not null default 'default',
  descent_id  text        not null,
  depth       int         not null,
  roster      jsonb       not null default '[]'::jsonb,
  achieved_at timestamptz not null default now(),
  primary key (world_id, descent_id)
);

create index if not exists depth_records_world_depth_idx
  on public.depth_records (world_id, depth desc, achieved_at asc);

create table if not exists public.depth_bests (
  world_id    text        not null default 'default',
  name        text        not null,
  depth       int         not null,
  achieved_at timestamptz not null default now(),
  primary key (world_id, name)
);

create index if not exists depth_bests_world_depth_idx
  on public.depth_bests (world_id, depth desc, achieved_at asc);

-- ============================================================ 2. widen the loot RPC
-- Drop the old 3-arg signature first: the new one has defaulted extra params, so
-- create-or-replace would otherwise leave an ambiguous overload alongside it.
drop function if exists public.jw_claim_delve_loot(text, text, jsonb);

-- Merge a loot delta into the caller's own inventory (unchanged, ADR-0007 §8)
-- and — when the record params ride along — upsert the Descent's board row and
-- the caller's personal best in the same call (ADR-0015 §5). Both upserts only
-- ever RAISE a depth (append/upsert-only, never pruned); the descent row's
-- roster is replaced by the roster that cleared the new deepest Stage.
create or replace function public.jw_claim_delve_loot(
  p_world text, p_who text, p_loot jsonb,
  p_descent text default null, p_depth int default null, p_roster jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv jsonb;
begin
  select inventory into v_inv from public.players where world_id = p_world and name = p_who for update;
  if v_inv is null then return jsonb_build_object('ok', false, 'reason', 'NO_PLAYER'); end if;
  v_inv := public.jw_apply(v_inv, coalesce(p_loot, '{}'::jsonb));
  update public.players set inventory = v_inv, updated_at = now() where world_id = p_world and name = p_who;
  if p_descent is not null and p_depth is not null then
    insert into public.depth_records (world_id, descent_id, depth, roster)
      values (p_world, p_descent, p_depth, coalesce(p_roster, '[]'::jsonb))
      on conflict (world_id, descent_id) do update
        set depth = excluded.depth, roster = excluded.roster, achieved_at = now()
        where depth_records.depth < excluded.depth;
    insert into public.depth_bests (world_id, name, depth)
      values (p_world, p_who, p_depth)
      on conflict (world_id, name) do update
        set depth = excluded.depth, achieved_at = now()
        where depth_bests.depth < excluded.depth;
  end if;
  return jsonb_build_object('ok', true, 'inventory', v_inv);
end;
$$;
