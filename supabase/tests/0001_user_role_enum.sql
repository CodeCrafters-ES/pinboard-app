-- pgTAP tests for migration 0001: user_role enum + profiles.role column
BEGIN;

SELECT plan(8);

-- 1. Positive: enum type exists in public schema
SELECT has_type('public', 'user_role', 'user_role enum exists in public schema');

-- 2. Positive: enum contains exactly the three expected values in order
SELECT is(
  ARRAY(
    SELECT enumlabel::text
    FROM pg_enum
    JOIN pg_type      ON pg_enum.enumtypid     = pg_type.oid
    JOIN pg_namespace ON pg_type.typnamespace  = pg_namespace.oid
    WHERE pg_type.typname    = 'user_role'
      AND pg_namespace.nspname = 'public'
    ORDER BY enumsortorder
  ),
  ARRAY['admin', 'manager', 'staff'],
  'user_role enum contains exactly admin, manager, staff in order'
);

-- 3. Positive: profiles table exists
SELECT has_table('public', 'profiles', 'profiles table exists in public schema');

-- 4. Positive: profiles.role column exists
SELECT has_column('public', 'profiles', 'role', 'profiles.role column exists');

-- 5. Positive: profiles.role is NOT NULL
SELECT col_not_null('public', 'profiles', 'role', 'profiles.role is NOT NULL');

-- 6. Positive: profiles.role default is staff
SELECT col_default_is(
  'public', 'profiles', 'role', 'staff',
  'profiles.role default value is staff'
);

-- 7. Positive: profiles.id is a primary key
SELECT col_is_pk('public', 'profiles', 'id', 'profiles.id is the primary key');

-- 8. Negative: inserting an unlisted role value raises an error
SELECT throws_ok(
  $$INSERT INTO public.profiles (id, role)
    VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'superuser'::public.user_role)$$,
  'invalid input value for enum user_role: "superuser"',
  'inserting an invalid role value raises a Postgres enum error'
);

SELECT * FROM finish();
ROLLBACK;
