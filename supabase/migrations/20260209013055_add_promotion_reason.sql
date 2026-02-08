do $$
begin
  if not exists (select 1 from pg_type where typname = 'promotion_reason') then
    create type promotion_reason as enum ('checkin', 'cancellation', 'finishing', 'resequence');
  end if;
end;
$$;

alter table if exists public.registrations
  add column if not exists promotion_reason promotion_reason;

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
      updated_at = now()
  where r.game_id = _game_id
    and r.status in ('active', 'standby');

  update public.registrations r
  set promotion_reason = 'resequence',
      updated_at = now()
  from tmp_before_resequence b
  where r.id = b.id
    and b.status = 'standby'
    and r.status = 'active'
    and r.promotion_reason is null;
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
  v_deadline timestamptz;
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

    if v_deadline is not null and now() >= v_deadline then
      update public.registrations r
      set promotion_reason = 'checkin',
          updated_at = now()
      from changes c
      where r.id = c.id
        and c.before_status = 'standby'
        and c.after_status = 'active';
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

    drop table if exists tmp_before_finish;
    create temporary table tmp_before_finish on commit drop as
      select id, status
      from public.registrations
      where game_id = _game_id
        and status in ('active', 'standby');

    perform public.resequence_queue_positions(_game_id);

    update public.registrations r
    set promotion_reason = 'finishing',
        updated_at = now()
    from tmp_before_finish b
    where r.id = b.id
      and b.status = 'standby'
      and r.status = 'active';

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
            promotion_reason = 'cancellation',
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

create or replace function public.handle_registration_status_push()
returns trigger
language plpgsql
as $$
declare
  v_title text := 'עלית לשחק! ⚽️';
  v_body text := 'התפנה מקום ואתה עכשיו ברשימת המשתתפים ✅';
begin
  if old.status = 'standby' and new.status = 'active' then
    if new.promotion_reason = 'checkin' then
      v_title := 'עלית לשחק! ⚽️';
      v_body := 'עשית צ׳ק־אין וקיבלת מקום בהרכב ✅';
    elsif new.promotion_reason = 'cancellation' then
      v_title := 'עלית לשחק! ⚽️';
      v_body := 'התפנה מקום בגלל ביטול וקיבלת מקום בהרכב ✅';
    elsif new.promotion_reason = 'finishing' then
      v_title := 'עלית לשחק! ⚽️';
      v_body := 'התפנה מקום כי שחקן סיים וקיבלת מקום בהרכב ✅';
    else
      v_title := 'עלית לשחק! ⚽️';
      v_body := 'התפנה מקום ואתה עכשיו ברשימת המשתתפים ✅';
    end if;

    perform public.send_push_internal(
      jsonb_build_object(
        'event_type', 'promotion',
        'audience', 'user',
        'user_ids', jsonb_build_array(new.user_id),
        'title', v_title,
        'body', v_body,
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
