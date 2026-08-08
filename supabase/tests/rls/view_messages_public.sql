-- Tests: vista public.messages_public_v (soft delete enmascara content) — I-F-N07-04-01 (#287)
-- Migración 20260807000000_messages_public_v.sql.
-- Cubre:
--   - security_invoker = true (hereda la RLS de messages: solo participantes / admin).
--   - mensaje activo → content visible.
--   - sender borra el suyo → la vista enmascara su content (null), conservando deleted_at.
--   - admin modera (soft delete) un mensaje ajeno → content también enmascarado.
--   - un no participante no ve filas del chat (la vista hereda la RLS de messages).
--   - fix #330: el soft delete BORRA el content en la TABLA BASE (trigger
--     messages_clear_content_on_soft_delete), así que ni el autor ni el otro participante
--     lo recuperan por messages (no solo por la vista). Migración
--     20260813000000_clear_message_content_on_soft_delete.sql.
--
-- Seed UUIDs (supabase/seed.sql) — ids de auth.users:
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(12);

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
-- Chat 1:1 admin + manager.
insert into public.chats (id) values ('c0ffee00-0000-0000-0000-000000000001'::uuid);

-- Una fila por sentencia: el trigger de par 1:1 materializa al completarse el par.
insert into public.chat_participants (chat_id, user_id)
  values ('c0ffee00-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-0000-0000-0000-000000000001'::uuid); -- admin
insert into public.chat_participants (chat_id, user_id)
  values ('c0ffee00-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-0000-0000-0000-000000000002'::uuid); -- manager

insert into public.messages (id, chat_id, sender_id, content) values
  -- activo, de admin
  ('a0000000-0000-0000-0000-00000000000a'::uuid, 'c0ffee00-0000-0000-0000-000000000001'::uuid,
   'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'activo'),
  -- de manager, lo borrará él mismo
  ('b0000000-0000-0000-0000-00000000000b'::uuid, 'c0ffee00-0000-0000-0000-000000000001'::uuid,
   'aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'secreto de manager'),
  -- de manager, lo moderará el admin
  ('b0000000-0000-0000-0000-00000000000c'::uuid, 'c0ffee00-0000-0000-0000-000000000001'::uuid,
   'aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'a moderar');

-- ── Estructura ───────────────────────────────────────────────────────────────
select has_view('public', 'messages_public_v', 'existe la vista messages_public_v');

select ok(
  (select array_to_string(reloptions, ',') from pg_class
   where relname = 'messages_public_v' and relnamespace = 'public'::regnamespace)
   like '%security_invoker=true%',
  'messages_public_v se creó con security_invoker=true'
);

-- ── manager: ve el content de un mensaje activo ──────────────────────────────
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

select results_eq(
  $$ select content from public.messages_public_v
     where id = 'a0000000-0000-0000-0000-00000000000a'::uuid $$,
  $$ values ('activo'::text) $$,
  'manager: ve el content de un mensaje activo'
);

-- ── sender borra el suyo → la vista enmascara su content ─────────────────────
select lives_ok(
  $$ update public.messages set deleted_at = now()
     where id = 'b0000000-0000-0000-0000-00000000000b'::uuid $$,
  'manager: puede soft-deletar su propio mensaje'
);

select results_eq(
  $$ select content, (deleted_at is not null) from public.messages_public_v
     where id = 'b0000000-0000-0000-0000-00000000000b'::uuid $$,
  $$ values (null::text, true) $$,
  'la vista enmascara el content del borrado por su autor (deleted_at se conserva)'
);

-- fix #330: el content se borra en la TABLA BASE, no solo en la vista.
select results_eq(
  $$ select content from public.messages
     where id = 'b0000000-0000-0000-0000-00000000000b'::uuid $$,
  $$ values (''::text) $$,
  'fix #330: el autor no recupera el content del borrado por la tabla base (queda vacío)'
);

-- ── admin: modera (soft delete) un mensaje ajeno → content enmascarado ────────
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select lives_ok(
  $$ update public.messages set deleted_at = now()
     where id = 'b0000000-0000-0000-0000-00000000000c'::uuid $$,
  'admin: puede soft-deletar (moderar) un mensaje ajeno'
);

select results_eq(
  $$ select content from public.messages_public_v
     where id = 'b0000000-0000-0000-0000-00000000000c'::uuid $$,
  $$ values (null::text) $$,
  'la vista enmascara el content del mensaje moderado por admin'
);

-- fix #330: el OTRO participante (admin) tampoco recupera por la tabla base el content
-- del mensaje que borró manager; y el moderado por admin también queda vacío en base.
select results_eq(
  $$ select content from public.messages
     where id = 'b0000000-0000-0000-0000-00000000000b'::uuid $$,
  $$ values (''::text) $$,
  'fix #330: el otro participante (admin) no recupera por la tabla base el borrado de manager'
);

select results_eq(
  $$ select content from public.messages
     where id = 'b0000000-0000-0000-0000-00000000000c'::uuid $$,
  $$ values (''::text) $$,
  'fix #330: el content del mensaje moderado por admin queda vacío en la tabla base'
);

-- Un mensaje activo conserva su content en la tabla base (no se blanquea de más).
select results_eq(
  $$ select content from public.messages
     where id = 'a0000000-0000-0000-0000-00000000000a'::uuid $$,
  $$ values ('activo'::text) $$,
  'fix #330: un mensaje activo conserva su content en la tabla base'
);

-- ── staff (no participante): la vista no le devuelve filas del chat ───────────
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select is(
  (select count(*)::int from public.messages_public_v
   where chat_id = 'c0ffee00-0000-0000-0000-000000000001'::uuid),
  0,
  'staff no participa: la vista hereda la RLS de messages y no le devuelve nada'
);

reset role;

select * from finish();
rollback;
