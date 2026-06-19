-- Migration: 0011 — RLS policies for public.engagement_sessions
-- refs: docs/adr/0002-rbac.md
-- Part of Epic S00 / Feature F-S00-04 / Issue I-F-S00-04-04
-- Depends on: 0010 (engagement_sessions table), 0003/0004 (helpers is_manager)

alter table public.engagement_sessions enable row level security;

-- SELECT: own user sees their sessions; manager and admin see all (dashboard).
-- No INSERT / UPDATE / DELETE policy for authenticated or anon — RLS denies by default.
-- service_role (Edge Function track-engagement) bypasses RLS and writes directly.
create policy engagement_sessions_select_own_or_manager
  on public.engagement_sessions for select
  to authenticated
  using (
    user_id = auth.uid()
    or is_manager()
  );

comment on table public.engagement_sessions is
  'Escritura permitida solo desde Edge Function track-engagement con service_role. '
  'Lectura: propio usuario (own) o manager/admin (dashboard). refs: docs/adr/0002-rbac.md';
