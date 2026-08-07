-- Migration: N07 — fix de seguridad (Epic N07 #274)
-- Congela las columnas de identidad en UPDATE de chat_participants y messages.
--
-- Complementa a 20260811000000_fix_chat_participant_self_join.sql. Aquel cerró el
-- self-join vía INSERT en chat_participants; este cierra la MISMA clase de ataque por
-- la vía de UPDATE, que las policies own no impedían:
--
--   1) chat_participants_update_own tiene `with check (user_id = auth.uid())`, así que
--      un usuario podía `update chat_participants set chat_id = '<chat_ajeno>'` sobre su
--      propia fila (using/with check siguen cumpliéndose porque user_id no cambia) y
--      AUTO-AÑADIRSE a un chat ajeno. Tras el move, is_chat_participant() pasa a true y
--      messages_select_participant abre todo el historial — el mismo desenlace que 328.
--   2) messages_update_own tiene `with check (sender_id = auth.uid())`, así que un
--      usuario podía mover un mensaje propio a un chat_id ajeno (inyección/spoofing).
--
-- La RLS no puede referirse a OLD, así que se congelan las columnas con triggers
-- BEFORE UPDATE. La RPC create_or_get_direct_chat y los triggers de par corren como
-- owner (SECURITY DEFINER) pero solo INSERTan; el admin no necesita mover filas entre
-- chats. El cliente solo hace UPDATE de last_read_at (participants) y content/deleted_at
-- (messages), ninguno toca chat_id/user_id/sender_id.
--
-- Precondition: 20260731000000 (tablas), 20260803010000 (policies UPDATE own).

-- ── chat_participants: chat_id / user_id inmutables en UPDATE ──────────────────
create or replace function public.chat_participants_freeze_identity()
returns trigger
language plpgsql
as $$
begin
  if new.chat_id is distinct from old.chat_id
     or new.user_id is distinct from old.user_id then
    raise exception 'chat_id/user_id son inmutables en un UPDATE de chat_participants'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger chat_participants_freeze_identity
  before update on public.chat_participants
  for each row execute function public.chat_participants_freeze_identity();

-- ── messages: chat_id / sender_id inmutables en UPDATE ─────────────────────────
-- Nombre alfabéticamente anterior a messages_set_edited_at (BEFORE UPDATE OF content),
-- así la comprobación de identidad corre primero; el orden no afecta a edited_at.
create or replace function public.messages_freeze_identity()
returns trigger
language plpgsql
as $$
begin
  if new.chat_id is distinct from old.chat_id
     or new.sender_id is distinct from old.sender_id then
    raise exception 'chat_id/sender_id son inmutables en un UPDATE de messages'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger messages_freeze_identity
  before update on public.messages
  for each row execute function public.messages_freeze_identity();
