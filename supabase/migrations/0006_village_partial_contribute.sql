-- Village: per-resource contribution amounts (ADR-0010, the contribution slider).
--
-- The original jw_contribute_village (0005) pours EVERY carried qualifying item
-- into the pool. The client now offers a per-resource slider so a player can give
-- only some of what they carry, so the RPC needs to accept a cap per item.
--
-- This is ADDITIVE: it adds a 5-arg OVERLOAD (…, p_amounts jsonb) and leaves the
-- original 4-arg function in place, so any client still on the old build keeps
-- working (its 4-arg call resolves to the give-everything version). The new
-- client always passes p_amounts; null there means "give it all" (same behaviour
-- as the 4-arg form). Idempotent — deploying preserves the pool, tier, and Hall.

create or replace function public.jw_contribute_village(
  p_who text, p_values jsonb, p_thresholds jsonb, p_max int, p_amounts jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv jsonb; v_village jsonb; v_hall jsonb; v_taken jsonb := '{}'::jsonb;
        v_points int := 0; k text; per int; have int; want int; give int;
begin
  select village into v_village from public.world where id = 1 for update;
  v_village := coalesce(v_village, '{"tier":0,"pool":0,"hall":null,"milestonesBuilt":0}'::jsonb);
  v_hall := v_village->'hall';
  if v_hall is null or jsonb_typeof(v_hall) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'NO_HALL');
  end if;
  select inventory into v_inv from public.players where name = p_who for update;
  if v_inv is null then return jsonb_build_object('ok', false, 'reason', 'NOTHING_TO_GIVE'); end if;
  -- take the requested amount of each qualifying item, clamped to what is held
  -- (p_amounts null => take all of it, the cozy "pour it all in" default)
  for k, per in select key, value::int from jsonb_each_text(p_values) loop
    have := public.jw_num(v_inv, k);
    if have > 0 then
      if p_amounts is null then
        give := have;
      else
        want := public.jw_num(p_amounts, k);
        give := least(have, greatest(0, want));
      end if;
      if give > 0 then
        v_taken := public.jw_add(v_taken, k, give);
        v_points := v_points + give * per;
        v_inv := public.jw_add(v_inv, k, -give);
      end if;
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

-- no-security (see 0001): anon reads the world row + calls every gameplay RPC
grant execute on function public.jw_contribute_village(text, jsonb, jsonb, int, jsonb) to anon, authenticated;
