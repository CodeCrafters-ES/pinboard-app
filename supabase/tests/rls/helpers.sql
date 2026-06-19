-- pgTAP tests for migration 0003: SECURITY DEFINER role helper functions
-- Depends on seed.sql (aaaaaaaa-* users with admin / manager / staff roles)
BEGIN;

SELECT plan(20);

-- ── Function existence ────────────────────────────────────────────────────────

-- 1. auth_role() exists in public schema
SELECT has_function('public', 'auth_role', ARRAY[]::text[], 'auth_role() exists in public schema');

-- 2. is_admin() exists in public schema
SELECT has_function('public', 'is_admin', ARRAY[]::text[], 'is_admin() exists in public schema');

-- 3. is_manager() exists in public schema
SELECT has_function('public', 'is_manager', ARRAY[]::text[], 'is_manager() exists in public schema');

-- 4. is_staff() exists in public schema
SELECT has_function('public', 'is_staff', ARRAY[]::text[], 'is_staff() exists in public schema');

-- ── SECURITY DEFINER attribute on auth_role ───────────────────────────────────

-- 5. Positive: auth_role() is declared SECURITY DEFINER
SELECT is(
  (
    SELECT prosecdef
    FROM pg_proc
    JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
    WHERE pg_namespace.nspname = 'public'
      AND pg_proc.proname      = 'auth_role'
  ),
  true,
  'auth_role() has SECURITY DEFINER attribute'
);

-- 6. Positive: auth_role() has search_path set to 'public, auth'
SELECT is(
  (
    SELECT proconfig
    FROM pg_proc
    JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
    WHERE pg_namespace.nspname = 'public'
      AND pg_proc.proname      = 'auth_role'
  ),
  ARRAY['search_path=public, auth'],
  'auth_role() search_path is fixed to public, auth'
);

-- 7. Negative: is_admin() is NOT declared SECURITY DEFINER (ordinary STABLE)
SELECT is(
  (
    SELECT prosecdef
    FROM pg_proc
    JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
    WHERE pg_namespace.nspname = 'public'
      AND pg_proc.proname      = 'is_admin'
  ),
  false,
  'is_admin() is not SECURITY DEFINER (ordinary STABLE function)'
);

-- ── Behavior with seed users ──────────────────────────────────────────────────
-- Simulate each session by temporarily overriding auth.uid() via a local
-- setting used by the Supabase GoTrue stub (`request.jwt.claim.sub`).
-- In a real Supabase local stack the JWT is verified by GoTrue; here we SET
-- the claim directly so auth.uid() resolves to the desired UUID.

-- 8. Positive: auth_role() returns 'admin' when session is the admin seed user
SELECT is(
  (
    SELECT set_config('request.jwt.claim.sub',
                      'aaaaaaaa-0000-0000-0000-000000000001', true)
  ),
  'aaaaaaaa-0000-0000-0000-000000000001',
  'set_config helper: admin session configured'
);

SELECT is(
  public.auth_role()::text,
  'admin',
  'auth_role() returns admin for the admin seed user'
);

-- 9. Positive: is_admin() returns true for admin seed user (session still set)
SELECT is(
  public.is_admin(),
  true,
  'is_admin() returns true for admin seed user'
);

-- 10. Positive: is_manager() returns true for admin (inclusive hierarchy)
SELECT is(
  public.is_manager(),
  true,
  'is_manager() returns true for admin seed user (inclusive hierarchy)'
);

-- 11. Positive: is_staff() returns true for admin (inclusive hierarchy)
SELECT is(
  public.is_staff(),
  true,
  'is_staff() returns true for admin seed user (inclusive hierarchy)'
);

-- Switch session to manager seed user
SELECT set_config('request.jwt.claim.sub',
                  'aaaaaaaa-0000-0000-0000-000000000002', true);

-- 12. Positive: auth_role() returns 'manager' for the manager seed user
SELECT is(
  public.auth_role()::text,
  'manager',
  'auth_role() returns manager for the manager seed user'
);

-- 13. Negative: is_admin() returns false for manager seed user
SELECT is(
  public.is_admin(),
  false,
  'is_admin() returns false for manager seed user'
);

-- 14. Positive: is_manager() returns true for manager seed user
SELECT is(
  public.is_manager(),
  true,
  'is_manager() returns true for manager seed user'
);

-- 15. Positive: is_staff() returns true for manager seed user (inclusive hierarchy)
SELECT is(
  public.is_staff(),
  true,
  'is_staff() returns true for manager seed user (inclusive hierarchy)'
);

-- Switch session to staff seed user
SELECT set_config('request.jwt.claim.sub',
                  'aaaaaaaa-0000-0000-0000-000000000003', true);

-- 16. Negative: is_admin() returns false for staff seed user
SELECT is(
  public.is_admin(),
  false,
  'is_admin() returns false for staff seed user'
);

-- 17. Negative: is_manager() returns false for staff seed user
SELECT is(
  public.is_manager(),
  false,
  'is_manager() returns false for staff seed user'
);

-- 18. Positive: is_staff() returns true for staff seed user
SELECT is(
  public.is_staff(),
  true,
  'is_staff() returns true for staff seed user'
);

-- Clear session (simulate anon / no JWT)
SELECT set_config('request.jwt.claim.sub', '', true);

-- 19. Negative: is_admin() returns false (not null) when no session
SELECT is(
  public.is_admin(),
  false,
  'is_admin() returns false (never null) when there is no authenticated session'
);

SELECT * FROM finish();
ROLLBACK;
