-- Migration: N07-01-02 — Chat pagination indexes (I-F-N07-01-02, #281)
-- Epic N07 (#274) / Feature F-N07-01 (#275).
-- Depends on: 20260731000000_chat.sql (chats, chat_participants, messages).
-- Índices que hacen O(log n) la paginación cursor-based del hilo y el listado
-- "mis chats ordenados por actividad". Ver docs/chat.md para las queries de
-- referencia, el contrato del cursor y el procedimiento de benchmark.

-- 1. Paginación cursor-based dentro de un chat.
--    Sirve `where chat_id = $1 order by created_at desc, id desc limit 30` y la
--    comparación de tupla `(created_at, id) < ($2, $3)` de las páginas siguientes.
--    Postgres NO crea índice para la FK messages.chat_id: sin esto la paginación
--    haría un Seq Scan de toda la tabla messages.
create index if not exists messages_chat_paging_idx
  on public.messages (chat_id, created_at desc, id desc);

-- 2. "Mis chats ordenados por actividad": el listado ordena los chats por su
--    última actividad. Índice desc para servir el ORDER BY ... DESC LIMIT.
create index if not exists chats_last_message_at_idx
  on public.chats (last_message_at desc);

-- 3. Resolver los chats de un usuario. La PK de chat_participants es
--    (chat_id, user_id); este índice invierte el orden para el acceso por user_id
--    (columna líder) que necesitan el listado de chats y el helper
--    is_chat_participant(chat_id) de la RLS (F-N07-02).
create index if not exists chat_participants_user_idx
  on public.chat_participants (user_id, chat_id);

-- ── Decisión I-F-N07-01-02 (#2): NO se crea messages_active_idx ────────────────
-- Se descarta deliberadamente el índice parcial propuesto en el issue:
--     create index messages_active_idx on public.messages (chat_id, created_at desc)
--       where deleted_at is null;
-- El DoD de la epic (#274) muestra los mensajes borrados como "Mensaje eliminado",
-- por lo que la query de paginación SÍ trae las filas con deleted_at not null (no
-- filtra por `deleted_at is null`) y ya queda cubierta por messages_chat_paging_idx.
-- Hoy no existe ninguna query que lea solo mensajes activos, así que el índice
-- parcial sería peso muerto en cada INSERT/soft-delete sin consumidor. Se añadirá
-- junto a la query que lo justifique (p. ej. el conteo de no leídos de F-N07-03) si
-- surge la necesidad.
