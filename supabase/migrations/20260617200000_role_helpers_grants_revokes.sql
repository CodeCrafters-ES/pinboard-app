-- Migration: 0004 — Grants/revokes for role helper functions
-- Part of Epic S00 / Feature F-S00-02: Helpers SECURITY DEFINER
-- Depends on: 0003 (auth_role, is_admin, is_manager, is_staff already created)
-- Safe to re-run: REVOKE/GRANT/ALTER OWNER are idempotent on repeated execution

-- 1. Revoke EXECUTE from public (covers anon and any unlisted role).
--    By default Postgres grants EXECUTE on new functions to PUBLIC; this
--    removes that implicit grant so anon clients cannot call the helpers.
REVOKE ALL ON FUNCTION
  public.auth_role(),
  public.is_admin(),
  public.is_manager(),
  public.is_staff()
FROM public;

-- 2. Grant EXECUTE only to the two roles that need it:
--    · authenticated — every logged-in Supabase user
--    · service_role  — Edge Functions running with the service key
GRANT EXECUTE ON FUNCTION
  public.auth_role(),
  public.is_admin(),
  public.is_manager(),
  public.is_staff()
TO authenticated;

GRANT EXECUTE ON FUNCTION
  public.auth_role(),
  public.is_admin(),
  public.is_manager(),
  public.is_staff()
TO service_role;

-- 3. Ensure the owner is postgres so that SECURITY DEFINER on auth_role()
--    runs with a trusted role that can read public.profiles regardless of
--    the caller's search_path.
ALTER FUNCTION public.auth_role()  OWNER TO postgres;
ALTER FUNCTION public.is_admin()   OWNER TO postgres;
ALTER FUNCTION public.is_manager() OWNER TO postgres;
ALTER FUNCTION public.is_staff()   OWNER TO postgres;
