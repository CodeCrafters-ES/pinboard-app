-- Migration: añade engaged_users a post_engagement_daily
-- Part of Epic N04 (#172) / Feature F-N04-03 (#175)
-- refs: docs/adr/0001-engagement.md (status viewed / engaged / clicked)
--
-- ADR-001 y las decisiones cerradas del EPIC-N04 definen `engaged` como "el usuario
-- interactuó (reacción / valoración / comentario) pero NO clicó el enlace externo".
-- Hasta ahora ese concepto no llegaba al dashboard: la Edge Function no escribe
-- status = 'engaged' (se decidió derivarlo, no usar triggers cross-tabla) y la MV no
-- lo agregaba. Esta migración lo materializa.
--
-- ── Por qué se atribuye al día de la PRIMERA interacción ─────────────────────
-- El cliente suma las filas diarias para componer la ventana de 30 días. Eso es
-- seguro para unique_readers porque engagement_sessions tiene 1 fila por
-- (user_id, post_id): cada usuario cae en un único día. Pero un usuario SÍ puede
-- interactuar varios días (reacciona el día 1, comenta el día 3), así que contarlo
-- en cada día lo doblaría al sumar. Atribuyéndolo al día de su primera interacción
-- con el post, cada usuario engaged aparece en un único bucket y la suma sigue
-- siendo un conteo de usuarios distintos.
--
-- `clicked` es absorbente (ADR-001): si el usuario acaba clicando, deja de contar
-- como engaged en el siguiente refresco.
--
-- Las MV no admiten ALTER ... ADD COLUMN, así que se recrea (y con ella la vista
-- pública que la expone). Las funciones de refresco resuelven el nombre en tiempo
-- de ejecución, así que el job horario de pg_cron sigue siendo válido.

drop view if exists public.post_engagement_daily;
drop materialized view if exists private.post_engagement_daily;

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
-- Toda interacción in-app con el post, sea del tipo que sea.
interactions as (
  select post_id, user_id,   created_at from public.post_reactions
  union all
  select post_id, user_id,   created_at from public.post_ratings
  union all
  select post_id, author_id, created_at from public.post_comments
),
first_interaction as (
  select post_id, user_id, min(created_at) as first_at
  from interactions
  group by post_id, user_id
),
-- engaged = interactuó y NO clicó el enlace, imputado a su primer día.
engaged as (
  select
    fi.post_id,
    (fi.first_at at time zone 'utc')::date as day,
    count(distinct fi.user_id)             as engaged_users
  from first_interaction fi
  left join public.engagement_sessions es
    on  es.post_id = fi.post_id
    and es.user_id = fi.user_id
    and es.link_clicked
  where es.user_id is null
  group by fi.post_id, (fi.first_at at time zone 'utc')::date
),
spine as (
  select post_id, day from sessions
  union
  select post_id, day from ratings
  union
  select post_id, day from reactions
  union
  select post_id, day from comments
  union
  select post_id, day from engaged
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
  coalesce(e.engaged_users, 0)    as engaged_users,
  -- Señales opcionales (ADR-0006).
  s.avg_seconds,
  s.avg_scroll
from spine sp
left join sessions  s  on s.post_id  = sp.post_id and s.day  = sp.day
left join ratings   r  on r.post_id  = sp.post_id and r.day  = sp.day
left join reactions rx on rx.post_id = sp.post_id and rx.day = sp.day
left join comments  c  on c.post_id  = sp.post_id and c.day  = sp.day
left join engaged   e  on e.post_id  = sp.post_id and e.day  = sp.day;

create unique index post_engagement_daily_pk
  on private.post_engagement_daily (post_id, day);

create index post_engagement_daily_day_idx
  on private.post_engagement_daily (day desc);

comment on materialized view private.post_engagement_daily is
  'Métricas de engagement por (post_id, día). Refresco horario vía pg_cron; lag máximo 1h. '
  'No expuesta por PostgREST (las MV no soportan RLS): el acceso va por public.post_engagement_daily.';

comment on column private.post_engagement_daily.engaged_users is
  'ADR-001: usuarios que interactuaron (reacción/valoración/comentario) sin clicar el enlace. '
  'Imputados al día de su PRIMERA interacción con el post, para que sumar días no los doble.';

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
  d.engaged_users,
  d.avg_seconds,
  d.avg_scroll
from private.post_engagement_daily d
where public.is_manager();

comment on view public.post_engagement_daily is
  'Lectura del dashboard sobre la MV private.post_engagement_daily (F-N04-03). '
  'Solo admin/manager (guard is_manager()); staff obtiene 0 filas.';

grant select on public.post_engagement_daily to authenticated;
