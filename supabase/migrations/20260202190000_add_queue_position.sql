alter table public.registrations
  add column if not exists queue_position integer;

create index if not exists registrations_game_status_queue_position_idx
  on public.registrations (game_id, status, queue_position);

create index if not exists registrations_game_status_check_in_idx
  on public.registrations (game_id, status, check_in_status);

with ordered as (
  select
    id,
    row_number() over (partition by game_id order by created_at asc) as rn
  from public.registrations
  where status = 'standby'
)
update public.registrations r
set queue_position = ordered.rn
from ordered
where r.id = ordered.id;

update public.registrations
set queue_position = null
where status = 'active';

alter table public.registrations
  add constraint registrations_active_queue_position_null
  check (status <> 'active' or queue_position is null)
  not valid;

alter table public.registrations
  add constraint registrations_standby_queue_position_not_null
  check (status <> 'standby' or queue_position is not null)
  not valid;
