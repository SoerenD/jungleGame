-- 0017 — jw_dig returns the rotated treasure index (treasure-✕ fix).
--
-- The dig spot rotates server-side on every successful dig, but the old jw_dig
-- (0010) returned only {ok, loot, inventory} — never the new index. The client's
-- local `treasureIndex` therefore went stale after a dig, so when a player dug
-- while still holding ≥3 map pieces the ✕ stayed glued to the just-looted tile
-- for the rest of the session (it only self-corrected on the next join). Now the
-- new index is computed into a variable, used in the UPDATE, AND returned, so the
-- client relocates (or clears) the ✕ immediately. The loot table is unchanged.
--
-- Deploy order: safe any time. A pre-0017 client ignores 'treasure_index'; the
-- post-0017 client reads it when present and otherwise hides the ✕ until its next
-- join (graceful — see SupabaseBackend.dig).

create or replace function public.jw_dig(p_world text, p_who text, p_ptx int, p_pty int, p_spots jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv jsonb; v_idx int; v_n int; v_spot jsonb; v_loot jsonb; v_new_idx int;
begin
  select inventory into v_inv from public.players where world_id = p_world and name = p_who for update;
  if v_inv is null or public.jw_num(v_inv, 'map_piece') < 3 then return jsonb_build_object('ok', false, 'reason', 'NO_MAP'); end if;
  select treasure_index into v_idx from public.world where id = p_world for update;
  v_n := jsonb_array_length(p_spots);
  v_spot := p_spots->v_idx;
  if abs(p_ptx - (v_spot->>'tx')::int) > 1 or abs(p_pty - (v_spot->>'ty')::int) > 1 then
    return jsonb_build_object('ok', false, 'reason', 'NOT_HERE');
  end if;
  v_loot := jsonb_build_object('wood', 10, 'stone', 8, 'fruit', 6, 'fiber', 6, 'golden_idol', 1);
  v_inv := public.jw_apply(public.jw_add(v_inv, 'map_piece', -3), v_loot);
  v_new_idx := (v_idx + 1 + floor(random() * (v_n - 1))::int) % v_n;
  update public.players set inventory = v_inv, updated_at = now() where world_id = p_world and name = p_who;
  update public.world set treasure_index = v_new_idx where id = p_world;
  return jsonb_build_object('ok', true, 'loot', v_loot, 'inventory', v_inv, 'treasure_index', v_new_idx);
end;
$$;
