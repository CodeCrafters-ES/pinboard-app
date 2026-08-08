-- Schema tests: chat base tables (I-F-N07-01-01, #280)
-- Verifica estructura, unicidad del chat 1:1 (chat_direct_pairs), cascadas,
-- triggers (last_message_at / edited_at), CHECK de content y publication Realtime.
-- Corre como el rol por defecto (BYPASSRLS en tablas public); RLS es F-N07-02.
-- refs: 20260731000000_chat.sql
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(23);

-- ── Structure ──────────────────────────────────────────────────────────────
select has_table('public', 'chats', 'chats table exists');
select has_table('public', 'chat_participants', 'chat_participants table exists');
select has_table('public', 'messages', 'messages table exists');
select has_table('public', 'chat_direct_pairs', 'chat_direct_pairs table exists');

-- ── Defaults ───────────────────────────────────────────────────────────────
insert into public.chats (id) values ('cccccccc-0000-0000-0000-000000000001'::uuid);

select results_eq(
  $test$
    select is_group, (last_message_at is not null)
    from public.chats where id = 'cccccccc-0000-0000-0000-000000000001'::uuid
  $test$,
  $expected$ values (false, true) $expected$,
  'defaults: is_group = false, last_message_at not null'
);

-- ── CHECK content length ─────────────────────────────────────────────────────
select throws_ok(
  $test$
    insert into public.messages (chat_id, sender_id, content)
    values ('cccccccc-0000-0000-0000-000000000001'::uuid,
            'aaaaaaaa-0000-0000-0000-000000000001'::uuid, '')
  $test$,
  '23514', null,
  'content vacío viola el CHECK de longitud'
);

select throws_ok(
  $test$
    insert into public.messages (chat_id, sender_id, content)
    values ('cccccccc-0000-0000-0000-000000000001'::uuid,
            'aaaaaaaa-0000-0000-0000-000000000001'::uuid, repeat('x', 4001))
  $test$,
  '23514', null,
  'content > 4000 chars viola el CHECK de longitud'
);

-- ── Unicidad chat 1:1 (chat_direct_pairs vía trigger) ────────────────────────
-- Chat A: par admin(01) + manager(02) → materializa chat_direct_pairs.
insert into public.chat_participants (chat_id, user_id) values
  ('cccccccc-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select lives_ok(
  $test$
    insert into public.chat_participants (chat_id, user_id) values
      ('cccccccc-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-0000-0000-0000-000000000002'::uuid)
  $test$,
  'segundo participante del chat 1:1 se inserta y materializa el par'
);

select results_eq(
  $test$
    select user_a, user_b from public.chat_direct_pairs
    where chat_id = 'cccccccc-0000-0000-0000-000000000001'::uuid
  $test$,
  $expected$ values ('aaaaaaaa-0000-0000-0000-000000000001'::uuid,
                     'aaaaaaaa-0000-0000-0000-000000000002'::uuid) $expected$,
  'chat_direct_pairs guarda el par ordenado (user_a < user_b)'
);

-- Chat B: mismo par (01 + 02) → el segundo participante debe fallar por unicidad.
insert into public.chats (id) values ('cccccccc-0000-0000-0000-000000000002'::uuid);
insert into public.chat_participants (chat_id, user_id) values
  ('cccccccc-0000-0000-0000-000000000002'::uuid, 'aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select throws_ok(
  $test$
    insert into public.chat_participants (chat_id, user_id) values
      ('cccccccc-0000-0000-0000-000000000002'::uuid, 'aaaaaaaa-0000-0000-0000-000000000002'::uuid)
  $test$,
  '23505', null,
  'no se puede crear un segundo chat 1:1 con el mismo par'
);

-- Chats de grupo quedan exentos del par único.
insert into public.chats (id, is_group) values
  ('cccccccc-0000-0000-0000-000000000003'::uuid, true);

select lives_ok(
  $test$
    insert into public.chat_participants (chat_id, user_id) values
      ('cccccccc-0000-0000-0000-000000000003'::uuid, 'aaaaaaaa-0000-0000-0000-000000000001'::uuid),
      ('cccccccc-0000-0000-0000-000000000003'::uuid, 'aaaaaaaa-0000-0000-0000-000000000002'::uuid),
      ('cccccccc-0000-0000-0000-000000000003'::uuid, 'aaaaaaaa-0000-0000-0000-000000000003'::uuid)
  $test$,
  'un chat de grupo con el mismo par no dispara la unicidad'
);

select is(
  (select count(*)::int from public.chat_direct_pairs
   where chat_id = 'cccccccc-0000-0000-0000-000000000003'::uuid),
  0,
  'un chat de grupo no genera fila en chat_direct_pairs'
);

-- ── Trigger last_message_at ──────────────────────────────────────────────────
insert into public.messages (id, chat_id, sender_id, content, created_at) values
  ('dddddddd-0000-0000-0000-000000000001'::uuid,
   'cccccccc-0000-0000-0000-000000000001'::uuid,
   'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
   'hola', '2026-07-31 10:00:00+00');

select results_eq(
  $test$
    select last_message_at from public.chats
    where id = 'cccccccc-0000-0000-0000-000000000001'::uuid
  $test$,
  $expected$ values ('2026-07-31 10:00:00+00'::timestamptz) $expected$,
  'insertar mensaje actualiza chats.last_message_at = created_at del mensaje'
);

-- ── Trigger edited_at ────────────────────────────────────────────────────────
update public.messages set content = 'hola editado'
where id = 'dddddddd-0000-0000-0000-000000000001'::uuid;

select isnt(
  (select edited_at from public.messages where id = 'dddddddd-0000-0000-0000-000000000001'::uuid),
  null,
  'editar content setea edited_at automáticamente'
);

-- Actualizar otra columna (soft delete) no toca edited_at.
insert into public.messages (id, chat_id, sender_id, content) values
  ('dddddddd-0000-0000-0000-000000000002'::uuid,
   'cccccccc-0000-0000-0000-000000000001'::uuid,
   'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'sin editar');

update public.messages set deleted_at = now()
where id = 'dddddddd-0000-0000-0000-000000000002'::uuid;

select is(
  (select edited_at from public.messages where id = 'dddddddd-0000-0000-0000-000000000002'::uuid),
  null,
  'soft delete (deleted_at) no setea edited_at'
);

-- ── Trigger clear content on soft delete (fix #330) ──────────────────────────
-- El soft delete blanquea el content en la tabla base (no solo en la vista); el CHECK
-- relajado admite '' cuando deleted_at is not null. refs: 20260813000000.
select is(
  (select content from public.messages where id = 'dddddddd-0000-0000-0000-000000000002'::uuid),
  '',
  'soft delete borra el content en la tabla base (queda vacío)'
);

-- ── Cascada: borrar chat elimina sus mensajes ────────────────────────────────
delete from public.chats where id = 'cccccccc-0000-0000-0000-000000000001'::uuid;

select is(
  (select count(*)::int from public.messages
   where chat_id = 'cccccccc-0000-0000-0000-000000000001'::uuid),
  0,
  'borrar un chat elimina en cascada sus mensajes'
);

-- ── Cascada: borrar usuario elimina sus filas de chat_participants ────────────
-- Usuario desechable (evita tocar relaciones del seed). El rollback deshace todo.
insert into auth.users (
  instance_id, id, aud, role, email, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'dddddddd-0000-0000-0000-000000000009'::uuid,
  'authenticated', 'authenticated', 'throwaway-n07@nun-ibiza.dev',
  now(), now(), '', '', '', ''
);

insert into public.chats (id, is_group) values
  ('cccccccc-0000-0000-0000-000000000004'::uuid, true);
insert into public.chat_participants (chat_id, user_id) values
  ('cccccccc-0000-0000-0000-000000000004'::uuid, 'dddddddd-0000-0000-0000-000000000009'::uuid);

delete from auth.users where id = 'dddddddd-0000-0000-0000-000000000009'::uuid;

select is(
  (select count(*)::int from public.chat_participants
   where user_id = 'dddddddd-0000-0000-0000-000000000009'::uuid),
  0,
  'borrar un usuario elimina en cascada sus filas de chat_participants'
);

-- ── Realtime publication ─────────────────────────────────────────────────────
select is(
  (select count(*)::int from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'),
  1,
  'messages está en la publication supabase_realtime'
);

select is(
  (select count(*)::int from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_participants'),
  1,
  'chat_participants está en la publication supabase_realtime'
);

-- ── Índices de paginación (I-F-N07-01-02, #281) ──────────────────────────────
-- Un índice no altera resultados: si se borra/renombra, ningún test funcional
-- falla y la regresión (Seq Scan en prod) pasa desapercibida. Estos asserts fijan
-- su existencia y forma (orden y dirección de columnas) como invariante en CI.
select ok(
  (select indexdef from pg_indexes
   where schemaname = 'public' and indexname = 'messages_chat_paging_idx')
  like '%USING btree (chat_id, created_at DESC, id DESC)%',
  'messages_chat_paging_idx = (chat_id, created_at desc, id desc)'
);

select ok(
  (select indexdef from pg_indexes
   where schemaname = 'public' and indexname = 'chats_last_message_at_idx')
  like '%USING btree (last_message_at DESC)%',
  'chats_last_message_at_idx = (last_message_at desc)'
);

select ok(
  (select indexdef from pg_indexes
   where schemaname = 'public' and indexname = 'chat_participants_user_idx')
  like '%USING btree (user_id, chat_id)%',
  'chat_participants_user_idx = (user_id, chat_id)'
);

select * from finish();
rollback;
