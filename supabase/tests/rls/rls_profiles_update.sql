-- RLS tests: profiles UPDATE policy
-- Policy: profiles_update_self_or_admin
--   USING:      user_id = auth.uid() OR is_admin()
--   WITH CHECK: (user_id = auth.uid() AND role = auth_role()) OR is_admin()
-- refs: docs/adr/0002-rbac.md
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(4);

create or replace function pg_temp.set_session(uid uuid)
returns void language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text,
    true
  );
$$;

-- Positive: staff can update their own full_name
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select lives_ok(
  $test$
    update public.profiles
    set full_name = 'Staff Updated'
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  $test$,
  'staff puede actualizar su propio full_name'
);

-- Negative: staff cannot update another user's profile
select throws_ok(
  $test$
    update public.profiles
    set full_name = 'Hacked'
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
  $test$,
  '42501',
  null,
  'staff no puede actualizar el perfil de otro usuario'
);

-- Negative: staff cannot self-escalate role (WITH CHECK blocks it)
select throws_ok(
  $test$
    update public.profiles
    set role = 'admin'
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  $test$,
  '42501',
  null,
  'staff no puede escalar su propio rol'
);

-- Positive: admin can change another user's role
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select lives_ok(
  $test$
    update public.profiles
    set role = 'manager'
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  $test$,
  'admin puede cambiar el rol de otro usuario'
);

select * from finish();
rollback;
