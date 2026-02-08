create or replace function public.cron_auto_create_weekly_game()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  functions_url text;
  internal_secret text;
begin
  select value into functions_url
  from public.app_config
  where key = 'functions_url';

  select value into internal_secret
  from public.app_config
  where key = 'internal_push_secret';

  if functions_url is null or internal_secret is null then
    raise exception 'Missing app_config keys: functions_url or internal_push_secret';
  end if;

  perform net.http_post(
    url := functions_url || '/auto-create-weekly-game',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', internal_secret
    ),
    body := '{}'::jsonb
  );
end;
$$;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'auto_create_weekly_game') then
    perform cron.schedule(
      'auto_create_weekly_game',
      '0 6 * * 5',
      $cron$select public.cron_auto_create_weekly_game();$cron$
    );
  end if;
end;
$$;
