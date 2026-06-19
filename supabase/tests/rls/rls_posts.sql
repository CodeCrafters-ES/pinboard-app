-- RLS tests: posts table
-- Policies: posts_select_authenticated, posts_insert_manager_or_admin,
--           posts_update_own_or_admin, posts_delete_own_or_admin
-- refs: docs/adr/0002-rbac.md
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(7);

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

-- Fixture: a post owned by the manager seed user (inserted as postgres, bypasses RLS)
insert into public.posts (id, author_id, title, body)
values (
  'bbbbbbbb-0000-0000-0000-000000000001'::uuid,
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid,  -- manager
  'Test post', 'Test body'
);

-- ── SELECT ────────────────────────────────────────────────────────────────────

-- Positive: staff can read posts
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select results_eq(
  $test$ select count(*)::int from public.posts $test$,
  $expected$ values (1) $expected$,
  'staff puede leer posts'
);

-- ── INSERT ────────────────────────────────────────────────────────────────────

-- Positive: manager can insert a post as themselves
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

select lives_ok(
  $test$
    insert into public.posts (author_id, title, body)
    values ('aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'Manager post', 'Body')
  $test$,
  'manager puede insertar un post como author propio'
);

-- Negative: staff cannot insert a post
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select throws_ok(
  $test$
    insert into public.posts (author_id, title, body)
    values ('aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'Staff post', 'Body')
  $test$,
  '42501',
  null,
  'staff no puede insertar un post'
);

-- ── UPDATE ────────────────────────────────────────────────────────────────────

-- Positive: manager can update their own post
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

select lives_ok(
  $test$
    update public.posts set title = 'Updated title'
    where id = 'bbbbbbbb-0000-0000-0000-000000000001'::uuid
  $test$,
  'manager puede actualizar su propio post'
);

-- Negative: staff cannot update any post (USING blocks silently)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select is(
  (with res as (
    update public.posts set title = 'Hacked'
    where id = 'bbbbbbbb-0000-0000-0000-000000000001'::uuid
    returning 1
  ) select count(*)::int from res),
  0,
  'staff no puede modificar un post'
);

-- ── DELETE ────────────────────────────────────────────────────────────────────

-- Positive: manager can delete their own post
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

select lives_ok(
  $test$
    delete from public.posts
    where id = 'bbbbbbbb-0000-0000-0000-000000000001'::uuid
  $test$,
  'manager puede borrar su propio post'
);

-- Negative: staff cannot delete any post (re-insert fixture first)
insert into public.posts (id, author_id, title, body)
values (
  'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
  'Post to keep', 'Body'
);

select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select is(
  (with res as (
    delete from public.posts
    where id = 'bbbbbbbb-0000-0000-0000-000000000002'::uuid
    returning 1
  ) select count(*)::int from res),
  0,
  'staff no puede borrar un post'
);

select * from finish();
rollback;
