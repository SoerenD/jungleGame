-- 0013 — Armor equip persistence (ADR-0017 §4): ONE jsonb column + ONE RPC.
--
-- Worn Armor is a per-player slot→item mapping ({"boots":"tideglass_boots"}).
-- The stat VALUES never touch SQL (client-applied like the Village buffs,
-- ADR-0013 pattern); the DB only remembers what is worn, exactly like
-- wake_point remembers the Hammock. jw_join returns it so a reload re-dresses
-- the Avatar; the wire carries it on the position/presence payload.
--
-- Trusted-friends posture (ADR-0005) — but the mapping is still guarded
-- against nonsense: only the three known slots, only item-id-shaped values,
-- only pieces actually in the caller's inventory survive.
--
-- Deploy order: this migration ships BEFORE any client that calls jw_equip
-- (a pre-0013 client is unaffected; a post-0013 client degrades gracefully
-- to a non-persisted equip if the RPC is missing).

-- ============================================================ 1. the column
alter table public.players add column if not exists equipped jsonb not null default '{}'::jsonb;

-- ============================================================ 2. the RPC
create or replace function public.jw_equip(p_world text, p_who text, p_equipped jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv jsonb; v_out jsonb := '{}'::jsonb; v_slot text; v_item text;
begin
  select inventory into v_inv from public.players where world_id = p_world and name = p_who for update;
  if v_inv is null then return jsonb_build_object('ok', false, 'reason', 'NO_PLAYER'); end if;
  for v_slot, v_item in select key, value #>> '{}' from jsonb_each(coalesce(p_equipped, '{}'::jsonb)) loop
    if v_slot in ('boots', 'chest', 'helm')
       and v_item ~ '^[a-z][a-z0-9_]{0,31}$'
       and public.jw_num(v_inv, v_item) > 0 then
      v_out := jsonb_set(v_out, array[v_slot], to_jsonb(v_item), true);
    end if;
  end loop;
  update public.players set equipped = v_out, updated_at = now() where world_id = p_world and name = p_who;
  return jsonb_build_object('ok', true, 'equipped', v_out);
end;
$$;

-- ============================================================ 3. jw_join returns it
-- The 0010 body verbatim + ONE field in the return ('equipped') — same
-- signature, so create-or-replace swaps it in place.
create or replace function public.jw_join(p_world text, p_name text, p_pin text, p_appearance jsonb, p_spawn_x double precision, p_spawn_y double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rec public.players; v_new boolean := false; v_seal jsonb;
begin
  -- implicit world creation (ADR-0014): an unknown slug materialises here, fully
  -- defaulted (gate closed, Seal intact, no Village/fight) from the column defaults
  insert into public.world (id) values (p_world) on conflict (id) do nothing;
  select * into rec from public.players where world_id = p_world and name = p_name;
  if found then
    if rec.pin <> p_pin then return jsonb_build_object('ok', false, 'reason', 'WRONG_PIN'); end if;
    update public.players set appearance = p_appearance, updated_at = now() where world_id = p_world and name = p_name;
  else
    v_new := true;
    insert into public.players(world_id, name, pin, appearance, x, y) values (p_world, p_name, p_pin, p_appearance, p_spawn_x, p_spawn_y);
  end if;
  select seal into v_seal from public.world where id = p_world;
  if coalesce((v_seal->>'broken')::boolean, false) then
    update public.players
      set journey = jsonb_set(jsonb_set(journey, '{steps,visit_seal}', 'true'::jsonb, true), '{steps,first_offering}', 'true'::jsonb, true)
      where world_id = p_world and name = p_name;
  end if;
  select * into rec from public.players where world_id = p_world and name = p_name;
  return jsonb_build_object('ok', true, 'isNew', v_new, 'name', rec.name, 'appearance', rec.appearance,
    'x', rec.x, 'y', rec.y, 'inventory', rec.inventory, 'introSeen', rec.intro_seen,
    'journey', rec.journey, 'explored', rec.explored, 'wakePoint', rec.wake_point, 'tablets', rec.tablets,
    'equipped', coalesce(rec.equipped, '{}'::jsonb),
    'village', (select village from public.world where id = p_world));
end;
$$;
