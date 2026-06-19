-- RLS tests: post_reactions table
-- Policies: post_reactions_select_authenticated, post_reactions_insert_self,
--           post_reactions_update_self, post_reactions_delete_self_or_admin
-- refs: docs/adr/0002-rbac.md
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(5);

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
insert into public.posts (id, author_id, title, body)
values ('cccccccc-0000-0000-0000-000000000001'::uuid,
        'aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'Post for reactions', 'Body');

insert into public.post_reactions (id, post_id, user_id, reaction)
values ('cccccccc-0000-0000-0000-000000000010'::uuid,
        'cccccccc-0000-0000-0000-000000000001'::uuid,
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
    insert into public.post_reactions (post_id, user_id, reaction)
    values ('cccccccc-0000-0000-0000-000000000001'::uuid,
            'aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'love')
  $test$,
  'staff puede insertar su propia reacción'
);

-- Negative: staff cannot insert a reaction on behalf of another user
select throws_ok(
  $test$
    insert into public.post_reactions (post_id, user_id, reaction)
    values ('cccccccc-0000-0000-0000-000000000001'::uuid,
            'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'like')
  $test$,
  '42501',
  null,
  'staff no puede insertar una reacción en nombre de otro usuario'
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
select throws_ok(
  $test$
    delete from public.post_reactions
    where id = 'cccccccc-0000-0000-0000-000000000010'::uuid
  $test$,
  '42501',
  null,
  'staff no puede eliminar la reacción de otro usuario'
);

select * from finish();
rollback;
