-- =============================================================================
-- BENCH SEED — Chat pagination (I-F-N07-01-02, #281)
-- PURPOSE : Poblar la BD LOCAL con ~1M mensajes y ~10k chats para validar los
--           umbrales de latencia de la paginación cursor-based y del listado
--           "mis chats". SOLO local — no es para CI ni producción.
-- USAGE   : pnpm bench:chat:seed        (o)
--           psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--                -f supabase/bench/chat_bench_seed.sql
-- Después: supabase/bench/chat_bench_run.sql  (mide p50/p95 + EXPLAIN).
-- Re-ejecutable: limpia sus propios datos (prefijos de UUID/email deterministas)
-- antes de volver a sembrar. NO toca los usuarios del seed (aaaaaaaa-...).
-- =============================================================================
\set ON_ERROR_STOP on
\timing on

-- Parámetros del bench.
\set n_chats     10000
\set n_messages  1000000
\set hot_chat    '00000000-0000-4000-9000-000000000001'
\set focus_user  '00000000-0000-4000-8000-000000000000'

begin;

-- ── Limpieza idempotente ─────────────────────────────────────────────────────
-- Borrar los chats del bench cascada a chat_participants / messages / pairs.
delete from public.chats        where id::text   like '00000000-0000-4000-9000-%';
delete from auth.users          where email      like 'bench-%@nun-ibiza.dev';
delete from auth.users          where id = :'focus_user'::uuid;

-- ── Usuarios throwaway ───────────────────────────────────────────────────────
-- Columnas mínimas que exige el scanner de GoTrue (tokens '' en vez de NULL),
-- igual que el patrón del test schema_chat.sql.
insert into auth.users (
  instance_id, id, aud, role, email, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values (
  '00000000-0000-0000-0000-000000000000'::uuid, :'focus_user'::uuid,
  'authenticated', 'authenticated', 'bench-focus@nun-ibiza.dev',
  now(), now(), '', '', '', ''
);

insert into auth.users (
  instance_id, id, aud, role, email, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  ('00000000-0000-4000-8001-' || lpad(to_hex(gs), 12, '0'))::uuid,
  'authenticated', 'authenticated', 'bench-' || gs || '@nun-ibiza.dev',
  now(), now(), '', '', '', ''
from generate_series(1, :n_chats) gs;

-- ── Desactivar triggers para la carga masiva ─────────────────────────────────
-- messages_set_last_message_at haría 1M UPDATE sobre chats; last_message_at se
-- fija abajo explícitamente. messages_set_edited_at no aplica a INSERT.
alter table public.messages          disable trigger user;
alter table public.chat_participants disable trigger user;

-- ── Chats (last_message_at escalonado para que el ORDER BY sea significativo) ─
insert into public.chats (id, is_group, created_at, last_message_at)
select
  ('00000000-0000-4000-9000-' || lpad(to_hex(gs), 12, '0'))::uuid,
  false,
  now(),
  now() - (gs || ' seconds')::interval
from generate_series(1, :n_chats) gs;

-- ── Participantes: el focus user está en TODOS los chats + 1 contraparte c/u ──
insert into public.chat_participants (chat_id, user_id)
select ('00000000-0000-4000-9000-' || lpad(to_hex(gs), 12, '0'))::uuid,
       :'focus_user'::uuid
from generate_series(1, :n_chats) gs;

insert into public.chat_participants (chat_id, user_id)
select ('00000000-0000-4000-9000-' || lpad(to_hex(gs), 12, '0'))::uuid,
       ('00000000-0000-4000-8001-' || lpad(to_hex(gs), 12, '0'))::uuid
from generate_series(1, :n_chats) gs;

-- ── Mensajes: 100k en el "hot chat" + resto repartido entre los 10k chats ─────
-- created_at único y monótono (now() - gs s) → sin empates en el cursor.
insert into public.messages (chat_id, sender_id, content, created_at)
select
  case
    when gs <= 100000 then :'hot_chat'::uuid
    else ('00000000-0000-4000-9000-' || lpad(to_hex((gs % :n_chats) + 1), 12, '0'))::uuid
  end,
  :'focus_user'::uuid,
  'benchmark message ' || gs,
  now() - (gs || ' seconds')::interval
from generate_series(1, :n_messages) gs;

-- ── Reactivar triggers ───────────────────────────────────────────────────────
alter table public.messages          enable trigger user;
alter table public.chat_participants enable trigger user;

-- ── ANALYZE para que el planner tenga estadísticas frescas ───────────────────
analyze public.messages;
analyze public.chats;
analyze public.chat_participants;

commit;

-- ── Resumen ──────────────────────────────────────────────────────────────────
select
  (select count(*) from public.messages
     where chat_id = :'hot_chat'::uuid)                               as hot_chat_messages,
  (select count(*) from public.messages)                             as total_messages,
  (select count(*) from public.chats
     where id::text like '00000000-0000-4000-9000-%')                as bench_chats,
  (select count(*) from public.chat_participants
     where user_id = :'focus_user'::uuid)                            as focus_user_chats;
