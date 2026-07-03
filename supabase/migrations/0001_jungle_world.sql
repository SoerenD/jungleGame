-- Jungle World — complete Supabase backend schema (ADR-0001, ADR-0005).
-- This is the source of truth for the `irjxvtgrzkmvjomozyiv` project; it was
-- applied via the Supabase MCP as migrations jw_schema / jw_rpc_core /
-- jw_rpc_crate_sawmill / jw_rpc_guardian / jw_send_chat. Re-run it verbatim to
-- rebuild the database from scratch (all statements are idempotent).
--
-- NO-SECURITY MODEL (trusted friend group, ADR-0005): RLS is intentionally
-- left disabled; anon reads tables directly and every mutation goes through the
-- SECURITY DEFINER jw_* functions. Do NOT expose this project publicly to
-- untrusted users without adding RLS + auth.

-- ============================================================ tables
create table if not exists public.players (
  name        text primary key,
  pin         text not null,
  appearance  jsonb not null,
  x           double precision not null,
  y           double precision not null,
  inventory   jsonb not null default '{}'::jsonb,
  tablets     jsonb not null default '[]'::jsonb,
  intro_seen  boolean not null default false,
  journey     jsonb not null default '{"steps":{},"hintUses":{}}'::jsonb,
  wake_point  jsonb,
  explored    jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

-- only *touched* nodes live here; a pristine node is implicit (client overlays
-- world-data.json). Lazy regrow is computed in jw_hit_node from harvested_at.
create table if not exists public.nodes (
  id           text primary key,
  type         text not null,
  tx           int not null,
  ty           int not null,
  hp           int not null,
  harvested_at bigint
);

create table if not exists public.structures (
  id         text primary key,
  type       text not null,
  tx         int not null,
  ty         int not null,
  placed_by  text not null,
  placed_at  bigint not null,
  text       text,
  unique (tx, ty)               -- first placement on a tile wins
);

create table if not exists public.crates (
  structure_id text primary key,
  contents     jsonb not null default '{}'::jsonb
);

create table if not exists public.sawmills (
  structure_id text primary key,
  wood         int not null default 0,
  since        bigint not null default 0
);

create table if not exists public.chat (
  id        bigint generated always as identity primary key,
  from_name text not null,
  text      text not null,
  ts        bigint not null
);
create index if not exists chat_ts_idx on public.chat (ts);

create table if not exists public.world (
  id             int primary key default 1 check (id = 1),
  gate_open      boolean not null default false,
  treasure_index int not null default 0,
  seal           jsonb not null default '{"broken":false,"contributed":{"wood":0,"stone":0,"fiber":0,"fruit":0}}'::jsonb,
  fight          jsonb
);
insert into public.world (id) values (1) on conflict (id) do nothing;

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;

-- ============================================================ inventory helpers
create or replace function public.jw_num(inv jsonb, k text)
returns int language sql immutable set search_path = public as $$
  select coalesce((inv->>k)::int, 0);
$$;

create or replace function public.jw_add(inv jsonb, k text, d int)
returns jsonb language sql immutable set search_path = public as $$
  select case
    when coalesce((inv->>k)::int, 0) + d <= 0 then inv - k
    else jsonb_set(coalesce(inv, '{}'::jsonb), array[k], to_jsonb(coalesce((inv->>k)::int, 0) + d))
  end;
$$;

create or replace function public.jw_apply(inv jsonb, deltas jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare k text; v int; acc jsonb := coalesce(inv, '{}'::jsonb);
begin
  for k, v in select key, value::int from jsonb_each_text(deltas) loop
    acc := public.jw_add(acc, k, v);
  end loop;
  return acc;
end;
$$;

create or replace function public.jw_afford(inv jsonb, cost jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare k text; v int;
begin
  for k, v in select key, value::int from jsonb_each_text(cost) loop
    if public.jw_num(inv, k) < v then return false; end if;
  end loop;
  return true;
end;
$$;

-- ============================================================ join
create or replace function public.jw_join(p_name text, p_pin text, p_appearance jsonb, p_spawn_x double precision, p_spawn_y double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rec public.players; v_new boolean := false; v_seal jsonb;
begin
  select * into rec from public.players where name = p_name;
  if found then
    if rec.pin <> p_pin then return jsonb_build_object('ok', false, 'reason', 'WRONG_PIN'); end if;
    update public.players set appearance = p_appearance, updated_at = now() where name = p_name;
  else
    v_new := true;
    insert into public.players(name, pin, appearance, x, y) values (p_name, p_pin, p_appearance, p_spawn_x, p_spawn_y);
  end if;
  select seal into v_seal from public.world where id = 1;
  if coalesce((v_seal->>'broken')::boolean, false) then
    update public.players
      set journey = jsonb_set(jsonb_set(journey, '{steps,visit_seal}', 'true'::jsonb, true), '{steps,first_offering}', 'true'::jsonb, true)
      where name = p_name;
  end if;
  select * into rec from public.players where name = p_name;
  return jsonb_build_object('ok', true, 'isNew', v_new, 'name', rec.name, 'appearance', rec.appearance,
    'x', rec.x, 'y', rec.y, 'inventory', rec.inventory, 'introSeen', rec.intro_seen,
    'journey', rec.journey, 'explored', rec.explored, 'wakePoint', rec.wake_point, 'tablets', rec.tablets);
end;
$$;

-- ============================================================ harvest
create or replace function public.jw_hit_node(
  p_id text, p_type text, p_tx int, p_ty int, p_max_hp int, p_regrow_ms bigint,
  p_dmg int, p_yield jsonb, p_map_piece boolean, p_who text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
        v_hp int; v_harv bigint; v_new_hp int; v_finishing boolean; v_gained jsonb; v_inv jsonb; v_node jsonb;
begin
  insert into public.nodes(id, type, tx, ty, hp, harvested_at) values (p_id, p_type, p_tx, p_ty, p_max_hp, null)
    on conflict (id) do nothing;
  select hp, harvested_at into v_hp, v_harv from public.nodes where id = p_id for update;
  if v_harv is not null and v_now >= v_harv + p_regrow_ms then v_hp := p_max_hp; v_harv := null; end if;
  if v_hp <= 0 then return jsonb_build_object('ok', false, 'reason', 'DEPLETED'); end if;
  v_new_hp := greatest(0, v_hp - p_dmg);
  v_finishing := v_new_hp = 0;
  update public.nodes set hp = v_new_hp, harvested_at = case when v_finishing then v_now else null end where id = p_id;
  v_gained := null; v_inv := null;
  if v_finishing then
    v_gained := coalesce(p_yield, '{}'::jsonb);
    if p_map_piece then v_gained := public.jw_add(v_gained, 'map_piece', 1); end if;
    update public.players set inventory = public.jw_apply(inventory, v_gained), updated_at = now()
      where name = p_who returning inventory into v_inv;
  end if;
  v_node := jsonb_build_object('id', p_id, 'type', p_type, 'tx', p_tx, 'ty', p_ty, 'hp', v_new_hp,
    'harvestedAt', case when v_finishing then v_now else null end);
  return jsonb_build_object('ok', true, 'node', v_node, 'finishing', v_finishing, 'gained', v_gained, 'inventory', v_inv);
end;
$$;

-- ============================================================ craft
create or replace function public.jw_craft(p_who text, p_cost jsonb, p_output text, p_count int, p_requires_tool text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv jsonb; k text; v int;
begin
  select inventory into v_inv from public.players where name = p_who for update;
  if v_inv is null then return jsonb_build_object('ok', false, 'reason', 'UNKNOWN_RECIPE'); end if;
  if p_requires_tool is not null and p_requires_tool <> '' and public.jw_num(v_inv, p_requires_tool) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'TOOL_REQUIRED');
  end if;
  if not public.jw_afford(v_inv, p_cost) then return jsonb_build_object('ok', false, 'reason', 'INSUFFICIENT'); end if;
  for k, v in select key, value::int from jsonb_each_text(p_cost) loop v_inv := public.jw_add(v_inv, k, -v); end loop;
  v_inv := public.jw_add(v_inv, p_output, p_count);
  update public.players set inventory = v_inv, updated_at = now() where name = p_who;
  return jsonb_build_object('ok', true, 'crafted', p_output, 'inventory', v_inv);
end;
$$;

-- ============================================================ place structure
create or replace function public.jw_place_structure(p_who text, p_item text, p_tx int, p_ty int, p_text text, p_id text, p_is_hammock boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; v_inv jsonb; v_struct jsonb;
begin
  select inventory into v_inv from public.players where name = p_who for update;
  if v_inv is null or public.jw_num(v_inv, p_item) <= 0 then return jsonb_build_object('ok', false, 'reason', 'NOT_IN_INVENTORY'); end if;
  begin
    insert into public.structures(id, type, tx, ty, placed_by, placed_at, text) values (p_id, p_item, p_tx, p_ty, p_who, v_now, p_text);
  exception when unique_violation then return jsonb_build_object('ok', false, 'reason', 'OCCUPIED'); end;
  v_inv := public.jw_add(v_inv, p_item, -1);
  update public.players set inventory = v_inv,
    wake_point = case when p_is_hammock then jsonb_build_object('tx', p_tx, 'ty', p_ty) else wake_point end,
    updated_at = now() where name = p_who;
  v_struct := jsonb_build_object('id', p_id, 'type', p_item, 'tx', p_tx, 'ty', p_ty, 'placedBy', p_who, 'placedAt', v_now)
    || case when p_text is not null then jsonb_build_object('text', p_text) else '{}'::jsonb end;
  return jsonb_build_object('ok', true, 'structure', v_struct, 'inventory', v_inv);
end;
$$;

-- ============================================================ Seal
create or replace function public.jw_contribute_seal(p_who text, p_quotas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv jsonb; v_seal jsonb; v_contrib jsonb; v_taken jsonb := '{}'::jsonb;
        res text; v_need int; v_give int; v_have int; v_all boolean := true;
        v_before numeric := 0; v_after numeric := 0; v_total numeric := 0; v_broken boolean;
begin
  select inventory into v_inv from public.players where name = p_who for update;
  select seal into v_seal from public.world where id = 1 for update;
  if v_inv is null then return jsonb_build_object('ok', false, 'reason', 'NOTHING_TO_GIVE'); end if;
  if coalesce((v_seal->>'broken')::boolean, false) then return jsonb_build_object('ok', false, 'reason', 'ALREADY_BROKEN'); end if;
  v_contrib := v_seal->'contributed';
  foreach res in array array['wood','stone','fiber','fruit'] loop
    v_before := v_before + least(public.jw_num(v_contrib, res), public.jw_num(p_quotas, res));
    v_total := v_total + public.jw_num(p_quotas, res);
  end loop;
  foreach res in array array['wood','stone','fiber','fruit'] loop
    v_need := greatest(0, public.jw_num(p_quotas, res) - public.jw_num(v_contrib, res));
    v_have := public.jw_num(v_inv, res);
    v_give := least(v_have, v_need);
    if v_give > 0 then
      v_inv := public.jw_add(v_inv, res, -v_give);
      v_contrib := public.jw_add(v_contrib, res, v_give);
      v_taken := public.jw_add(v_taken, res, v_give);
    end if;
  end loop;
  if v_taken = '{}'::jsonb then return jsonb_build_object('ok', false, 'reason', 'NOTHING_TO_GIVE'); end if;
  foreach res in array array['wood','stone','fiber','fruit'] loop
    v_after := v_after + least(public.jw_num(v_contrib, res), public.jw_num(p_quotas, res));
    if public.jw_num(v_contrib, res) < public.jw_num(p_quotas, res) then v_all := false; end if;
  end loop;
  v_broken := v_all;
  v_seal := jsonb_set(jsonb_set(v_seal, '{contributed}', v_contrib), '{broken}', to_jsonb(v_broken));
  update public.players set inventory = v_inv, updated_at = now() where name = p_who;
  update public.world set seal = v_seal where id = 1;
  return jsonb_build_object('ok', true, 'taken', v_taken, 'inventory', v_inv,
    'seal', jsonb_build_object('broken', v_broken, 'contributed', v_contrib, 'quotas', p_quotas),
    'beforePct', (v_before / v_total) * 100, 'afterPct', (v_after / v_total) * 100, 'broken', v_broken);
end;
$$;

-- ============================================================ altar / dig / tablets / cook / eat / onboarding
create or replace function public.jw_offer_altar(p_who text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv jsonb; v_gate boolean;
begin
  select gate_open into v_gate from public.world where id = 1 for update;
  if v_gate then return jsonb_build_object('ok', false, 'reason', 'ALREADY_OPEN'); end if;
  select inventory into v_inv from public.players where name = p_who for update;
  if v_inv is null or public.jw_num(v_inv, 'fruit') < 2 or public.jw_num(v_inv, 'fiber') < 2 then
    return jsonb_build_object('ok', false, 'reason', 'INSUFFICIENT');
  end if;
  v_inv := public.jw_add(public.jw_add(v_inv, 'fruit', -2), 'fiber', -2);
  update public.players set inventory = v_inv, updated_at = now() where name = p_who;
  update public.world set gate_open = true where id = 1;
  return jsonb_build_object('ok', true, 'inventory', v_inv);
end;
$$;

create or replace function public.jw_dig(p_who text, p_ptx int, p_pty int, p_spots jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv jsonb; v_idx int; v_n int; v_spot jsonb; v_loot jsonb;
begin
  select inventory into v_inv from public.players where name = p_who for update;
  if v_inv is null or public.jw_num(v_inv, 'map_piece') < 3 then return jsonb_build_object('ok', false, 'reason', 'NO_MAP'); end if;
  select treasure_index into v_idx from public.world where id = 1 for update;
  v_n := jsonb_array_length(p_spots);
  v_spot := p_spots->v_idx;
  if abs(p_ptx - (v_spot->>'tx')::int) > 1 or abs(p_pty - (v_spot->>'ty')::int) > 1 then
    return jsonb_build_object('ok', false, 'reason', 'NOT_HERE');
  end if;
  v_loot := jsonb_build_object('wood', 10, 'stone', 8, 'fruit', 6, 'fiber', 6, 'golden_idol', 1);
  v_inv := public.jw_apply(public.jw_add(v_inv, 'map_piece', -3), v_loot);
  update public.players set inventory = v_inv, updated_at = now() where name = p_who;
  update public.world set treasure_index = (v_idx + 1 + floor(random() * (v_n - 1))::int) % v_n where id = 1;
  return jsonb_build_object('ok', true, 'loot', v_loot, 'inventory', v_inv);
end;
$$;

create or replace function public.jw_read_tablet(p_who text, p_id text, p_total int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tablets jsonb; v_all boolean;
begin
  select tablets into v_tablets from public.players where name = p_who for update;
  if v_tablets is null then return jsonb_build_object('tablets', '[]'::jsonb, 'allRead', false); end if;
  if not (v_tablets @> jsonb_build_array(p_id)) then
    v_tablets := v_tablets || jsonb_build_array(p_id);
    update public.players set tablets = v_tablets, updated_at = now() where name = p_who;
  end if;
  v_all := jsonb_array_length(v_tablets) >= p_total;
  return jsonb_build_object('tablets', v_tablets, 'allRead', v_all);
end;
$$;

create or replace function public.jw_cook(p_who text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv jsonb;
begin
  select inventory into v_inv from public.players where name = p_who for update;
  if v_inv is null or public.jw_num(v_inv, 'fish') < 1 then return jsonb_build_object('ok', false, 'reason', 'NO_FISH'); end if;
  v_inv := public.jw_add(public.jw_add(v_inv, 'fish', -1), 'cooked_fish', 1);
  update public.players set inventory = v_inv, updated_at = now() where name = p_who;
  return jsonb_build_object('ok', true, 'inventory', v_inv);
end;
$$;

create or replace function public.jw_eat(p_who text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv jsonb;
begin
  select inventory into v_inv from public.players where name = p_who for update;
  if v_inv is null or public.jw_num(v_inv, 'cooked_fish') < 1 then return jsonb_build_object('ok', false, 'reason', 'NOTHING_TO_EAT'); end if;
  v_inv := public.jw_add(v_inv, 'cooked_fish', -1);
  update public.players set inventory = v_inv, updated_at = now() where name = p_who;
  return jsonb_build_object('ok', true, 'inventory', v_inv);
end;
$$;

create or replace function public.jw_mark_intro_seen(p_who text)
returns void language sql security definer set search_path = public as $$
  update public.players set intro_seen = true where name = p_who;
$$;

create or replace function public.jw_complete_journey_step(p_who text, p_step text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_j jsonb;
begin
  update public.players set journey = jsonb_set(journey, array['steps', p_step], 'true'::jsonb, true), updated_at = now()
    where name = p_who returning journey into v_j;
  return coalesce(v_j, '{"steps":{},"hintUses":{}}'::jsonb);
end;
$$;

create or replace function public.jw_bump_hint(p_who text, p_hint text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_j jsonb; v_cur int;
begin
  select journey into v_j from public.players where name = p_who for update;
  if v_j is null then return '{"steps":{},"hintUses":{}}'::jsonb; end if;
  v_cur := coalesce((v_j #>> array['hintUses', p_hint])::int, 0);
  v_j := jsonb_set(v_j, array['hintUses', p_hint], to_jsonb(v_cur + 1), true);
  update public.players set journey = v_j, updated_at = now() where name = p_who;
  return v_j;
end;
$$;

create or replace function public.jw_mark_explored(p_who text, p_chunks jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_ex jsonb;
begin
  select explored into v_ex from public.players where name = p_who for update;
  if v_ex is null then return; end if;
  v_ex := (select coalesce(jsonb_agg(distinct e), '[]'::jsonb)
           from (select value as e from jsonb_array_elements(v_ex) union select value from jsonb_array_elements(p_chunks)) u);
  update public.players set explored = v_ex, updated_at = now() where name = p_who;
end;
$$;

-- ============================================================ crates
create or replace function public.jw_crate_open(p_crate_id text, p_who text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_contents jsonb; v_inv jsonb;
begin
  if not exists (select 1 from public.structures where id = p_crate_id and type = 'crate') then
    return jsonb_build_object('ok', false, 'reason', 'NO_CRATE');
  end if;
  insert into public.crates(structure_id) values (p_crate_id) on conflict (structure_id) do nothing;
  select contents into v_contents from public.crates where structure_id = p_crate_id;
  select inventory into v_inv from public.players where name = p_who;
  return jsonb_build_object('ok', true, 'contents', coalesce(v_contents, '{}'::jsonb), 'inventory', coalesce(v_inv, '{}'::jsonb));
end;
$$;

create or replace function public.jw_crate_deposit(p_crate_id text, p_item text, p_count int, p_who text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_contents jsonb; v_inv jsonb; v_give int;
begin
  if not exists (select 1 from public.structures where id = p_crate_id and type = 'crate') then return jsonb_build_object('ok', false, 'reason', 'NO_CRATE'); end if;
  insert into public.crates(structure_id) values (p_crate_id) on conflict (structure_id) do nothing;
  select contents into v_contents from public.crates where structure_id = p_crate_id for update;
  select inventory into v_inv from public.players where name = p_who for update;
  v_give := least(greatest(0, p_count), public.jw_num(v_inv, p_item));
  if v_give <= 0 then return jsonb_build_object('ok', false, 'reason', 'NOTHING'); end if;
  v_inv := public.jw_add(v_inv, p_item, -v_give);
  v_contents := public.jw_add(v_contents, p_item, v_give);
  update public.players set inventory = v_inv, updated_at = now() where name = p_who;
  update public.crates set contents = v_contents where structure_id = p_crate_id;
  return jsonb_build_object('ok', true, 'contents', v_contents, 'inventory', v_inv);
end;
$$;

create or replace function public.jw_crate_withdraw(p_crate_id text, p_item text, p_count int, p_who text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_contents jsonb; v_inv jsonb; v_take int;
begin
  if not exists (select 1 from public.structures where id = p_crate_id and type = 'crate') then return jsonb_build_object('ok', false, 'reason', 'NO_CRATE'); end if;
  insert into public.crates(structure_id) values (p_crate_id) on conflict (structure_id) do nothing;
  select contents into v_contents from public.crates where structure_id = p_crate_id for update;
  select inventory into v_inv from public.players where name = p_who for update;
  v_take := least(greatest(0, p_count), public.jw_num(v_contents, p_item));
  if v_take <= 0 then return jsonb_build_object('ok', false, 'reason', 'NOTHING'); end if;
  v_contents := public.jw_add(v_contents, p_item, -v_take);
  v_inv := public.jw_add(v_inv, p_item, v_take);
  update public.players set inventory = v_inv, updated_at = now() where name = p_who;
  update public.crates set contents = v_contents where structure_id = p_crate_id;
  return jsonb_build_object('ok', true, 'contents', v_contents, 'inventory', v_inv);
end;
$$;

-- ============================================================ Sawmill (lazy milling)
create or replace function public.jw_sawmill_state(p_wood int, p_since bigint, p_now bigint, p_plank_ms bigint)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'wood', p_wood - (case when p_wood > 0 then least(p_wood, floor((p_now - p_since)::numeric / p_plank_ms)::int) else 0 end),
    'ready', (case when p_wood > 0 then least(p_wood, floor((p_now - p_since)::numeric / p_plank_ms)::int) else 0 end),
    'nextPlankMs', case when (p_wood - (case when p_wood > 0 then least(p_wood, floor((p_now - p_since)::numeric / p_plank_ms)::int) else 0 end)) > 0
                        then p_plank_ms - ((p_now - p_since) % p_plank_ms) else null end);
$$;

create or replace function public.jw_sawmill_open(p_id text, p_who text, p_plank_ms bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; v_wood int; v_since bigint; v_inv jsonb;
begin
  if not exists (select 1 from public.structures where id = p_id and type = 'sawmill') then return jsonb_build_object('ok', false, 'reason', 'NO_SAWMILL'); end if;
  insert into public.sawmills(structure_id) values (p_id) on conflict (structure_id) do nothing;
  select wood, since into v_wood, v_since from public.sawmills where structure_id = p_id;
  select inventory into v_inv from public.players where name = p_who;
  return jsonb_build_object('ok', true, 'state', public.jw_sawmill_state(v_wood, v_since, v_now, p_plank_ms), 'inventory', coalesce(v_inv, '{}'::jsonb));
end;
$$;

create or replace function public.jw_sawmill_deposit(p_id text, p_who text, p_cap int, p_plank_ms bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; v_wood int; v_since bigint; v_inv jsonb; v_give int;
begin
  if not exists (select 1 from public.structures where id = p_id and type = 'sawmill') then return jsonb_build_object('ok', false, 'reason', 'NO_SAWMILL'); end if;
  insert into public.sawmills(structure_id) values (p_id) on conflict (structure_id) do nothing;
  select wood, since into v_wood, v_since from public.sawmills where structure_id = p_id for update;
  select inventory into v_inv from public.players where name = p_who for update;
  v_give := least(public.jw_num(v_inv, 'wood'), p_cap - v_wood);
  if v_give <= 0 then return jsonb_build_object('ok', false, 'reason', 'NOTHING'); end if;
  if v_wood = 0 then v_since := v_now; end if;
  v_inv := public.jw_add(v_inv, 'wood', -v_give);
  v_wood := v_wood + v_give;
  update public.players set inventory = v_inv, updated_at = now() where name = p_who;
  update public.sawmills set wood = v_wood, since = v_since where structure_id = p_id;
  return jsonb_build_object('ok', true, 'state', public.jw_sawmill_state(v_wood, v_since, v_now, p_plank_ms), 'inventory', v_inv);
end;
$$;

create or replace function public.jw_sawmill_collect(p_id text, p_who text, p_plank_ms bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; v_wood int; v_since bigint; v_inv jsonb; v_done int;
begin
  if not exists (select 1 from public.structures where id = p_id and type = 'sawmill') then return jsonb_build_object('ok', false, 'reason', 'NO_SAWMILL'); end if;
  insert into public.sawmills(structure_id) values (p_id) on conflict (structure_id) do nothing;
  select wood, since into v_wood, v_since from public.sawmills where structure_id = p_id for update;
  v_done := case when v_wood > 0 then least(v_wood, floor((v_now - v_since)::numeric / p_plank_ms)::int) else 0 end;
  if v_done <= 0 then return jsonb_build_object('ok', false, 'reason', 'NOTHING'); end if;
  v_wood := v_wood - v_done;
  v_since := v_since + v_done * p_plank_ms;
  select public.jw_add(inventory, 'plank', v_done) into v_inv from public.players where name = p_who for update;
  update public.players set inventory = v_inv, updated_at = now() where name = p_who;
  update public.sawmills set wood = v_wood, since = v_since where structure_id = p_id;
  return jsonb_build_object('ok', true, 'state', public.jw_sawmill_state(v_wood, v_since, v_now, p_plank_ms), 'inventory', v_inv);
end;
$$;

-- ============================================================ Guardian
create or replace function public.jw_reconcile_fight(f jsonb, v_now bigint, p_awake bigint, p_dormant bigint)
returns jsonb language plpgsql immutable set search_path = public as $$
begin
  if f is null then return null; end if;
  if (f->>'engagedAt') is null then
    if v_now >= (f->>'summonedAt')::bigint + p_dormant then return null; else return f; end if;
  else
    if v_now >= (f->>'engagedAt')::bigint + p_awake and (f->>'hp')::int > 0 then return null; else return f; end if;
  end if;
end;
$$;

create or replace function public.jw_guardian_reconcile(p_awake_ms bigint, p_dormant_ms bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; v_fight jsonb; v_after jsonb; v_reason text;
begin
  select fight into v_fight from public.world where id = 1 for update;
  if v_fight is null then return jsonb_build_object('slumbered', false); end if;
  v_after := public.jw_reconcile_fight(v_fight, v_now, p_awake_ms, p_dormant_ms);
  if v_after is null then
    v_reason := case when (v_fight->>'engagedAt') is null then 'dormant' else 'awake' end;
    update public.world set fight = null where id = 1;
    return jsonb_build_object('slumbered', true, 'reason', v_reason);
  end if;
  return jsonb_build_object('slumbered', false);
end;
$$;

create or replace function public.jw_summon(p_who text, p_awake_ms bigint, p_dormant_ms bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; v_fight jsonb; v_seal jsonb; v_inv jsonb;
begin
  select fight, seal into v_fight, v_seal from public.world where id = 1 for update;
  v_fight := public.jw_reconcile_fight(v_fight, v_now, p_awake_ms, p_dormant_ms);
  if not coalesce((v_seal->>'broken')::boolean, false) then return jsonb_build_object('ok', false, 'reason', 'SEAL_INTACT'); end if;
  if v_fight is not null then return jsonb_build_object('ok', false, 'reason', 'FIGHT_IN_PROGRESS'); end if;
  select inventory into v_inv from public.players where name = p_who for update;
  if v_inv is null or public.jw_num(v_inv, 'summon_totem') < 1 then
    update public.world set fight = null where id = 1;
    return jsonb_build_object('ok', false, 'reason', 'NO_TOTEM');
  end if;
  v_inv := public.jw_add(v_inv, 'summon_totem', -1);
  v_fight := jsonb_build_object('summonedAt', v_now, 'engagedAt', null, 'roster', '[]'::jsonb,
    'hp', 0, 'maxHp', 0, 'participants', '[]'::jsonb, 'knockdowns', '{}'::jsonb, 'lastKnockdownWave', '{}'::jsonb);
  update public.players set inventory = v_inv, updated_at = now() where name = p_who;
  update public.world set fight = v_fight where id = 1;
  return jsonb_build_object('ok', true, 'fight', v_fight - 'knockdowns' - 'lastKnockdownWave', 'inventory', v_inv);
end;
$$;

create or replace function public.jw_guardian_hit(
  p_who text, p_dmg int, p_roster jsonb, p_max_hp int, p_eye_open boolean, p_scale_drop int, p_awake_ms bigint, p_dormant_ms bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
        v_fight jsonb; v_inv jsonb; v_roster jsonb; v_parts jsonb; v_hp int; v_engaged boolean := false;
begin
  select fight into v_fight from public.world where id = 1 for update;
  v_fight := public.jw_reconcile_fight(v_fight, v_now, p_awake_ms, p_dormant_ms);
  if v_fight is null then update public.world set fight = null where id = 1; return jsonb_build_object('ok', false, 'reason', 'NO_FIGHT'); end if;
  select inventory into v_inv from public.players where name = p_who for update;
  if (v_fight->>'engagedAt') is null then
    v_roster := coalesce(p_roster, '[]'::jsonb);
    if not (v_roster @> jsonb_build_array(p_who)) then v_roster := v_roster || jsonb_build_array(p_who); end if;
    v_fight := jsonb_set(v_fight, '{engagedAt}', to_jsonb(v_now));
    v_fight := jsonb_set(v_fight, '{roster}', v_roster);
    v_fight := jsonb_set(v_fight, '{maxHp}', to_jsonb(p_max_hp));
    v_fight := jsonb_set(v_fight, '{hp}', to_jsonb(p_max_hp));
    v_engaged := true;
  else
    if not ((v_fight->'roster') @> jsonb_build_array(p_who)) or not p_eye_open then
      return jsonb_build_object('ok', true, 'hp', (v_fight->>'hp')::int, 'victory', false, 'inventory', coalesce(v_inv, '{}'::jsonb), 'deflected', true);
    end if;
  end if;
  v_hp := greatest(0, (v_fight->>'hp')::int - p_dmg);
  v_fight := jsonb_set(v_fight, '{hp}', to_jsonb(v_hp));
  v_parts := v_fight->'participants';
  if not (v_parts @> jsonb_build_array(p_who)) then v_parts := v_parts || jsonb_build_array(p_who); v_fight := jsonb_set(v_fight, '{participants}', v_parts); end if;
  if v_hp = 0 then
    update public.players set inventory = public.jw_add(inventory, 'guardian_scale', p_scale_drop), updated_at = now()
      where name in (select jsonb_array_elements_text(v_parts));
    update public.world set fight = null where id = 1;
    select inventory into v_inv from public.players where name = p_who;
    return jsonb_build_object('ok', true, 'hp', 0, 'victory', true, 'inventory', v_inv, 'deflected', false, 'engaged', v_engaged, 'participants', v_parts);
  end if;
  update public.world set fight = v_fight where id = 1;
  return jsonb_build_object('ok', true, 'hp', v_hp, 'victory', false, 'inventory', coalesce(v_inv, '{}'::jsonb),
    'deflected', false, 'engaged', v_engaged, 'fight', v_fight - 'knockdowns' - 'lastKnockdownWave');
end;
$$;

create or replace function public.jw_knockdown(
  p_who text, p_wave int, p_exhaustion_n int, p_spawn jsonb, p_tile int, p_awake_ms bigint, p_dormant_ms bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
        v_fight jsonb; v_wake jsonb; v_at_hammock boolean; v_cur int; v_new int; v_exhausted boolean;
begin
  select fight into v_fight from public.world where id = 1 for update;
  v_fight := public.jw_reconcile_fight(v_fight, v_now, p_awake_ms, p_dormant_ms);
  if v_fight is null then update public.world set fight = null where id = 1; return jsonb_build_object('ok', false, 'reason', 'NO_FIGHT'); end if;
  v_cur := coalesce((v_fight #>> array['knockdowns', p_who])::int, 0);
  if (v_fight->>'engagedAt') is null or not ((v_fight->'roster') @> jsonb_build_array(p_who)) or v_cur >= p_exhaustion_n then
    return jsonb_build_object('ok', false, 'reason', 'NOT_IN_DANGER');
  end if;
  select wake_point into v_wake from public.players where name = p_who;
  v_at_hammock := v_wake is not null;
  if v_wake is null then v_wake := p_spawn; end if;
  if coalesce((v_fight #>> array['lastKnockdownWave', p_who])::int, -1) = p_wave then
    return jsonb_build_object('ok', true, 'knockdowns', v_cur, 'exhausted', false, 'wake', v_wake, 'atHammock', v_at_hammock);
  end if;
  v_new := v_cur + 1;
  v_exhausted := v_new >= p_exhaustion_n;
  v_fight := jsonb_set(v_fight, array['lastKnockdownWave', p_who], to_jsonb(p_wave), true);
  v_fight := jsonb_set(v_fight, array['knockdowns', p_who], to_jsonb(v_new), true);
  if v_exhausted then
    update public.players set x = ((v_wake->>'tx')::double precision + 0.5) * p_tile,
                              y = ((v_wake->>'ty')::double precision + 0.5) * p_tile, updated_at = now() where name = p_who;
  end if;
  update public.world set fight = v_fight where id = 1;
  return jsonb_build_object('ok', true, 'knockdowns', v_new, 'exhausted', v_exhausted, 'wake', v_wake, 'atHammock', v_at_hammock);
end;
$$;

-- ============================================================ chat
create or replace function public.jw_send_chat(p_from text, p_text text, p_ts bigint)
returns void language sql security definer set search_path = public as $$
  insert into public.chat(from_name, text, ts) values (p_from, left(p_text, 200), p_ts);
$$;

-- no-security: the anon client calls every gameplay RPC
grant execute on all functions in schema public to anon, authenticated;
