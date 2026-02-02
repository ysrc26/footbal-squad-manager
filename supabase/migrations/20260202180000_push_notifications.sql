create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists push_enabled boolean default true;

create table if not exists public.push_notifications_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  event_type text not null,
  audience text not null,
  user_ids uuid[] null,
  game_id uuid null,
  title text not null,
  body text not null,
  url text null,
  data jsonb null,
  dedupe_key text unique,
  onesignal_response jsonb null,
  error text null
);
