-- Migration: restrict profiles SELECT so staff can only read their own row.
-- Requires PostgreSQL 15+ (ALTER VIEW ... SET (security_invoker = false)).
DO $$
BEGIN
  IF current_setting('server_version_num')::int < 150000 THEN
    RAISE EXCEPTION
      'Migration 20260703000000 requires PostgreSQL 15+. Current version: %', version();
  END IF;
END;
$$;

-- Fixes: staff could read email of other users by querying profiles directly.
-- refs: docs/adr/0002-rbac.md, issue #62 (I-F-N01-02-02 AC)
--
-- Before: profiles_select_authenticated — USING (true) — any authenticated
--         user could read all rows including the email column.
--
-- After: profiles_select_self_or_privileged — staff reads own row only;
--        admin + manager (is_manager() is inclusive) read all rows.
--
-- profiles_public view:
--   SET security_invoker = false (PostgreSQL 15+) so that the view's queries
--   run as the view owner (postgres/superuser), bypassing RLS on profiles.
--   Staff can therefore still list other users through profiles_public — which
--   has no email column — without being blocked by the new policy.
--   Requires PostgreSQL 15+. Supabase projects created after 2023 run PG 15+.

-- 1. Drop the open SELECT policy ─────────────────────────────────────────────
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;

-- 2. Restricted SELECT policy ─────────────────────────────────────────────────
-- is_manager() returns true for both admin and manager (inclusive hierarchy).
CREATE POLICY profiles_select_self_or_privileged
  ON public.profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_manager());

-- 3. profiles_public: run as view owner so RLS on profiles is bypassed ────────
ALTER VIEW public.profiles_public SET (security_invoker = false);
