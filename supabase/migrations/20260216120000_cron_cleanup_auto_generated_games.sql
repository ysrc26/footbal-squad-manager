create or replace function public.cron_cleanup_auto_generated_games()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with target_games as (
    select g.id
    from public.games g
    where g.is_auto_generated = true
      and g.kickoff_time < now()
    for update
  ),
  deleted_registrations as (
    delete from public.registrations r
    using target_games tg
    where r.game_id = tg.id
    returning r.id
  )
  delete from public.games g
  using target_games tg
  where g.id = tg.id;
end;
$$;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'cleanup_auto_generated_games') then
    perform cron.schedule(
      'cleanup_auto_generated_games',
      '0 6 * * 0',
      $cron$select public.cron_cleanup_auto_generated_games();$cron$
    );
  end if;
end;
$$;
