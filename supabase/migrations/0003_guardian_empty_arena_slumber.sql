-- Guardian: end a wiped fight promptly (ADR-0004 wipe, empty-arena grace).
--
-- Before this, an ENGAGED Guardian only re-slumbered at `engagedAt + awake` (the
-- full ~5-minute window) or on victory. So once the WHOLE roster Exhausted — no
-- one left in the arena, no one able to damage it — the fight kept "running" for
-- the rest of the window with nobody in it (visible bug: solo Exhaustion never
-- ends the fight).
--
-- Fix: when the knockdown that Exhausts the LAST active fighter lands, stamp
-- `emptySlumberAt = now + p_empty_ms` on the fight row. `jw_reconcile_fight` then
-- ends the fight at that deadline too — unbeaten, totem spent — whichever comes
-- first. Purely additive: a fight that is never wiped behaves exactly as before
-- (the key is simply absent → treated as null).

-- 1. reconcile also honours the empty-arena deadline -------------------------
create or replace function public.jw_reconcile_fight(f jsonb, v_now bigint, p_awake bigint, p_dormant bigint)
returns jsonb language plpgsql immutable set search_path = public as $$
begin
  if f is null then return null; end if;
  if (f->>'engagedAt') is null then
    if v_now >= (f->>'summonedAt')::bigint + p_dormant then return null; else return f; end if;
  else
    -- engaged: slumber at the awake-window deadline OR early once the arena has
    -- emptied (whole roster Exhausted); either way HP is still > 0 (unbeaten)
    if (f->>'hp')::int > 0 and (
         v_now >= (f->>'engagedAt')::bigint + p_awake
         or ((f->>'emptySlumberAt') is not null and v_now >= (f->>'emptySlumberAt')::bigint)
       ) then
      return null;
    else
      return f;
    end if;
  end if;
end;
$$;

-- 2. jw_knockdown stamps emptySlumberAt when the roster fully Exhausts ---------
-- (new signature: gains p_empty_ms; drop the old 7-arg overload first)
drop function if exists public.jw_knockdown(text, int, int, jsonb, int, bigint, bigint);

create or replace function public.jw_knockdown(
  p_who text, p_wave int, p_exhaustion_n int, p_spawn jsonb, p_tile int,
  p_awake_ms bigint, p_dormant_ms bigint, p_empty_ms bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
        v_fight jsonb; v_wake jsonb; v_at_hammock boolean; v_cur int; v_new int; v_exhausted boolean; v_wiped boolean;
begin
  select fight into v_fight from public.world where id = 1 for update;
  v_fight := public.jw_reconcile_fight(v_fight, v_now, p_awake_ms, p_dormant_ms);
  if v_fight is null then update public.world set fight = null where id = 1; return jsonb_build_object('ok', false, 'reason', 'NO_FIGHT'); end if;
  v_cur := coalesce((v_fight #>> array['knockdowns', p_who])::int, 0);
  if (v_fight->>'engagedAt') is null or not ((v_fight->'roster') @> jsonb_build_array(p_who)) or v_cur >= p_exhaustion_n then
    return jsonb_build_object('ok', false, 'reason', 'NOT_IN_DANGER');
  end if;
  select wake_point into v_wake from public.players where name = p_who;
  v_at_hammock := v_wake is not null;
  if v_wake is null then v_wake := p_spawn; end if;
  if coalesce((v_fight #>> array['lastKnockdownWave', p_who])::int, -1) = p_wave then
    return jsonb_build_object('ok', true, 'knockdowns', v_cur, 'exhausted', false, 'wake', v_wake, 'atHammock', v_at_hammock);
  end if;
  v_new := v_cur + 1;
  v_exhausted := v_new >= p_exhaustion_n;
  v_fight := jsonb_set(v_fight, array['lastKnockdownWave', p_who], to_jsonb(p_wave), true);
  v_fight := jsonb_set(v_fight, array['knockdowns', p_who], to_jsonb(v_new), true);
  if v_exhausted then
    update public.players set x = ((v_wake->>'tx')::double precision + 0.5) * p_tile,
                              y = ((v_wake->>'ty')::double precision + 0.5) * p_tile, updated_at = now() where name = p_who;
    -- arena empty? every roster member is now Exhausted → no one left to fight.
    -- Stamp the re-slumber deadline once (reconcile ends the fight at it).
    v_wiped := not exists (
      select 1 from jsonb_array_elements_text(v_fight->'roster') as r(name)
      where coalesce((v_fight #>> array['knockdowns', r.name])::int, 0) < p_exhaustion_n
    );
    if v_wiped and (v_fight->>'emptySlumberAt') is null then
      v_fight := jsonb_set(v_fight, '{emptySlumberAt}', to_jsonb(v_now + p_empty_ms), true);
    end if;
  end if;
  update public.world set fight = v_fight where id = 1;
  return jsonb_build_object('ok', true, 'knockdowns', v_new, 'exhausted', v_exhausted,
    'wake', v_wake, 'atHammock', v_at_hammock, 'emptySlumberAt', v_fight->'emptySlumberAt');
end;
$$;
