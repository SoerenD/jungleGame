-- The Village: the communal, group-founded meta-loop (ADR-0010 / A3).
--
-- One collective Village per World — server-ordered, additive, and tile-
-- INDEPENDENT. A new `village` jsonb on the singleton world row holds the whole
-- record: {tier, pool, hall, milestonesBuilt}. Progress belongs to the group,
-- never the Hall's tile, so moving or dismantling the Hall never resets it.
--
--   * jw_contribute_village  — dump every carried qualifying item into the pool
--                              (additive, permanent), then advance the tier.
--   * jw_village_note_build   — the Hall founds/relocates the Village; a later
--                              milestone Building raised in-zone advances the tier.
--   * jw_village_recompute    — climb the tier while pool + milestones allow.
--   * jw_join / jw_dismantle_structure gain Village awareness (spawn-at-Hall,
--                              and un-homing the Village when the Hall is removed).
--
-- Idempotent + additive: deploying preserves every build, node id, and the Seal;
-- an un-founded Village (tier 0, empty pool, no Hall) gates nothing.

-- 1. the Village record on the singleton world row ---------------------------
alter table public.world
  add column if not exists village jsonb not null
  default '{"tier":0,"pool":0,"hall":null,"milestonesBuilt":0}'::jsonb;

-- 2. tier climb: pure function of pool + milestones (no decay — tier only rises)
create or replace function public.jw_village_recompute(v_village jsonb, p_thresholds jsonb, p_max int)
returns jsonb language plpgsql immutable set search_path = public as $$
declare v_tier int := coalesce((v_village->>'tier')::int, 0);
        v_pool int := coalesce((v_village->>'pool')::int, 0);
        v_mile int := coalesce((v_village->>'milestonesBuilt')::int, 0);
        v_thresh int;
begin
  while v_tier < p_max and v_mile > v_tier loop
    v_thresh := coalesce((p_thresholds->>(v_tier + 1))::int, 0);
    exit when v_pool < v_thresh;   -- the next tier's pool threshold isn't met yet
    v_tier := v_tier + 1;
  end loop;
  return jsonb_set(v_village, '{tier}', to_jsonb(v_tier), true);
end;
$$;

-- 3. contribute every carried qualifying item into the pool (additive) --------
create or replace function public.jw_contribute_village(p_who text, p_values jsonb, p_thresholds jsonb, p_max int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv jsonb; v_village jsonb; v_hall jsonb; v_taken jsonb := '{}'::jsonb;
        v_points int := 0; k text; per int; have int;
begin
  select village into v_village from public.world where id = 1 for update;
  v_village := coalesce(v_village, '{"tier":0,"pool":0,"hall":null,"milestonesBuilt":0}'::jsonb);
  v_hall := v_village->'hall';
  if v_hall is null or jsonb_typeof(v_hall) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'NO_HALL');
  end if;
  select inventory into v_inv from public.players where name = p_who for update;
  if v_inv is null then return jsonb_build_object('ok', false, 'reason', 'NOTHING_TO_GIVE'); end if;
  -- take ALL of each qualifying item (the pool is uncapped, cozy-additive)
  for k, per in select key, value::int from jsonb_each_text(p_values) loop
    have := public.jw_num(v_inv, k);
    if have > 0 then
      v_taken := public.jw_add(v_taken, k, have);
      v_points := v_points + have * per;
      v_inv := public.jw_add(v_inv, k, -have);
    end if;
  end loop;
  if v_points <= 0 then return jsonb_build_object('ok', false, 'reason', 'NOTHING_TO_GIVE'); end if;
  v_village := jsonb_set(v_village, '{pool}', to_jsonb(coalesce((v_village->>'pool')::int, 0) + v_points), true);
  v_village := public.jw_village_recompute(v_village, p_thresholds, p_max);
  update public.players set inventory = v_inv, updated_at = now() where name = p_who;
  update public.world set village = v_village where id = 1;
  return jsonb_build_object('ok', true, 'taken', v_taken, 'inventory', v_inv, 'village', v_village, 'gained', v_points);
end;
$$;

-- 4. record a Village build: found/relocate the Hall, or an in-zone milestone --
-- p_target_tier: 1 = the Hall (founding), 2..5 = that tier's milestone, 0 = decor.
create or replace function public.jw_village_note_build(
  p_who text, p_target_tier int, p_tx int, p_ty int, p_radius double precision, p_thresholds jsonb, p_max int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_village jsonb; v_hall jsonb; v_mile int; v_tier_before int;
        v_hx int; v_hy int; v_dist double precision; v_changed boolean := false;
begin
  select village into v_village from public.world where id = 1 for update;
  v_village := coalesce(v_village, '{"tier":0,"pool":0,"hall":null,"milestonesBuilt":0}'::jsonb);
  v_tier_before := coalesce((v_village->>'tier')::int, 0);
  v_mile := coalesce((v_village->>'milestonesBuilt')::int, 0);
  if p_target_tier = 1 then
    -- the Hall: found or relocate — never resets the pool/tier (tile-independent)
    v_village := jsonb_set(v_village, '{hall}', jsonb_build_object('tx', p_tx, 'ty', p_ty), true);
    if v_mile < 1 then v_village := jsonb_set(v_village, '{milestonesBuilt}', to_jsonb(1), true); end if;
    v_changed := true;
  elsif p_target_tier >= 2 then
    v_hall := v_village->'hall';
    if v_hall is not null and jsonb_typeof(v_hall) = 'object' then
      v_hx := (v_hall->>'tx')::int; v_hy := (v_hall->>'ty')::int;
      v_dist := sqrt(power(p_tx - v_hx, 2) + power(p_ty - v_hy, 2));
      if v_dist <= p_radius and v_mile < p_target_tier then
        v_village := jsonb_set(v_village, '{milestonesBuilt}', to_jsonb(p_target_tier), true);
        v_changed := true;
      end if;
    end if;
  end if;
  if v_changed then
    v_village := public.jw_village_recompute(v_village, p_thresholds, p_max);
    update public.world set village = v_village where id = 1;
  end if;
  return jsonb_build_object('village', v_village, 'changed', v_changed,
    'founded', (p_target_tier = 1 and v_tier_before = 0), 'tierBefore', v_tier_before);
end;
$$;

-- 5. jw_join: return the Village so the client can wake a Player at the Hall ---
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
    'journey', rec.journey, 'explored', rec.explored, 'wakePoint', rec.wake_point, 'tablets', rec.tablets,
    'village', (select village from public.world where id = 1));
end;
$$;

-- 6. dismantle: removing THE Hall un-homes the Village but keeps the tier/pool -
create or replace function public.jw_dismantle_structure(p_who text, p_id text, p_refund jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv jsonb; v_type text; v_tx int; v_ty int;
begin
  select type, tx, ty into v_type, v_tx, v_ty from public.structures where id = p_id for update;
  if v_type is null then return jsonb_build_object('ok', false, 'reason', 'NO_STRUCTURE'); end if;
  delete from public.structures where id = p_id;      -- cascades structure_tiles
  delete from public.crates where structure_id = p_id;
  delete from public.sawmills where structure_id = p_id;
  if v_type = 'hammock' then
    update public.players set wake_point = null
      where wake_point is not null
        and (wake_point->>'tx')::int = v_tx and (wake_point->>'ty')::int = v_ty;
  end if;
  -- A3 (ADR-0010): the Hall un-homes the Village (spawn falls back to World
  -- spawn) but tier/pool/milestones stay — progress is tile-independent.
  if v_type = 'village_hall' then
    update public.world set village = jsonb_set(village, '{hall}', 'null'::jsonb, true)
      where id = 1
        and jsonb_typeof(village->'hall') = 'object'
        and (village->'hall'->>'tx')::int = v_tx and (village->'hall'->>'ty')::int = v_ty;
  end if;
  select inventory into v_inv from public.players where name = p_who for update;
  if v_inv is null then v_inv := '{}'::jsonb; end if;
  v_inv := public.jw_apply(v_inv, coalesce(p_refund, '{}'::jsonb));
  update public.players set inventory = v_inv, updated_at = now() where name = p_who;
  return jsonb_build_object('ok', true, 'removed', p_id, 'inventory', v_inv,
    'village', (select village from public.world where id = 1));
end;
$$;

-- no-security (see 0001): anon reads the world row + calls every gameplay RPC
grant execute on function public.jw_village_recompute(jsonb, jsonb, int) to anon, authenticated;
grant execute on function public.jw_contribute_village(text, jsonb, jsonb, int) to anon, authenticated;
grant execute on function public.jw_village_note_build(text, int, int, int, double precision, jsonb, int) to anon, authenticated;
