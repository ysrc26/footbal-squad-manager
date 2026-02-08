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

create or replace function public.handle_post_deadline_checkin()
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

  if v_deadline is not null
     and now() >= v_deadline
     and now() <= v_deadline + interval '3 hours' then
    perform public.process_late_swaps(new.game_id);
  end if;

  return new;
end;
$$;

drop trigger if exists registrations_post_deadline_checkin on public.registrations;
create trigger registrations_post_deadline_checkin
after update of check_in_status on public.registrations
for each row
when (old.check_in_status is distinct from new.check_in_status)
execute function public.handle_post_deadline_checkin();

create or replace function public.handle_post_deadline_status_change()
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

  if v_deadline is not null
     and now() >= v_deadline
     and now() <= v_deadline + interval '3 hours' then
    perform public.resequence_queue_positions(new.game_id);
  end if;

  return new;
end;
$$;

drop trigger if exists registrations_post_deadline_status_change on public.registrations;
create trigger registrations_post_deadline_status_change
after update of status on public.registrations
for each row
when (old.status is distinct from new.status and new.status in ('cancelled', 'finished'))
execute function public.handle_post_deadline_status_change();
