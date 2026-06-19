-- RLS tests: engagement_sessions table
-- Policy: engagement_sessions_select_own_or_manager
-- No write policies exist by design — all writes go through service_role.
-- refs: docs/adr/0002-rbac.md
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(5);

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

create or replace function pg_temp.reset_session()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{}', true);
  reset role;
end;
$$;

-- Fixtures (inserted as postgres = service_role equivalent, bypasses RLS)
insert into public.posts (id, author_id, title, body)
values ('aaaaaaaa-1111-0000-0000-000000000001'::uuid,
        'aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'Post for engagement', 'Body');

-- Staff owns this session
insert into public.engagement_sessions (id, user_id, post_id)
values ('aaaaaaaa-1111-0000-0000-000000000010'::uuid,
        'aaaaaaaa-0000-0000-0000-000000000003'::uuid,
        'aaaaaaaa-1111-0000-0000-000000000001'::uuid);

-- Manager owns this session
insert into public.engagement_sessions (id, user_id, post_id)
values ('aaaaaaaa-1111-0000-0000-000000000011'::uuid,
        'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
        'aaaaaaaa-1111-0000-0000-000000000001'::uuid);

-- ── SELECT ────────────────────────────────────────────────────────────────────

-- Positive: staff sees only their own sessions
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select results_eq(
  $test$ select count(*)::int from public.engagement_sessions $test$,
  $expected$ values (1) $expected$,
  'staff solo ve sus propias sesiones de engagement'
);

-- Negative: staff cannot see sessions belonging to other users
select results_eq(
  $test$
    select count(*)::int from public.engagement_sessions
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
  $test$,
  $expected$ values (0) $expected$,
  'staff no puede ver sesiones de otro usuario'
);

-- Positive: manager sees all sessions (dashboard)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

select results_eq(
  $test$ select count(*)::int from public.engagement_sessions $test$,
  $expected$ values (2) $expected$,
  'manager ve todas las sesiones de engagement (dashboard)'
);

-- ── INSERT (write denied for authenticated) ───────────────────────────────────

-- Negative: authenticated staff cannot insert directly (no write policy)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select throws_ok(
  $test$
    insert into public.engagement_sessions (user_id, post_id)
    values ('aaaaaaaa-0000-0000-0000-000000000003'::uuid,
            'aaaaaaaa-1111-0000-0000-000000000001'::uuid)
  $test$,
  '42501',
  null,
  'authenticated no puede insertar en engagement_sessions (solo Edge Function con service_role)'
);

-- Negative: anon cannot insert
select pg_temp.reset_session();
set local role anon;

select throws_ok(
  $test$
    insert into public.engagement_sessions (user_id, post_id)
    values ('aaaaaaaa-0000-0000-0000-000000000003'::uuid,
            'aaaaaaaa-1111-0000-0000-000000000001'::uuid)
  $test$,
  '42501',
  null,
  'anon no puede insertar en engagement_sessions'
);

reset role;

select * from finish();
rollback;
