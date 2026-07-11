-- Migration: vista materializada post_engagement_daily + refresco horario (pg_cron)
-- Part of Epic N04 / Feature F-N04-03 (#175) / Issue I-F-N04-03-02 (#181)
-- refs: docs/adr/0001-engagement.md · docs/adr/0006-engagement-behavioral-signals.md
--       métricas de origen: 20260711000000_create_post_engagement_metrics_view.sql (#180)
--
-- Materializa las métricas por (post_id, día) para que el dashboard no ataque
-- engagement_sessions cruda. Lag máximo del dashboard: 1 hora (refresco horario).
--
-- ── Por qué la MV vive en el schema `private` ────────────────────────────────
-- Las vistas materializadas NO soportan RLS ni `security_invoker`. Si se expusiera
-- con grant a `authenticated`, cualquier staff podría leer el engagement de todos
-- los posts. `private` no está en `[api] schemas` (config.toml), así que PostgREST
-- no lo expone. El acceso pasa por la vista pública `public.post_engagement_daily`,
-- que corre con permisos del owner y filtra con el guard `is_manager()`.
--
-- ── Fan-out ──────────────────────────────────────────────────────────────────
-- Cada fuente se pre-agrega por (post_id, día) y luego se une sobre un "spine" con
-- todos los pares (post_id, día) presentes en cualquier fuente. Unir las tablas
-- directamente multiplicaría los conteos (producto cartesiano).
--
-- ── Días en UTC ──────────────────────────────────────────────────────────────
-- `at time zone 'utc'` hace el bucketing determinista e independiente del TimeZone
-- de la sesión que consulte o refresque.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create materialized view private.post_engagement_daily as
with sessions as (
  select
    post_id,
    (started_at at time zone 'utc')::date               as day,
    count(distinct user_id)                             as unique_readers,
    count(distinct user_id) filter (where link_clicked) as unique_clicks,
    avg(focused_seconds)::numeric(10,2)                 as avg_seconds,
    avg(max_scroll_pct)::numeric(4,3)                   as avg_scroll
  from public.engagement_sessions
  group by post_id, (started_at at time zone 'utc')::date
),
ratings as (
  select
    post_id,
    (created_at at time zone 'utc')::date as day,
    avg(rating)::numeric(3,2)             as avg_rating,
    count(*)                              as total_ratings
  from public.post_ratings
  group by post_id, (created_at at time zone 'utc')::date
),
reactions as (
  select
    post_id,
    (created_at at time zone 'utc')::date as day,
    count(*)                              as total_reactions
  from public.post_reactions
  group by post_id, (created_at at time zone 'utc')::date
),
comments as (
  select
    post_id,
    (created_at at time zone 'utc')::date as day,
    count(*)                              as total_comments
  from public.post_comments
  group by post_id, (created_at at time zone 'utc')::date
),
spine as (
  select post_id, day from sessions
  union
  select post_id, day from ratings
  union
  select post_id, day from reactions
  union
  select post_id, day from comments
)
select
  sp.post_id,
  sp.day,
  coalesce(s.unique_readers, 0)   as unique_readers,
  coalesce(s.unique_clicks, 0)    as unique_clicks,
  -- nullif evita la división por cero: sin lectores ese día, el ratio es NULL.
  round(
    coalesce(s.unique_clicks, 0)::numeric / nullif(s.unique_readers, 0),
    4
  )                               as click_rate,
  r.avg_rating,
  coalesce(r.total_ratings, 0)    as total_ratings,
  coalesce(rx.total_reactions, 0) as total_reactions,
  coalesce(c.total_comments, 0)   as total_comments,
  -- Señales opcionales (ADR-0006).
  s.avg_seconds,
  s.avg_scroll
from spine sp
left join sessions  s  on s.post_id  = sp.post_id and s.day  = sp.day
left join ratings   r  on r.post_id  = sp.post_id and r.day  = sp.day
left join reactions rx on rx.post_id = sp.post_id and rx.day = sp.day
left join comments  c  on c.post_id  = sp.post_id and c.day  = sp.day;

-- Índice único: requisito de REFRESH MATERIALIZED VIEW CONCURRENTLY (refresca sin
-- bloquear las lecturas del dashboard).
create unique index post_engagement_daily_pk
  on private.post_engagement_daily (post_id, day);

create index post_engagement_daily_day_idx
  on private.post_engagement_daily (day desc);

comment on materialized view private.post_engagement_daily is
  'Métricas de engagement por (post_id, día). Refresco horario vía pg_cron; lag máximo 1h. '
  'No expuesta por PostgREST (las MV no soportan RLS): el acceso va por public.post_engagement_daily.';

-- ── Acceso público (RBAC en Postgres) ────────────────────────────────────────
-- Vista con permisos del owner (lee la MV en `private`) + guard is_manager()
-- (jerarquía inclusiva: admin > manager). Staff obtiene 0 filas.
create or replace view public.post_engagement_daily as
select
  d.post_id,
  d.day,
  d.unique_readers,
  d.unique_clicks,
  d.click_rate,
  d.avg_rating,
  d.total_ratings,
  d.total_reactions,
  d.total_comments,
  d.avg_seconds,
  d.avg_scroll
from private.post_engagement_daily d
where public.is_manager();

comment on view public.post_engagement_daily is
  'Lectura del dashboard sobre la MV private.post_engagement_daily (F-N04-03). '
  'Solo admin/manager (guard is_manager()); staff obtiene 0 filas.';

grant select on public.post_engagement_daily to authenticated;

-- ── Refresco horario ─────────────────────────────────────────────────────────
create extension if not exists pg_cron;

create or replace function private.refresh_post_engagement_daily()
returns void
language sql
security definer
set search_path = ''
as $$
  refresh materialized view concurrently private.post_engagement_daily;
$$;

comment on function private.refresh_post_engagement_daily() is
  'Refresco CONCURRENTLY (no bloquea lecturas). Lo invoca el job horario de pg_cron.';

-- Job idempotente: cron.schedule hace upsert por nombre, así que re-aplicar la
-- migración no duplica el job. Cada hora en punto → lag máximo de 1h.
select cron.schedule(
  'refresh-post-engagement-daily',
  '0 * * * *',
  $$ select private.refresh_post_engagement_daily() $$
);
