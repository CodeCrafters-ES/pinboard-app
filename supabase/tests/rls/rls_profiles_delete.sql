-- RLS tests: profiles DELETE policy
-- Policy: profiles_delete_admin — only admin can delete rows.
-- refs: docs/adr/0002-rbac.md
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(2);

create or replace function pg_temp.set_session(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
end;
$$;

-- Negative: staff cannot delete any profile (uses existing manager seed profile)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select throws_ok(
  $test$
    delete from public.profiles
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
  $test$,
  '42501',
  null,
  'staff no puede eliminar ningún perfil'
);

-- Positive: admin can delete a profile (uses existing manager seed profile)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select lives_ok(
  $test$
    delete from public.profiles
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
  $test$,
  'admin puede eliminar un perfil'
);

select * from finish();
rollback;
