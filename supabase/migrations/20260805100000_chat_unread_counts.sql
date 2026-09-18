-- Migration: N07-03-03 — No leídos: vista my_chats_v + índice de mensajes activos (#286)
-- Epic N07 (#274) / Feature F-N07-03 (#277) / Issue I-F-N07-03-03 (#286).
-- Depends on: 20260731000000_chat.sql (tablas), 20260731100000_chat_indexes.sql
--   (índices de paginación) y 20260803010000_rls_chat_update_n07_02_02.sql
--   (chat_participants_update_own, para que markAsRead escriba su last_read_at).
--
-- Entrega el contador de no leídos por chat sin duplicar estado: una vista con
-- security_invoker que hereda la RLS del usuario que consulta (PG15+), más el
-- índice parcial de mensajes activos que 20260731100000_chat_indexes.sql dejó
-- reservado justo para esta query.

-- ── Índice de mensajes activos ────────────────────────────────────────────────
-- El contador de no leídos es la primera query que lee SOLO mensajes activos
-- (`deleted_at is null`) en un rango `created_at > last_read_at` por chat: es la que
-- justifica el índice parcial que #281 dejó pendiente a propósito. Excluye del índice
-- las filas borradas (no cuentan como no leídas) y sirve el rango por chat.
create index if not exists messages_active_idx
  on public.messages (chat_id, created_at)
  where deleted_at is null;

-- ── Vista: mis chats con contador de no leídos ────────────────────────────────
-- security_invoker = true: la vista corre con los permisos y la RLS del usuario que
-- la consulta (no del owner), así que auth.uid() es el llamante y solo ve sus chats.
-- unread_count: mensajes posteriores a MI last_read_at, enviados por OTRO (no self) y
-- no borrados. Chat sin mensajes → 0. El propio remitente nunca infla su unread, y el
-- filtro `sender_id <> cp.user_id` es por-espectador (dos participantes del mismo chat
-- ven contadores distintos).
create view public.my_chats_v
  with (security_invoker = true) as
select
  c.id              as chat_id,
  c.is_group,
  c.last_message_at,
  cp.last_read_at,
  (
    select count(*)
    from public.messages m
    where m.chat_id = c.id
      and m.created_at > cp.last_read_at
      and m.sender_id <> cp.user_id
      and m.deleted_at is null
  )::int as unread_count
from public.chats c
join public.chat_participants cp
  on cp.chat_id = c.id and cp.user_id = auth.uid();

grant select on public.my_chats_v to authenticated;
