create or replace function public.process_late_swaps(_game_id uuid)
returns table(swaps_count int, swaps jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deadline timestamptz;
  v_max_players integer;
  v_active_count integer;
  v_swaps jsonb := '[]'::jsonb;
  v_swaps_count int := 0;
  v_late record;
  v_standby record;
  v_late_pos integer;
  v_standby_pos integer;
  v_temp_pos integer;
begin
  if auth.uid() is not null then
    if not public.has_role(auth.uid(), 'admin') then
      raise exception 'Admin privileges required';
    end if;
  end if;

  perform pg_advisory_lock(hashtext(_game_id::text));

  begin
    select deadline_time, max_players
      into v_deadline, v_max_players
    from public.games
    where id = _game_id;

    if v_max_players is null then
      raise exception 'Game not found';
    end if;

    select count(*)
      into v_active_count
    from public.registrations
    where game_id = _game_id
      and status = 'active';

    if v_deadline is not null and now() < v_deadline then
      while v_active_count < v_max_players loop
        select * into v_standby
        from public.registrations
        where game_id = _game_id
          and status = 'standby'
        order by queue_position asc nulls last
        limit 1
        for update;

        if v_standby is null then
          exit;
        end if;

        update public.registrations
        set status = 'active',
            updated_at = now()
        where id = v_standby.id;

        v_active_count := v_active_count + 1;
      end loop;

      swaps_count := v_swaps_count;
      swaps := v_swaps;

      perform pg_advisory_unlock(hashtext(_game_id::text));
      return next;
    end if;

    if v_deadline is not null and now() >= v_deadline then
      while v_active_count < v_max_players loop
        select * into v_standby
        from public.registrations
        where game_id = _game_id
          and status = 'standby'
          and check_in_status = 'checked_in'
        order by queue_position asc nulls last
        limit 1
        for update;

        if v_standby is null then
          select * into v_standby
          from public.registrations
          where game_id = _game_id
            and status = 'standby'
          order by queue_position asc nulls last
          limit 1
          for update;
        end if;

        if v_standby is null then
          exit;
        end if;

        update public.registrations
        set status = 'active',
            updated_at = now()
        where id = v_standby.id;

        v_active_count := v_active_count + 1;
      end loop;

      if v_active_count = v_max_players then
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

          select coalesce(min(queue_position), 0) - 1
            into v_temp_pos
          from public.registrations
          where game_id = _game_id
            and status in ('active', 'standby');

          update public.registrations
          set status = 'active',
              queue_position = v_temp_pos,
              updated_at = now()
          where id = v_standby.id;

          update public.registrations
          set status = 'standby',
              queue_position = v_standby_pos,
              updated_at = now()
          where id = v_late.id;

          update public.registrations
          set queue_position = v_late_pos,
              updated_at = now()
          where id = v_standby.id;

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
