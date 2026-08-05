-- Tests: RPC public.create_or_get_direct_chat(other_user) — F-N07-03 (#277)
-- Migración 20260806000000_create_or_get_direct_chat.sql.
-- Cubre: crea el chat 1:1 con ambos participantes y materializa el par; es idempotente
-- (mismo par → mismo chat); rechaza chatear consigo mismo y con un usuario inexistente.
--
-- Seed UUIDs (supabase/seed.sql) — ids de auth.users:
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002

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

select has_function(
  'public', 'create_or_get_direct_chat', array['uuid'],
  'existe la función create_or_get_direct_chat(uuid)'
);

-- admin abre un chat con manager.
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);
create temp table _chat as
  select public.create_or_get_direct_chat('aaaaaaaa-0000-0000-0000-000000000002'::uuid) as id;

select isnt((select id from _chat), null, 'crea el chat y devuelve su id');

select is(
  (select count(*)::int from public.chat_participants where chat_id = (select id from _chat)),
  2,
  'da de alta a los dos participantes (admin + manager)'
);

select is(
  (select count(*)::int from public.chat_direct_pairs
   where chat_id = (select id from _chat)
     and user_a = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid
     and user_b = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid),
  1,
  'materializa el par ordenado en chat_direct_pairs'
);

-- Segunda llamada con el mismo par → mismo chat (idempotente).
select is(
  public.create_or_get_direct_chat('aaaaaaaa-0000-0000-0000-000000000002'::uuid),
  (select id from _chat),
  'idempotente: mismo par devuelve el chat existente'
);

-- Rechaza chatear consigo mismo (errcode 22023).
select throws_ok(
  $$ select public.create_or_get_direct_chat('aaaaaaaa-0000-0000-0000-000000000001'::uuid) $$,
  '22023', null,
  'rechaza abrir un chat consigo mismo'
);

-- Rechaza un usuario que no existe en profiles (errcode 23503).
select throws_ok(
  $$ select public.create_or_get_direct_chat('99999999-9999-4999-8999-999999999999'::uuid) $$,
  '23503', null,
  'rechaza abrir un chat con un usuario inexistente'
);

reset role;

select * from finish();
rollback;
