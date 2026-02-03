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
  v_standby_count integer;
  v_new_status registration_status;
  v_queue_position integer;
  v_deadline timestamptz;
  v_after_deadline boolean := false;
  v_promote record;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform pg_advisory_lock(hashtext(_game_id::text));

  begin
    select g.max_players, g.max_standby, g.deadline_time
      into v_max_players, v_max_standby, v_deadline
    from public.games g
    where g.id = _game_id
    for update;

    if v_max_players is null then
      raise exception 'Game not found';
    end if;

    v_active_limit := greatest(0, v_max_players - coalesce(v_max_standby, 0));
    v_after_deadline := v_deadline is not null and now() >= v_deadline;

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

    -- Promote standby into active slots before admitting a new registrant
    while v_active_count < v_active_limit loop
      if v_after_deadline then
        select * into v_promote
        from public.registrations r
        where r.game_id = _game_id
          and r.status = 'standby'
          and r.check_in_status = 'checked_in'
        order by r.queue_position asc
        limit 1
        for update;
      else
        select * into v_promote
        from public.registrations r
        where r.game_id = _game_id
          and r.status = 'standby'
        order by r.queue_position asc
        limit 1
        for update;
      end if;

      if v_promote is null then
        exit;
      end if;

      update public.registrations
      set status = 'active',
          updated_at = now()
      where id = v_promote.id;

      v_active_count := v_active_count + 1;
    end loop;

    select count(*) into v_standby_count
    from public.registrations r
    where r.game_id = _game_id
      and r.status = 'standby';

    if v_standby_count > 0 then
      v_new_status := 'standby';
    elsif v_active_count < v_active_limit then
      v_new_status := 'active';
    else
      v_new_status := 'standby';
    end if;

    select coalesce(max(r.queue_position), 0) + 1
      into v_queue_position
    from public.registrations r
    where r.game_id = _game_id
      and r.status in ('active', 'standby');

    insert into public.registrations (game_id, user_id, status, check_in_status, queue_position)
    values (_game_id, v_user_id, v_new_status, 'pending', v_queue_position)
    on conflict (user_id, game_id) do update
      set status = excluded.status,
          check_in_status = 'pending',
          queue_position = excluded.queue_position,
          updated_at = now()
    returning id into registration_id;

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
