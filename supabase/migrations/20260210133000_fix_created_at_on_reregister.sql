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
  v_active_count integer;
  v_standby_count integer;
  v_total_count integer;
  v_new_status registration_status;
  v_queue_position integer;
  v_deadline timestamptz;
  v_after_deadline boolean := false;
  v_promote record;
  v_wave1 timestamptz;
  v_wave2 timestamptz;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform pg_advisory_lock(hashtext(_game_id::text));

  begin
    select g.max_players, g.max_standby, g.deadline_time, g.wave1_registration_opens_at, g.registration_opens_at
      into v_max_players, v_max_standby, v_deadline, v_wave1, v_wave2
    from public.games g
    where g.id = _game_id
    for update;

    if v_max_players is null then
      raise exception 'Game not found';
    end if;

    v_max_standby := coalesce(v_max_standby, 0);
    v_after_deadline := v_deadline is not null and v_now >= v_deadline;

    if v_wave1 is not null and v_now < v_wave1 then
      raise exception 'Registration not open yet';
    end if;

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
    while v_active_count < v_max_players loop
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

    select count(*) into v_active_count
    from public.registrations r
    where r.game_id = _game_id
      and r.status = 'active';

    select count(*) into v_standby_count
    from public.registrations r
    where r.game_id = _game_id
      and r.status = 'standby';

    v_total_count := v_active_count + v_standby_count;

    if v_total_count >= v_max_players + v_max_standby then
      raise exception 'Registration is full';
    end if;

    if v_active_count < v_max_players then
      v_new_status := 'active';
    else
      v_new_status := 'standby';
    end if;

    select coalesce(max(r.queue_position), 0) + 1
      into v_queue_position
    from public.registrations r
    where r.game_id = _game_id
      and r.status in ('active', 'standby');

    insert into public.registrations (
      game_id,
      user_id,
      status,
      check_in_status,
      queue_position,
      is_late,
      eta_minutes,
      is_early_finish,
      early_finish_time
    )
    values (
      _game_id,
      v_user_id,
      v_new_status,
      'pending',
      v_queue_position,
      false,
      null,
      false,
      null
    )
    on conflict (user_id, game_id) do update
      set status = excluded.status,
          check_in_status = 'pending',
          queue_position = excluded.queue_position,
          is_late = false,
          eta_minutes = null,
          is_early_finish = false,
          early_finish_time = null,
          created_at = case
            when public.registrations.status = 'cancelled' then now()
            else public.registrations.created_at
          end,
          updated_at = now()
    returning id into registration_id;

    perform public.resequence_queue_positions(_game_id);

    select r.id, r.status, r.queue_position
      into registration_id, status, queue_position
    from public.registrations r
    where r.game_id = _game_id
      and r.user_id = v_user_id
      and r.status in ('active', 'standby')
    limit 1;

    perform pg_advisory_unlock(hashtext(_game_id::text));
    return next;
  exception when others then
    perform pg_advisory_unlock(hashtext(_game_id::text));
    raise;
  end;
end;
$$;
