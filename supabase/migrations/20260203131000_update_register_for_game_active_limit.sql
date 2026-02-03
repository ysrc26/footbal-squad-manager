create or replace function public.register_for_game(_game_id uuid)
returns table(registration_id uuid, status registration_status, queue_position integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing record;
  v_max_players integer;
  v_max_standby integer;
  v_active_limit integer;
  v_active_count integer;
  v_new_status registration_status;
  v_queue_position integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform pg_advisory_lock(hashtext(_game_id::text));

  begin
    select g.max_players, g.max_standby
      into v_max_players, v_max_standby
    from public.games g
    where g.id = _game_id
    for update;

    if v_max_players is null then
      raise exception 'Game not found';
    end if;

    v_active_limit := greatest(0, v_max_players - coalesce(v_max_standby, 0));

    select * into v_existing
    from public.registrations r
    where r.game_id = _game_id
      and r.user_id = v_user_id
    limit 1
    for update;

    if v_existing is not null and v_existing.status in ('active', 'standby') then
      registration_id := v_existing.id;
      status := v_existing.status;
      queue_position := v_existing.queue_position;
      perform pg_advisory_unlock(hashtext(_game_id::text));
      return next;
    end if;

    select count(*) into v_active_count
    from public.registrations r
    where r.game_id = _game_id
      and r.status = 'active';

    if v_active_count < v_active_limit then
      v_new_status := 'active';
    else
      v_new_status := 'standby';
    end if;

    select coalesce(max(r.queue_position), 0) + 1
      into v_queue_position
    from public.registrations r
    where r.game_id = _game_id
      and r.status in ('active', 'standby');

    if v_existing is not null then
      update public.registrations
      set status = v_new_status,
          check_in_status = 'pending',
          queue_position = v_queue_position,
          updated_at = now()
      where id = v_existing.id;

      registration_id := v_existing.id;
    else
      insert into public.registrations (game_id, user_id, status, check_in_status, queue_position)
      values (_game_id, v_user_id, v_new_status, 'pending', v_queue_position)
      returning id into registration_id;
    end if;

    status := v_new_status;
    queue_position := v_queue_position;

    perform pg_advisory_unlock(hashtext(_game_id::text));
    return next;
  exception when others then
    perform pg_advisory_unlock(hashtext(_game_id::text));
    raise;
  end;
end;
$$;
