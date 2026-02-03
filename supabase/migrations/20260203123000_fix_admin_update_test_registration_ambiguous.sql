create or replace function public.admin_update_test_registration(
  _game_id uuid,
  _user_id uuid,
  _action text,
  _eta_minutes integer default null
)
returns table(
  id uuid,
  user_id uuid,
  status registration_status,
  check_in_status check_in_status,
  eta_minutes integer,
  queue_position integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration record;
  v_full_name text;
  v_deadline timestamptz;
  v_cancel_pos integer;
  v_promote record;
begin
  if auth.uid() is not null then
    if not public.has_role(auth.uid(), 'admin') then
      raise exception 'Admin privileges required';
    end if;
  end if;

  perform pg_advisory_lock(hashtext(_game_id::text));

  begin
    select * into v_registration
    from public.registrations
    where game_id = _game_id
      and user_id = _user_id
    limit 1
    for update;

    if v_registration is null then
      raise exception 'Registration not found';
    end if;

    select full_name into v_full_name
    from public.profiles
    where id = v_registration.user_id;

    if v_full_name is null or v_full_name not like 'TEST_%' then
      raise exception 'Test player not found';
    end if;

    if _action = 'checkin_on' then
      update public.registrations
      set check_in_status = 'checked_in',
          updated_at = now()
      where id = v_registration.id;
    elsif _action = 'checkin_off' then
      update public.registrations
      set check_in_status = 'pending',
          updated_at = now()
      where id = v_registration.id;
    elsif _action = 'late_set' then
      if _eta_minutes is null then
        raise exception 'eta_minutes is required for late_set';
      end if;
      update public.registrations
      set eta_minutes = _eta_minutes,
          check_in_status = 'pending',
          updated_at = now()
      where id = v_registration.id;
    elsif _action = 'late_clear' then
      update public.registrations
      set eta_minutes = null,
          updated_at = now()
      where id = v_registration.id;
    elsif _action = 'cancel' then
      if v_registration.status <> 'cancelled' then
        v_cancel_pos := v_registration.queue_position;

        update public.registrations
        set status = 'cancelled',
            check_in_status = 'pending',
            queue_position = null,
            eta_minutes = null,
            updated_at = now()
        where id = v_registration.id;

        if v_cancel_pos is not null then
          update public.registrations
          set queue_position = queue_position - 1,
              updated_at = now()
          where game_id = _game_id
            and status in ('active', 'standby')
            and queue_position > v_cancel_pos;
        end if;

        if v_registration.status = 'active' then
          select deadline_time into v_deadline
          from public.games
          where id = _game_id;

          if v_deadline is not null and now() >= v_deadline then
            select * into v_promote
            from public.registrations
            where game_id = _game_id
              and status = 'standby'
              and check_in_status = 'checked_in'
            order by queue_position asc
            limit 1
            for update;
          else
            select * into v_promote
            from public.registrations
            where game_id = _game_id
              and status = 'standby'
            order by queue_position asc
            limit 1
            for update;
          end if;

          if v_promote is not null then
            update public.registrations
            set status = 'active',
                updated_at = now()
            where id = v_promote.id;
          end if;
        end if;
      end if;
    else
      raise exception 'Invalid action';
    end if;

    select
      r.id,
      r.user_id,
      r.status,
      r.check_in_status,
      r.eta_minutes,
      r.queue_position,
      r.created_at,
      r.updated_at
    into id, user_id, status, check_in_status, eta_minutes, queue_position, created_at, updated_at
    from public.registrations r
    where r.id = v_registration.id;

    perform pg_advisory_unlock(hashtext(_game_id::text));
    return next;
  exception when others then
    perform pg_advisory_unlock(hashtext(_game_id::text));
    raise;
  end;
end;
$$;
