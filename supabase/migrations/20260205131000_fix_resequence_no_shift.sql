create or replace function public.resequence_queue_positions(_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with ordered as (
    select
      r.id,
      row_number() over (
        order by r.queue_position asc nulls last, r.created_at asc, r.id asc
      ) as rn
    from public.registrations r
    where r.game_id = _game_id
      and r.status in ('active', 'standby')
  )
  update public.registrations r
  set queue_position = ordered.rn,
      updated_at = now()
  from ordered
  where r.id = ordered.id;
end;
$$;

create or replace function public.cancel_registration_for_game(_game_id uuid)
returns table(cancelled_registration_id uuid, promoted_registration_id uuid, promoted_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing record;
  v_promote record;
  v_was_active boolean := false;
  v_deadline timestamptz;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform pg_advisory_lock(hashtext(_game_id::text));

  begin
    select * into v_existing
    from public.registrations r
    where r.game_id = _game_id
      and r.user_id = v_user_id
    limit 1
    for update;

    if v_existing is null then
      raise exception 'Registration not found';
    end if;

    v_was_active := v_existing.status = 'active';

    update public.registrations r
    set status = 'cancelled',
        check_in_status = 'pending',
        queue_position = null,
        eta_minutes = null,
        updated_at = now()
    where r.id = v_existing.id;

    cancelled_registration_id := v_existing.id;

    select g.deadline_time into v_deadline
    from public.games g
    where g.id = _game_id;

    if v_was_active then
      if v_deadline is not null and now() >= v_deadline then
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

      if v_promote is not null then
        update public.registrations r
        set status = 'active',
            updated_at = now()
        where r.id = v_promote.id;

        promoted_registration_id := v_promote.id;
        promoted_user_id := v_promote.user_id;
      end if;
    end if;

    perform public.resequence_queue_positions(_game_id);

    perform pg_advisory_unlock(hashtext(_game_id::text));
    return next;
  exception when others then
    perform pg_advisory_unlock(hashtext(_game_id::text));
    raise;
  end;
end;
$$;

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
  v_promote record;
  v_need_resequence boolean := false;
begin
  if auth.uid() is not null then
    if not public.has_role(auth.uid(), 'admin') then
      raise exception 'Admin privileges required';
    end if;
  end if;

  perform pg_advisory_lock(hashtext(_game_id::text));

  begin
    select * into v_registration
    from public.registrations r
    where r.game_id = _game_id
      and r.user_id = _user_id
    limit 1
    for update;

    if v_registration is null then
      raise exception 'Registration not found';
    end if;

    select p.full_name into v_full_name
    from public.profiles p
    where p.id = v_registration.user_id;

    if v_full_name is null or v_full_name not like 'TEST_%' then
      raise exception 'Test player not found';
    end if;

    if _action = 'checkin_on' then
      update public.registrations r
      set check_in_status = 'checked_in',
          updated_at = now()
      where r.id = v_registration.id;
    elsif _action = 'checkin_off' then
      update public.registrations r
      set check_in_status = 'pending',
          updated_at = now()
      where r.id = v_registration.id;
    elsif _action = 'late_set' then
      if _eta_minutes is null then
        raise exception 'eta_minutes is required for late_set';
      end if;
      update public.registrations r
      set eta_minutes = _eta_minutes,
          check_in_status = 'pending',
          updated_at = now()
      where r.id = v_registration.id;
    elsif _action = 'late_clear' then
      update public.registrations r
      set eta_minutes = null,
          updated_at = now()
      where r.id = v_registration.id;
    elsif _action = 'cancel' then
      if v_registration.status <> 'cancelled' then
        update public.registrations r
        set status = 'cancelled',
            check_in_status = 'pending',
            queue_position = null,
            eta_minutes = null,
            updated_at = now()
        where r.id = v_registration.id;

        v_need_resequence := true;

        if v_registration.status = 'active' then
          select g.deadline_time into v_deadline
          from public.games g
          where g.id = _game_id;

          if v_deadline is not null and now() >= v_deadline then
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

          if v_promote is not null then
            update public.registrations r
            set status = 'active',
                updated_at = now()
            where r.id = v_promote.id;
          end if;
        end if;
      end if;
    else
      raise exception 'Invalid action';
    end if;

    if v_need_resequence then
      perform public.resequence_queue_positions(_game_id);
    end if;

    return query
    select
      r.id,
      r.user_id,
      r.status,
      r.check_in_status,
      r.eta_minutes,
      r.queue_position,
      r.created_at,
      r.updated_at
    from public.registrations r
    where r.id = v_registration.id;

    perform pg_advisory_unlock(hashtext(_game_id::text));
    return;
  exception when others then
    perform pg_advisory_unlock(hashtext(_game_id::text));
    raise;
  end;
end;
$$;
