-- Migration: vista public.post_engagement_metrics — métricas de engagement por post
-- Part of Epic N04 / Feature F-N04-03 (#175) / Issue I-F-N04-03-01 (#180)
-- refs: docs/adr/0001-engagement.md (link_clicked + status)
--       docs/adr/0006-engagement-behavioral-signals.md (señales opcionales)
--
-- Define las métricas agregadas por post que consume el dashboard. La vista
-- materializada post_engagement_daily (I-F-N04-03-02) y la UI (I-F-N04-03-03)
-- se apoyan en esta definición.
--
-- Cada fuente se agrega POR SEPARADO en su propio CTE y luego se une por post_id.
-- Unir engagement_sessions con post_ratings/post_reactions directamente produciría
-- un fan-out (producto cartesiano) que inflaría los conteos y falsearía las medias.
--
-- Se parte de `posts` (no de engagement_sessions) para que un post sin sesiones
-- aparezca con 0: es justo el caso `unique_readers = 0` que debe evitar la división
-- por cero en click_rate (nullif → NULL, rate indefinido cuando no hay lectores).
--
-- Acceso: RBAC en Postgres. `security_invoker = on` hace que se apliquen las RLS de
-- las tablas base con el rol que consulta, y el guard `is_manager()` (inclusivo:
-- admin > manager) deja a staff con 0 filas.

create or replace view public.post_engagement_metrics
with (security_invoker = on) as
with sessions as (
  select
    post_id,
    count(distinct user_id)                             as unique_readers,
    count(distinct user_id) filter (where link_clicked) as unique_clicks,
    avg(focused_seconds)::numeric(10,2)                 as avg_seconds,
    avg(max_scroll_pct)::numeric(4,3)                   as avg_scroll
  from public.engagement_sessions
  group by post_id
),
ratings as (
  select
    post_id,
    avg(rating)::numeric(3,2) as avg_rating,
    count(*)                  as total_ratings
  from public.post_ratings
  group by post_id
),
reactions as (
  select post_id, count(*) as total_reactions
  from public.post_reactions
  group by post_id
),
comments as (
  select post_id, count(*) as total_comments
  from public.post_comments
  group by post_id
),
-- Usuarios que interactuaron con el post (reacción / valoración / comentario).
-- union (no union all) deduplica al mismo usuario que hizo varias cosas.
interactors as (
  select post_id, user_id   from public.post_reactions
  union
  select post_id, user_id   from public.post_ratings
  union
  select post_id, author_id from public.post_comments
),
-- status = engaged (ADR-001): interactuó pero NO clicó el enlace externo.
engaged as (
  select i.post_id, count(distinct i.user_id) as engaged_users
  from interactors i
  left join public.engagement_sessions es
    on  es.post_id = i.post_id
    and es.user_id = i.user_id
    and es.link_clicked
  where es.user_id is null
  group by i.post_id
)
select
  p.id                                as post_id,
  coalesce(s.unique_readers, 0)       as unique_readers,
  coalesce(s.unique_clicks, 0)        as unique_clicks,
  -- nullif evita la división por cero: sin lectores, el ratio es NULL (indefinido).
  round(
    coalesce(s.unique_clicks, 0)::numeric / nullif(s.unique_readers, 0),
    4
  )                                   as click_rate,
  r.avg_rating,
  coalesce(r.total_ratings, 0)        as total_ratings,
  coalesce(rx.total_reactions, 0)     as total_reactions,
  coalesce(c.total_comments, 0)       as total_comments,
  coalesce(e.engaged_users, 0)        as engaged_users,
  -- Señales opcionales (ADR-0006): disponibles, no obligatorias en la UI.
  s.avg_seconds,
  s.avg_scroll
from public.posts p
left join sessions  s  on s.post_id  = p.id
left join ratings   r  on r.post_id  = p.id
left join reactions rx on rx.post_id = p.id
left join comments  c  on c.post_id  = p.id
left join engaged   e  on e.post_id  = p.id
where public.is_manager();

comment on view public.post_engagement_metrics is
  'Métricas de engagement por post para el dashboard (F-N04-03). link_clicked es el eje: '
  'unique_clicks / click_rate. avg_seconds y avg_scroll son opcionales (ADR-0006). '
  'Solo admin/manager (guard is_manager()); staff obtiene 0 filas.';

grant select on public.post_engagement_metrics to authenticated;
