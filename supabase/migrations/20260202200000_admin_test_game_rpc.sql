create or replace function public.admin_create_test_game(
  _kickoff_time timestamptz,
  _deadline_time timestamptz,
  _max_players integer,
  _max_standby integer,
  _active_count integer,
  _standby_count integer,
  _batch_id text
)
returns table(game_id uuid, profile_ids uuid[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_id uuid;
  v_profile_ids uuid[] := '{}';
  v_total integer := _active_count + _standby_count;
  v_idx integer := 1;
  v_profile_id uuid;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Admin privileges required';
  end if;

  if _kickoff_time >= _deadline_time then
    raise exception 'kickoff_time must be before deadline_time';
  end if;

  if _max_players <= 0 or _max_standby < 0 then
    raise exception 'Invalid max players/standby';
  end if;

  if _active_count < 0 or _standby_count < 0 then
    raise exception 'Invalid counts';
  end if;

  if _active_count > _max_players then
    raise exception 'Active count exceeds max players';
  end if;

  if _standby_count > _max_standby then
    raise exception 'Standby count exceeds max standby';
  end if;

  insert into public.games (
    date,
    deadline_time,
    kickoff_time,
    status,
    max_players,
    max_standby,
    is_auto_generated
  )
  values (
    (_kickoff_time at time zone 'UTC')::date,
    _deadline_time,
    _kickoff_time,
    'open_for_all',
    _max_players,
    _max_standby,
    false
  )
  returning id into v_game_id;

  while v_idx <= v_total loop
    v_profile_id := gen_random_uuid();
    insert into public.profiles (id, full_name, phone_number, avatar_url, is_resident)
    values (v_profile_id, format('TEST_%s_%s', _batch_id, v_idx), null, null, false);
    v_profile_ids := array_append(v_profile_ids, v_profile_id);
    v_idx := v_idx + 1;
  end loop;

  for v_idx in 1.._active_count loop
    insert into public.registrations (game_id, user_id, status, check_in_status, queue_position)
    values (v_game_id, v_profile_ids[v_idx], 'active', 'pending', null);
  end loop;

  for v_idx in 1.._standby_count loop
    insert into public.registrations (game_id, user_id, status, check_in_status, queue_position)
    values (
      v_game_id,
      v_profile_ids[_active_count + v_idx],
      'standby',
      'checked_in',
      v_idx
    );
  end loop;

  game_id := v_game_id;
  profile_ids := v_profile_ids;
  return next;
end;
$$;

create or replace function public.admin_cleanup_test_game(
  _game_id uuid,
  _profile_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Admin privileges required';
  end if;

  if _game_id is not null then
    delete from public.registrations where game_id = _game_id;
    delete from public.games where id = _game_id;
  end if;

  if _profile_ids is not null and array_length(_profile_ids, 1) > 0 then
    delete from public.profiles where id = any(_profile_ids);
  end if;
end;
$$;
