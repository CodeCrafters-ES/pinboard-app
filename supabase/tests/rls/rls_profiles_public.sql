-- RLS tests: profiles_public view — column restriction enforcement
-- View: profiles_public — limited columns, no email, no title
-- refs: docs/adr/0002-rbac.md, issue #74 (I-F-N01-02-02)
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

BEGIN;
SELECT plan(2);

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

-- Positive: staff can read another user's profile via profiles_public
SELECT pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

SELECT results_eq(
  $test$
    SELECT count(*)::int FROM public.profiles_public
    WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
  $test$,
  $expected$ VALUES (1) $expected$,
  'staff puede leer profiles_public de otro usuario'
);

-- Negative: email column does not exist in profiles_public (schema-level enforcement)
-- Error code 42703 = undefined_column
SELECT throws_ok(
  $test$
    SELECT email FROM public.profiles_public LIMIT 1
  $test$,
  '42703',
  null,
  'profiles_public no expone la columna email'
);

SELECT * FROM finish();
ROLLBACK;
