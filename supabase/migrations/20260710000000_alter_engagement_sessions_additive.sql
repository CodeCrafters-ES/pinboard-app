-- Migration: alter engagement_sessions — alineación de status + columnas de comportamiento
-- Part of Epic N04 / Feature F-N04-02 (#174) / Issue I-F-N04-02-01 (#178)
-- refs: docs/adr/0001-engagement.md (status viewed/engaged/clicked)
--       docs/adr/0006-engagement-behavioral-signals.md (columnas aditivas)
--
-- Cambio puramente ADITIVO sobre el esquema restaurado (20260618500000):
--   1. Alinea `status` de active/idle/closed → viewed/engaged/clicked (canónico, ADR-001).
--   2. Añade columnas opcionales `focused_seconds` y `max_scroll_pct` (ADR-0006).
-- Mantiene `id` PK, `unique (user_id, post_id)` y la FK `user_id → auth.users(id)`.
-- No dropea la tabla: las filas existentes quedan válidas (defaults en las nuevas columnas).
--
-- Rollback (no versionado; el repo es forward-only vía `supabase db reset`):
--   alter table public.engagement_sessions
--     drop column max_scroll_pct, drop column focused_seconds;
--   alter table public.engagement_sessions drop constraint engagement_sessions_status_check;
--   alter table public.engagement_sessions alter column status set default 'active';
--   alter table public.engagement_sessions
--     add constraint engagement_sessions_status_check check (status in ('active','idle','closed'));

-- 1. Alinear el status al modelo canónico ADR-001 (viewed/engaged/clicked)
alter table public.engagement_sessions
  drop constraint if exists engagement_sessions_status_check;

update public.engagement_sessions
  set status = 'viewed'
  where status not in ('viewed', 'engaged', 'clicked');

alter table public.engagement_sessions
  alter column status set default 'viewed';

alter table public.engagement_sessions
  add constraint engagement_sessions_status_check
  check (status in ('viewed', 'engaged', 'clicked'));

-- 2. Señales de comportamiento OPCIONALES y aditivas (ADR-0006).
-- Default 0: no rompen filas previas ni gobiernan el status.
alter table public.engagement_sessions
  add column if not exists focused_seconds integer not null default 0
    check (focused_seconds >= 0),
  add column if not exists max_scroll_pct numeric(4,3) not null default 0
    check (max_scroll_pct >= 0 and max_scroll_pct <= 1);

comment on column public.engagement_sessions.link_clicked is
  'Métrica principal: el usuario clicó el enlace externo. Append-only (nunca true→false).';
comment on column public.engagement_sessions.focused_seconds is
  'OPCIONAL (ADR-0006): segundos de foco in-app acumulados. No gobierna status.';
comment on column public.engagement_sessions.max_scroll_pct is
  'OPCIONAL (ADR-0006): scroll máximo de la sesión, monotónico ∈ [0,1]. No gobierna status.';
