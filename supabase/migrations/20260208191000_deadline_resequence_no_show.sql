create or replace function public.resequence_queue_positions(_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_players integer;
  v_deadline timestamptz;
  v_wave2 timestamptz;
  v_after_deadline boolean := false;
  v_before_wave2 boolean := false;
begin
  select g.max_players, g.deadline_time, g.registration_opens_at
    into v_max_players, v_deadline, v_wave2
  from public.games g
  where g.id = _game_id
  for update;

  if v_max_players is null then
    raise exception 'Game not found';
  end if;

  v_after_deadline := v_deadline is not null and now() >= v_deadline;
  v_before_wave2 := v_wave2 is not null and now() < v_wave2;

  with ordered as (
    select
      r.id,
      row_number() over (
        order by
          case
            when v_after_deadline then (r.check_in_status = 'checked_in')::int
            when v_before_wave2 then (coalesce(p.is_resident, false))::int
            else 0
          end desc,
          r.created_at asc,
          r.id asc
      ) as rn
    from public.registrations r
    left join public.profiles p on p.id = r.user_id
    where r.game_id = _game_id
      and r.status in ('active', 'standby')
  ),
  shifted as (
    update public.registrations r
    set queue_position = -ordered.rn,
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

  update public.registrations r
  set status = (
        case when r.queue_position <= v_max_players
          then 'active'::registration_status
          else 'standby'::registration_status
        end
      ),
      updated_at = now()
  where r.game_id = _game_id
    and r.status in ('active', 'standby');
end;
$$;

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

    insert into public.registrations (game_id, user_id, status, check_in_status, queue_position)
    values (_game_id, v_user_id, v_new_status, 'pending', v_queue_position)
    on conflict (user_id, game_id) do update
      set status = excluded.status,
          check_in_status = 'pending',
          queue_position = excluded.queue_position,
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

create or replace function public.process_late_swaps(_game_id uuid)
returns table(swaps_count int, swaps jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_swaps jsonb := '[]'::jsonb;
  v_swaps_count int := 0;
  v_promoted_count int := 0;
  v_demoted_count int := 0;
begin
  if auth.uid() is not null then
    if not public.has_role(auth.uid(), 'admin') then
      raise exception 'Admin privileges required';
    end if;
  end if;

  perform pg_advisory_lock(hashtext(_game_id::text));

  begin
    drop table if exists tmp_before;
    create temporary table tmp_before on commit drop as
      select id, user_id, status
      from public.registrations
      where game_id = _game_id
        and status in ('active', 'standby');

    update public.registrations
    set check_in_status = 'no_show',
        updated_at = now()
    where game_id = _game_id
      and check_in_status is distinct from 'checked_in';

    perform public.resequence_queue_positions(_game_id);

    with after_state as (
      select id, user_id, status
      from public.registrations
      where game_id = _game_id
        and status in ('active', 'standby')
    ),
    changes as (
      select
        b.id,
        b.user_id,
        b.status as before_status,
        a.status as after_status
      from tmp_before b
      join after_state a on a.id = b.id
      where b.status is distinct from a.status
    )
    select
      count(*) filter (where before_status = 'standby' and after_status = 'active'),
      count(*) filter (where before_status = 'active' and after_status = 'standby'),
      coalesce(jsonb_agg(
        jsonb_build_object(
          'promoted_user_id', case when after_status = 'active' then user_id else null end,
          'demoted_user_id', case when after_status = 'standby' then user_id else null end,
          'promoted_registration_id', case when after_status = 'active' then id else null end,
          'demoted_registration_id', case when after_status = 'standby' then id else null end,
          'game_id', _game_id
        )
      ), '[]'::jsonb)
    into v_promoted_count, v_demoted_count, v_swaps
    from changes;

    v_swaps_count := least(v_promoted_count, v_demoted_count);

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

create or replace function public.cron_process_late_swaps()
returns void
language plpgsql
as $$
declare
  game record;
  now_ts timestamptz := now();
begin
  select * into game
  from public.games
  where status <> 'cancelled'
    and deadline_time <= now_ts
    and deadline_time >= now_ts - interval '10 minutes'
  order by deadline_time asc
  limit 1;

  if not found then
    return;
  end if;

  perform public.process_late_swaps(game.id);
end;
$$;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'late_swaps') then
    perform cron.schedule(
      'late_swaps',
      '* * * * *',
      $cron$select public.cron_process_late_swaps();$cron$
    );
  end if;
end;
$$;

create or replace function public.handle_checkin_resequence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deadline timestamptz;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  select g.deadline_time into v_deadline
  from public.games g
  where g.id = new.game_id;

  if v_deadline is not null and now() >= v_deadline then
    perform public.resequence_queue_positions(new.game_id);
  end if;

  return new;
end;
$$;

drop trigger if exists registrations_checkin_resequence on public.registrations;
create trigger registrations_checkin_resequence
after update of check_in_status on public.registrations
for each row
when (old.check_in_status is distinct from new.check_in_status and new.check_in_status = 'checked_in')
execute function public.handle_checkin_resequence();
