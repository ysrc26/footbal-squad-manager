alter table if exists public.registrations
  add column if not exists check_in_at timestamptz;

update public.registrations
set check_in_at = updated_at
where check_in_status = 'checked_in'
  and check_in_at is null;

-- Update constraint to treat finished like cancelled/no_show (no queue position)
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'registrations_cancelled_queue_position_null'
      and conrelid = 'public.registrations'::regclass
  ) then
    alter table public.registrations
      drop constraint registrations_cancelled_queue_position_null;
  end if;
end;
$$;

alter table public.registrations
  add constraint registrations_cancelled_queue_position_null
  check (status not in ('cancelled', 'no_show', 'finished') or queue_position is null)
  not valid;

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
          case when v_after_deadline then r.check_in_at end asc nulls last,
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
          case when v_after_deadline then r.check_in_at end asc nulls last,
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
        check_in_at = null,
        updated_at = now()
    where game_id = _game_id
      and status in ('active', 'standby')
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

create or replace function public.handle_checkin_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.check_in_status = 'checked_in' and new.check_in_at is null then
      new.check_in_at := now();
    end if;
    return new;
  end if;

  if new.check_in_status = 'checked_in'
     and old.check_in_status is distinct from 'checked_in' then
    new.check_in_at := now();
  elsif old.check_in_status = 'checked_in'
     and new.check_in_status is distinct from 'checked_in' then
    new.check_in_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists registrations_checkin_at on public.registrations;
create trigger registrations_checkin_at
before insert or update of check_in_status on public.registrations
for each row
execute function public.handle_checkin_at();

create or replace function public.finish_registration_for_game(_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing record;
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

    if v_existing.status in ('cancelled', 'no_show', 'finished') then
      perform pg_advisory_unlock(hashtext(_game_id::text));
      return;
    end if;

    update public.registrations r
    set status = 'finished',
        queue_position = null,
        updated_at = now()
    where r.id = v_existing.id;

    perform public.resequence_queue_positions(_game_id);

    perform pg_advisory_unlock(hashtext(_game_id::text));
  exception when others then
    perform pg_advisory_unlock(hashtext(_game_id::text));
    raise;
  end;
end;
$$;
