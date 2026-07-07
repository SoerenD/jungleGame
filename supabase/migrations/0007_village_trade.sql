-- Trade Post: the market_square resource exchange (ADR-0013).
--
-- Swap a surplus tradeable Resource for another. The client computes the
-- deterministic, tier-taxed yield (content/village.ts tradeYield); this RPC
-- validates the give and applies the swap atomically. Purely ADDITIVE — no
-- existing table, column, or RPC is touched, so deploying is safe mid-play.
create or replace function public.jw_village_trade(
  p_who text, p_give text, p_give_n int, p_get text, p_get_n int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv jsonb; v_tier int;
begin
  if p_give_n <= 0 or p_get_n <= 0 or p_give = p_get then
    return jsonb_build_object('ok', false, 'reason', 'INSUFFICIENT');
  end if;
  select coalesce((village->>'tier')::int, 0) into v_tier from public.world where id = 1;
  if v_tier < 3 then
    return jsonb_build_object('ok', false, 'reason', 'NO_MARKET');
  end if;
  select inventory into v_inv from public.players where name = p_who for update;
  if v_inv is null or public.jw_num(v_inv, p_give) < p_give_n then
    return jsonb_build_object('ok', false, 'reason', 'INSUFFICIENT');
  end if;
  v_inv := public.jw_add(v_inv, p_give, -p_give_n);
  v_inv := public.jw_add(v_inv, p_get, p_get_n);
  update public.players set inventory = v_inv, updated_at = now() where name = p_who;
  return jsonb_build_object('ok', true, 'inventory', v_inv);
end;
$$;

-- no-security (see 0001): anon calls every gameplay RPC
grant execute on function public.jw_village_trade(text, text, int, text, int) to anon, authenticated;
