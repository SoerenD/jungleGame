-- Village identity + memory (ADR-0013): the Banner names the Village and picks a
-- crest hue; the Well keeps a Chronicle of short lines. Both live as new keys on
-- the world.village jsonb — purely ADDITIVE, no schema change, safe mid-play.

create or replace function public.jw_village_set_name(p_name text, p_crest int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  update public.world
    set village = jsonb_set(
      jsonb_set(coalesce(village, '{}'::jsonb), '{name}', to_jsonb(left(coalesce(p_name, ''), 24)), true),
      '{crest}', to_jsonb(coalesce(p_crest, 0)), true)
    where id = 1
    returning village into v;
  return jsonb_build_object('village', v);
end;
$$;

create or replace function public.jw_village_add_note(p_who text, p_text text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  update public.world
    set village = jsonb_set(
      coalesce(village, '{}'::jsonb), '{chronicle}',
      coalesce(village->'chronicle', '[]'::jsonb) || to_jsonb(left(coalesce(p_who, '?') || ': ' || coalesce(p_text, ''), 80)),
      true)
    where id = 1
    returning village into v;
  return jsonb_build_object('village', v);
end;
$$;

-- no-security (see 0001): anon calls every gameplay RPC
grant execute on function public.jw_village_set_name(text, int) to anon, authenticated;
grant execute on function public.jw_village_add_note(text, text) to anon, authenticated;
