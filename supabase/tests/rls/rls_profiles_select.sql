-- RLS tests: profiles SELECT policy
-- Policy: profiles_select_authenticated — any authenticated user sees all rows.
-- refs: docs/adr/0002-rbac.md
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(2);

create or replace function pg_temp.set_session(uid uuid)
returns void language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text,
    true
  );
$$;

-- Positive: staff can read another user's profile
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select results_eq(
  $test$
    select count(*)::int from public.profiles
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
  $test$,
  $expected$ values (1) $expected$,
  'staff puede leer el perfil de otro usuario'
);

-- Negative: anon (unauthenticated) gets zero rows
set local role anon;

select results_eq(
  $test$ select count(*)::int from public.profiles $test$,
  $expected$ values (0) $expected$,
  'anon no puede leer ningún perfil'
);

reset role;

select * from finish();
rollback;
