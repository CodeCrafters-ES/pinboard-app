-- RLS tests: push_tokens table
-- Policies: push_tokens_select_own, push_tokens_insert_own,
--           push_tokens_update_own, push_tokens_delete_own
-- refs: docs/adr/0002-rbac.md
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(6);

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

-- Fixture: a token owned by the manager seed user (inserted as postgres, bypasses RLS)
insert into public.push_tokens (id, user_id, token, platform)
values ('bbbbbbbb-1111-0000-0000-000000000001'::uuid,
        'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
        'ExponentPushToken[manager-fixture]', 'ios');

-- ── SELECT ────────────────────────────────────────────────────────────────────

-- Positive: staff can read their own tokens
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select results_eq(
  $test$ select count(*)::int from public.push_tokens $test$,
  $expected$ values (0) $expected$,
  'staff solo ve sus propios tokens (ninguno aún)'
);

-- Negative: staff cannot see another user's tokens
select results_eq(
  $test$
    select count(*)::int from public.push_tokens
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
  $test$,
  $expected$ values (0) $expected$,
  'staff no puede ver tokens de otro usuario'
);

-- ── INSERT ────────────────────────────────────────────────────────────────────

-- Positive: staff can insert their own token
select lives_ok(
  $test$
    insert into public.push_tokens (user_id, token, platform)
    values ('aaaaaaaa-0000-0000-0000-000000000003'::uuid,
            'ExponentPushToken[staff-token]', 'android')
  $test$,
  'staff puede insertar su propio token'
);

-- Negative: staff cannot insert a token for another user
select throws_ok(
  $test$
    insert into public.push_tokens (user_id, token, platform)
    values ('aaaaaaaa-0000-0000-0000-000000000002'::uuid,
            'ExponentPushToken[stolen-token]', 'ios')
  $test$,
  '42501',
  null,
  'staff no puede insertar un token en nombre de otro usuario'
);

-- ── UPDATE ────────────────────────────────────────────────────────────────────

-- Positive: staff can update their own token
select lives_ok(
  $test$
    update public.push_tokens set platform = 'web'
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  $test$,
  'staff puede actualizar su propio token'
);

-- ── DELETE ────────────────────────────────────────────────────────────────────

-- Positive: staff can delete their own token
select lives_ok(
  $test$
    delete from public.push_tokens
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  $test$,
  'staff puede eliminar su propio token'
);

select * from finish();
rollback;
