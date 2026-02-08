alter table if exists public.games
  add column if not exists deadline_no_show_processed_at timestamptz;

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
  v_shift integer;
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

  select coalesce(max(r.queue_position), 0) + 1000000
    into v_shift
  from public.registrations r
  where r.game_id = _game_id
    and r.status in ('active', 'standby');

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
  )
  update public.registrations r
  set queue_position = coalesce(r.queue_position, 0) + v_shift,
      updated_at = now()
  from ordered
  where r.id = ordered.id;

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
  )
  update public.registrations r
  set queue_position = ordered.rn,
      updated_at = now()
  from ordered
  where r.id = ordered.id;

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
    and (
      deadline_no_show_processed_at is null
      or deadline_no_show_processed_at < deadline_time
    )
  order by deadline_time asc
  limit 1;

  if not found then
    return;
  end if;

  perform public.process_late_swaps(game.id);

  update public.games
  set deadline_no_show_processed_at = now()
  where id = game.id;
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

do $$
declare
  game record;
begin
  for game in
    select id
    from public.games
    where status in ('scheduled', 'open_for_residents', 'open_for_all')
  loop
    perform public.resequence_queue_positions(game.id);
  end loop;
end;
$$;
