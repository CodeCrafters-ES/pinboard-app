-- RLS tests: profiles SELECT policy
-- Policy: profiles_select_self_or_privileged
--   USING: user_id = auth.uid() OR is_manager()
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

-- Positive: admin can read any profile
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select results_eq(
  $test$
    select count(*)::int from public.profiles
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
  $test$,
  $expected$ values (1) $expected$,
  'admin puede leer el perfil de otro usuario'
);

-- Positive: manager can read any profile
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

select results_eq(
  $test$
    select count(*)::int from public.profiles
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  $test$,
  $expected$ values (1) $expected$,
  'manager puede leer el perfil de otro usuario'
);

-- Positive: staff can read their own profile
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select results_eq(
  $test$
    select count(*)::int from public.profiles
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  $test$,
  $expected$ values (1) $expected$,
  'staff puede leer su propio perfil'
);

-- Negative: staff cannot read another user''s profile (prevents email leakage)
select results_eq(
  $test$
    select count(*)::int from public.profiles
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
  $test$,
  $expected$ values (0) $expected$,
  'staff no puede leer el perfil de otro usuario desde profiles'
);

-- Negative: anon gets zero rows
reset role;
set local role anon;

select results_eq(
  $test$ select count(*)::int from public.profiles $test$,
  $expected$ values (0) $expected$,
  'anon no puede leer ningún perfil'
);

reset role;

select * from finish();
rollback;
