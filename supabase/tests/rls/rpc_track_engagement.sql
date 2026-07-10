-- RPC tests: public.apply_engagement_events (escritura del lote de engagement)
-- Issue I-F-N04-02-02 (#179) — migración 20260710000001_track_engagement_rpc
-- refs: docs/adr/0001-engagement.md · docs/adr/0006-engagement-behavioral-signals.md
--
-- Ejercita la lógica de escritura que delega la Edge Function track-engagement:
-- status viewed→clicked, link_clicked append-only, acumulación de focused_seconds,
-- máximo de max_scroll_pct, pre-agregación del lote por post_id e idempotencia de filas.
-- (El contrato HTTP/JWT/array se cubre en __tests__/integration/trackEngagement.test.ts.)
--
-- Seed UUIDs (supabase/seed.sql):
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(11);

-- La función existe y solo la ejecuta service_role (no anon/authenticated).
select has_function('public', 'apply_engagement_events', array['uuid', 'jsonb'], 'existe apply_engagement_events(uuid, jsonb)');
select function_privs_are('public', 'apply_engagement_events', array['uuid', 'jsonb'], 'service_role', array['EXECUTE'], 'service_role puede ejecutar la RPC');
select function_privs_are('public', 'apply_engagement_events', array['uuid', 'jsonb'], 'authenticated', array[]::text[], 'authenticated NO puede ejecutar la RPC');
select function_privs_are('public', 'apply_engagement_events', array['uuid', 'jsonb'], 'anon', array[]::text[], 'anon NO puede ejecutar la RPC');

-- Fixtures (como postgres = bypass RLS): dos posts del manager.
insert into public.posts (id, author_id, title, external_url)
select v.id, p.id, v.title, 'https://example.com/rpc'
from (values
        ('aaaaaaaa-2222-0000-0000-000000000001'::uuid, 'RPC post A'),
        ('aaaaaaaa-2222-0000-0000-000000000002'::uuid, 'RPC post B')
     ) as v(id, title)
cross join lateral (
  select id from public.profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
) p;

-- ── 1er evento sin clic → viewed, link_clicked=false ────────────────────────
select public.apply_engagement_events(
  'aaaaaaaa-0000-0000-0000-000000000003'::uuid,
  '[{"session_id":"bbbbbbbb-0000-0000-0000-000000000001","post_id":"aaaaaaaa-2222-0000-0000-000000000001","focused_seconds_delta":0,"max_scroll_pct":0}]'::jsonb
);

select results_eq(
  $$ select status, link_clicked from public.engagement_sessions
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
       and post_id = 'aaaaaaaa-2222-0000-0000-000000000001'::uuid $$,
  $$ values ('viewed', false) $$,
  'primer evento crea la sesión con status=viewed y link_clicked=false'
);

-- ── link_clicked=true → clicked ─────────────────────────────────────────────
select public.apply_engagement_events(
  'aaaaaaaa-0000-0000-0000-000000000003'::uuid,
  '[{"session_id":"bbbbbbbb-0000-0000-0000-000000000001","post_id":"aaaaaaaa-2222-0000-0000-000000000001","link_clicked":true}]'::jsonb
);

select results_eq(
  $$ select status, link_clicked from public.engagement_sessions
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
       and post_id = 'aaaaaaaa-2222-0000-0000-000000000001'::uuid $$,
  $$ values ('clicked', true) $$,
  'link_clicked=true fija status=clicked'
);

-- ── append-only: un evento posterior sin clic no revierte clicked ────────────
select public.apply_engagement_events(
  'aaaaaaaa-0000-0000-0000-000000000003'::uuid,
  '[{"session_id":"bbbbbbbb-0000-0000-0000-000000000001","post_id":"aaaaaaaa-2222-0000-0000-000000000001","link_clicked":false,"focused_seconds_delta":10}]'::jsonb
);

select results_eq(
  $$ select status, link_clicked from public.engagement_sessions
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
       and post_id = 'aaaaaaaa-2222-0000-0000-000000000001'::uuid $$,
  $$ values ('clicked', true) $$,
  'link_clicked append-only: clicked no vuelve a viewed'
);

-- ── acumulación focused_seconds + máximo max_scroll_pct (varios lotes) ───────
select public.apply_engagement_events(
  'aaaaaaaa-0000-0000-0000-000000000003'::uuid,
  '[{"session_id":"bbbbbbbb-0000-0000-0000-000000000002","post_id":"aaaaaaaa-2222-0000-0000-000000000002","focused_seconds_delta":5,"max_scroll_pct":0.30}]'::jsonb
);
select public.apply_engagement_events(
  'aaaaaaaa-0000-0000-0000-000000000003'::uuid,
  '[{"session_id":"bbbbbbbb-0000-0000-0000-000000000002","post_id":"aaaaaaaa-2222-0000-0000-000000000002","focused_seconds_delta":7,"max_scroll_pct":0.10}]'::jsonb
);

select results_eq(
  $$ select focused_seconds, max_scroll_pct from public.engagement_sessions
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
       and post_id = 'aaaaaaaa-2222-0000-0000-000000000002'::uuid $$,
  $$ values (12, 0.300::numeric(4,3)) $$,
  'focused_seconds acumula (5+7=12); max_scroll_pct toma el máximo (0.30)'
);

-- ── pre-agregación del lote: varios eventos del mismo post en un solo array ──
select lives_ok(
  $$ select public.apply_engagement_events(
       'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
       '[{"session_id":"bbbbbbbb-0000-0000-0000-000000000003","post_id":"aaaaaaaa-2222-0000-0000-000000000001","focused_seconds_delta":3,"max_scroll_pct":0.20},
         {"session_id":"bbbbbbbb-0000-0000-0000-000000000003","post_id":"aaaaaaaa-2222-0000-0000-000000000001","focused_seconds_delta":4,"max_scroll_pct":0.50}]'::jsonb
     ) $$,
  'un lote con varios eventos del mismo post no lanza "affect row twice"'
);

select results_eq(
  $$ select focused_seconds, max_scroll_pct from public.engagement_sessions
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
       and post_id = 'aaaaaaaa-2222-0000-0000-000000000001'::uuid $$,
  $$ values (7, 0.500::numeric(4,3)) $$,
  'eventos del mismo lote se pre-agregan (3+4=7; máx 0.50)'
);

-- ── idempotencia de filas: 1 par (user_id, post_id) = 1 fila ────────────────
select results_eq(
  $$ select count(*)::int from public.engagement_sessions
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid $$,
  $$ values (2) $$,
  'varios lotes no duplican filas: staff tiene 1 fila por post (2 posts)'
);

select * from finish();
rollback;
