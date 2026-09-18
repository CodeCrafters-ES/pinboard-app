-- Migration: N07 — fix de seguridad (Epic N07 #274)
-- Cierra una fuga de confidencialidad: cualquier autenticado podía LEER (y escribir)
-- los mensajes de un DM ajeno encadenando dos fallos de RLS.
--
-- Cadena de explotación (verificada):
--   1) `public.chat_direct_pairs` tenía `grant select ... to authenticated` y SIN RLS,
--      así que un usuario podía listar el grafo social (qué pares tienen DM) y obtener
--      el `chat_id` de una conversación ajena.
--   2) `chat_participants_insert` solo comprobaba `user_id = auth.uid()`, así que ese
--      usuario podía AUTO-AÑADIRSE al chat ajeno. Tras el self-join,
--      `is_chat_participant()` pasaba a true y `messages_select_participant` le abría
--      todo el historial.
--
-- Precondition: 20260803000000 (policies base), 20260731000000 (chat_direct_pairs +
--   trigger), 20260806000000 / 20260808100000 (RPC create_or_get_direct_chat).

-- ── 1) chat_participants: el alta de participantes es exclusiva de la RPC + admin ──
-- La RPC `create_or_get_direct_chat` (SECURITY DEFINER) da de alta a AMBOS participantes
-- como owner, ignorando RLS: es el único camino sancionado para montar un 1:1 (ya lo
-- previó la epic). Un usuario ya NO puede insertarse a sí mismo directamente en un chat
-- — ese self-insert a un chat existente era el vector del ataque. El cliente nunca
-- inserta aquí (usa la RPC; sobre chat_participants solo hace UPDATE de last_read_at).
alter policy chat_participants_insert on public.chat_participants
  with check (public.is_admin());

-- ── 2) chat_direct_pairs: cerrar la lectura directa ───────────────────────────────
-- Filtraba el grafo social y los chat_id. El cliente no la consulta; la RPC resuelve el
-- par como definer (owner: ni el revoke ni la RLS le afectan). Se revoca el SELECT a
-- authenticated y se habilita RLS (deny por defecto, sin policy).
revoke select on public.chat_direct_pairs from authenticated;
alter table public.chat_direct_pairs enable row level security;
