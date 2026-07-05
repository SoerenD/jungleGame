-- Buildings, dismantle & the empty-arena end-fight (ADR-0008 + ADR-0004 / B2).
--
-- Three server-side pieces the client (SupabaseBackend) now calls:
--
--   1. Footprint-claim placement. A Building (ADR-0008) spans a w×h footprint;
--      placement must claim EVERY footprint tile or fail. A new `structure_tiles`
--      table holds one row per claimed tile (pk = (tx,ty)), so an overlapping
--      Building trips a unique_violation → OCCUPIED. Legacy 1×1 structures are
--      backfilled as single-tile claims. jw_place_structure gains p_w/p_h.
--
--   2. Dismantle. Any Player may remove any Structure (no ownership, like the
--      crate) for the caller's FULL refund (the client passes the crafting cost).
--      The row + its footprint tiles + crate/sawmill state are deleted atomically;
--      a retired Hammock clears its owners' wake points.
--
--   3. Empty-arena occupancy. When an engaged arena holds zero live roster
--      members, arm `emptySlumberAt` (jw_reconcile_fight already ends the fight at
--      it); a return within the grace disarms it. Generalises the all-Exhausted
--      wipe of 0003 to disconnects and step-outs.
--
-- Idempotent + additive: deploying this preserves every existing build and node
-- id (structure_tiles is derived from the live structures table).

-- 1. per-tile claim index ----------------------------------------------------
create table if not exists public.structure_tiles (
  tx           int not null,
  ty           int not null,
  structure_id text not null references public.structures(id) on delete cascade,
  primary key (tx, ty)
);
-- backfill: every existing Structure is 1×1, so its anchor is its only tile
insert into public.structure_tiles (tx, ty, structure_id)
  select tx, ty, id from public.structures
  on conflict (tx, ty) do nothing;

-- 2. footprint-aware placement (replaces the 1×1 jw_place_structure) ----------
-- drop the old 7-arg overload first so the new default-args signature is unique
drop function if exists public.jw_place_structure(text, text, int, int, text, text, boolean);

create or replace function public.jw_place_structure(
  p_who text, p_item text, p_tx int, p_ty int, p_text text, p_id text, p_is_hammock boolean,
  p_w int default 1, p_h int default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; v_inv jsonb; v_struct jsonb;
begin
  select inventory into v_inv from public.players where name = p_who for update;
  if v_inv is null or public.jw_num(v_inv, p_item) <= 0 then return jsonb_build_object('ok', false, 'reason', 'NOT_IN_INVENTORY'); end if;
  begin
    -- claim EVERY footprint tile atomically; any overlap → OCCUPIED (ADR-0008)
    insert into public.structure_tiles(tx, ty, structure_id)
      select p_tx + gx, p_ty + gy, p_id
      from generate_series(0, greatest(1, p_w) - 1) as gx,
           generate_series(0, greatest(1, p_h) - 1) as gy;
    insert into public.structures(id, type, tx, ty, placed_by, placed_at, text)
      values (p_id, p_item, p_tx, p_ty, p_who, v_now, p_text);
  exception when unique_violation then return jsonb_build_object('ok', false, 'reason', 'OCCUPIED'); end;
  v_inv := public.jw_add(v_inv, p_item, -1);
  update public.players set inventory = v_inv,
    wake_point = case when p_is_hammock then jsonb_build_object('tx', p_tx, 'ty', p_ty) else wake_point end,
    updated_at = now() where name = p_who;
  v_struct := jsonb_build_object('id', p_id, 'type', p_item, 'tx', p_tx, 'ty', p_ty, 'placedBy', p_who, 'placedAt', v_now)
    || case when p_text is not null then jsonb_build_object('text', p_text) else '{}'::jsonb end;
  return jsonb_build_object('ok', true, 'structure', v_struct, 'inventory', v_inv);
end;
$$;

-- 3. dismantle any Structure for the caller's full refund (no ownership) -------
create or replace function public.jw_dismantle_structure(p_who text, p_id text, p_refund jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv jsonb; v_type text; v_tx int; v_ty int;
begin
  select type, tx, ty into v_type, v_tx, v_ty from public.structures where id = p_id for update;
  if v_type is null then return jsonb_build_object('ok', false, 'reason', 'NO_STRUCTURE'); end if;
  -- the row + its footprint claim + any functional state die with it
  delete from public.structures where id = p_id;      -- cascades structure_tiles
  delete from public.crates where structure_id = p_id;
  delete from public.sawmills where structure_id = p_id;
  -- a retired Hammock clears every wake point that pointed at it
  if v_type = 'hammock' then
    update public.players set wake_point = null
      where wake_point is not null
        and (wake_point->>'tx')::int = v_tx and (wake_point->>'ty')::int = v_ty;
  end if;
  -- FULL refund of the crafting cost to the dismantler (empty for uncraftables)
  select inventory into v_inv from public.players where name = p_who for update;
  if v_inv is null then v_inv := '{}'::jsonb; end if;
  v_inv := public.jw_apply(v_inv, coalesce(p_refund, '{}'::jsonb));
  update public.players set inventory = v_inv, updated_at = now() where name = p_who;
  return jsonb_build_object('ok', true, 'removed', p_id, 'inventory', v_inv);
end;
$$;

-- 4. empty-arena occupancy: arm/disarm the re-slumber grace (B2) ---------------
create or replace function public.jw_guardian_arena_occupancy(p_who text, p_live int, p_empty_ms bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; v_fight jsonb;
begin
  select fight into v_fight from public.world where id = 1 for update;
  if v_fight is null or (v_fight->>'engagedAt') is null or coalesce((v_fight->>'hp')::int, 0) <= 0 then
    return jsonb_build_object('emptySlumberAt', null);
  end if;
  if p_live <= 0 then
    -- arena empty of live roster members → arm the ~5 s re-slumber once
    if (v_fight->>'emptySlumberAt') is null then
      v_fight := jsonb_set(v_fight, '{emptySlumberAt}', to_jsonb(v_now + p_empty_ms), true);
      update public.world set fight = v_fight where id = 1;
    end if;
  else
    -- a fighter is back within the grace → disarm
    if (v_fight->>'emptySlumberAt') is not null then
      v_fight := v_fight - 'emptySlumberAt';
      update public.world set fight = v_fight where id = 1;
    end if;
  end if;
  return jsonb_build_object('emptySlumberAt', v_fight->'emptySlumberAt');
end;
$$;

-- no-security (see 0001): anon reads tables + calls every gameplay RPC
grant select on public.structure_tiles to anon, authenticated;
grant execute on function public.jw_place_structure(text, text, int, int, text, text, boolean, int, int) to anon, authenticated;
grant execute on function public.jw_dismantle_structure(text, text, jsonb) to anon, authenticated;
grant execute on function public.jw_guardian_arena_occupancy(text, int, bigint) to anon, authenticated;
