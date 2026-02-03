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

  update public.registrations
  set status = 'cancelled',
      check_in_status = 'pending',
      queue_position = null,
      updated_at = now()
  where id = v_existing.id;

  cancelled_registration_id := v_existing.id;

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
          queue_position = null,
          updated_at = now()
      where id = v_promote.id;

      promoted_registration_id := v_promote.id;
      promoted_user_id := v_promote.user_id;
    end if;
  end if;

  return next;
end;
$$;
