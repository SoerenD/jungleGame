-- 0021 — two dedicated WEAPON slots on the gear record (2026-07 playtest batch).
--
-- jw_equip's slot whitelist widens from ('boots','chest','helm') to include
-- 'weapon1'/'weapon2'; slotting a weapon MOVES it out of the bag exactly like
-- 0016's armor move. The honour pass now runs against a WORKING ledger
-- (already-worn instances + bag copies, consumed as slots claim them) so the
-- SAME weapon in both slots genuinely needs two copies — the naive
-- "worn-or-in-bag" rule would mint a duplicate from one copy.
--
-- NO normalize DO-block: weapons never had a by-reference legacy, and armor was
-- normalized once by 0016. Weapon values are not slot-typed server-side (the
-- client's sanitize keeps junk out; an unknown id in a weapon slot is harmless
-- data the client drops on read).
--
-- Deploy order: stack after 0016 (this REPLACES its jw_equip; deploying both
-- together is fine — this one wins). A pre-0021 client sends armor-only records
-- and keeps working; a post-0021 client against pre-0021 SQL keeps its weapon
-- slots client-side in reference mode (no bag move) until this lands.

create or replace function public.jw_equip(p_world text, p_who text, p_equipped jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_inv jsonb; v_old jsonb; v_new jsonb := '{}'::jsonb; v_avail jsonb := '{}'::jsonb;
  v_slot text; v_item text; v_before text; v_after text;
  v_slots text[] := array['boots', 'chest', 'helm', 'weapon1', 'weapon2'];
begin
  select inventory, coalesce(equipped, '{}'::jsonb) into v_inv, v_old
    from public.players where world_id = p_world and name = p_who for update;
  if v_inv is null then return jsonb_build_object('ok', false, 'reason', 'NO_PLAYER'); end if;
  -- the working ledger: everything currently worn plus the whole bag
  v_avail := v_inv;
  foreach v_slot in array v_slots loop
    v_item := v_old ->> v_slot;
    if v_item is not null then v_avail := public.jw_add(v_avail, v_item, 1); end if;
  end loop;
  -- desired worn set: honour a slot while the ledger still has a copy, consuming
  -- it — so a doubled weapon needs two copies (shape-guarded ids only)
  foreach v_slot in array v_slots loop
    v_item := coalesce(p_equipped, '{}'::jsonb) ->> v_slot;
    if v_item is not null
       and v_item ~ '^[a-z][a-z0-9_]{0,31}$'
       and public.jw_num(v_avail, v_item) > 0 then
      v_avail := public.jw_add(v_avail, v_item, -1);
      v_new := jsonb_set(v_new, array[v_slot], to_jsonb(v_item), true);
    end if;
  end loop;
  -- transact the bag for every slot that changed. ALL unequip credits land
  -- before ANY equip debit: a cross-slot move (weapon2 → weapon1) would
  -- otherwise debit the covering copy's slot first in fixed slot order, and
  -- jw_add's zero clamp silently loses that debit — minting a duplicate once
  -- the credit lands after it.
  foreach v_slot in array v_slots loop
    v_before := v_old ->> v_slot;
    v_after := v_new ->> v_slot;
    if v_before is not null and v_before is distinct from v_after then
      v_inv := public.jw_add(v_inv, v_before, 1);   -- bared → bag
    end if;
  end loop;
  foreach v_slot in array v_slots loop
    v_before := v_old ->> v_slot;
    v_after := v_new ->> v_slot;
    if v_after is not null and v_after is distinct from v_before then
      v_inv := public.jw_add(v_inv, v_after, -1);   -- worn → out of bag
    end if;
  end loop;
  update public.players set equipped = v_new, inventory = v_inv, updated_at = now()
    where world_id = p_world and name = p_who;
  return jsonb_build_object('ok', true, 'equipped', v_new, 'inventory', v_inv);
end;
$$;
