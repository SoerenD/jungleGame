-- 0012 — the generic Refiner kernel (ADR-0017 §6): ONE table + three RPCs that
-- run ANY "deposit raw, collect refined over real time" Structure.
--
-- The Sawmill proved the shape (lazy timestamps, no tick — ADR-0001) but is
-- hardcoded wood→planks in TS and SQL. Each Warden Realm adds a Refiner (Brine
-- Kiln, Chime Kiln, Husking Mill), so the kernel is generalized ONCE, in the
-- established "client passes the tuning, SQL is the generic executor" pattern
-- (jw_contribute_village precedent): every call carries the input/output item
-- ids, the ms-per-unit and the cap; the row stores only what tuning can't
-- recompute (input_count, since). The live Sawmill table/RPCs stay UNTOUCHED —
-- it keeps its legacy path; only new Refiners ride this kernel.
--
-- Trusted-friends posture (ADR-0005, no auth) — but the item parameters are
-- still guarded against nonsense so a buggy client can't write junk item keys
-- into inventories or divide by a zero-ms tuning.
--
-- Deploy order: this migration ships BEFORE any client that calls jw_refiner_*
-- (the live DB rejects unknown RPC shapes). Deployment is a separate step —
-- writing this file does not touch the live DB.

-- ============================================================ 1. the refiner rows
-- One row per Refiner Structure, keyed by structure id alone (no type column:
-- the kernel is type-blind, the client decides which Structures are Refiners).
create table if not exists public.refiners (
  world_id     text   not null default 'default',
  structure_id text   not null,
  -- raw units still refining; finished output is DERIVED from `since`, never stored
  input_count  int    not null default 0,
  since        bigint not null default 0,
  primary key (world_id, structure_id)
);

-- ============================================================ 2. pure helpers (no tables touched)
-- jw_sawmill_state generalized: derive {input, ready, nextMs} from timestamps
create or replace function public.jw_refiner_state(p_input int, p_since bigint, p_now bigint, p_ms bigint)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'input', p_input - (case when p_input > 0 then least(p_input, floor((p_now - p_since)::numeric / p_ms)::int) else 0 end),
    'ready', (case when p_input > 0 then least(p_input, floor((p_now - p_since)::numeric / p_ms)::int) else 0 end),
    'nextMs', case when (p_input - (case when p_input > 0 then least(p_input, floor((p_now - p_since)::numeric / p_ms)::int) else 0 end)) > 0
                   then p_ms - ((p_now - p_since) % p_ms) else null end);
$$;

-- the nonsense guard: item ids must look like item ids (lowercase snake, the
-- shape of every ItemId), differ from each other, and the tuning must be sane
create or replace function public.jw_refiner_config_ok(p_input_item text, p_output_item text, p_ms bigint, p_cap int)
returns boolean language sql immutable set search_path = public as $$
  select p_input_item ~ '^[a-z][a-z0-9_]{0,31}$'
     and p_output_item ~ '^[a-z][a-z0-9_]{0,31}$'
     and p_input_item <> p_output_item
     and p_ms >= 1000 and p_cap between 1 and 999;
$$;

-- ============================================================ 3. the three RPCs
-- open just reads state (materialising the row like jw_sawmill_open does)
create or replace function public.jw_refiner_open(
  p_world text, p_id text, p_who text, p_input_item text, p_output_item text, p_ms bigint, p_cap int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; v_input int; v_since bigint; v_inv jsonb;
begin
  if not public.jw_refiner_config_ok(p_input_item, p_output_item, p_ms, p_cap) then return jsonb_build_object('ok', false, 'reason', 'BAD_CONFIG'); end if;
  if not exists (select 1 from public.structures where world_id = p_world and id = p_id) then return jsonb_build_object('ok', false, 'reason', 'NO_REFINER'); end if;
  insert into public.refiners(world_id, structure_id) values (p_world, p_id) on conflict (world_id, structure_id) do nothing;
  select input_count, since into v_input, v_since from public.refiners where world_id = p_world and structure_id = p_id;
  select inventory into v_inv from public.players where world_id = p_world and name = p_who;
  return jsonb_build_object('ok', true, 'state', public.jw_refiner_state(v_input, v_since, v_now, p_ms), 'inventory', coalesce(v_inv, '{}'::jsonb));
end;
$$;

create or replace function public.jw_refiner_deposit(
  p_world text, p_id text, p_who text, p_input_item text, p_output_item text, p_ms bigint, p_cap int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; v_input int; v_since bigint; v_inv jsonb; v_give int;
begin
  if not public.jw_refiner_config_ok(p_input_item, p_output_item, p_ms, p_cap) then return jsonb_build_object('ok', false, 'reason', 'BAD_CONFIG'); end if;
  if not exists (select 1 from public.structures where world_id = p_world and id = p_id) then return jsonb_build_object('ok', false, 'reason', 'NO_REFINER'); end if;
  insert into public.refiners(world_id, structure_id) values (p_world, p_id) on conflict (world_id, structure_id) do nothing;
  select input_count, since into v_input, v_since from public.refiners where world_id = p_world and structure_id = p_id for update;
  select inventory into v_inv from public.players where world_id = p_world and name = p_who for update;
  v_give := least(public.jw_num(v_inv, p_input_item), p_cap - v_input);
  if v_give <= 0 then return jsonb_build_object('ok', false, 'reason', 'NOTHING'); end if;
  if v_input = 0 then v_since := v_now; end if;  -- work starts on the first deposit
  v_inv := public.jw_add(v_inv, p_input_item, -v_give);
  v_input := v_input + v_give;
  update public.players set inventory = v_inv, updated_at = now() where world_id = p_world and name = p_who;
  update public.refiners set input_count = v_input, since = v_since where world_id = p_world and structure_id = p_id;
  return jsonb_build_object('ok', true, 'state', public.jw_refiner_state(v_input, v_since, v_now, p_ms), 'inventory', v_inv);
end;
$$;

create or replace function public.jw_refiner_collect(
  p_world text, p_id text, p_who text, p_input_item text, p_output_item text, p_ms bigint, p_cap int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; v_input int; v_since bigint; v_inv jsonb; v_done int;
begin
  if not public.jw_refiner_config_ok(p_input_item, p_output_item, p_ms, p_cap) then return jsonb_build_object('ok', false, 'reason', 'BAD_CONFIG'); end if;
  if not exists (select 1 from public.structures where world_id = p_world and id = p_id) then return jsonb_build_object('ok', false, 'reason', 'NO_REFINER'); end if;
  insert into public.refiners(world_id, structure_id) values (p_world, p_id) on conflict (world_id, structure_id) do nothing;
  select input_count, since into v_input, v_since from public.refiners where world_id = p_world and structure_id = p_id for update;
  v_done := case when v_input > 0 then least(v_input, floor((v_now - v_since)::numeric / p_ms)::int) else 0 end;
  if v_done <= 0 then return jsonb_build_object('ok', false, 'reason', 'NOTHING'); end if;
  v_input := v_input - v_done;
  v_since := v_since + v_done * p_ms;  -- keep the partial progress of the next unit
  select public.jw_add(inventory, p_output_item, v_done) into v_inv from public.players where world_id = p_world and name = p_who for update;
  update public.players set inventory = v_inv, updated_at = now() where world_id = p_world and name = p_who;
  update public.refiners set input_count = v_input, since = v_since where world_id = p_world and structure_id = p_id;
  return jsonb_build_object('ok', true, 'state', public.jw_refiner_state(v_input, v_since, v_now, p_ms), 'inventory', v_inv);
end;
$$;

-- ============================================================ 4. dismantle cleans the row
-- The 0010 body verbatim + ONE line: any Refiner's queue dies with its
-- Structure (type-blind, keyed by structure id — like crates/sawmills, but
-- one delete covers every present and future Refiner type).
create or replace function public.jw_dismantle_structure(p_world text, p_who text, p_id text, p_refund jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv jsonb; v_type text; v_tx int; v_ty int;
begin
  select type, tx, ty into v_type, v_tx, v_ty from public.structures where world_id = p_world and id = p_id for update;
  if v_type is null then return jsonb_build_object('ok', false, 'reason', 'NO_STRUCTURE'); end if;
  delete from public.structures where world_id = p_world and id = p_id;      -- cascades structure_tiles
  delete from public.crates where world_id = p_world and structure_id = p_id;
  delete from public.sawmills where world_id = p_world and structure_id = p_id;
  delete from public.refiners where world_id = p_world and structure_id = p_id;
  if v_type = 'hammock' then
    update public.players set wake_point = null
      where world_id = p_world and wake_point is not null
        and (wake_point->>'tx')::int = v_tx and (wake_point->>'ty')::int = v_ty;
  end if;
  if v_type = 'village_hall' then
    update public.world set village = jsonb_set(village, '{hall}', 'null'::jsonb, true)
      where id = p_world
        and jsonb_typeof(village->'hall') = 'object'
        and (village->'hall'->>'tx')::int = v_tx and (village->'hall'->>'ty')::int = v_ty;
  end if;
  select inventory into v_inv from public.players where world_id = p_world and name = p_who for update;
  if v_inv is null then v_inv := '{}'::jsonb; end if;
  v_inv := public.jw_apply(v_inv, coalesce(p_refund, '{}'::jsonb));
  update public.players set inventory = v_inv, updated_at = now() where world_id = p_world and name = p_who;
  return jsonb_build_object('ok', true, 'removed', p_id, 'inventory', v_inv,
    'village', (select village from public.world where id = p_world));
end;
$$;
