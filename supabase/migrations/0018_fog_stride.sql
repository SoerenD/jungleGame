-- 0018 — Fog-of-war stride stamp + one-time remap (the "venetian-blind" fix).
--
-- Explored chunks are stored as flat indices  idx = cy * stride + cx,  where the
-- row-stride is ceil(MAP_W / FOG_CHUNK). The World grew 200 → 300 → 384, so the
-- stride went 50 → 75 → 96. Indices saved under an OLD stride decode to shifted
-- chunks under the CURRENT one — contiguous explored terrain sheared into offset
-- bands (the stripes players saw only after a relog, when the SAVED old-stride
-- data was restored).
--
-- Fix: legacy fog is an unrecoverable MIX of strides (no per-index marker across
-- the 200→300→384 growths), so RESET it once to a blank slate and STAMP the current
-- stride. From then on every row is a single known stride and jw_join returns it as
-- `exploredStride`; a future growth remaps losslessly (pinned growth keeps each
-- chunk's (cx,cy)) — GameScene.initFog does that remap, now always on homogeneous data.
--
-- Deploy order: safe any time. jw_join gains one field pre-0018 clients ignore; the
-- reset costs only re-exploration (fog re-reveals as you walk; landmarks always show).

-- ============================================================ 1. the stamp column
alter table public.players add column if not exists fog_stride int;

-- ============================================================ 2. one-time reset
-- Legacy fog (fog_stride IS NULL) is UNRECOVERABLE: `explored` accumulated indices
-- under DIFFERENT strides across the 200→300→384 growths with no per-index marker,
-- so it is a MIX of stride-50/75/96 values that cannot be told apart. A blanket
-- remap (an earlier attempt) fixes one stride and scrambles the others — bigger
-- stripes, not fewer. The only clean state reachable from mixed data is empty, so
-- we RESET legacy fog to a blank slate and stamp the current stride; it re-reveals
-- as the Player walks. Rows already stamped (fog_stride set) are untouched. From
-- here on every row is a SINGLE known stride, so a future growth can remap losslessly.
update public.players set explored = '[]'::jsonb, fog_stride = 96 where fog_stride is null;

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
