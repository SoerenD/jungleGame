-- Dungeons v1 — the Delve (ADR-0007).
--
-- The Delve is host-authoritative and ephemeral: mob HP lives ONLY in the host
-- client's memory and on the Realtime wire, NEVER in Postgres (no write storms).
-- The database therefore learns of a run in exactly two places, both here:
--   1. the one-time `delve_open` world flag (the rubble cleared with an Ancient
--      Pickaxe — a permanent, server-ordered flag exactly like `gate_open`), and
--   2. participation loot, granted to a Player's own inventory at run completion.
-- Nothing else about a run touches the DB.

-- 1. the world flag ------------------------------------------------------------
alter table public.world add column if not exists delve_open boolean not null default false;

-- flip it once, forever (mirrors jw_offer_altar). The client has already checked
-- an Ancient Pickaxe is in hand; this is the atomic, server-ordered commit.
create or replace function public.jw_open_delve(p_who text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_open boolean;
begin
  select delve_open into v_open from public.world where id = 1 for update;
  if v_open then return jsonb_build_object('ok', false, 'reason', 'ALREADY_OPEN'); end if;
  update public.world set delve_open = true where id = 1;
  return jsonb_build_object('ok', true, 'delve_open', true);
end;
$$;

-- 2. participation loot --------------------------------------------------------
-- Merge a loot delta set into the caller's own inventory — the run's ONLY DB
-- write. Trusted-friends posture (ADR-0005): the host tells each participant what
-- they earned and the client claims it; the amounts are not re-derived here.
create or replace function public.jw_claim_delve_loot(p_who text, p_loot jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv jsonb;
begin
  select inventory into v_inv from public.players where name = p_who for update;
  if v_inv is null then return jsonb_build_object('ok', false, 'reason', 'NO_PLAYER'); end if;
  v_inv := public.jw_apply(v_inv, coalesce(p_loot, '{}'::jsonb));
  update public.players set inventory = v_inv, updated_at = now() where name = p_who;
  return jsonb_build_object('ok', true, 'inventory', v_inv);
end;
$$;
