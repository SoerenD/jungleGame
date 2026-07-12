-- 0014 — the Warden fight backend (ADR-0017 T4): ONE jsonb column + THREE RPCs.
--
-- Per-Warden world state lives under world.wardens, keyed by WardenDef id:
--   { "mire": { "altar": { "broken": bool, "contributed": {...} }, "gateOpen": bool } }
--
-- * jw_contribute_warden — the generic altar-Offering executor in the
--   jw_contribute_seal/jw_contribute_village shape: the CLIENT passes the
--   (per-head-scaled) jsonb demands, SQL clamps each take and flips `broken`
--   once every quota is met. Rungs 2–3 are pure data through this one RPC.
-- * jw_summon_warden — jw_summon generalized: gated on the Warden's broken
--   altar (not the Seal), consumes the CLIENT-NAMED totem item, and stamps
--   the fight jsonb with its `warden` key. The one-fight MUTEX (ADR-0017 §5)
--   holds in both directions: this refuses while ANY fight runs, and the
--   legacy jw_summon's `fight is not null` check refuses while a Warden
--   fight runs. jw_guardian_hit / jw_knockdown / the reconcile helper work on
--   the fight jsonb generically (jsonb_set preserves the warden key), so the
--   live fight RPCs need NO change; victory drops ride the client-side Spoils
--   claim exactly like the Guardian's (p_scale_drop is already 0).
-- * jw_open_realm_gate — the jw_open_delve pattern: any Player with the gate
--   key in hand (client-checked, ADR-0005 trusted-friends) flips the
--   one-time-forever gateOpen flag.
--
-- Deploy order: this migration ships BEFORE any client that calls jw_*_warden.

-- ============================================================ 1. the column
alter table public.world add column if not exists wardens jsonb not null default '{}'::jsonb;

-- ============================================================ 2. the altar Offering
create or replace function public.jw_contribute_warden(p_world text, p_who text, p_warden text, p_quotas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv jsonb; v_wardens jsonb; v_altar jsonb; v_contrib jsonb; v_taken jsonb := '{}'::jsonb;
        res text; v_need int; v_have int; v_give int; v_all boolean := true; v_broken boolean;
begin
  if p_warden !~ '^[a-z][a-z0-9_]{0,31}$' then return jsonb_build_object('ok', false, 'reason', 'NOTHING_TO_GIVE'); end if;
  select inventory into v_inv from public.players where world_id = p_world and name = p_who for update;
  select wardens into v_wardens from public.world where id = p_world for update;
  if v_inv is null then return jsonb_build_object('ok', false, 'reason', 'NOTHING_TO_GIVE'); end if;
  v_wardens := coalesce(v_wardens, '{}'::jsonb);
  v_altar := coalesce(v_wardens #> array[p_warden, 'altar'], '{"broken": false, "contributed": {}}'::jsonb);
  if coalesce((v_altar->>'broken')::boolean, false) then return jsonb_build_object('ok', false, 'reason', 'ALREADY_BROKEN'); end if;
  v_contrib := coalesce(v_altar->'contributed', '{}'::jsonb);
  -- the generic clamp loop (jw_contribute_village shape): the demands are data
  for res in select key from jsonb_each(coalesce(p_quotas, '{}'::jsonb)) loop
    v_need := greatest(0, public.jw_num(p_quotas, res) - public.jw_num(v_contrib, res));
    v_have := public.jw_num(v_inv, res);
    v_give := least(v_have, v_need);
    if v_give > 0 then
      v_inv := public.jw_add(v_inv, res, -v_give);
      v_contrib := public.jw_add(v_contrib, res, v_give);
      v_taken := public.jw_add(v_taken, res, v_give);
    end if;
  end loop;
  if v_taken = '{}'::jsonb then return jsonb_build_object('ok', false, 'reason', 'NOTHING_TO_GIVE'); end if;
  for res in select key from jsonb_each(coalesce(p_quotas, '{}'::jsonb)) loop
    if public.jw_num(v_contrib, res) < public.jw_num(p_quotas, res) then v_all := false; end if;
  end loop;
  v_broken := v_all;
  v_altar := jsonb_build_object('broken', v_broken, 'contributed', v_contrib);
  v_wardens := jsonb_set(v_wardens, array[p_warden], coalesce(v_wardens->p_warden, '{}'::jsonb), true);
  v_wardens := jsonb_set(v_wardens, array[p_warden, 'altar'], v_altar, true);
  update public.players set inventory = v_inv, updated_at = now() where world_id = p_world and name = p_who;
  update public.world set wardens = v_wardens where id = p_world;
  return jsonb_build_object('ok', true, 'taken', v_taken, 'inventory', v_inv,
    'altar', v_altar, 'broken', v_broken);
end;
$$;

-- ============================================================ 3. the summon (mutex + totem)
create or replace function public.jw_summon_warden(
  p_world text, p_who text, p_warden text, p_totem text, p_awake_ms bigint, p_dormant_ms bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
        v_fight jsonb; v_wardens jsonb; v_inv jsonb;
begin
  if p_warden !~ '^[a-z][a-z0-9_]{0,31}$' or p_totem !~ '^[a-z][a-z0-9_]{0,31}$' then
    return jsonb_build_object('ok', false, 'reason', 'NO_TOTEM');
  end if;
  select fight, wardens into v_fight, v_wardens from public.world where id = p_world for update;
  v_fight := public.jw_reconcile_fight(v_fight, v_now, p_awake_ms, p_dormant_ms);
  if not coalesce((v_wardens #>> array[p_warden, 'altar', 'broken'])::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'ALTAR_INTACT');
  end if;
  if v_fight is not null then return jsonb_build_object('ok', false, 'reason', 'FIGHT_IN_PROGRESS'); end if;
  select inventory into v_inv from public.players where world_id = p_world and name = p_who for update;
  if v_inv is null or public.jw_num(v_inv, p_totem) < 1 then
    update public.world set fight = null where id = p_world;
    return jsonb_build_object('ok', false, 'reason', 'NO_TOTEM');
  end if;
  v_inv := public.jw_add(v_inv, p_totem, -1);
  v_fight := jsonb_build_object('warden', p_warden, 'summonedAt', v_now, 'engagedAt', null,
    'roster', '[]'::jsonb, 'hp', 0, 'maxHp', 0, 'participants', '[]'::jsonb,
    'knockdowns', '{}'::jsonb, 'lastKnockdownWave', '{}'::jsonb);
  update public.players set inventory = v_inv, updated_at = now() where world_id = p_world and name = p_who;
  update public.world set fight = v_fight where id = p_world;
  return jsonb_build_object('ok', true, 'fight', v_fight - 'knockdowns' - 'lastKnockdownWave', 'inventory', v_inv);
end;
$$;

-- ============================================================ 4. the Realm gate
create or replace function public.jw_open_realm_gate(p_world text, p_who text, p_warden text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_wardens jsonb;
begin
  if p_warden !~ '^[a-z][a-z0-9_]{0,31}$' then return jsonb_build_object('ok', false, 'reason', 'ALREADY_OPEN'); end if;
  select wardens into v_wardens from public.world where id = p_world for update;
  v_wardens := coalesce(v_wardens, '{}'::jsonb);
  if coalesce((v_wardens #>> array[p_warden, 'gateOpen'])::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_OPEN');
  end if;
  v_wardens := jsonb_set(v_wardens, array[p_warden], coalesce(v_wardens->p_warden, '{}'::jsonb), true);
  v_wardens := jsonb_set(v_wardens, array[p_warden, 'gateOpen'], 'true'::jsonb, true);
  update public.world set wardens = v_wardens where id = p_world;
  return jsonb_build_object('ok', true, 'warden', p_warden);
end;
$$;
