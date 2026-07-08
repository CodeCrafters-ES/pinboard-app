-- pgTAP tests for profiles table RLS policies
-- Run with: npx supabase test db
BEGIN;

SELECT plan(8);

-- Helper: simulate a specific auth.uid()
CREATE OR REPLACE FUNCTION set_auth_uid(uid uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
$$;

-- Setup test users directly in auth.users and their profiles
DO $$
DECLARE
  staff_id  uuid := '00000000-0000-0000-0000-000000000001';
  admin_id  uuid := '00000000-0000-0000-0000-000000000002';
  other_id  uuid := '00000000-0000-0000-0000-000000000003';
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES
    (staff_id, 'staff@test.com',  '{"role":"staff"}'::jsonb,  now(), now()),
    (admin_id, 'admin@test.com',  '{"role":"admin"}'::jsonb,  now(), now()),
    (other_id, 'other@test.com',  '{"role":"staff"}'::jsonb,  now(), now())
  ON CONFLICT (id) DO NOTHING;
  -- Profiles are created by the trigger; insert manually if trigger not yet active in test env
  INSERT INTO public.profiles (user_id, email, role)
  VALUES
    (staff_id, 'staff@test.com', 'staff'),
    (admin_id, 'admin@test.com', 'admin'),
    (other_id, 'other@test.com', 'staff')
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- 1. POSITIVE: staff user can SELECT their own profile
SELECT set_auth_uid('00000000-0000-0000-0000-000000000001'::uuid);
SELECT results_eq(
  $$SELECT count(*)::int FROM public.profiles WHERE user_id = '00000000-0000-0000-0000-000000000001'::uuid$$,
  $$VALUES (1)$$,
  'staff user can SELECT own profile'
);

-- 2. NEGATIVE: staff user cannot SELECT another user''s profile
SELECT set_auth_uid('00000000-0000-0000-0000-000000000001'::uuid);
SELECT results_eq(
  $$SELECT count(*)::int FROM public.profiles WHERE user_id = '00000000-0000-0000-0000-000000000003'::uuid$$,
  $$VALUES (0)$$,
  'staff user cannot SELECT another user profile'
);

-- 3. POSITIVE: admin can SELECT all profiles
SELECT set_auth_uid('00000000-0000-0000-0000-000000000002'::uuid);
SELECT ok(
  (SELECT count(*)::int FROM public.profiles) >= 3,
  'admin can SELECT all profiles'
);

-- 4. NEGATIVE: anon (unauthenticated) cannot SELECT any profile
SET LOCAL role TO anon;
SELECT results_eq(
  $$SELECT count(*)::int FROM public.profiles$$,
  $$VALUES (0)$$,
  'anon cannot SELECT any profile'
);
RESET role;

-- 5. POSITIVE: user can UPDATE their own name
SELECT set_auth_uid('00000000-0000-0000-0000-000000000001'::uuid);
SELECT lives_ok(
  $$UPDATE public.profiles SET name = 'Test Name' WHERE user_id = '00000000-0000-0000-0000-000000000001'::uuid$$,
  'staff can UPDATE own name'
);

-- 6. NEGATIVE: staff cannot self-escalate role to admin
SELECT set_auth_uid('00000000-0000-0000-0000-000000000001'::uuid);
SELECT throws_ok(
  $$UPDATE public.profiles SET role = 'admin' WHERE user_id = '00000000-0000-0000-0000-000000000001'::uuid$$,
  null,
  'staff cannot self-escalate role to admin'
);

-- 7. NEGATIVE: authenticated user cannot INSERT directly into profiles
SELECT set_auth_uid('00000000-0000-0000-0000-000000000001'::uuid);
SELECT throws_ok(
  $$INSERT INTO public.profiles (user_id, email, role) VALUES ('00000000-0000-0000-0000-000000000099'::uuid, 'new@test.com', 'staff')$$,
  null,
  'authenticated user cannot INSERT into profiles directly'
);

-- 8. POSITIVE: trigger creates profile on auth.users insert
DO $$
DECLARE
  new_uid uuid := '00000000-0000-0000-0000-000000000010';
BEGIN
  DELETE FROM auth.users WHERE id = new_uid;
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES (new_uid, 'triggered@test.com', '{"role":"manager"}'::jsonb, now(), now());
END;
$$;
SELECT results_eq(
  $$SELECT role::text FROM public.profiles WHERE user_id = '00000000-0000-0000-0000-000000000010'::uuid$$,
  $$VALUES ('manager')$$,
  'trigger auto-creates profile with correct role on auth.users insert'
);

SELECT * FROM finish();
ROLLBACK;
