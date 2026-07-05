-- 0006 — fix jw_place_structure: insert the structures row BEFORE its tiles.
--
-- Bug: since 0004, jw_place_structure inserted into structure_tiles first, then
-- into structures. structure_tiles.structure_id is a NON-deferrable FK to
-- structures(id), so the tile insert violates the FK immediately — every new
-- placement raises 23503, the RPC returns null, and the client shows the
-- generic "can't build here" (INVALID). Pre-0004 structures survived only
-- because 0004 backfilled their tiles; no NEW build has succeeded on prod since.
--
-- Fix: insert the parent structures row first (so the FK parent exists), then
-- claim the footprint tiles. A tile overlap still trips the structure_tiles PK
-- (unique_violation) and the subtransaction rolls back BOTH inserts → OCCUPIED.
-- Only the insert order changes; signature and all other behaviour are identical.

create or replace function public.jw_place_structure(
  p_who text, p_item text, p_tx int, p_ty int, p_text text, p_id text, p_is_hammock boolean,
  p_w int default 1, p_h int default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; v_inv jsonb; v_struct jsonb;
begin
  select inventory into v_inv from public.players where name = p_who for update;
  if v_inv is null or public.jw_num(v_inv, p_item) <= 0 then return jsonb_build_object('ok', false, 'reason', 'NOT_IN_INVENTORY'); end if;
  begin
    -- parent FIRST so structure_tiles' FK is satisfied...
    insert into public.structures(id, type, tx, ty, placed_by, placed_at, text)
      values (p_id, p_item, p_tx, p_ty, p_who, v_now, p_text);
    -- ...then claim EVERY footprint tile; any overlap → unique_violation → OCCUPIED (ADR-0008)
    insert into public.structure_tiles(tx, ty, structure_id)
      select p_tx + gx, p_ty + gy, p_id
      from generate_series(0, greatest(1, p_w) - 1) as gx,
           generate_series(0, greatest(1, p_h) - 1) as gy;
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
