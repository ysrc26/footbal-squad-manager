create or replace function public.enforce_checkin_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kickoff timestamptz;
begin
  if new.check_in_status = 'checked_in'
     and old.check_in_status is distinct from 'checked_in' then
    if auth.uid() is not null and not public.has_role(auth.uid(), 'admin') then
      select g.kickoff_time into v_kickoff
      from public.games g
      where g.id = new.game_id;

      if v_kickoff is not null and now() < v_kickoff - interval '30 minutes' then
        raise exception 'Check-in opens 30 minutes before kickoff';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists registrations_checkin_window on public.registrations;
create trigger registrations_checkin_window
before update on public.registrations
for each row
execute function public.enforce_checkin_window();
