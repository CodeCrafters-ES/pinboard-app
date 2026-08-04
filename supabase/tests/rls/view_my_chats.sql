-- Tests: vista public.my_chats_v (no leídos por chat) — I-F-N07-03-03 (#286)
-- Migración 20260805100000_chat_unread_counts.sql.
-- Cubre:
--   - security_invoker = true (hereda la RLS del que consulta).
--   - unread_count = mensajes tras MI last_read_at, de OTRO y no borrados.
--   - por-espectador: manager y admin ven contadores distintos del mismo chat.
--   - self-sent no infla mi unread; mensaje borrado no cuenta; chat sin mensajes → 0.
--   - un no participante no ve el chat (la vista lo acota a auth.uid()).
--
-- Seed UUIDs (supabase/seed.sql) — ids de auth.users:
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

-- ── Fixtures (como postgres = bypass RLS) ────────────────────────────────────
-- Chat A: admin + manager (1:1). Chat C: manager + staff (1:1, sin mensajes).
insert into public.chats (id) values
  ('ccccaaaa-0000-0000-0000-000000000001'::uuid),   -- Chat A
  ('ccccaaaa-0000-0000-0000-000000000003'::uuid);   -- Chat C

-- Una fila por sentencia: el trigger de par 1:1 materializa al completarse el par.
insert into public.chat_participants (chat_id, user_id)
  values ('ccccaaaa-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-0000-0000-0000-000000000001'::uuid); -- A: admin
insert into public.chat_participants (chat_id, user_id)
  values ('ccccaaaa-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-0000-0000-0000-000000000002'::uuid); -- A: manager
insert into public.chat_participants (chat_id, user_id)
  values ('ccccaaaa-0000-0000-0000-000000000003'::uuid, 'aaaaaaaa-0000-0000-0000-000000000002'::uuid); -- C: manager
insert into public.chat_participants (chat_id, user_id)
  values ('ccccaaaa-0000-0000-0000-000000000003'::uuid, 'aaaaaaaa-0000-0000-0000-000000000003'::uuid); -- C: staff

-- last_read_at fijo (no depender de now()): admin y manager leyeron hasta 2026-08-01 00:00.
update public.chat_participants
  set last_read_at = '2026-08-01 00:00:00+00'
  where chat_id = 'ccccaaaa-0000-0000-0000-000000000001'::uuid;

-- Mensajes de Chat A.
insert into public.messages (id, chat_id, sender_id, content, created_at, deleted_at) values
  -- admin, tras el corte → cuenta para manager
  ('ddddaaaa-0000-0000-0000-000000000001'::uuid, 'ccccaaaa-0000-0000-0000-000000000001'::uuid,
   'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'a1', '2026-08-01 10:00:00+00', null),
  ('ddddaaaa-0000-0000-0000-000000000002'::uuid, 'ccccaaaa-0000-0000-0000-000000000001'::uuid,
   'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'a2', '2026-08-01 11:00:00+00', null),
  -- manager (self para manager; otro para admin) → cuenta solo para admin
  ('ddddaaaa-0000-0000-0000-000000000003'::uuid, 'ccccaaaa-0000-0000-0000-000000000001'::uuid,
   'aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'm1', '2026-08-01 12:00:00+00', null),
  -- admin, ANTES del corte → no cuenta
  ('ddddaaaa-0000-0000-0000-000000000004'::uuid, 'ccccaaaa-0000-0000-0000-000000000001'::uuid,
   'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'viejo', '2026-07-31 09:00:00+00', null),
  -- admin, tras el corte pero BORRADO → no cuenta
  ('ddddaaaa-0000-0000-0000-000000000005'::uuid, 'ccccaaaa-0000-0000-0000-000000000001'::uuid,
   'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'borrado', '2026-08-01 13:00:00+00', '2026-08-01 13:30:00+00');

-- ── security_invoker ─────────────────────────────────────────────────────────
select has_view('public', 'my_chats_v', 'existe la vista my_chats_v');

select ok(
  (select array_to_string(reloptions, ',') from pg_class
   where relname = 'my_chats_v' and relnamespace = 'public'::regnamespace)
   like '%security_invoker=true%',
  'my_chats_v se creó con security_invoker=true'
);

-- ── manager: ve A (unread=2) y C (unread=0) ──────────────────────────────────
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

select results_eq(
  $$ select unread_count from public.my_chats_v
     where chat_id = 'ccccaaaa-0000-0000-0000-000000000001'::uuid $$,
  $$ values (2) $$,
  'manager: unread=2 en chat A (2 de admin tras el corte; self, viejo y borrado excluidos)'
);

select results_eq(
  $$ select unread_count from public.my_chats_v
     where chat_id = 'ccccaaaa-0000-0000-0000-000000000003'::uuid $$,
  $$ values (0) $$,
  'manager: unread=0 en chat C (sin mensajes)'
);

select is(
  (select count(*)::int from public.my_chats_v),
  2,
  'manager ve exactamente sus 2 chats'
);

-- ── admin: mismo chat A, distinto contador (self por-espectador) ──────────────
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select results_eq(
  $$ select unread_count from public.my_chats_v
     where chat_id = 'ccccaaaa-0000-0000-0000-000000000001'::uuid $$,
  $$ values (1) $$,
  'admin: unread=1 en chat A (solo el mensaje de manager; los suyos no cuentan)'
);

-- ── staff: solo ve C, nunca A (la vista acota a auth.uid()) ───────────────────
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select is(
  (select count(*)::int from public.my_chats_v
   where chat_id = 'ccccaaaa-0000-0000-0000-000000000001'::uuid),
  0,
  'staff no participa en A: la vista no le devuelve esa fila'
);

reset role;

select * from finish();
rollback;
