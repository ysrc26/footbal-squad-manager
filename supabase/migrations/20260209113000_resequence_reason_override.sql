create or replace function public.resequence_queue_positions(
  _game_id uuid,
  _reason promotion_reason default 'resequence'
)
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

  drop table if exists tmp_before_resequence;
  create temporary table tmp_before_resequence on commit drop as
    select id, status
    from public.registrations
    where game_id = _game_id
      and status in ('active', 'standby');

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
      promotion_reason = (
        case
          when b.status = 'standby'
               and r.queue_position <= v_max_players
            then _reason
          else r.promotion_reason
        end
      ),
      updated_at = now()
  from tmp_before_resequence b
  where r.id = b.id;
end;
$$;

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

    perform public.resequence_queue_positions(_game_id, 'finishing');

    perform pg_advisory_unlock(hashtext(_game_id::text));
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

    if v_was_active then
      drop table if exists tmp_before_cancel;
      create temporary table tmp_before_cancel on commit drop as
        select id, status
        from public.registrations
        where game_id = _game_id
          and status in ('active', 'standby');
    end if;

    perform public.resequence_queue_positions(_game_id, 'cancellation');

    if v_was_active then
      select r.id, r.user_id
        into v_promote
      from public.registrations r
      join tmp_before_cancel b on b.id = r.id
      where b.status = 'standby'
        and r.status = 'active'
      order by r.queue_position asc
      limit 1;

      if v_promote is not null then
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
