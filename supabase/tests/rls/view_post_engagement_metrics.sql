-- Tests: vista public.post_engagement_metrics (métricas de engagement por post)
-- Issue I-F-N04-03-01 (#180) — migración 20260711000000_create_post_engagement_metrics_view
-- refs: docs/adr/0001-engagement.md · docs/adr/0006-engagement-behavioral-signals.md
--
-- Dataset fijo y resultado esperado. Cubre además:
--   - división por cero: post sin sesiones → click_rate NULL (no error).
--   - fan-out: los conteos NO se multiplican al cruzar sesiones × ratings × reactions.
--   - RBAC: admin/manager ven datos; staff obtiene 0 filas.
--
-- Seed UUIDs (supabase/seed.sql) — son ids de auth.users:
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(8);

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

select has_view('public', 'post_engagement_metrics', 'existe la vista post_engagement_metrics');

-- ── Dataset fijo (como postgres = bypass RLS) ───────────────────────────────
-- POST_A: con actividad. POST_B: sin nada (caso unique_readers = 0).
insert into public.posts (id, author_id, title, external_url, status, published_at)
select v.id, p.id, v.title, 'https://example.com/metrics', 'published', now()
from (values
        ('aaaaaaaa-3333-0000-0000-00000000000a'::uuid, 'Metrics post A'),
        ('aaaaaaaa-3333-0000-0000-00000000000b'::uuid, 'Metrics post B')
     ) as v(id, title)
cross join lateral (
  select id from public.profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
) p;

-- Sesiones de POST_A: 3 lectores únicos, 1 con clic.
--   staff   → clicó,     10s, scroll 0.800
--   manager → sin clic,  20s, scroll 0.400
--   admin   → sin clic,   0s, scroll 0.000
insert into public.engagement_sessions
  (user_id, post_id, link_clicked, status, focused_seconds, max_scroll_pct)
values
  ('aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'aaaaaaaa-3333-0000-0000-00000000000a'::uuid,
   true,  'clicked', 10, 0.800),
  ('aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'aaaaaaaa-3333-0000-0000-00000000000a'::uuid,
   false, 'viewed',  20, 0.400),
  ('aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-3333-0000-0000-00000000000a'::uuid,
   false, 'viewed',   0, 0.000);

-- Valoraciones: staff 5, manager 3 → avg 4.00, total 2
insert into public.post_ratings (post_id, user_id, rating) values
  ('aaaaaaaa-3333-0000-0000-00000000000a'::uuid, 'aaaaaaaa-0000-0000-0000-000000000003'::uuid, 5),
  ('aaaaaaaa-3333-0000-0000-00000000000a'::uuid, 'aaaaaaaa-0000-0000-0000-000000000002'::uuid, 3);

-- Reacciones: staff like, admin love → total 2
insert into public.post_reactions (post_id, user_id, type) values
  ('aaaaaaaa-3333-0000-0000-00000000000a'::uuid, 'aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'like'),
  ('aaaaaaaa-3333-0000-0000-00000000000a'::uuid, 'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'love');

-- Comentario del admin → total 1
insert into public.post_comments (post_id, author_id, body) values
  ('aaaaaaaa-3333-0000-0000-00000000000a'::uuid, 'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'Buen artículo');

-- ── Métricas principales (POST_A), como manager ─────────────────────────────
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

select results_eq(
  $$ select unique_readers, unique_clicks, click_rate
     from public.post_engagement_metrics
     where post_id = 'aaaaaaaa-3333-0000-0000-00000000000a'::uuid $$,
  $$ values (3::bigint, 1::bigint, 0.3333::numeric) $$,
  'unique_readers=3, unique_clicks=1, click_rate=1/3=0.3333'
);

-- Si la vista uniera las fuentes sin pre-agregar (fan-out), estos conteos saldrían
-- multiplicados por el nº de sesiones. Con 3 sesiones × 2 ratings × 2 reactions,
-- un JOIN naíf daría total_reactions=6 y avg_rating distorsionada.
select results_eq(
  $$ select avg_rating, total_ratings, total_reactions, total_comments
     from public.post_engagement_metrics
     where post_id = 'aaaaaaaa-3333-0000-0000-00000000000a'::uuid $$,
  $$ values (4.00::numeric(3,2), 2::bigint, 2::bigint, 1::bigint) $$,
  'avg_rating=4.00, total_ratings=2, total_reactions=2, total_comments=1 (sin fan-out)'
);

-- engaged (ADR-001): interactuó y NO clicó.
--   staff   → interactuó pero clicó   → NO engaged
--   manager → valoró, sin clic        → engaged
--   admin   → reaccionó y comentó, sin clic → engaged
select results_eq(
  $$ select engaged_users from public.post_engagement_metrics
     where post_id = 'aaaaaaaa-3333-0000-0000-00000000000a'::uuid $$,
  $$ values (2::bigint) $$,
  'engaged_users=2 (manager y admin interactuaron sin clicar; staff clicó)'
);

-- Señales opcionales (ADR-0006): avg(10,20,0)=10.00 · avg(0.8,0.4,0)=0.400
select results_eq(
  $$ select avg_seconds, avg_scroll from public.post_engagement_metrics
     where post_id = 'aaaaaaaa-3333-0000-0000-00000000000a'::uuid $$,
  $$ values (10.00::numeric(10,2), 0.400::numeric(4,3)) $$,
  'métricas opcionales: avg_seconds=10.00, avg_scroll=0.400'
);

-- ── División por cero: POST_B no tiene sesiones ─────────────────────────────
select results_eq(
  $$ select unique_readers, unique_clicks, click_rate, total_reactions, engaged_users
     from public.post_engagement_metrics
     where post_id = 'aaaaaaaa-3333-0000-0000-00000000000b'::uuid $$,
  $$ values (0::bigint, 0::bigint, null::numeric, 0::bigint, 0::bigint) $$,
  'post sin sesiones: unique_readers=0 y click_rate NULL (sin división por cero)'
);

-- ── RBAC ────────────────────────────────────────────────────────────────────
-- admin ve datos (jerarquía inclusiva: is_manager() es true para admin)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select results_eq(
  $$ select unique_clicks from public.post_engagement_metrics
     where post_id = 'aaaaaaaa-3333-0000-0000-00000000000a'::uuid $$,
  $$ values (1::bigint) $$,
  'admin ve las métricas (jerarquía inclusiva)'
);

-- staff no ve nada: la vista devuelve vacío
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select results_eq(
  $$ select count(*)::int from public.post_engagement_metrics $$,
  $$ values (0) $$,
  'staff no ve datos de engagement (vista vacía)'
);

reset role;

select * from finish();
rollback;
