-- 0016 — Armor is WORN by MOVING the piece (ADR-0017 §4, amended).
--
-- The old model (0013) wore Armor "by reference": the piece stayed in the bag
-- while equipped, and jw_equip only KEPT worn slots whose piece was still in the
-- inventory. That read as a duplicate — the piece showed both on the paperdoll
-- AND in the pack. Now equipping MOVES the piece: it is decremented out of the
-- bag, and unequipping returns it. jw_equip diffs the previously-worn set against
-- the desired one and transacts inventory via jw_add(±1), returning BOTH the worn
-- record and the mutated inventory (the client adopts the new bag).
--
-- A one-time normalization removes the now-stale bag copy of any piece that is
-- currently worn AND still sitting in the pack (the legacy by-reference state),
-- so the first post-deploy equip/unequip cannot mint a duplicate.
--
-- Deploy order: ship this BEFORE/with the client that reads res.inventory from
-- jw_equip. A pre-0016 client just ignores the extra 'inventory' field; a post-
-- 0016 client against pre-0016 SQL keeps the old bag (equip still copies) until
-- this lands — nothing breaks either way.

-- ============================================================ 1. jw_equip: MOVE
create or replace function public.jw_equip(p_world text, p_who text, p_equipped jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_inv jsonb; v_old jsonb; v_new jsonb := '{}'::jsonb;
  v_slot text; v_item text; v_before text; v_after text;
begin
  select inventory, coalesce(equipped, '{}'::jsonb) into v_inv, v_old
    from public.players where world_id = p_world and name = p_who for update;
  if v_inv is null then return jsonb_build_object('ok', false, 'reason', 'NO_PLAYER'); end if;
  -- desired worn set: honour a slot when the piece is already worn there OR a copy
  -- is available in the bag (shape-guarded: known slots, id-shaped values only)
  for v_slot, v_item in select key, value #>> '{}' from jsonb_each(coalesce(p_equipped, '{}'::jsonb)) loop
    if v_slot in ('boots', 'chest', 'helm')
       and v_item ~ '^[a-z][a-z0-9_]{0,31}$'
       and ((v_old ->> v_slot) = v_item or public.jw_num(v_inv, v_item) > 0) then
      v_new := jsonb_set(v_new, array[v_slot], to_jsonb(v_item), true);
    end if;
  end loop;
  -- transact the bag for every slot that changed
  foreach v_slot in array array['boots', 'chest', 'helm'] loop
    v_before := v_old ->> v_slot;
    v_after := v_new ->> v_slot;
    if v_before is distinct from v_after then
      if v_before is not null then v_inv := public.jw_add(v_inv, v_before, 1); end if;   -- bared → bag
      if v_after is not null then v_inv := public.jw_add(v_inv, v_after, -1); end if;     -- worn → out of bag
    end if;
  end loop;
  update public.players set equipped = v_new, inventory = v_inv, updated_at = now()
    where world_id = p_world and name = p_who;
  return jsonb_build_object('ok', true, 'equipped', v_new, 'inventory', v_inv);
end;
$$;

-- ============================================================ 2. one-time normalize
-- Remove the stale bag copy of any piece worn AND still in the pack (legacy
-- by-reference state). Idempotent: after it runs a worn piece is gone from the
-- bag, so a re-run changes nothing (jw_num(...) > 0 no longer holds).
do $$
declare r record; v_inv jsonb; v_slot text; v_item text;
begin
  for r in select world_id, name, inventory, equipped from public.players
           where equipped is not null and equipped <> '{}'::jsonb loop
    v_inv := r.inventory;
    foreach v_slot in array array['boots', 'chest', 'helm'] loop
      v_item := r.equipped ->> v_slot;
      if v_item is not null and public.jw_num(v_inv, v_item) > 0 then
        v_inv := public.jw_add(v_inv, v_item, -1);
      end if;
    end loop;
    if v_inv is distinct from r.inventory then
      update public.players set inventory = v_inv where world_id = r.world_id and name = r.name;
    end if;
  end loop;
end $$;
