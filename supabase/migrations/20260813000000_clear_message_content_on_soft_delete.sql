-- Migration: N07 — endurecer soft delete (fix #330)
-- Epic N07 (#274) / fix del gap de confidencialidad detectado en la auditoría (#330).
--
-- Problema: el DoD de N07/#278 exige que el `content` original de un mensaje borrado
-- "no sea accesible al cliente". El enmascarado vivía solo en la vista messages_public_v
-- y en el cliente (maskDeleted), pero la policy messages_select_participant permite SELECT
-- sobre la TABLA BASE messages, y `authenticated` tiene GRANT SELECT sobre ella: cualquier
-- participante del DM (autor u otro) podía recuperar el texto por la tabla base o por REST
-- (/rest/v1/messages), y el payload de Realtime postgres_changes también lo transportaba.
--
-- Solución: al fijar deleted_at (soft delete), borrar físicamente `content` con un trigger
-- BEFORE UPDATE. Al reescribir NEW.content antes de persistir la fila, el texto original
-- desaparece de la tabla base, de REST y del WAL (y por tanto del payload de Realtime). Se
-- conservan fila y metadatos (deleted_at, sender_id, created_at): el borrado sigue siendo
-- soft. La vista messages_public_v y maskDeleted quedan como defensa en profundidad.
--
-- Precondition: 20260731000000 (tabla messages + trigger edited_at),
--   20260807000000 (vista messages_public_v), 20260812000000 (freeze de identidad).

-- ── CHECK de longitud: permitir content vacío SOLO en mensajes borrados ─────────
-- El INSERT de un mensaje vacío (deleted_at null) debe seguir fallando (23514); el
-- trigger de abajo deja content = '' en los borrados, lo que exige relajar el CHECK.
alter table public.messages drop constraint messages_content_check;
alter table public.messages add constraint messages_content_check check (
  char_length(content) <= 4000
  and (deleted_at is not null or char_length(content) >= 1)
);

-- ── Trigger: blanquear content al soft-deletar ─────────────────────────────────
-- Solo en la transición null → not null (idempotente: no re-toca borrados previos).
-- No interfiere con messages_set_edited_at (BEFORE UPDATE OF content): el soft delete
-- hace `set deleted_at = ...` sin nombrar content, así que aquel trigger no dispara y
-- edited_at no se ensucia. Tampoco con messages_freeze_identity (mira chat_id/sender_id).
-- El nombre 'clear' es alfabéticamente anterior a freeze/set, pero el orden es indiferente.
create or replace function public.messages_clear_content_on_soft_delete()
returns trigger
language plpgsql
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    new.content := '';
  end if;
  return new;
end;
$$;

create trigger messages_clear_content_on_soft_delete
  before update on public.messages
  for each row execute function public.messages_clear_content_on_soft_delete();
