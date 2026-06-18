-- RLS tests: post_ratings table
-- Policies: post_ratings_select_authenticated, post_ratings_insert_self,
--           post_ratings_update_self
-- Note: no DELETE policy exists by design — ratings are updated, never deleted.
-- refs: docs/adr/0002-rbac.md
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(5);

create or replace function pg_temp.set_session(uid uuid)
returns void language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text,
    true
  );
$$;

-- Fixtures
insert into public.posts (id, author_id, title, body)
values ('dddddddd-0000-0000-0000-000000000001'::uuid,
        'aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'Post for ratings', 'Body');

insert into public.post_ratings (id, post_id, user_id, score)
values ('dddddddd-0000-0000-0000-000000000010'::uuid,
        'dddddddd-0000-0000-0000-000000000001'::uuid,
        'aaaaaaaa-0000-0000-0000-000000000002'::uuid,  -- manager owns this rating
        4);

-- ── SELECT ────────────────────────────────────────────────────────────────────

-- Positive: staff can read ratings
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select results_eq(
  $test$ select count(*)::int from public.post_ratings $test$,
  $expected$ values (1) $expected$,
  'staff puede leer valoraciones'
);

-- ── INSERT ────────────────────────────────────────────────────────────────────

-- Positive: staff can insert their own rating
select lives_ok(
  $test$
    insert into public.post_ratings (post_id, user_id, score)
    values ('dddddddd-0000-0000-0000-000000000001'::uuid,
            'aaaaaaaa-0000-0000-0000-000000000003'::uuid, 3)
  $test$,
  'staff puede insertar su propia valoración'
);

-- Negative: staff cannot insert a rating on behalf of another user
select throws_ok(
  $test$
    insert into public.post_ratings (post_id, user_id, score)
    values ('dddddddd-0000-0000-0000-000000000001'::uuid,
            'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 5)
  $test$,
  '42501',
  null,
  'staff no puede insertar una valoración en nombre de otro usuario'
);

-- ── UPDATE ────────────────────────────────────────────────────────────────────

-- Positive: staff can update their own rating
select lives_ok(
  $test$
    update public.post_ratings set score = 5
    where post_id = 'dddddddd-0000-0000-0000-000000000001'::uuid
      and user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  $test$,
  'staff puede actualizar su propia valoración'
);

-- Negative: staff cannot update another user's rating
select throws_ok(
  $test$
    update public.post_ratings set score = 1
    where id = 'dddddddd-0000-0000-0000-000000000010'::uuid
  $test$,
  '42501',
  null,
  'staff no puede modificar la valoración de otro usuario'
);

select * from finish();
rollback;
