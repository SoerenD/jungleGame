-- 0019: the Village Hall becomes THE wake point, and the hammock/table/
-- obsidian_path buildables are retired (2026-07 playtest batch).
--
-- 1. jw_knockdown stops honouring players.wake_point: the client passes the
--    wake tile as p_spawn (Village Hall if founded, else World spawn), so the
--    server just uses it. The returned key stays 'atHammock' (always false)
--    for old-client wire compat; new clients derive atVillage themselves.
-- 2. Legacy wake_points are nulled EVERYWHERE (all worlds — hammocks were the
--    only writer). The column stays: jw_join's SELECT list still returns it.
-- 3. Already-placed hammock/table/obsidian_path structures are deleted (their
--    footprint tiles cascade); crafted-but-unplaced copies are stripped from
--    player inventories and crate contents. Client-side the ids no longer
--    exist, so rows left behind would only be reserved-but-invisible tiles.
--
-- jw_place_structure keeps its p_is_hammock parameter (signature is live);
-- the client now always sends false.

create or replace function public.jw_knockdown(
  p_world text, p_who text, p_wave int, p_exhaustion_n int, p_spawn jsonb, p_tile int,
  p_awake_ms bigint, p_dormant_ms bigint, p_empty_ms bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
        v_fight jsonb; v_wake jsonb; v_cur int; v_new int; v_exhausted boolean; v_wiped boolean;
begin
  select fight into v_fight from public.world where id = p_world for update;
  v_fight := public.jw_reconcile_fight(v_fight, v_now, p_awake_ms, p_dormant_ms);
  if v_fight is null then update public.world set fight = null where id = p_world; return jsonb_build_object('ok', false, 'reason', 'NO_FIGHT'); end if;
  v_cur := coalesce((v_fight #>> array['knockdowns', p_who])::int, 0);
  if (v_fight->>'engagedAt') is null or not ((v_fight->'roster') @> jsonb_build_array(p_who)) or v_cur >= p_exhaustion_n then
    return jsonb_build_object('ok', false, 'reason', 'NOT_IN_DANGER');
  end if;
  -- the client-passed wake tile is authoritative (Village Hall > World spawn);
  -- players.wake_point is retired and no longer read
  v_wake := p_spawn;
  if coalesce((v_fight #>> array['lastKnockdownWave', p_who])::int, -1) = p_wave then
    return jsonb_build_object('ok', true, 'knockdowns', v_cur, 'exhausted', false, 'wake', v_wake, 'atHammock', false);
  end if;
  v_new := v_cur + 1;
  v_exhausted := v_new >= p_exhaustion_n;
  v_fight := jsonb_set(v_fight, array['lastKnockdownWave', p_who], to_jsonb(p_wave), true);
  v_fight := jsonb_set(v_fight, array['knockdowns', p_who], to_jsonb(v_new), true);
  if v_exhausted then
    update public.players set x = ((v_wake->>'tx')::double precision + 0.5) * p_tile,
                              y = ((v_wake->>'ty')::double precision + 0.5) * p_tile, updated_at = now()
      where world_id = p_world and name = p_who;
    v_wiped := not exists (
      select 1 from jsonb_array_elements_text(v_fight->'roster') as r(name)
      where coalesce((v_fight #>> array['knockdowns', r.name])::int, 0) < p_exhaustion_n
    );
    if v_wiped and (v_fight->>'emptySlumberAt') is null then
      v_fight := jsonb_set(v_fight, '{emptySlumberAt}', to_jsonb(v_now + p_empty_ms), true);
    end if;
  end if;
  update public.world set fight = v_fight where id = p_world;
  return jsonb_build_object('ok', true, 'knockdowns', v_new, 'exhausted', v_exhausted,
    'wake', v_wake, 'atHammock', false, 'emptySlumberAt', v_fight->'emptySlumberAt');
end;
$$;

-- legacy hammock wake points retire (all worlds; the column itself stays)
update public.players set wake_point = null where wake_point is not null;

-- placed instances of the retired buildables vanish (footprint tiles cascade)
delete from public.structures where type in ('hammock', 'table', 'obsidian_path');

-- crafted-but-unplaced copies leave every pack and crate
update public.players
  set inventory = inventory - 'hammock' - 'table' - 'obsidian_path'
  where inventory ?| array['hammock', 'table', 'obsidian_path'];
update public.crates
  set contents = contents - 'hammock' - 'table' - 'obsidian_path'
  where contents ?| array['hammock', 'table', 'obsidian_path'];
