do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'registrations_active_queue_position_null'
      and conrelid = 'public.registrations'::regclass
  ) then
    alter table public.registrations
      drop constraint registrations_active_queue_position_null;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'registrations_standby_queue_position_not_null'
      and conrelid = 'public.registrations'::regclass
  ) then
    alter table public.registrations
      drop constraint registrations_standby_queue_position_not_null;
  end if;
end;
$$;

-- Backfill queue_position for active + standby based on created_at
with ordered as (
  select
    id,
    row_number() over (partition by game_id order by created_at asc, id asc) as rn
  from public.registrations
  where status in ('active', 'standby')
)
update public.registrations r
set queue_position = ordered.rn
from ordered
where r.id = ordered.id;

update public.registrations
set queue_position = null
where status in ('cancelled', 'no_show');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'registrations_active_standby_queue_position_not_null'
      and conrelid = 'public.registrations'::regclass
  ) then
    alter table public.registrations
      add constraint registrations_active_standby_queue_position_not_null
      check (status not in ('active', 'standby') or queue_position is not null)
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'registrations_cancelled_queue_position_null'
      and conrelid = 'public.registrations'::regclass
  ) then
    alter table public.registrations
      add constraint registrations_cancelled_queue_position_null
      check (status not in ('cancelled', 'no_show') or queue_position is null)
      not valid;
  end if;
end;
$$;

create unique index if not exists registrations_game_queue_position_unique_active_standby_idx
  on public.registrations (game_id, queue_position)
  where status in ('active', 'standby');

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
  v_active_count integer;
  v_new_status registration_status;
  v_queue_position integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform pg_advisory_lock(hashtext(_game_id::text));

  begin
    select max_players into v_max_players
    from public.games
    where id = _game_id
    for update;

    if v_max_players is null then
      raise exception 'Game not found';
    end if;

    select * into v_existing
    from public.registrations
    where game_id = _game_id
      and user_id = v_user_id
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
    from public.registrations
    where game_id = _game_id
      and status = 'active';

    if v_active_count < v_max_players then
      v_new_status := 'active';
    else
      v_new_status := 'standby';
    end if;

    select coalesce(max(queue_position), 0) + 1
      into v_queue_position
    from public.registrations
    where game_id = _game_id
      and status in ('active', 'standby');

    if v_existing is not null then
      update public.registrations r
      set r.status = v_new_status,
          check_in_status = 'pending',
          queue_position = v_queue_position,
          updated_at = now()
      where r.id = v_existing.id;

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
  v_cancel_pos integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform pg_advisory_lock(hashtext(_game_id::text));

  begin
    select * into v_existing
    from public.registrations
    where game_id = _game_id
      and user_id = v_user_id
    limit 1
    for update;

    if v_existing is null then
      raise exception 'Registration not found';
    end if;

    v_was_active := v_existing.status = 'active';
    v_cancel_pos := v_existing.queue_position;

    update public.registrations
    set status = 'cancelled',
        check_in_status = 'pending',
        queue_position = null,
        eta_minutes = null,
        updated_at = now()
    where id = v_existing.id;

    cancelled_registration_id := v_existing.id;

    if v_cancel_pos is not null then
      update public.registrations
      set queue_position = queue_position - 1,
          updated_at = now()
      where game_id = _game_id
        and status in ('active', 'standby')
        and queue_position > v_cancel_pos;
    end if;

    select deadline_time into v_deadline
    from public.games
    where id = _game_id;

    if v_was_active then
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

        promoted_registration_id := v_promote.id;
        promoted_user_id := v_promote.user_id;
      end if;
    end if;

    perform pg_advisory_unlock(hashtext(_game_id::text));
    return next;
  exception when others then
    perform pg_advisory_unlock(hashtext(_game_id::text));
    raise;
  end;
end;
$$;

create or replace function public.process_late_swaps(_game_id uuid)
returns table(swaps_count int, swaps jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deadline timestamptz;
  v_swaps jsonb := '[]'::jsonb;
  v_swaps_count int := 0;
  v_late record;
  v_standby record;
  v_late_pos integer;
  v_standby_pos integer;
begin
  if auth.uid() is not null then
    if not public.has_role(auth.uid(), 'admin') then
      raise exception 'Admin privileges required';
    end if;
  end if;

  perform pg_advisory_lock(hashtext(_game_id::text));

  begin
    select deadline_time into v_deadline
    from public.games
    where id = _game_id;

    if v_deadline is not null and now() >= v_deadline then
      loop
        select * into v_late
        from public.registrations
        where game_id = _game_id
          and status = 'active'
          and check_in_status is distinct from 'checked_in'
        order by queue_position desc nulls last, created_at desc
        limit 1
        for update;

        select * into v_standby
        from public.registrations
        where game_id = _game_id
          and status = 'standby'
          and check_in_status = 'checked_in'
        order by queue_position asc nulls last
        limit 1
        for update;

        if v_late is null or v_standby is null then
          exit;
        end if;

        v_late_pos := v_late.queue_position;
        v_standby_pos := v_standby.queue_position;

        update public.registrations
        set status = 'active',
            queue_position = v_late_pos,
            updated_at = now()
        where id = v_standby.id;

        update public.registrations
        set status = 'standby',
            queue_position = v_standby_pos,
            updated_at = now()
        where id = v_late.id;

        v_swaps_count := v_swaps_count + 1;
        v_swaps := v_swaps || jsonb_build_array(
          jsonb_build_object(
            'promoted_user_id', v_standby.user_id,
            'demoted_user_id', v_late.user_id,
            'promoted_registration_id', v_standby.id,
            'demoted_registration_id', v_late.id,
            'game_id', _game_id
          )
        );
      end loop;
    end if;

    swaps_count := v_swaps_count;
    swaps := v_swaps;

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

    select id, user_id, status, check_in_status, eta_minutes, queue_position, created_at, updated_at
    into id, user_id, status, check_in_status, eta_minutes, queue_position, created_at, updated_at
    from public.registrations
    where id = v_registration.id;

    perform pg_advisory_unlock(hashtext(_game_id::text));
    return next;
  exception when others then
    perform pg_advisory_unlock(hashtext(_game_id::text));
    raise;
  end;
end;
$$;
