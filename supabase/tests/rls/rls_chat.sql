-- RLS tests: chat (SELECT/INSERT solo participante) — I-F-N07-02-01 (#282)
-- Policies: chats_select_participant, chats_insert_authenticated,
--           chat_participants_select, chat_participants_insert,
--           messages_select_participant, messages_insert_participant
-- Helper:   public.is_chat_participant(uuid)
-- refs: 20260803000000_rls_chat_n07_02_01.sql, docs/rls/chat.md, docs/adr/0002-rbac.md
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003
--
-- Fixtures:
--   Chat A (eeee…01): admin + manager    → staff NO participa (y no es admin)
--   Chat B (eeee…02): manager + staff    → admin NO participa (pero es admin)

begin;
select plan(19);

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
insert into public.chats (id) values
  ('eeeeeeee-0000-0000-0000-000000000001'::uuid),   -- Chat A
  ('eeeeeeee-0000-0000-0000-000000000002'::uuid);   -- Chat B

-- Una fila por sentencia: el trigger chat_direct_pairs_sync (AFTER ROW) materializa
-- el par 1:1 al completarse el segundo participante; un INSERT multi-fila haría que
-- ambas filas vieran el par completo e intentaran insertarlo dos veces.
insert into public.chat_participants (chat_id, user_id)
  values ('eeeeeeee-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-0000-0000-0000-000000000001'::uuid); -- A: admin
insert into public.chat_participants (chat_id, user_id)
  values ('eeeeeeee-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-0000-0000-0000-000000000002'::uuid); -- A: manager
insert into public.chat_participants (chat_id, user_id)
  values ('eeeeeeee-0000-0000-0000-000000000002'::uuid, 'aaaaaaaa-0000-0000-0000-000000000002'::uuid); -- B: manager
insert into public.chat_participants (chat_id, user_id)
  values ('eeeeeeee-0000-0000-0000-000000000002'::uuid, 'aaaaaaaa-0000-0000-0000-000000000003'::uuid); -- B: staff

insert into public.messages (id, chat_id, sender_id, content) values
  ('ffffffff-0000-0000-0000-00000000000a'::uuid,
   'eeeeeeee-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'A: hola'),
  ('ffffffff-0000-0000-0000-00000000000b'::uuid,
   'eeeeeeee-0000-0000-0000-000000000002'::uuid, 'aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'B: hola');

-- ── SELECT messages: participante vs no participante ─────────────────────────

-- 1. Positive: staff (participante de B) ve los mensajes de B
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);
select results_eq(
  $test$ select count(*)::int from public.messages
         where chat_id = 'eeeeeeee-0000-0000-0000-000000000002'::uuid $test$,
  $expected$ values (1) $expected$,
  'staff: ve los mensajes de un chat donde participa'
);

-- 2. Negative: staff (NO participante de A) no ve los mensajes de A
select results_eq(
  $test$ select count(*)::int from public.messages
         where chat_id = 'eeeeeeee-0000-0000-0000-000000000001'::uuid $test$,
  $expected$ values (0) $expected$,
  'staff: no ve mensajes de un chat donde no participa'
);

-- ── SELECT chats ─────────────────────────────────────────────────────────────

-- 3. Positive: staff ve el chat B (participa)
select results_eq(
  $test$ select count(*)::int from public.chats
         where id = 'eeeeeeee-0000-0000-0000-000000000002'::uuid $test$,
  $expected$ values (1) $expected$,
  'staff: ve el chat donde participa'
);

-- 4. Negative: staff no ve el chat A (no participa)
select results_eq(
  $test$ select count(*)::int from public.chats
         where id = 'eeeeeeee-0000-0000-0000-000000000001'::uuid $test$,
  $expected$ values (0) $expected$,
  'staff: no ve un chat donde no participa'
);

-- ── SELECT chat_participants ─────────────────────────────────────────────────

-- 5. Positive: staff ve las 2 filas de participants de B
select results_eq(
  $test$ select count(*)::int from public.chat_participants
         where chat_id = 'eeeeeeee-0000-0000-0000-000000000002'::uuid $test$,
  $expected$ values (2) $expected$,
  'staff: ve los participantes de su chat'
);

-- 6. Negative: staff no ve los participants de A
select results_eq(
  $test$ select count(*)::int from public.chat_participants
         where chat_id = 'eeeeeeee-0000-0000-0000-000000000001'::uuid $test$,
  $expected$ values (0) $expected$,
  'staff: no ve los participantes de un chat ajeno'
);

-- ── INSERT messages ──────────────────────────────────────────────────────────

-- 7. Positive: staff envía un mensaje en B como él mismo
select lives_ok(
  $test$
    insert into public.messages (chat_id, sender_id, content)
    values ('eeeeeeee-0000-0000-0000-000000000002'::uuid,
            'aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'B: mensaje de staff')
  $test$,
  'staff: puede enviar mensaje en su chat como remitente propio'
);

-- 8. Negative: staff intenta enviar en A (no participa) → deny
select throws_ok(
  $test$
    insert into public.messages (chat_id, sender_id, content)
    values ('eeeeeeee-0000-0000-0000-000000000001'::uuid,
            'aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'A: intruso')
  $test$,
  '42501', null,
  'staff: no puede enviar mensaje en un chat donde no participa'
);

-- 9. Negative: staff envía en B pero suplantando a manager (sender_id ≠ auth.uid) → deny
select throws_ok(
  $test$
    insert into public.messages (chat_id, sender_id, content)
    values ('eeeeeeee-0000-0000-0000-000000000002'::uuid,
            'aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'B: suplantación')
  $test$,
  '42501', null,
  'staff: no puede enviar mensaje con sender_id ajeno (suplantación)'
);

-- ── INSERT chat_participants: solo la RPC (definer) o admin dan de alta ───────
-- El alta directa por el cliente está cerrada (fix del self-join, #274): un usuario ya
-- NO puede insertarse a sí mismo en un chat. El camino sancionado es la RPC.

-- 10. Negative: staff intenta AUTO-AÑADIRSE a un chat AJENO existente (A) → deny.
--     Este era el vector: colarse en el DM de admin+manager para leer sus mensajes.
select throws_ok(
  $test$
    insert into public.chat_participants (chat_id, user_id)
    values ('eeeeeeee-0000-0000-0000-000000000001'::uuid,
            'aaaaaaaa-0000-0000-0000-000000000003'::uuid)
  $test$,
  '42501', null,
  'staff: no puede auto-añadirse a un chat ajeno (self-join cerrado)'
);

-- 11. Negative: staff tampoco puede añadirse a un chat nuevo directamente (alta por RPC).
insert into public.chats (id) values ('eeeeeeee-0000-0000-0000-000000000003'::uuid);
select throws_ok(
  $test$
    insert into public.chat_participants (chat_id, user_id)
    values ('eeeeeeee-0000-0000-0000-000000000003'::uuid,
            'aaaaaaaa-0000-0000-0000-000000000003'::uuid)
  $test$,
  '42501', null,
  'staff: no puede insertarse a sí mismo directamente (el alta la hace la RPC)'
);

-- 12. Negative: staff intenta añadir a manager (user_id ajeno) → deny
select throws_ok(
  $test$
    insert into public.chat_participants (chat_id, user_id)
    values ('eeeeeeee-0000-0000-0000-000000000003'::uuid,
            'aaaaaaaa-0000-0000-0000-000000000002'::uuid)
  $test$,
  '42501', null,
  'staff: no puede añadir a otro usuario como participante'
);

-- ── Fuga cerrada: chat_direct_pairs no es legible por el cliente ──────────────

-- 13. Negative: staff no puede leer chat_direct_pairs (revoke + RLS) → permission denied.
select throws_ok(
  $test$ select 1 from public.chat_direct_pairs
         where chat_id = 'eeeeeeee-0000-0000-0000-000000000001'::uuid $test$,
  '42501', null,
  'staff: no puede leer chat_direct_pairs (grafo social cerrado)'
);

-- 14. Positive: la RPC sí resuelve el par existente (corre como definer, pese al lockdown).
--     Devuelve el Chat B (manager+staff), ya materializado por el fixture.
select is(
  public.create_or_get_direct_chat('aaaaaaaa-0000-0000-0000-000000000002'::uuid),
  'eeeeeeee-0000-0000-0000-000000000002'::uuid,
  'RPC create_or_get_direct_chat: sigue resolviendo el par existente tras el fix'
);

-- ── INSERT chats (cualquier autenticado) ─────────────────────────────────────

-- 15. Positive: staff puede crear un contenedor chats
select lives_ok(
  $test$ insert into public.chats (id)
         values ('eeeeeeee-0000-0000-0000-000000000004'::uuid) $test$,
  'staff: puede crear un chat (contenedor)'
);

-- ── Admin: moderación (SELECT en cualquier chat aunque no participe) ──────────

-- 16. Positive: admin ve mensajes de B (no participa) vía is_admin()
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);
select results_eq(
  $test$ select count(*)::int from public.messages
         where chat_id = 'eeeeeeee-0000-0000-0000-000000000002'::uuid $test$,
  $expected$ values (2) $expected$,
  'admin: ve mensajes de cualquier chat aunque no participe'
);

-- 17. Positive: admin ve el chat B aunque no participe
select results_eq(
  $test$ select count(*)::int from public.chats
         where id = 'eeeeeeee-0000-0000-0000-000000000002'::uuid $test$,
  $expected$ values (1) $expected$,
  'admin: ve cualquier chat aunque no participe'
);

-- ── Helper is_chat_participant ───────────────────────────────────────────────

-- 18. Positive: helper true para participante
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);
select ok(
  public.is_chat_participant('eeeeeeee-0000-0000-0000-000000000002'::uuid),
  'is_chat_participant: true para un participante'
);

-- 19. Negative: helper false para no participante
select ok(
  not public.is_chat_participant('eeeeeeee-0000-0000-0000-000000000001'::uuid),
  'is_chat_participant: false para un no participante'
);

select * from finish();
rollback;
