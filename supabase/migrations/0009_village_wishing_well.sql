-- Wishing Well: the fountain communal Dorffest (ADR-0013).
--
-- Players toss fruit toward a shared meter (world.village.wishes). When it fills,
-- a village-wide Dorffest starts: world.village.festivalUntil is set to a future
-- epoch-ms, and the meter resets. The festival is a pure timestamp (ADR-0001/0002)
-- — clients compute "is a festival running" lazily from festivalUntil, no server
-- tick. Both new keys live on the world.village jsonb: purely ADDITIVE, no schema
-- change, safe to deploy mid-play.
--
-- THRESHOLD (30) and FESTIVAL_MS (300000) mirror content/village.ts — keep in sync.
create or replace function public.jw_village_wish(p_who text, p_n int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_inv jsonb;
  v_village jsonb;
  v_wishes int;
  v_festival_until bigint;
  v_started boolean := false;
  v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  c_threshold constant int := 30;
  c_festival_ms constant bigint := 300000;
begin
  if p_n <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'INSUFFICIENT');
  end if;
  -- lock the world row so concurrent wishes can't double-trigger a festival
  select village into v_village from public.world where id = 1 for update;
  if v_village is null or coalesce(jsonb_typeof(v_village->'hall'), 'null') <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'NO_FOUNTAIN');
  end if;
  v_festival_until := coalesce((v_village->>'festivalUntil')::bigint, 0);
  if v_festival_until > v_now_ms then
    return jsonb_build_object('ok', false, 'reason', 'FESTIVAL_ACTIVE');
  end if;
  select inventory into v_inv from public.players where name = p_who for update;
  if v_inv is null or public.jw_num(v_inv, 'fruit') < p_n then
    return jsonb_build_object('ok', false, 'reason', 'INSUFFICIENT');
  end if;
  v_inv := public.jw_add(v_inv, 'fruit', -p_n);
  v_wishes := coalesce((v_village->>'wishes')::int, 0) + p_n;
  if v_wishes >= c_threshold then
    v_wishes := 0;
    v_festival_until := v_now_ms + c_festival_ms;
    v_started := true;
  end if;
  v_village := jsonb_set(v_village, '{wishes}', to_jsonb(v_wishes), true);
  v_village := jsonb_set(v_village, '{festivalUntil}', to_jsonb(v_festival_until), true);
  update public.players set inventory = v_inv, updated_at = now() where name = p_who;
  update public.world set village = v_village where id = 1;
  return jsonb_build_object('ok', true, 'inventory', v_inv, 'village', v_village, 'festivalStarted', v_started);
end;
$$;

-- no-security (see 0001): anon calls every gameplay RPC
grant execute on function public.jw_village_wish(text, int) to anon, authenticated;
