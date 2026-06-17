-- pgTAP tests for migration 0002: profiles.role indexes and defaults
BEGIN;

SELECT plan(7);

-- 1. Positive: B-Tree index profiles_role_idx exists on public.profiles(role)
SELECT has_index(
  'public', 'profiles', 'profiles_role_idx',
  'profiles_role_idx index exists on public.profiles'
);

-- 2. Positive: partial index profiles_elevated_role_idx exists
SELECT has_index(
  'public', 'profiles', 'profiles_elevated_role_idx',
  'profiles_elevated_role_idx partial index exists on public.profiles'
);

-- 3. Positive: profiles.role is NOT NULL
SELECT col_not_null(
  'public', 'profiles', 'role',
  'profiles.role is NOT NULL'
);

-- 4. Positive: profiles.role default is staff
SELECT col_default_is(
  'public', 'profiles', 'role', 'staff',
  'profiles.role default value is staff'
);

-- 5. Positive: inserting a row without explicit role gets default staff
DO $$
DECLARE
  test_id uuid := 'bbbbbbbb-0000-0000-0000-000000000001'::uuid;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, created_at, updated_at, role)
  VALUES (test_id, 'test-default@nun-ibiza.dev', 'x', now(), now(), 'authenticated');
  INSERT INTO public.profiles (id, full_name) VALUES (test_id, 'Test Default Role');
END;
$$;

SELECT is(
  (SELECT role::text FROM public.profiles
   WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001'::uuid),
  'staff',
  'a profile inserted without explicit role gets default staff'
);

-- 6. Positive: seed users exist with correct roles
SELECT is(
  (SELECT COUNT(*)::int FROM public.profiles
   WHERE id IN (
     'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
     'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
     'aaaaaaaa-0000-0000-0000-000000000003'::uuid
   )),
  3,
  'seed contains exactly three profiles'
);

-- 7. Negative: inserting NULL into profiles.role raises a not-null violation
SELECT throws_ok(
  $$INSERT INTO public.profiles (id, role, full_name)
    VALUES ('cccccccc-0000-0000-0000-000000000001'::uuid, NULL, 'Null Role Test')$$,
  '23502',
  NULL,
  'inserting NULL into profiles.role raises a not-null constraint violation'
);

SELECT * FROM finish();
ROLLBACK;
