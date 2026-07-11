-- Schema/constraints tests: engagement_sessions (modelo aditivo)
-- Issue I-F-N04-02-01 (#178) — migración 20260710000000_alter_engagement_sessions_additive
-- refs: docs/adr/0001-engagement.md · docs/adr/0006-engagement-behavioral-signals.md
--
-- Cubre la alineación de `status` (viewed/engaged/clicked) y las columnas aditivas
-- `focused_seconds` / `max_scroll_pct`, sus defaults, CHECKs, UPSERT y cascades.
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(19);

-- ── Estructura de columnas ──────────────────────────────────────────────────
select has_column('public', 'engagement_sessions', 'link_clicked',    'existe link_clicked');
select has_column('public', 'engagement_sessions', 'status',          'existe status');
select has_column('public', 'engagement_sessions', 'focused_seconds', 'existe focused_seconds (ADR-0006)');
select has_column('public', 'engagement_sessions', 'max_scroll_pct',  'existe max_scroll_pct (ADR-0006)');

select col_type_is('public', 'engagement_sessions', 'focused_seconds', 'integer',      'focused_seconds es integer');
select col_type_is('public', 'engagement_sessions', 'max_scroll_pct',  'numeric(4,3)', 'max_scroll_pct es numeric(4,3)');

-- ── Defaults ────────────────────────────────────────────────────────────────
select col_default_is('public', 'engagement_sessions', 'link_clicked',    'false',    'link_clicked default false');
select col_default_is('public', 'engagement_sessions', 'status',          'viewed',   'status default viewed (ADR-001)');
select col_default_is('public', 'engagement_sessions', 'focused_seconds', '0',        'focused_seconds default 0');
select col_default_is('public', 'engagement_sessions', 'max_scroll_pct',  '0',        'max_scroll_pct default 0');

-- ── Legacy fuera: el modelo reading-session revertido (#226) no debe reaparecer ─
select hasnt_column('public', 'engagement_sessions', 'session_id', 'no existe session_id (modelo revertido)');
select hasnt_column('public', 'engagement_sessions', 'state',      'no existe state (modelo revertido)');

-- ── Fixtures (como postgres = bypass RLS) ───────────────────────────────────
insert into public.posts (id, author_id, title, external_url)
select
  'aaaaaaaa-1111-0000-0000-000000000001'::uuid,
  p.id,
  'Post for engagement schema test',
  'https://example.com/test'
from public.profiles p where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid;

-- ── CHECK de status: solo viewed/engaged/clicked ────────────────────────────
select throws_ok(
  $test$
    insert into public.engagement_sessions (user_id, post_id, status)
    values ('aaaaaaaa-0000-0000-0000-000000000003'::uuid,
            'aaaaaaaa-1111-0000-0000-000000000001'::uuid, 'active')
  $test$,
  '23514',
  null,
  'status rechaza el valor legacy active (solo viewed/engaged/clicked)'
);

-- ── CHECK de columnas aditivas ──────────────────────────────────────────────
select throws_ok(
  $test$
    insert into public.engagement_sessions (user_id, post_id, max_scroll_pct)
    values ('aaaaaaaa-0000-0000-0000-000000000003'::uuid,
            'aaaaaaaa-1111-0000-0000-000000000001'::uuid, 1.5)
  $test$,
  '23514',
  null,
  'max_scroll_pct = 1.5 viola el CHECK ∈ [0,1]'
);

select throws_ok(
  $test$
    insert into public.engagement_sessions (user_id, post_id, focused_seconds)
    values ('aaaaaaaa-0000-0000-0000-000000000003'::uuid,
            'aaaaaaaa-1111-0000-0000-000000000001'::uuid, -1)
  $test$,
  '23514',
  null,
  'focused_seconds = -1 viola el CHECK >= 0'
);

-- ── UPSERT on conflict (user_id, post_id): acumula sin crear filas duplicadas ─
insert into public.engagement_sessions (user_id, post_id, focused_seconds, max_scroll_pct)
values ('aaaaaaaa-0000-0000-0000-000000000003'::uuid,
        'aaaaaaaa-1111-0000-0000-000000000001'::uuid, 5, 0.30)
on conflict (user_id, post_id) do update set
  focused_seconds = engagement_sessions.focused_seconds + excluded.focused_seconds,
  max_scroll_pct  = greatest(engagement_sessions.max_scroll_pct, excluded.max_scroll_pct);

insert into public.engagement_sessions (user_id, post_id, focused_seconds, max_scroll_pct)
values ('aaaaaaaa-0000-0000-0000-000000000003'::uuid,
        'aaaaaaaa-1111-0000-0000-000000000001'::uuid, 7, 0.10)
on conflict (user_id, post_id) do update set
  focused_seconds = engagement_sessions.focused_seconds + excluded.focused_seconds,
  max_scroll_pct  = greatest(engagement_sessions.max_scroll_pct, excluded.max_scroll_pct);

select results_eq(
  $test$
    select focused_seconds, max_scroll_pct
    from public.engagement_sessions
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
      and post_id = 'aaaaaaaa-1111-0000-0000-000000000001'::uuid
  $test$,
  $expected$ values (12, 0.300::numeric(4,3)) $expected$,
  'UPSERT acumula focused_seconds (5+7=12) y toma el máximo de max_scroll_pct (0.30)'
);

select results_eq(
  $test$
    select count(*)::int from public.engagement_sessions
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
      and post_id = 'aaaaaaaa-1111-0000-0000-000000000001'::uuid
  $test$,
  $expected$ values (1) $expected$,
  'un par (user_id, post_id) = 1 fila tras varios UPSERT'
);

-- ── Cascade al borrar el post ───────────────────────────────────────────────
delete from public.posts where id = 'aaaaaaaa-1111-0000-0000-000000000001'::uuid;

select results_eq(
  $test$ select count(*)::int from public.engagement_sessions
         where post_id = 'aaaaaaaa-1111-0000-0000-000000000001'::uuid $test$,
  $expected$ values (0) $expected$,
  'borrar el post elimina sus engagement_sessions (cascade)'
);

-- ── Cascade al borrar el usuario (auth.users) ───────────────────────────────
insert into public.posts (id, author_id, title, external_url)
select
  'aaaaaaaa-1111-0000-0000-000000000002'::uuid,
  p.id,
  'Post for cascade-user test',
  'https://example.com/test2'
from public.profiles p where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid;

-- Usuario efímero solo para probar el cascade sobre auth.users
insert into auth.users (id, email)
values ('aaaaaaaa-0000-0000-0000-0000000000ff'::uuid, 'cascade-test@nun-ibiza.dev');

insert into public.engagement_sessions (user_id, post_id)
values ('aaaaaaaa-0000-0000-0000-0000000000ff'::uuid,
        'aaaaaaaa-1111-0000-0000-000000000002'::uuid);

delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-0000000000ff'::uuid;

select results_eq(
  $test$ select count(*)::int from public.engagement_sessions
         where user_id = 'aaaaaaaa-0000-0000-0000-0000000000ff'::uuid $test$,
  $expected$ values (0) $expected$,
  'borrar el usuario (auth.users) elimina sus engagement_sessions (cascade)'
);

select * from finish();
rollback;
