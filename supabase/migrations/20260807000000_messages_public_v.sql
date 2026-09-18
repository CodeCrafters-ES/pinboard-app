-- Migration: N07-04-01 — Soft delete: vista messages_public_v (#287)
-- Epic N07 (#274) / Feature F-N07-04 (#278) / Issue I-F-N07-04-01 (#287).
-- Depends on: 20260731000000_chat.sql (messages.deleted_at) y
--   20260803000000_rls_chat_n07_02_01.sql (RLS de messages: solo participantes).
--
-- Opción B (recomendada por #287): el cliente lee los mensajes por esta vista, que
-- enmascara el `content` de los borrados (deleted_at not null → null). Así el content
-- original no es recuperable desde el cliente tras el soft delete. security_invoker =
-- true hace que la vista herede la RLS de messages (solo participantes / admin), sin
-- ampliar visibilidad: únicamente oculta la columna.
--
-- Nota Realtime: el stream postgres_changes va sobre la tabla messages, así que el
-- payload del UPDATE de un borrado sigue trayendo el content; el cliente lo enmascara
-- en useChat. Una garantía a nivel websocket queda fuera del alcance del MVP.
create view public.messages_public_v
  with (security_invoker = true) as
select
  id,
  chat_id,
  sender_id,
  case when deleted_at is null then content else null end as content,
  created_at,
  edited_at,
  deleted_at
from public.messages;

grant select on public.messages_public_v to authenticated;
