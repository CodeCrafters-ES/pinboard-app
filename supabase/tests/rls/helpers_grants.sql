-- pgTAP tests for migration 0004: grants/revokes on role helper functions
-- Depends on: migration 0003 (functions created), seed.sql (roles set up)
BEGIN;

SELECT plan(8);

-- ── Owner checks ──────────────────────────────────────────────────────────────

-- 1. Positive: auth_role() owner is postgres
SELECT is(
  (
    SELECT pg_catalog.pg_get_userbyid(p.proowner)
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'auth_role'
  ),
  'postgres',
  'auth_role() owner is postgres'
);

-- 2. Positive: is_admin() owner is postgres
SELECT is(
  (
    SELECT pg_catalog.pg_get_userbyid(p.proowner)
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'is_admin'
  ),
  'postgres',
  'is_admin() owner is postgres'
);

-- 3. Positive: is_manager() owner is postgres
SELECT is(
  (
    SELECT pg_catalog.pg_get_userbyid(p.proowner)
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'is_manager'
  ),
  'postgres',
  'is_manager() owner is postgres'
);

-- 4. Positive: is_staff() owner is postgres
SELECT is(
  (
    SELECT pg_catalog.pg_get_userbyid(p.proowner)
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'is_staff'
  ),
  'postgres',
  'is_staff() owner is postgres'
);

-- ── Privilege checks via information_schema ───────────────────────────────────

-- 5. Negative: public/anon has no EXECUTE on auth_role()
SELECT is(
  (
    SELECT COUNT(*)::int
    FROM information_schema.routine_privileges
    WHERE routine_schema   = 'public'
      AND routine_name     = 'auth_role'
      AND grantee          IN ('PUBLIC', 'anon')
      AND privilege_type   = 'EXECUTE'
  ),
  0,
  'anon / PUBLIC has no EXECUTE privilege on auth_role()'
);

-- 6. Positive: authenticated role has EXECUTE on auth_role()
SELECT is(
  (
    SELECT COUNT(*)::int
    FROM information_schema.routine_privileges
    WHERE routine_schema   = 'public'
      AND routine_name     = 'auth_role'
      AND grantee          = 'authenticated'
      AND privilege_type   = 'EXECUTE'
  ),
  1,
  'authenticated role has EXECUTE privilege on auth_role()'
);

-- 7. Positive: service_role has EXECUTE on auth_role()
SELECT is(
  (
    SELECT COUNT(*)::int
    FROM information_schema.routine_privileges
    WHERE routine_schema   = 'public'
      AND routine_name     = 'auth_role'
      AND grantee          = 'service_role'
      AND privilege_type   = 'EXECUTE'
  ),
  1,
  'service_role has EXECUTE privilege on auth_role()'
);

-- 8. Negative: anon has no EXECUTE on is_admin()
SELECT is(
  (
    SELECT COUNT(*)::int
    FROM information_schema.routine_privileges
    WHERE routine_schema   = 'public'
      AND routine_name     = 'is_admin'
      AND grantee          IN ('PUBLIC', 'anon')
      AND privilege_type   = 'EXECUTE'
  ),
  0,
  'anon / PUBLIC has no EXECUTE privilege on is_admin()'
);

SELECT * FROM finish();
ROLLBACK;
