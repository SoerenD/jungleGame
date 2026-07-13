-- 0015 — the Echoes (ADR-0017 rung 2): the Hushdark's signature mechanic needs
-- the first piece of SHARED, PERSISTED player state on the Warden ladder.
--
-- Unlike the Tide (rung 1), which is a pure client f(clock) with NO server state,
-- an echo is a RECORDED movement loop: a shade of a Player that walks a captured
-- path forever. Recordings must persist AND be shared, because a multi-pedestal
-- vault is opened by layering the shades of ABSENT friends (async co-op) — so the
-- shades outlive their author's session and any Player must be able to list them.
-- Replay itself stays a pure f(loop-phase) client-side (content/echoes.ts,
-- ADR-0002); the DB only stores the raw recording + a once-per-week vault claim.
--
-- Trust posture (ADR-0005, no auth): like every other RPC, the client passes its
-- tuning and the server is the generic executor. Recording starts are QUANTISED
-- server-side to `serverNow mod period` so every shade's loop phase aligns and
-- overlaid shades stay in sync (handover §Quantisierung). Anti-parking: a shade
-- must carry real movement to be useful, and a vault opens only while EVERY
-- pedestal is covered at the same instant — both are enforced in the pure client
-- replay; the server guards only against empty/junk recordings.
--
-- Presence is NOT used for sync (the phx_closed rate-limit): shades are LISTED via
-- jw_echo_list (an RPC read), never presence-tracked.
--
-- Deploy order: this migration ships BEFORE any client that calls jw_echo_* (the
-- live DB rejects unknown RPC shapes). Writing this file does not touch the live
-- DB — deployment is a separate step, run on a throwaway world, never 'default'.

-- ============================================================ 1. the recording rows
-- One row per shade, keyed by a client-chosen ghost id (e.g. "<who>#<slot>") so a
-- Player may keep a small handful of shades. period_ms is stored so replay uses
-- the exact loop length the shade was captured at (dev/prod periods differ).
create table if not exists public.echo_ghosts (
  world_id    text        not null default 'default',
  ghost_id    text        not null,
  who         text        not null,
  recorded_at bigint      not null,               -- SERVER-quantised to serverNow mod period_ms
  period_ms   bigint      not null,
  samples     jsonb       not null default '[]'::jsonb,
  -- 'echo' = an ordinary looping shade (cycles through a Player's few slots);
  -- 'greeting' = a permanent, named shade left as a mastery mark for others
  kind        text        not null default 'echo',
  updated_at  timestamptz not null default now(),
  primary key (world_id, ghost_id)
);

create index if not exists echo_ghosts_world_idx
  on public.echo_ghosts (world_id, updated_at desc);

-- ============================================================ 3. jw_echo_record — spend a charm, quantise, upsert
-- Captures (or replaces) a shade. Spends one Chime Charm (ADR-0017 §7 — the
-- renewable hushsteel sink that makes recording repeatable demand). Quantises the
-- start server-side so loop phases align. Guards against junk: a plausible
-- id/period and at least two samples (a shade with fewer than two points has no
-- path to walk). The movement-magnitude (anti-parking) check lives in the client
-- replay, same trust model as the pack cap.
create or replace function public.jw_echo_record(
  p_world text, p_who text, p_ghost text, p_period bigint, p_samples jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
        v_start bigint; v_inv jsonb;
begin
  if length(coalesce(p_ghost, '')) < 1 or length(p_ghost) > 96 then
    return jsonb_build_object('ok', false, 'reason', 'BAD_GHOST');
  end if;
  if p_period < 1000 or p_period > 600000 then
    return jsonb_build_object('ok', false, 'reason', 'BAD_PERIOD');
  end if;
  if jsonb_typeof(p_samples) <> 'array' or jsonb_array_length(p_samples) < 2 then
    return jsonb_build_object('ok', false, 'reason', 'NOTHING');
  end if;
  if jsonb_array_length(p_samples) > 400 then
    return jsonb_build_object('ok', false, 'reason', 'TOO_MANY');
  end if;
  select inventory into v_inv from public.players where world_id = p_world and name = p_who for update;
  if v_inv is null then return jsonb_build_object('ok', false, 'reason', 'NO_PLAYER'); end if;
  if public.jw_num(v_inv, 'chime_charm') < 1 then return jsonb_build_object('ok', false, 'reason', 'NO_CHARM'); end if;
  v_inv := public.jw_add(v_inv, 'chime_charm', -1);            -- spend the charm (§7 renewable sink)
  v_start := v_now - (v_now % p_period);                       -- QUANTISE to serverNow mod period
  insert into public.echo_ghosts(world_id, ghost_id, who, recorded_at, period_ms, samples)
    values (p_world, p_ghost, p_who, v_start, p_period, p_samples)
    on conflict (world_id, ghost_id) do update
      set who = excluded.who, recorded_at = excluded.recorded_at,
          period_ms = excluded.period_ms, samples = excluded.samples, updated_at = now();
  update public.players set inventory = v_inv, updated_at = now() where world_id = p_world and name = p_who;
  return jsonb_build_object('ok', true, 'inventory', v_inv, 'ghost', jsonb_build_object(
    'ghostId', p_ghost, 'who', p_who, 'recordedAt', v_start, 'periodMs', p_period, 'samples', p_samples));
end;
$$;

-- ============================================================ 4. jw_echo_list — the RPC read (never presence)
-- Lists every shade in the world so any Player can overlay absent friends' shades.
create or replace function public.jw_echo_list(p_world text)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'ghostId', ghost_id, 'who', who, 'recordedAt', recorded_at,
      'periodMs', period_ms, 'samples', samples, 'kind', kind)
    order by updated_at desc), '[]'::jsonb)
  from public.echo_ghosts where world_id = p_world;
$$;

-- ============================================================ 5b. jw_echo_greet — leave a permanent greeting shade
-- The mastery mark: one PERMANENT, named shade per Player (fixed id "<who>@greet")
-- that never cycles out and that everyone — especially new arrivals — finds walking
-- the Hushdark. No charm (it is the reward for opening the deep vault; the client
-- gates it behind that). Same quantise + sample guards as a recording.
create or replace function public.jw_echo_greet(p_world text, p_who text, p_period bigint, p_samples jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
        v_start bigint; v_ghost text := left(p_who, 80) || '@greet';
begin
  if p_period < 1000 or p_period > 600000 then return jsonb_build_object('ok', false, 'reason', 'BAD_PERIOD'); end if;
  if jsonb_typeof(p_samples) <> 'array' or jsonb_array_length(p_samples) < 2 then
    return jsonb_build_object('ok', false, 'reason', 'NOTHING'); end if;
  if jsonb_array_length(p_samples) > 400 then return jsonb_build_object('ok', false, 'reason', 'TOO_MANY'); end if;
  v_start := v_now - (v_now % p_period);
  insert into public.echo_ghosts(world_id, ghost_id, who, recorded_at, period_ms, samples, kind)
    values (p_world, v_ghost, p_who, v_start, p_period, p_samples, 'greeting')
    on conflict (world_id, ghost_id) do update
      set recorded_at = excluded.recorded_at, period_ms = excluded.period_ms,
          samples = excluded.samples, kind = 'greeting', updated_at = now();
  return jsonb_build_object('ok', true, 'ghost', jsonb_build_object(
    'ghostId', v_ghost, 'who', p_who, 'recordedAt', v_start, 'periodMs', p_period, 'samples', p_samples, 'kind', 'greeting'));
end;
$$;

-- ============================================================ 5. jw_echo_forget — drop one's own shade
-- A Player may clear a shade (dismantle-refund parity: no orphaned rows, and a
-- pedestal never stays trivially held by a stale recording).
create or replace function public.jw_echo_forget(p_world text, p_who text, p_ghost text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  delete from public.echo_ghosts where world_id = p_world and ghost_id = p_ghost;
  return jsonb_build_object('ok', true, 'ghostId', p_ghost);
end;
$$;

-- ============================================================ 8. the Reverberant (puzzle-summoned boss)
-- Solving the 3-pedestal Echoes puzzle summons a hidden boss (the Reverberant)
-- that rises in the court. NO altar, NO totem — the puzzle IS the summon. Keeps
-- the one-fight mutex + the reconcile (jw_reconcile_fight, migration 0014). Its
-- reward flows through jw_reverb_claim on defeat, not a totem/altar Offering.
create or replace function public.jw_summon_reverb(p_world text, p_who text, p_awake_ms bigint, p_dormant_ms bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; v_fight jsonb;
begin
  select fight into v_fight from public.world where id = p_world for update;
  v_fight := public.jw_reconcile_fight(v_fight, v_now, p_awake_ms, p_dormant_ms);
  if v_fight is not null then return jsonb_build_object('ok', false, 'reason', 'FIGHT_IN_PROGRESS'); end if;
  v_fight := jsonb_build_object('warden', 'reverb', 'summonedAt', v_now, 'engagedAt', null,
    'roster', '[]'::jsonb, 'hp', 0, 'maxHp', 0, 'participants', '[]'::jsonb,
    'knockdowns', '{}'::jsonb, 'lastKnockdownWave', '{}'::jsonb);
  update public.world set fight = v_fight where id = p_world;
  return jsonb_build_object('ok', true, 'fight', v_fight - 'knockdowns' - 'lastKnockdownWave');
end;
$$;

-- the once-per-(player, week) weekly-clear ledger (the depth_records only-raise idiom
-- generalised per-player so every participant is paid their weekly reward exactly once)
create table if not exists public.reverb_clears (
  world_id   text        not null default 'default',
  who        text        not null,
  week       bigint      not null,
  cleared_at timestamptz not null default now(),
  primary key (world_id, who, week)
);

-- one row the FIRST time a Player ever fells the Reverberant — gates the one-time
-- epic-helm + reliquary. Its OWN dedicated ledger (PK per player) so this marquee
-- reward is granted exactly once and can never be pre-empted by another path.
create table if not exists public.reverb_trophies (
  world_id   text        not null default 'default',
  who        text        not null,
  granted_at timestamptz not null default now(),
  primary key (world_id, who)
);

-- jw_reverb_claim — the participation reward on the Reverberant's defeat. FIRST-ever
-- clear (reverb_trophies, idempotent): the epic Reverberant Helm + the Echo Reliquary.
-- Each WEEK (reverb_clears, idempotent per who+week): an Echo Sigil + resources. Both
-- guards are insert-on-conflict-do-nothing, so a re-claim / double-click pays nothing.
create or replace function public.jw_reverb_claim(p_world text, p_who text, p_week bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv jsonb; v_first boolean; v_weekly boolean; v_loot jsonb := '{}'::jsonb;
begin
  if p_week < 0 then return jsonb_build_object('ok', false, 'reason', 'BAD_WEEK'); end if;
  select inventory into v_inv from public.players where world_id = p_world and name = p_who for update;
  if v_inv is null then return jsonb_build_object('ok', false, 'reason', 'NO_PLAYER'); end if;
  insert into public.reverb_trophies(world_id, who) values (p_world, p_who)
    on conflict (world_id, who) do nothing returning true into v_first;
  if coalesce(v_first, false) then
    v_loot := public.jw_add(v_loot, 'hushsteel_helm_epic', 1);
    v_loot := public.jw_add(v_loot, 'hushdark_reliquary', 1);
  end if;
  insert into public.reverb_clears(world_id, who, week) values (p_world, p_who, p_week)
    on conflict (world_id, who, week) do nothing returning true into v_weekly;
  if coalesce(v_weekly, false) then
    v_loot := public.jw_add(v_loot, 'echo_sigil', 1);
    v_loot := public.jw_add(v_loot, 'echo_crystal', 8);
    v_loot := public.jw_add(v_loot, 'hushsteel', 2);
  end if;
  v_inv := public.jw_apply(v_inv, v_loot);
  update public.players set inventory = v_inv, updated_at = now() where world_id = p_world and name = p_who;
  return jsonb_build_object('ok', true, 'inventory', v_inv, 'loot', v_loot,
    'firstEver', coalesce(v_first, false), 'weekly', coalesce(v_weekly, false));
end;
$$;

-- new functions created after 0010's blanket grant need their own execute grant
grant execute on all functions in schema public to anon, authenticated;
