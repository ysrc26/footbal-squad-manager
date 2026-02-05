alter table public.profiles
  alter column push_enabled set default false;

update public.profiles
set push_enabled = false;
