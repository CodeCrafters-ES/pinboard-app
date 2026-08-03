-- RLS tests: chat UPDATE own (edit / soft delete) + last_read_at — I-F-N07-02-02 (#283)
-- Policies: messages_update_own, messages_no_hard_delete, chat_participants_update_own
-- refs: 20260803010000_rls_chat_update_n07_02_02.sql, docs/rls/chat.md, docs/adr/0004-chat-realtime.md
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003
--
-- Fixture: un chat con manager + staff; un mensaje de cada uno.

begin;
select plan(10);

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
insert into public.chats (id) values ('abababab-0000-0000-0000-000000000001'::uuid);

-- Una fila por sentencia (el trigger chat_direct_pairs_sync materializa el par al
-- completarse el segundo participante; un multi-fila lo insertaría dos veces).
insert into public.chat_participants (chat_id, user_id)
  values ('abababab-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-0000-0000-0000-000000000002'::uuid); -- manager
insert into public.chat_participants (chat_id, user_id)
  values ('abababab-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-0000-0000-0000-000000000003'::uuid); -- staff

insert into public.messages (id, chat_id, sender_id, content) values
  ('dcdcdcdc-0000-0000-0000-000000000001'::uuid,
   'abababab-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'de manager'),
  ('dcdcdcdc-0000-0000-0000-000000000002'::uuid,
   'abababab-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'de staff');

-- ── Sender edita / soft-borra su propio mensaje ──────────────────────────────
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid); -- staff

-- 1. Positive: staff edita el content de su propio mensaje
select lives_ok(
  $test$
    update public.messages set content = 'de staff (editado)'
    where id = 'dcdcdcdc-0000-0000-0000-000000000002'::uuid
  $test$,
  'staff: puede editar el content de su propio mensaje'
);

-- 2. La edición fija edited_at (trigger)
select isnt(
  (select edited_at from public.messages where id = 'dcdcdcdc-0000-0000-0000-000000000002'::uuid),
  null,
  'editar content setea edited_at'
);

-- 3. Positive: staff hace soft delete de su propio mensaje
select lives_ok(
  $test$
    update public.messages set deleted_at = now()
    where id = 'dcdcdcdc-0000-0000-0000-000000000002'::uuid
  $test$,
  'staff: puede soft-deletar su propio mensaje (deleted_at)'
);

-- 4. Negative: staff no puede editar un mensaje ajeno (USING bloquea → 0 filas)
select results_eq(
  $test$
    with res as (
      update public.messages set content = 'secuestrado'
      where id = 'dcdcdcdc-0000-0000-0000-000000000001'::uuid
      returning 1
    ) select count(*)::int from res
  $test$,
  $expected$ values (0) $expected$,
  'staff: no puede editar un mensaje ajeno'
);

-- 5. Negative: staff no puede hacer DELETE físico (ni de su propio mensaje)
select results_eq(
  $test$
    with res as (
      delete from public.messages
      where id = 'dcdcdcdc-0000-0000-0000-000000000002'::uuid
      returning 1
    ) select count(*)::int from res
  $test$,
  $expected$ values (0) $expected$,
  'staff: no puede borrar físicamente un mensaje (solo soft delete)'
);

-- ── last_read_at ─────────────────────────────────────────────────────────────

-- 6. Positive: staff actualiza su propio last_read_at
select lives_ok(
  $test$
    update public.chat_participants set last_read_at = now()
    where chat_id = 'abababab-0000-0000-0000-000000000001'::uuid
      and user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  $test$,
  'staff: puede actualizar su propio last_read_at'
);

-- 7. Negative: staff no puede actualizar el last_read_at de otro (USING → 0 filas)
select results_eq(
  $test$
    with res as (
      update public.chat_participants set last_read_at = now()
      where chat_id = 'abababab-0000-0000-0000-000000000001'::uuid
        and user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
      returning 1
    ) select count(*)::int from res
  $test$,
  $expected$ values (0) $expected$,
  'staff: no puede actualizar el last_read_at de otro participante'
);

-- ── Admin: moderación (UPDATE/DELETE sobre cualquier mensaje) ─────────────────
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid); -- admin

-- 8. Positive: admin soft-borra (modera) un mensaje ajeno
select lives_ok(
  $test$
    update public.messages set deleted_at = now()
    where id = 'dcdcdcdc-0000-0000-0000-000000000001'::uuid
  $test$,
  'admin: puede soft-deletar (moderar) cualquier mensaje'
);

-- 9. Positive: admin edita el content de cualquier mensaje
select lives_ok(
  $test$
    update public.messages set content = 'moderado por admin'
    where id = 'dcdcdcdc-0000-0000-0000-000000000002'::uuid
  $test$,
  'admin: puede editar cualquier mensaje'
);

-- 10. Positive: admin puede hacer DELETE físico
select lives_ok(
  $test$
    delete from public.messages
    where id = 'dcdcdcdc-0000-0000-0000-000000000001'::uuid
  $test$,
  'admin: puede borrar físicamente un mensaje'
);

select * from finish();
rollback;
