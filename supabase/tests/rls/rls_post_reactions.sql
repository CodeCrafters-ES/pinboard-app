-- RLS tests: post_reactions table
-- Policies: post_reactions_select_authenticated, post_reactions_insert_own,
--           post_reactions_update_own, post_reactions_delete_own
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

-- Fixtures (inserted as postgres, bypass RLS)
insert into public.posts (id, author_id, title, external_url)
select
  'cccccccc-0000-0000-0000-000000000001'::uuid,
  p.id,
  'Post for reactions',
  'https://example.com/test'
from public.profiles p where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid;

insert into public.post_reactions (post_id, user_id, type)
values ('cccccccc-0000-0000-0000-000000000001'::uuid,
        'aaaaaaaa-0000-0000-0000-000000000002'::uuid,  -- manager owns this reaction
        'like');

-- ── SELECT ────────────────────────────────────────────────────────────────────

-- Positive: staff can read reactions
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select results_eq(
  $test$ select count(*)::int from public.post_reactions $test$,
  $expected$ values (1) $expected$,
  'staff puede leer reacciones'
);

-- ── INSERT ────────────────────────────────────────────────────────────────────

-- Positive: staff can insert their own reaction
select lives_ok(
  $test$
    insert into public.post_reactions (post_id, user_id, type)
    values ('cccccccc-0000-0000-0000-000000000001'::uuid,
            'aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'love')
  $test$,
  'staff puede insertar su propia reacción'
);

-- Negative: staff cannot insert a reaction on behalf of another user
select throws_ok(
  $test$
    insert into public.post_reactions (post_id, user_id, type)
    values ('cccccccc-0000-0000-0000-000000000001'::uuid,
            'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'like')
  $test$,
  '42501',
  null,
  'staff no puede insertar una reacción en nombre de otro usuario'
);

-- ── UPDATE ────────────────────────────────────────────────────────────────────

-- Positive: staff can update their own reaction type
select lives_ok(
  $test$
    update public.post_reactions set type = 'love'
    where post_id = 'cccccccc-0000-0000-0000-000000000001'::uuid
      and user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  $test$,
  'staff puede actualizar su propia reacción'
);

-- Negative: staff cannot update another user's reaction
select results_eq(
  $test$
    with res as (
      update public.post_reactions set type = 'dislike'
      where post_id = 'cccccccc-0000-0000-0000-000000000001'::uuid
        and user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
      returning 1
    ) select count(*)::int from res
  $test$,
  $expected$ values (0) $expected$,
  'staff no puede actualizar la reacción de otro usuario'
);

-- ── DELETE ────────────────────────────────────────────────────────────────────

-- Positive: staff can delete their own reaction
select lives_ok(
  $test$
    delete from public.post_reactions
    where post_id = 'cccccccc-0000-0000-0000-000000000001'::uuid
      and user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  $test$,
  'staff puede eliminar su propia reacción'
);

-- Negative: staff cannot delete another user's reaction
select results_eq(
  $test$
    with res as (
      delete from public.post_reactions
      where post_id = 'cccccccc-0000-0000-0000-000000000001'::uuid
        and user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
      returning 1
    ) select count(*)::int from res
  $test$,
  $expected$ values (0) $expected$,
  'staff no puede eliminar la reacción de otro usuario'
);

select * from finish();
rollback;
