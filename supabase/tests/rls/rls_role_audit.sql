-- RLS tests: role_audit table
-- Covers: trigger behaviour, role_audit_select_admin policy,
--         and write-denial for authenticated/anon clients.
-- refs: docs/adr/0002-rbac.md
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
-- Ensure no rows from seed or prior tests contaminate trigger assertions.
truncate public.role_audit;
select plan(7);

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

-- ── Trigger: inserts audit row on role change ─────────────────────────────────
-- Execute as postgres (superuser) to simulate a service_role update or admin action.
-- Set jwt claims so auth.uid() returns the admin UUID inside the trigger.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);

update public.profiles
set role = 'manager'
where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid;  -- staff → manager

-- 1. Trigger inserted exactly one row in role_audit
select results_eq(
  $test$ select count(*)::int from public.role_audit $test$,
  $expected$ values (1) $expected$,
  'trigger inserta una fila en role_audit al cambiar profiles.role'
);

-- 2. Audit row has correct from_role and to_role
select results_eq(
  $test$
    select from_role::text, to_role::text
    from public.role_audit
    limit 1
  $test$,
  $expected$ values ('staff', 'manager') $expected$,
  'la fila de auditoría registra from_role y to_role correctos'
);

-- 3. Audit row records the actor (changed_by = admin UUID)
select results_eq(
  $test$
    select changed_by from public.role_audit limit 1
  $test$,
  $expected$ values ('aaaaaaaa-0000-0000-0000-000000000001'::uuid) $expected$,
  'la fila de auditoría registra el actor (changed_by = admin UUID)'
);

-- Restore staff role (no audit assertion needed, just cleanup)
select pg_temp.reset_session();
update public.profiles set role = 'staff'
where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid;

-- ── SELECT ────────────────────────────────────────────────────────────────────

-- 4. Positive: admin can read role_audit
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select ok(
  (select count(*)::int from public.role_audit) >= 1,
  'admin puede leer role_audit'
);

-- 5. Negative: staff cannot read role_audit (0 rows returned by RLS)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select results_eq(
  $test$ select count(*)::int from public.role_audit $test$,
  $expected$ values (0) $expected$,
  'staff no puede leer role_audit'
);

-- ── WRITE denied for authenticated ────────────────────────────────────────────

-- 6. Negative: authenticated cannot INSERT into role_audit
select throws_ok(
  $test$
    insert into public.role_audit (target_user_id, changed_by, from_role, to_role)
    values (null, 'aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'staff', 'admin')
  $test$,
  '42501',
  null,
  'authenticated no puede insertar en role_audit'
);

-- 7. Negative: anon cannot read role_audit
select pg_temp.reset_session();
set local role anon;

select results_eq(
  $test$ select count(*)::int from public.role_audit $test$,
  $expected$ values (0) $expected$,
  'anon no puede leer role_audit'
);

reset role;

select * from finish();
rollback;
