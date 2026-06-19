-- RLS test template — Nun Ibiza PinBoard App
-- Copy this file, rename to rls_<tabla>_<accion>.sql and fill in the blanks.
-- See supabase/tests/rls/PLAN.md for the full conventions.
--
-- Seed UUIDs (from supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

BEGIN;
SELECT plan(2);

-- ── Session helper ────────────────────────────────────────────────────────────
-- Sets JWT claims AND switches Postgres role to `authenticated` so RLS applies.
CREATE OR REPLACE FUNCTION pg_temp.set_session(uid uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL ROLE authenticated;
END;
$$;

-- ── Optional: test-specific fixture data ──────────────────────────────────────
-- Run BEFORE any set_session() call so inserts execute as postgres (superuser).
-- Example:
-- INSERT INTO public.posts (id, author_id, title, body)
-- VALUES ('bbbbbbbb-0000-0000-0000-000000000001',
--         'aaaaaaaa-0000-0000-0000-000000000002',
--         'Test post', 'Body text');

-- ── Caso positivo ─────────────────────────────────────────────────────────────
SELECT pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);  -- admin

SELECT lives_ok(
  $test$
    SELECT 1
  $test$,
  'REPLACE ME: descripción del caso positivo'
);

-- ── Caso negativo ─────────────────────────────────────────────────────────────
SELECT pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);  -- staff

SELECT throws_ok(
  $test$
    UPDATE public.profiles SET role = 'admin'
    WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  $test$,
  '42501',
  null,
  'staff no puede escalar su propio rol (reemplazar con el caso de prueba real)'
);

-- ── Cleanup ───────────────────────────────────────────────────────────────────
SELECT * FROM finish();
ROLLBACK;
