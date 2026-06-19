-- RLS tests: profiles INSERT policy
-- Policy: profiles_insert_admin — only admin can insert rows directly.
-- refs: docs/adr/0002-rbac.md
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
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

-- Fixture: create an auth user without triggering handle_new_user (which would
-- auto-create a profile and cause a unique conflict in the test INSERT below).
alter table auth.users disable trigger on_auth_user_created;
insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, role)
values ('cccccccc-0000-0000-0000-000000000099'::uuid, 'test-insert@nun-ibiza.dev',
        'placeholder', now(), now(), now(), '{}', '{}', false, 'authenticated');
alter table auth.users enable trigger on_auth_user_created;

-- Positive: admin can insert a profile directly
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select lives_ok(
  $test$
    insert into public.profiles (user_id, email, role)
    values ('cccccccc-0000-0000-0000-000000000099'::uuid, 'test-insert@nun-ibiza.dev', 'staff')
  $test$,
  'admin puede insertar un perfil directamente'
);

-- Negative: staff cannot insert a profile directly (42501 thrown before FK check)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select throws_ok(
  $test$
    insert into public.profiles (user_id, email, role)
    values ('cccccccc-0000-0000-0000-000000000098'::uuid, 'test-insert2@nun-ibiza.dev', 'staff')
  $test$,
  '42501',
  null,
  'staff no puede insertar un perfil directamente'
);

select * from finish();
rollback;
