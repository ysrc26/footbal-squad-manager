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

  perform pg_advisory_xact_lock(hashtext(_game_id::text));

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
    return next;
  end if;

  select count(*) into v_active_count
  from public.registrations
  where game_id = _game_id
    and status = 'active';

  if v_active_count < v_max_players then
    v_new_status := 'active';
    v_queue_position := null;
  else
    v_new_status := 'standby';
    select coalesce(max(queue_position), 0) + 1
      into v_queue_position
    from public.registrations
    where game_id = _game_id
      and status = 'standby';
  end if;

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
  return next;
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
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtext(_game_id::text));

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

  update public.registrations r
  set r.status = 'cancelled',
      check_in_status = 'pending',
      queue_position = null,
      updated_at = now()
  where r.id = v_existing.id;

  cancelled_registration_id := v_existing.id;

  if v_was_active then
    select * into v_promote
    from public.registrations
    where game_id = _game_id
      and status = 'standby'
    order by queue_position asc
    limit 1
    for update;

    if v_promote is not null then
      update public.registrations r
      set r.status = 'active',
          queue_position = null,
          updated_at = now()
      where r.id = v_promote.id;

      promoted_registration_id := v_promote.id;
      promoted_user_id := v_promote.user_id;
    end if;
  end if;

  return next;
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
        from public.registrations r
        where r.game_id = _game_id
          and r.status = 'active'
          and r.check_in_status is distinct from 'checked_in'
        order by r.created_at desc, r.id desc
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

        update public.registrations r
        set r.status = 'active',
            queue_position = null,
            updated_at = now()
        where r.id = v_standby.id;

        update public.registrations r
        set r.status = 'standby',
            queue_position = v_standby.queue_position,
            updated_at = now()
        where r.id = v_late.id;

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

create or replace function public.handle_registration_status_push()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'standby' and new.status = 'active' then
    perform public.send_push_internal(
      jsonb_build_object(
        'event_type', 'promotion',
        'audience', 'user',
        'user_ids', jsonb_build_array(new.user_id),
        'title', 'עלית לשחק! ⚽️',
        'body', 'עשית צ׳ק־אין וקיבלת מקום בהרכב ✅',
        'url', '/game',
        'dedupe_key', format('swap:%s:%s', new.id, coalesce(new.updated_at, now()))
      )
    );
  elsif old.status = 'active' and new.status = 'standby'
        and new.check_in_status is distinct from 'checked_in' then
    perform public.send_push_internal(
      jsonb_build_object(
        'event_type', 'demotion',
        'audience', 'user',
        'user_ids', jsonb_build_array(new.user_id),
        'title', 'המקום עבר למזמין',
        'body', 'לא ביצעת צ׳ק־אין עד זמן שמירת המקומות, ועברת לתור המזמינים.',
        'url', '/game',
        'dedupe_key', format('swap:%s:%s', new.id, coalesce(new.updated_at, now()))
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists registrations_promotion_push on public.registrations;

drop trigger if exists registrations_status_push on public.registrations;
create trigger registrations_status_push
after update on public.registrations
for each row
when (old.status is distinct from new.status)
execute function public.handle_registration_status_push();

drop function if exists public.handle_registration_promotion();

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
