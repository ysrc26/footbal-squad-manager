create or replace function public.resequence_queue_positions(_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift integer;
begin
  select coalesce(max(r.queue_position), 0) + 1000000
    into v_shift
  from public.registrations r
  where r.game_id = _game_id
    and r.status in ('active', 'standby');

  with ordered as (
    select
      r.id,
      row_number() over (
        order by r.queue_position asc nulls last, r.created_at asc, r.id asc
      ) as rn
    from public.registrations r
    where r.game_id = _game_id
      and r.status in ('active', 'standby')
  ),
  shifted as (
    update public.registrations r
    set queue_position = r.queue_position + v_shift,
        updated_at = now()
    from ordered
    where r.id = ordered.id
    returning ordered.id as reg_id, ordered.rn as rn
  )
  update public.registrations r
  set queue_position = shifted.rn,
      updated_at = now()
  from shifted
  where r.id = shifted.reg_id;
end;
$$;

do $$
declare
  v_game record;
begin
  for v_game in select g.id from public.games g loop
    perform public.resequence_queue_positions(v_game.id);
  end loop;
end;
$$;
