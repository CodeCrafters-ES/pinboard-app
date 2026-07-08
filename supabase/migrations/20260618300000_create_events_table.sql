-- Migration: 0008 — Create events table
-- Part of Epic S00 / Feature F-S00-04 / Issue I-F-S00-04-03
-- Precondition for 0009_rls_events

create table public.events (
  id           uuid        primary key default gen_random_uuid(),
  author_id    uuid        not null references auth.users(id) on delete cascade,
  title        text        not null,
  description  text,
  location     text,
  image_url    text,
  event_start_at timestamptz not null,
  event_end_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint events_end_after_start check (event_end_at > event_start_at)
);

create index events_author_id_idx    on public.events (author_id);
create index events_start_at_idx     on public.events (event_start_at);
create index events_event_end_at_idx on public.events (event_end_at);

grant select, insert, update, delete on public.events to authenticated;

create trigger events_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();
