-- RLS tests: post_comments table
-- Policies: post_comments_select_authenticated, post_comments_insert_self,
--           post_comments_update_own_or_admin, post_comments_delete_self_or_admin
-- refs: docs/adr/0002-rbac.md
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(8);

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

create or replace function pg_temp.reset_session()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{}', true);
  reset role;
end;
$$;

-- Fixtures
insert into public.posts (id, author_id, title, external_url)
select
  'eeeeeeee-0000-0000-0000-000000000001'::uuid,
  p.id,
  'Post for comments',
  'https://example.com/test'
from public.profiles p where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid;

insert into public.post_comments (id, post_id, author_id, body)
values ('eeeeeeee-0000-0000-0000-000000000010'::uuid,
        'eeeeeeee-0000-0000-0000-000000000001'::uuid,
        'aaaaaaaa-0000-0000-0000-000000000002'::uuid,  -- manager owns this comment
        'Manager comment');

-- ── SELECT ────────────────────────────────────────────────────────────────────

-- Positive: staff can read comments
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select results_eq(
  $test$ select count(*)::int from public.post_comments $test$,
  $expected$ values (1) $expected$,
  'staff puede leer comentarios'
);

-- ── INSERT ────────────────────────────────────────────────────────────────────

-- Positive: staff can insert their own comment
select lives_ok(
  $test$
    insert into public.post_comments (post_id, author_id, body)
    values ('eeeeeeee-0000-0000-0000-000000000001'::uuid,
            'aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'Staff comment')
  $test$,
  'staff puede insertar su propio comentario'
);

-- Negative: staff cannot insert a comment on behalf of another user
select throws_ok(
  $test$
    insert into public.post_comments (post_id, author_id, body)
    values ('eeeeeeee-0000-0000-0000-000000000001'::uuid,
            'aaaaaaaa-0000-0000-0000-000000000002'::uuid,  -- manager, not the caller
            'Comentario suplantado')
  $test$,
  '42501',
  null,
  'staff no puede insertar un comentario en nombre de otro usuario'
);

-- ── DELETE ────────────────────────────────────────────────────────────────────

-- Positive: staff can delete their own comment
select lives_ok(
  $test$
    delete from public.post_comments
    where post_id = 'eeeeeeee-0000-0000-0000-000000000001'::uuid
      and author_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  $test$,
  'staff puede borrar su propio comentario'
);

-- Negative: staff cannot delete another user's comment
select results_eq(
  $test$
    with res as (
      delete from public.post_comments
      where id = 'eeeeeeee-0000-0000-0000-000000000010'::uuid
      returning 1
    ) select count(*)::int from res
  $test$,
  $expected$ values (0) $expected$,
  'staff no puede borrar el comentario de otro usuario'
);

-- Positive: admin can delete (moderate) any comment
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select lives_ok(
  $test$
    delete from public.post_comments
    where id = 'eeeeeeee-0000-0000-0000-000000000010'::uuid
  $test$,
  'admin puede moderar (borrar) cualquier comentario'
);

-- Re-insert the manager comment as superuser (before switching to staff session)
select pg_temp.reset_session();

insert into public.post_comments (id, post_id, author_id, body)
values ('eeeeeeee-0000-0000-0000-000000000011'::uuid,
        'eeeeeeee-0000-0000-0000-000000000001'::uuid,
        'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
        'Manager comment 2');

-- Negative: staff cannot update another user's comment
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select results_eq(
  $test$
    with res as (
      update public.post_comments set body = 'Tampered'
      where id = 'eeeeeeee-0000-0000-0000-000000000011'::uuid
      returning 1
    ) select count(*)::int from res
  $test$,
  $expected$ values (0) $expected$,
  'staff no puede editar el comentario de otro usuario'
);

-- Positive: admin can update (moderate) any comment
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select lives_ok(
  $test$
    update public.post_comments set body = 'Moderado por admin'
    where id = 'eeeeeeee-0000-0000-0000-000000000011'::uuid
  $test$,
  'admin puede moderar (editar) cualquier comentario'
);

select * from finish();
rollback;
