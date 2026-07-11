-- Tests: MV private.post_engagement_daily + vista public.post_engagement_daily
-- Issue I-F-N04-03-02 (#181) — migración 20260711000001_create_post_engagement_daily_mv
-- refs: docs/adr/0001-engagement.md · docs/adr/0006-engagement-behavioral-signals.md
--
-- Dataset fijo con timestamps UTC explícitos (el bucketing de día es determinista).
-- Cubre: agregación por (post_id, día) desde las 4 fuentes, ausencia de fan-out,
-- día sin sesiones (click_rate NULL, sin división por cero), índice único para el
-- refresh concurrente, job horario de pg_cron y RBAC (staff no ve nada).
--
-- Nota: los tests corren en transacción, y REFRESH ... CONCURRENTLY no puede correr
-- dentro de un bloque transaccional; aquí se usa el REFRESH plano (equivalente en
-- resultado). El CONCURRENTLY lo ejerce el job de cron fuera de transacción.
--
-- Seed UUIDs (supabase/seed.sql) — ids de auth.users:
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(10);

create or replace function pg_temp.set_session(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
end;
$$;

-- ── Estructura ──────────────────────────────────────────────────────────────
select ok(
  (select count(*) from pg_matviews
    where schemaname = 'private' and matviewname = 'post_engagement_daily') = 1,
  'existe la MV private.post_engagement_daily (fuera del schema expuesto por PostgREST)'
);

select ok(
  exists (
    select 1
    from pg_index i
    join pg_class ic on ic.oid = i.indexrelid
    join pg_class tc on tc.oid = i.indrelid
    join pg_namespace n on n.oid = tc.relnamespace
    where n.nspname = 'private'
      and tc.relname = 'post_engagement_daily'
      and ic.relname = 'post_engagement_daily_pk'
      and i.indisunique
  ),
  'índice único (post_id, day): requisito de REFRESH MATERIALIZED VIEW CONCURRENTLY'
);

select is(
  (select schedule from cron.job where jobname = 'refresh-post-engagement-daily'),
  '0 * * * *',
  'refresco programado cada hora vía pg_cron (lag máximo del dashboard: 1h)'
);

select has_view('public', 'post_engagement_daily', 'existe la vista pública que consume el dashboard');

-- ── Dataset fijo (como postgres = bypass RLS) ───────────────────────────────
insert into public.posts (id, author_id, title, external_url, status, published_at)
select 'aaaaaaaa-4444-0000-0000-00000000000a'::uuid, p.id, 'Daily metrics post',
       'https://example.com/daily', 'published', '2026-07-01T08:00:00Z'
from public.profiles p where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid;

-- Día 1 (2026-07-01): 2 lectores, 1 clic. engagement_sessions es 1 fila por
-- (user_id, post_id), así que cada usuario aporta a un único día por post.
insert into public.engagement_sessions
  (user_id, post_id, started_at, link_clicked, status, focused_seconds, max_scroll_pct)
values
  ('aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'aaaaaaaa-4444-0000-0000-00000000000a'::uuid,
   '2026-07-01T10:00:00Z', true,  'clicked', 10, 0.800),
  ('aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'aaaaaaaa-4444-0000-0000-00000000000a'::uuid,
   '2026-07-01T11:00:00Z', false, 'viewed',  20, 0.400);

-- Día 1: 2 valoraciones (staff 5, manager 3) y 1 reacción (staff).
insert into public.post_ratings (post_id, user_id, rating, created_at) values
  ('aaaaaaaa-4444-0000-0000-00000000000a'::uuid, 'aaaaaaaa-0000-0000-0000-000000000003'::uuid,
   5, '2026-07-01T12:00:00Z'),
  ('aaaaaaaa-4444-0000-0000-00000000000a'::uuid, 'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
   3, '2026-07-01T13:00:00Z');

insert into public.post_reactions (post_id, user_id, type, created_at) values
  ('aaaaaaaa-4444-0000-0000-00000000000a'::uuid, 'aaaaaaaa-0000-0000-0000-000000000003'::uuid,
   'like', '2026-07-01T12:30:00Z');

-- Día 2 (2026-07-02): SIN sesiones; solo una valoración del admin.
-- Ejercita el "spine" (el día existe aunque no haya sesiones) y la división por cero.
insert into public.post_ratings (post_id, user_id, rating, created_at) values
  ('aaaaaaaa-4444-0000-0000-00000000000a'::uuid, 'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
   4, '2026-07-02T09:00:00Z');

refresh materialized view private.post_engagement_daily;

-- ── Métricas del día 1 (como manager) ───────────────────────────────────────
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

select results_eq(
  $$ select unique_readers, unique_clicks, click_rate
     from public.post_engagement_daily
     where post_id = 'aaaaaaaa-4444-0000-0000-00000000000a'::uuid
       and day = '2026-07-01'::date $$,
  $$ values (2::bigint, 1::bigint, 0.5000::numeric) $$,
  'día 1: unique_readers=2, unique_clicks=1, click_rate=0.5'
);

-- Con 2 sesiones × 2 ratings × 1 reacción, un JOIN sin pre-agregar daría
-- total_reactions=2 y total_ratings=4. Aquí se comprueba que no hay fan-out.
select results_eq(
  $$ select avg_rating, total_ratings, total_reactions, total_comments
     from public.post_engagement_daily
     where post_id = 'aaaaaaaa-4444-0000-0000-00000000000a'::uuid
       and day = '2026-07-01'::date $$,
  $$ values (4.00::numeric(3,2), 2::bigint, 1::bigint, 0::bigint) $$,
  'día 1: avg_rating=4.00, ratings=2, reactions=1, comments=0 (sin fan-out)'
);

select results_eq(
  $$ select avg_seconds, avg_scroll
     from public.post_engagement_daily
     where post_id = 'aaaaaaaa-4444-0000-0000-00000000000a'::uuid
       and day = '2026-07-01'::date $$,
  $$ values (15.00::numeric(10,2), 0.600::numeric(4,3)) $$,
  'día 1: señales opcionales avg_seconds=15.00, avg_scroll=0.600 (ADR-0006)'
);

-- ── Día 2: sin sesiones → click_rate NULL, sin división por cero ────────────
select results_eq(
  $$ select unique_readers, unique_clicks, click_rate, avg_rating, total_ratings
     from public.post_engagement_daily
     where post_id = 'aaaaaaaa-4444-0000-0000-00000000000a'::uuid
       and day = '2026-07-02'::date $$,
  $$ values (0::bigint, 0::bigint, null::numeric, 4.00::numeric(3,2), 1::bigint) $$,
  'día 2 sin sesiones: unique_readers=0 y click_rate NULL (sin división por cero)'
);

select results_eq(
  $$ select count(*)::int from public.post_engagement_daily
     where post_id = 'aaaaaaaa-4444-0000-0000-00000000000a'::uuid $$,
  $$ values (2) $$,
  'el post agrega en 2 filas: una por día con actividad'
);

-- ── RBAC ────────────────────────────────────────────────────────────────────
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select results_eq(
  $$ select count(*)::int from public.post_engagement_daily $$,
  $$ values (0) $$,
  'staff no ve datos del dashboard (vista vacía)'
);

reset role;

select * from finish();
rollback;
