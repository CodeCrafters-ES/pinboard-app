-- RLS tests: profiles DELETE policy
-- Policy: profiles_delete_admin — only admin can delete rows.
-- refs: docs/adr/0002-rbac.md
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(2);

create or replace function pg_temp.set_session(uid uuid)
returns void language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text,
    true
  );
$$;

-- Fixture: create a throwaway profile that admin will delete
insert into public.profiles (user_id, email, role)
values ('dddddddd-0000-0000-0000-000000000099'::uuid, 'delete-target@nun-ibiza.dev', 'staff');

-- Negative: staff cannot delete any profile
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select throws_ok(
  $test$
    delete from public.profiles
    where user_id = 'dddddddd-0000-0000-0000-000000000099'::uuid
  $test$,
  '42501',
  null,
  'staff no puede eliminar ningún perfil'
);

-- Positive: admin can delete a profile
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select lives_ok(
  $test$
    delete from public.profiles
    where user_id = 'dddddddd-0000-0000-0000-000000000099'::uuid
  $test$,
  'admin puede eliminar un perfil'
);

select * from finish();
rollback;
