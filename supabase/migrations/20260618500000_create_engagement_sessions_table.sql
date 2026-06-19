-- Migration: 0010 — Create engagement_sessions table
-- Part of Epic S00 / Feature F-S00-04 / Issue I-F-S00-04-04
-- Precondition for 0011_rls_engagement_sessions
--
-- Write access is intentionally NOT granted to authenticated or anon.
-- Only service_role (Edge Function track-engagement) may write to this table.

create table public.engagement_sessions (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  post_id      uuid        not null references public.posts(id) on delete cascade,
  started_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  link_clicked boolean     not null default false,
  status       text        not null default 'active'
                           check (status in ('active', 'idle', 'closed')),
  device       text,
  unique (user_id, post_id)
);

create index engagement_sessions_user_id_idx  on public.engagement_sessions (user_id);
create index engagement_sessions_post_id_idx  on public.engagement_sessions (post_id);
create index engagement_sessions_started_at_idx on public.engagement_sessions (started_at desc);

-- SELECT only: clients may read, but never write directly.
-- service_role bypasses RLS and handles all writes via Edge Function track-engagement.
grant select on public.engagement_sessions to authenticated;
