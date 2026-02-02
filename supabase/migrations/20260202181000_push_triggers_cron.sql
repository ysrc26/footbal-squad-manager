create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

create or replace function public.send_push_internal(payload jsonb)
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
    url := functions_url || '/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', internal_secret
    ),
    body := payload
  );
end;
$$;

create or replace function public.handle_registration_promotion()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'standby' and new.status = 'active' then
    perform public.send_push_internal(
      jsonb_build_object(
        'event_type', 'promotion',
        'audience', 'user',
        'user_ids', jsonb_build_array(new.user_id),
        'title', 'עלית לשחק! ⚽️',
        'body', 'התפנה מקום ואתה עכשיו ברשימת המשתתפים ✅',
        'url', '/game',
        'dedupe_key', format('promotion:%s:%s', new.id, coalesce(new.updated_at, now()))
      )
    );
  end if;

  return new;
end;
$$;

create or replace function public.handle_game_status_change()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('open_for_residents', 'open_for_all')
     and old.status is distinct from new.status then
    perform public.send_push_internal(
      jsonb_build_object(
        'event_type', 'game_open',
        'audience', 'all',
        'game_id', new.id,
        'title', 'נפתחה ההרשמה למשחק מוצ"ש',
        'body', 'יש 15 מקומות. מי שבא — נרשם עכשיו 💪',
        'url', '/game',
        'dedupe_key', format('game_open:%s:%s:%s', new.id, new.status, coalesce(new.updated_at, now()))
      )
    );
  elsif new.status = 'cancelled'
     and old.status is distinct from new.status then
    perform public.send_push_internal(
      jsonb_build_object(
        'event_type', 'game_cancelled',
        'audience', 'all',
        'game_id', new.id,
        'title', 'עדכון: המשחק בוטל',
        'body', 'המשחק הקרוב בוטל. נעדכן לגבי משחק חלופי.',
        'url', '/game',
        'dedupe_key', format('game_cancelled:%s:%s', new.id, coalesce(new.updated_at, now()))
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists registrations_promotion_push on public.registrations;
create trigger registrations_promotion_push
after update on public.registrations
for each row
when (old.status = 'standby' and new.status = 'active')
execute function public.handle_registration_promotion();

drop trigger if exists games_status_push on public.games;
create trigger games_status_push
after update on public.games
for each row
when (old.status is distinct from new.status)
execute function public.handle_game_status_change();

create or replace function public.get_upcoming_game()
returns table(id uuid, kickoff_time timestamptz)
language sql
as $$
  select id, kickoff_time
  from public.games
  where kickoff_time > now()
    and status in ('scheduled', 'open_for_residents', 'open_for_all')
  order by kickoff_time asc
  limit 1;
$$;

create or replace function public.cron_push_registration_open()
returns void
language plpgsql
as $$
declare
  dedupe_date text := to_char(now() at time zone 'Asia/Jerusalem', 'YYYY-MM-DD');
begin
  perform public.send_push_internal(
    jsonb_build_object(
      'event_type', 'reminder',
      'audience', 'all',
      'title', 'נפתחה ההרשמה למשחק מוצ"ש',
      'body', 'ההרשמה פתוחה עכשיו. 15 מקומות ראשונים בפנים!',
      'url', '/game',
      'dedupe_key', format('cron_open:%s', dedupe_date)
    )
  );
end;
$$;

create or replace function public.cron_push_registration_closing()
returns void
language plpgsql
as $$
declare
  game record;
  registration_closes_at timestamptz;
  now_ts timestamptz := now();
  dedupe_date text := to_char(now() at time zone 'Asia/Jerusalem', 'YYYY-MM-DD');
begin
  select * into game from public.get_upcoming_game();
  if not found then
    return;
  end if;

  registration_closes_at := game.kickoff_time - interval '15 minutes';

  if now_ts between (registration_closes_at - interval '30 minutes')
                and (registration_closes_at - interval '25 minutes') then
    perform public.send_push_internal(
      jsonb_build_object(
        'event_type', 'reminder',
        'audience', 'all',
        'game_id', game.id,
        'title', 'עוד חצי שעה נסגרת ההרשמה',
        'body', 'אם אתה מגיע—זה הזמן להירשם ⚽️',
        'url', '/game',
        'dedupe_key', format('cron_closing:%s:%s', game.id, dedupe_date)
      )
    );
  end if;
end;
$$;

create or replace function public.cron_push_kickoff_reminder()
returns void
language plpgsql
as $$
declare
  game record;
  now_ts timestamptz := now();
  dedupe_date text := to_char(now() at time zone 'Asia/Jerusalem', 'YYYY-MM-DD');
begin
  select * into game from public.get_upcoming_game();
  if not found then
    return;
  end if;

  if now_ts between (game.kickoff_time - interval '60 minutes')
                and (game.kickoff_time - interval '55 minutes') then
    perform public.send_push_internal(
      jsonb_build_object(
        'event_type', 'reminder',
        'audience', 'game_active',
        'game_id', game.id,
        'title', 'תזכורת למשחק',
        'body', 'עוד שעה משחק. תצא בזמן 🙌',
        'url', '/game',
        'dedupe_key', format('cron_kickoff:%s:%s', game.id, dedupe_date)
      )
    );
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'push_registration_open') then
    perform cron.schedule(
      'push_registration_open',
      '0 12 * * 5',
      $cron$select public.cron_push_registration_open();$cron$
    );
  end if;

  if not exists (select 1 from cron.job where jobname = 'push_registration_closing') then
    perform cron.schedule(
      'push_registration_closing',
      '*/5 * * * *',
      $cron$select public.cron_push_registration_closing();$cron$
    );
  end if;

  if not exists (select 1 from cron.job where jobname = 'push_kickoff_reminder') then
    perform cron.schedule(
      'push_kickoff_reminder',
      '*/5 * * * *',
      $cron$select public.cron_push_kickoff_reminder();$cron$
    );
  end if;
end;
$$;
