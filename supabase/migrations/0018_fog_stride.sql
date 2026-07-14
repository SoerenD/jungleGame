-- 0018 — Fog-of-war stride stamp + one-time remap (the "venetian-blind" fix).
--
-- Explored chunks are stored as flat indices  idx = cy * stride + cx,  where the
-- row-stride is ceil(MAP_W / FOG_CHUNK). The World grew 200 → 300 → 384, so the
-- stride went 50 → 75 → 96. Indices saved under an OLD stride decode to shifted
-- chunks under the CURRENT one — contiguous explored terrain sheared into offset
-- bands (the stripes players saw only after a relog, when the SAVED old-stride
-- data was restored).
--
-- Fix: remap every legacy row's indices ONCE from the last pre-Realm stride (75,
-- ceil(300/4)) to the current stride (96, ceil(384/4)) — pinned growth keeps each
-- chunk's (cx,cy), so the remap is lossless — then STAMP fog_stride so the client's
-- load-time remap becomes a no-op and future growth can remap cleanly instead of
-- scrambling. jw_join returns the stamp as `exploredStride`.
--
-- Deploy order: safe any time. A pre-0018 client ignores 'exploredStride' and its
-- own load-time remap (assuming the legacy 75 stride) already un-stripes the
-- display; deploying this makes the stored data consistent so it never re-stripes.

-- ============================================================ 1. the stamp column
alter table public.players add column if not exists fog_stride int;

-- ============================================================ 2. one-time remap
-- Legacy rows (fog_stride IS NULL) hold indices under the 300-era stride 75; remap
-- them onto the current 384-era stride 96 and stamp. Rows already stamped are left
-- alone. (A tiny slice explored in the brief 384-era window before this ships is
-- remapped as if 75 and may shift once — it re-reveals on the next walk; there is
-- no per-index marker to distinguish it, and this is still strictly better than the
-- all-old-data stripes the players see today.)
do $$
declare
  r record; v_new jsonb; e_txt text; idx int; cx int; cy int;
  old_stride constant int := 75;   -- ceil(WORLD_VIEW_W=300 / FOG_CHUNK=4)
  new_stride constant int := 96;   -- ceil(MAP_W=384 / FOG_CHUNK=4)
begin
  for r in select world_id, name, explored from public.players where fog_stride is null loop
    v_new := '[]'::jsonb;
    for e_txt in select value from jsonb_array_elements_text(coalesce(r.explored, '[]'::jsonb)) loop
      idx := e_txt::int;
      if idx < 0 then continue; end if;
      cx := idx % old_stride;
      cy := idx / old_stride;             -- integer division
      v_new := v_new || to_jsonb(cy * new_stride + cx);
    end loop;
    update public.players set explored = v_new, fog_stride = new_stride
      where world_id = r.world_id and name = r.name;
  end loop;
end $$;

-- ============================================================ 3. default for new rows
-- New players start empty and save fresh chunks under the current stride, so their
-- stamp is the current stride. (A future map growth bumps this default + adds a new
-- one-time remap, exactly as this migration does.)
alter table public.players alter column fog_stride set default 96;

-- ============================================================ 4. jw_join returns it
-- The 0013 body verbatim + ONE field in the return ('exploredStride') — same
-- signature, so create-or-replace swaps it in place.
create or replace function public.jw_join(p_world text, p_name text, p_pin text, p_appearance jsonb, p_spawn_x double precision, p_spawn_y double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rec public.players; v_new boolean := false; v_seal jsonb;
begin
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
    'exploredStride', rec.fog_stride,
    'village', (select village from public.world where id = p_world));
end;
$$;
