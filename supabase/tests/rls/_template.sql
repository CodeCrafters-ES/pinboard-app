-- RLS test template — Nun Ibiza PinBoard App
-- Copy this file, rename to rls_<tabla>_<accion>.sql and fill in the blanks.
-- See supabase/tests/rls/PLAN.md for the full conventions.
--
-- Seed UUIDs (from supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

BEGIN;
SELECT plan(2);  -- adjust to match the number of assertions below

-- ── Session helper ────────────────────────────────────────────────────────────
-- Reusable inside this transaction; dropped automatically on ROLLBACK.
CREATE OR REPLACE FUNCTION pg_temp.set_session(uid uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text,
    true  -- local to transaction
  );
$$;

-- ── Optional: test-specific fixture data ──────────────────────────────────────
-- Create only what the test needs; ROLLBACK cleans it up automatically.
-- Example:
-- INSERT INTO public.posts (id, author_id, title, body)
-- VALUES ('bbbbbbbb-0000-0000-0000-000000000001',
--         'aaaaaaaa-0000-0000-0000-000000000002',  -- manager owns this post
--         'Test post', 'Body text');

-- ── Caso positivo ─────────────────────────────────────────────────────────────
-- Simulate the role that SHOULD be allowed to perform the operation.
SELECT pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);  -- admin

SELECT lives_ok(
  $test$
    -- Replace with the actual query that admin/manager/owner should be allowed to run.
    -- Example: UPDATE public.profiles SET full_name = 'Test' WHERE id = auth.uid()
    SELECT 1
  $test$,
  'REPLACE ME: descripción del caso positivo'
);

-- ── Caso negativo ─────────────────────────────────────────────────────────────
-- Simulate the role that SHOULD be blocked by the RLS policy.
SELECT pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);  -- staff

SELECT throws_ok(
  $test$
    -- Replace with the actual query that staff/anon should NOT be allowed to run.
    -- Example: UPDATE public.profiles SET role = 'admin' WHERE id <> auth.uid()
    SELECT 1/0
  $test$,
  '42501',  -- insufficient_privilege — the SQLSTATE RLS raises on block
  null,
  'REPLACE ME: descripción del caso negativo'
);

-- ── Cleanup ───────────────────────────────────────────────────────────────────
SELECT * FROM finish();
ROLLBACK;
