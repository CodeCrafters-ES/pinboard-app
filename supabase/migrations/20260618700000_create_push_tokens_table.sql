-- Migration: 0012 — Create push_tokens table
-- Part of Epic S00 / Feature F-S00-04
-- Precondition for 0013_rls_push_tokens

create table public.push_tokens (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  token      text        not null,
  platform   text        not null check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

create index push_tokens_user_id_idx on public.push_tokens (user_id);

grant select, insert, update, delete on public.push_tokens to authenticated;

create trigger push_tokens_updated_at
  before update on public.push_tokens
  for each row execute function public.set_updated_at();
