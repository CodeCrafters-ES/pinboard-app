-- RLS tests: posts table
-- Policies: posts_select_authenticated, posts_insert_manager_or_admin,
--           posts_update_own_or_admin, posts_delete_admin
-- Issue: I-F-N02-01-03 (#145)
-- refs: docs/adr/0002-rbac.md
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(16);

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

-- ── Fixtures (inserted as postgres superuser, bypasses RLS) ──────────────────

-- Published post by manager
insert into public.posts (id, author_id, title, external_url, status)
select
  'bbbbbbbb-0000-0000-0000-000000000001'::uuid,
  p.id, 'Published manager post', 'https://example.com/pub', 'published'
from public.profiles p where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid;

-- Draft post by manager (not published)
insert into public.posts (id, author_id, title, external_url, status)
select
  'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
  p.id, 'Draft manager post', 'https://example.com/draft', 'draft'
from public.profiles p where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid;

-- Soft-deleted published post by manager
insert into public.posts (id, author_id, title, external_url, status, deleted_at)
select
  'bbbbbbbb-0000-0000-0000-000000000003'::uuid,
  p.id, 'Deleted manager post', 'https://example.com/del', 'published', now()
from public.profiles p where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid;

-- Published post by admin (used to test manager cross-access)
insert into public.posts (id, author_id, title, external_url, status)
select
  'bbbbbbbb-0000-0000-0000-000000000004'::uuid,
  p.id, 'Admin post', 'https://example.com/admin', 'published'
from public.profiles p where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid;

-- ── SELECT ────────────────────────────────────────────────────────────────────

-- 1. Positive: staff can read a published non-deleted post
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select results_eq(
  $test$ select count(*)::int from public.posts where id = 'bbbbbbbb-0000-0000-0000-000000000001'::uuid $test$,
  $expected$ values (1) $expected$,
  'staff: puede leer post publicado no eliminado'
);

-- 2. Negative: staff cannot see a draft post authored by someone else
select results_eq(
  $test$ select count(*)::int from public.posts where id = 'bbbbbbbb-0000-0000-0000-000000000002'::uuid $test$,
  $expected$ values (0) $expected$,
  'staff: no puede ver borrador ajeno'
);

-- 3. Negative: staff cannot see a soft-deleted post (even if published)
select results_eq(
  $test$ select count(*)::int from public.posts where id = 'bbbbbbbb-0000-0000-0000-000000000003'::uuid $test$,
  $expected$ values (0) $expected$,
  'staff: no puede ver post con deleted_at'
);

-- 4. Positive: manager can read their own draft post
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

select results_eq(
  $test$ select count(*)::int from public.posts where id = 'bbbbbbbb-0000-0000-0000-000000000002'::uuid $test$,
  $expected$ values (1) $expected$,
  'manager: puede ver su propio borrador'
);

-- 5. Negative: manager cannot see their own soft-deleted post
select results_eq(
  $test$ select count(*)::int from public.posts where id = 'bbbbbbbb-0000-0000-0000-000000000003'::uuid $test$,
  $expected$ values (0) $expected$,
  'manager: no puede ver su propio post eliminado (deleted_at IS NOT NULL)'
);

-- 6. Positive: admin can see a soft-deleted post
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select results_eq(
  $test$ select count(*)::int from public.posts where id = 'bbbbbbbb-0000-0000-0000-000000000003'::uuid $test$,
  $expected$ values (1) $expected$,
  'admin: puede ver post con deleted_at'
);

-- ── INSERT ────────────────────────────────────────────────────────────────────

-- 7. Positive: manager can insert a post as themselves
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

select lives_ok(
  $test$
    insert into public.posts (author_id, title, external_url)
    select p.id, 'New manager post', 'https://example.com/new-mgr'
    from public.profiles p where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
  $test$,
  'manager: puede insertar post con author_id propio'
);

-- 8. Negative: manager cannot insert with another user's author_id
select throws_ok(
  $test$
    insert into public.posts (author_id, title, external_url)
    select p.id, 'Impersonation', 'https://example.com/imp'
    from public.profiles p where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid
  $test$,
  '42501',
  null,
  'manager: no puede insertar con author_id ajeno'
);

-- 9. Positive: admin can insert a post with any author_id (e.g. manager's)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select lives_ok(
  $test$
    insert into public.posts (author_id, title, external_url)
    select p.id, 'Admin inserts for manager', 'https://example.com/admin-for-mgr'
    from public.profiles p where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
  $test$,
  'admin: puede insertar post con cualquier author_id'
);

-- 10. Negative: staff cannot insert a post
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select throws_ok(
  $test$
    insert into public.posts (author_id, title, external_url)
    select p.id, 'Staff post', 'https://example.com/staff'
    from public.profiles p where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  $test$,
  '42501',
  null,
  'staff: no puede insertar un post'
);

-- ── UPDATE ────────────────────────────────────────────────────────────────────

-- 11. Positive: manager can update their own non-deleted post
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

select lives_ok(
  $test$
    update public.posts set title = 'Updated title'
    where id = 'bbbbbbbb-0000-0000-0000-000000000001'::uuid
  $test$,
  'manager: puede actualizar su propio post no eliminado'
);

-- 12. Negative: manager cannot update another user's post (USING blocks silently)
select results_eq(
  $test$
    with res as (
      update public.posts set title = 'Hacked'
      where id = 'bbbbbbbb-0000-0000-0000-000000000004'::uuid
      returning 1
    ) select count(*)::int from res
  $test$,
  $expected$ values (0) $expected$,
  'manager: no puede actualizar post ajeno'
);

-- 13. Negative: manager cannot update their own soft-deleted post
select results_eq(
  $test$
    with res as (
      update public.posts set title = 'Un-delete attempt'
      where id = 'bbbbbbbb-0000-0000-0000-000000000003'::uuid
      returning 1
    ) select count(*)::int from res
  $test$,
  $expected$ values (0) $expected$,
  'manager: no puede actualizar su propio post eliminado (USING bloquea deleted_at IS NOT NULL)'
);

-- 14. Negative: staff cannot update any post (USING blocks silently)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select results_eq(
  $test$
    with res as (
      update public.posts set title = 'Hacked by staff'
      where id = 'bbbbbbbb-0000-0000-0000-000000000001'::uuid
      returning 1
    ) select count(*)::int from res
  $test$,
  $expected$ values (0) $expected$,
  'staff: no puede actualizar ningún post'
);

-- ── DELETE ────────────────────────────────────────────────────────────────────

-- 15. Positive: admin can hard-delete a post
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select lives_ok(
  $test$
    delete from public.posts
    where id = 'bbbbbbbb-0000-0000-0000-000000000003'::uuid
  $test$,
  'admin: puede borrar físicamente un post'
);

-- 16. Negative: manager cannot hard-delete (even their own post); USING blocks silently
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

select results_eq(
  $test$
    with res as (
      delete from public.posts
      where id = 'bbbbbbbb-0000-0000-0000-000000000001'::uuid
      returning 1
    ) select count(*)::int from res
  $test$,
  $expected$ values (0) $expected$,
  'manager: no puede borrar físicamente su propio post (solo admin puede)'
);

select * from finish();
rollback;
