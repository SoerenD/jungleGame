-- 0020: the Village pool stops at the NEXT tier's threshold until that tier's
-- milestone Building is raised (2026-07 playtest batch — the "Vorrat 567/300"
-- confusion). Same 6-arg signature as 0010's jw_contribute_village, so old
-- clients keep working; the per-item loop now clamps every give to the pool's
-- remaining room, and a full pool refuses with POOL_FULL, deducting nothing
-- (the no-loss contract). At max tier the pool stays uncapped (the endless
-- prestige sink for sigils/trophies). Existing over-threshold pools are LEFT
-- as they are — thresholds are cumulative, so those points already count
-- toward the tier after next; only NEW contributions are refused.
--
-- Accepted divergence: when the ROOM clamp bites (only in a concurrent race —
-- the client pre-clamps and sends explicit amounts), the loop consumes
-- resources in jsonb key order, which differs from the client's
-- VILLAGE_CONTRIB insertion order. Points taken are identical either way;
-- only WHICH surplus resource fills the last few points can differ.

create or replace function public.jw_contribute_village(
  p_world text, p_who text, p_values jsonb, p_thresholds jsonb, p_max int, p_amounts jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv jsonb; v_village jsonb; v_hall jsonb; v_taken jsonb := '{}'::jsonb;
        v_points int := 0; k text; per int; have int; want int; give int;
        v_tier int; v_cap int; v_room int;
begin
  select village into v_village from public.world where id = p_world for update;
  v_village := coalesce(v_village, '{"tier":0,"pool":0,"hall":null,"milestonesBuilt":0}'::jsonb);
  v_hall := v_village->'hall';
  if v_hall is null or jsonb_typeof(v_hall) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'NO_HALL');
  end if;
  -- the pool's remaining room: next tier's threshold minus the pool (unlimited
  -- at max tier). p_thresholds is the cumulative array, indexed by tier.
  v_tier := coalesce((v_village->>'tier')::int, 0);
  if v_tier >= p_max then
    v_room := 2147483647;
  else
    v_cap := coalesce((p_thresholds->>(v_tier + 1))::int, 2147483647);
    v_room := greatest(0, v_cap - coalesce((v_village->>'pool')::int, 0));
  end if;
  select inventory into v_inv from public.players where world_id = p_world and name = p_who for update;
  if v_inv is null then return jsonb_build_object('ok', false, 'reason', 'NOTHING_TO_GIVE'); end if;
  for k, per in select key, value::int from jsonb_each_text(p_values) loop
    have := public.jw_num(v_inv, k);
    if have > 0 and per > 0 then
      if p_amounts is null then
        give := have;
      else
        want := public.jw_num(p_amounts, k);
        give := least(have, greatest(0, want));
      end if;
      give := least(give, (v_room - v_points) / per); -- whole units into the remaining room
      if give > 0 then
        v_taken := public.jw_add(v_taken, k, give);
        v_points := v_points + give * per;
        v_inv := public.jw_add(v_inv, k, -give);
      end if;
    end if;
  end loop;
  if v_points <= 0 then
    return jsonb_build_object('ok', false, 'reason',
      case when v_room <= 0 then 'POOL_FULL' else 'NOTHING_TO_GIVE' end);
  end if;
  v_village := jsonb_set(v_village, '{pool}', to_jsonb(coalesce((v_village->>'pool')::int, 0) + v_points), true);
  v_village := public.jw_village_recompute(v_village, p_thresholds, p_max);
  update public.players set inventory = v_inv, updated_at = now() where world_id = p_world and name = p_who;
  update public.world set village = v_village where id = p_world;
  return jsonb_build_object('ok', true, 'taken', v_taken, 'inventory', v_inv, 'village', v_village, 'gained', v_points);
end;
$$;
