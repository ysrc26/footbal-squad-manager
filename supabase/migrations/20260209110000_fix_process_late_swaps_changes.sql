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

    drop table if exists tmp_changes;
    create temporary table tmp_changes on commit drop as
      with after_state as (
        select id, user_id, status
        from public.registrations
        where game_id = _game_id
          and status in ('active', 'standby')
      )
      select
        b.id,
        b.user_id,
        b.status as before_status,
        a.status as after_status
      from tmp_before b
      join after_state a on a.id = b.id
      where b.status is distinct from a.status;

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
    from tmp_changes;

    v_swaps_count := least(v_promoted_count, v_demoted_count);

    if v_deadline is not null and now() >= v_deadline then
      update public.registrations r
      set promotion_reason = 'checkin',
          updated_at = now()
      from tmp_changes c
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
