-- Migration: replace engagement_sessions with the N04 reading-session model
-- Part of EPIC-N04 / F-N04-02 / Issue I-F-N04-02-01 (#178)
-- Precondition: 20260618500000 (old engagement_sessions), public.set_updated_at() (20260617000001)
--
-- Supersedes ADR-001: the prior (user_id, post_id)-unique link_clicked model is
-- dropped and rebuilt as one row per reading session (session_id PK), tracking
-- focused_seconds + max_scroll_pct + derived state (viewed → skimmed → read).
-- See docs/adr/0003-engagement-reading-sessions.md.
--
-- Writes stay exclusive to the track-engagement Edge Function (service_role);
-- RLS SELECT policies land in EPIC-S00 (default-deny meanwhile).

-- 1. Drop the old model. cascade removes its RLS policy, grant and indexes.
drop table if exists public.engagement_sessions cascade;

-- 2. Business state of a reading session (ADR-0003). Guarded so the migration is
--    idempotent if the enum already exists from a partial run.
do $$
begin
  create type public.engagement_state as enum ('viewed', 'skimmed', 'read');
exception
  when duplicate_object then null;
end $$;

-- 3. One row per reading session. session_id is generated client-side on screen open.
create table public.engagement_sessions (
  session_id      uuid         primary key,
  post_id         uuid         not null references public.posts(id) on delete cascade,
  user_id         uuid         not null references public.profiles(id) on delete cascade,
  focused_seconds integer      not null default 0 check (focused_seconds >= 0),
  max_scroll_pct  numeric(4,3) not null default 0
                               check (max_scroll_pct >= 0 and max_scroll_pct <= 1),
  state           public.engagement_state not null default 'viewed',
  started_at      timestamptz  not null default now(),
  updated_at      timestamptz  not null default now()
);

comment on column public.engagement_sessions.focused_seconds is
  'Segundos de foco in-app acumulados; la Edge Function los suma desde los deltas del cliente.';
comment on column public.engagement_sessions.max_scroll_pct is
  'Máximo scroll alcanzado en la sesión, monotónico ∈ [0, 1].';
comment on column public.engagement_sessions.state is
  'Estado derivado por el servidor (viewed → skimmed → read) según ADR-0003.';

create index engagement_sessions_post_id_idx     on public.engagement_sessions (post_id);
create index engagement_sessions_user_id_idx     on public.engagement_sessions (user_id);
create index engagement_sessions_post_state_idx  on public.engagement_sessions (post_id, state);
create index engagement_sessions_updated_at_idx  on public.engagement_sessions (updated_at);

-- 4. Keep updated_at fresh on every UPDATE (shared trigger fn from 20260617000001).
create trigger engagement_sessions_updated_at
  before update on public.engagement_sessions
  for each row execute function public.set_updated_at();

-- 5. Enable RLS. No policies here — SELECT policies (own / manager-admin) land in
--    EPIC-S00 / I-F-S00-04-05. Until then RLS denies reads by default. All writes
--    go through the track-engagement Edge Function with service_role (bypasses RLS).
alter table public.engagement_sessions enable row level security;

grant select on public.engagement_sessions to authenticated;

comment on table public.engagement_sessions is
  'Una fila por sesión de lectura (session_id). Escritura exclusiva vía Edge Function '
  'track-engagement (service_role). Lectura: policies en EPIC-S00. refs: docs/adr/0003-engagement-reading-sessions.md';
