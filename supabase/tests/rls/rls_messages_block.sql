-- Behavioral tests: el bloqueo corta el envío 1:1 sin destruir el historial — I-F-N07-04-02 (#288)
-- Cubre el endurecimiento de messages_insert_participant y de create_or_get_direct_chat
-- con la comprobación public.is_blocked. Criterios de aceptación del issue #288:
--   · bloqueo → INSERT de mensaje hacia el bloqueado → deny
--   · bloqueo → historial sigue siendo legible
--   · desbloqueo → INSERT funciona de nuevo
--   · chat 1:1 ya existente sigue devolviéndose aunque haya bloqueo (no se recrea)
-- refs: 20260808100000_user_blocks.sql, 20260803000000_rls_chat_n07_02_01.sql,
--       20260806000000_create_or_get_direct_chat.sql, docs/adr/0002-rbac.md
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

-- ── Fixtures (postgres superuser, bypassa RLS) ───────────────────────────────
-- Chat X: manager + staff. Una fila por sentencia (el trigger chat_direct_pairs_sync
-- materializa el par al completarse el segundo participante).
insert into public.chats (id) values ('eeeeeeee-0000-0000-0000-0000000000b1'::uuid);
insert into public.chat_participants (chat_id, user_id)
  values ('eeeeeeee-0000-0000-0000-0000000000b1'::uuid, 'aaaaaaaa-0000-0000-0000-000000000002'::uuid);
insert into public.chat_participants (chat_id, user_id)
  values ('eeeeeeee-0000-0000-0000-0000000000b1'::uuid, 'aaaaaaaa-0000-0000-0000-000000000003'::uuid);

-- Mensaje histórico anterior al bloqueo (debe seguir siendo legible tras bloquear).
insert into public.messages (id, chat_id, sender_id, content) values
  ('ffffffff-0000-0000-0000-0000000000c1'::uuid,
   'eeeeeeee-0000-0000-0000-0000000000b1'::uuid,
   'aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'X: histórico');

-- Bloqueos: manager↔staff (sobre chat existente) y staff↔admin (sin chat previo).
insert into public.user_blocks (blocker_user_id, blocked_user_id) values
  ('aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'aaaaaaaa-0000-0000-0000-000000000003'::uuid),
  ('aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'aaaaaaaa-0000-0000-0000-000000000001'::uuid);

-- ── Bloqueo → no se puede enviar hacia el bloqueado ──────────────────────────
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);
select throws_ok(
  $test$ insert into public.messages (chat_id, sender_id, content)
         values ('eeeeeeee-0000-0000-0000-0000000000b1'::uuid,
                 'aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'X: bloqueado') $test$,
  '42501', null,
  'staff: no puede enviar mensajes en un chat con bloqueo activo'
);

-- ── Bloqueo → el historial sigue siendo legible ──────────────────────────────
select results_eq(
  $test$ select count(*)::int from public.messages
         where chat_id = 'eeeeeeee-0000-0000-0000-0000000000b1'::uuid $test$,
  $expected$ values (1) $expected$,
  'staff: sigue leyendo el historial del chat pese al bloqueo'
);

-- ── El bloqueo corta en ambos sentidos ───────────────────────────────────────
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);
select throws_ok(
  $test$ insert into public.messages (chat_id, sender_id, content)
         values ('eeeeeeee-0000-0000-0000-0000000000b1'::uuid,
                 'aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'X: mutuo') $test$,
  '42501', null,
  'manager (el bloqueador): tampoco puede enviar al usuario que bloqueó'
);

-- ── create_or_get_direct_chat: no abre un chat NUEVO entre un par bloqueado ───
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);
select throws_ok(
  $test$ select public.create_or_get_direct_chat('aaaaaaaa-0000-0000-0000-000000000003'::uuid) $test$,
  '42501', null,
  'admin: no puede abrir un DM nuevo con un par bloqueado (staff↔admin)'
);

-- ── Desbloqueo → vuelve a poder enviarse ─────────────────────────────────────
reset role;
delete from public.user_blocks
  where blocker_user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
    and blocked_user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid;

select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);
select lives_ok(
  $test$ insert into public.messages (chat_id, sender_id, content)
         values ('eeeeeeee-0000-0000-0000-0000000000b1'::uuid,
                 'aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'X: tras desbloqueo') $test$,
  'staff: tras el desbloqueo vuelve a poder enviar mensajes'
);

-- ── Un chat 1:1 ya existente se sigue devolviendo aunque exista un bloqueo ────
-- (create_or_get_direct_chat resuelve el par existente antes de comprobar bloqueo:
-- el historial permanece accesible; solo se impide ABRIR uno nuevo.)
reset role;
insert into public.user_blocks (blocker_user_id, blocked_user_id) values
  ('aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);
select is(
  public.create_or_get_direct_chat('aaaaaaaa-0000-0000-0000-000000000002'::uuid),
  'eeeeeeee-0000-0000-0000-0000000000b1'::uuid,
  'devuelve el chat 1:1 existente aunque el par esté bloqueado (no lo recrea)'
);

reset role;

select * from finish();
rollback;
