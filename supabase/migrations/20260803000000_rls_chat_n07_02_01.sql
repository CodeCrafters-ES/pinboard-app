-- Migration: N07-02-01 — RLS de chat: SELECT/INSERT solo participante (#282)
-- Epic N07 (#274) / Feature F-N07-02 (#276) / Issue I-F-N07-02-01 (#282).
-- Depends on: 20260731000000_chat.sql (tablas) y los helpers de rol
--   is_admin() de 20260617190000_security_definer_role_helpers.sql.
-- Sustituye el placeholder de RLS I-F-S00-04-04.
--
-- Alcance de esta issue: SELECT + INSERT. El UPDATE (edición / soft delete) es
-- I-F-N07-02-02 (#283); al no definirse aquí, queda denegado por defecto (RLS on
-- sin policy = deny), que es el estado deseado hasta que #283 lo materialice.
--
-- Nota: los triggers de 20260731000000_chat.sql (last_message_at, par 1:1) son
-- SECURITY DEFINER, así que sus escrituras sobre chats/chat_direct_pairs siguen
-- funcionando con RLS activada (corren como owner, con BYPASSRLS).

-- ── Helper: ¿el usuario autenticado participa en el chat? ─────────────────────
-- SECURITY DEFINER para romper la recursión: la policy de chat_participants usa
-- este helper, que a su vez lee chat_participants. Al correr como owner, la
-- lectura interna ignora RLS y no se auto-invoca.
create or replace function public.is_chat_participant(p_chat_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.chat_participants
    where chat_id = p_chat_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_chat_participant(uuid) from public;
grant execute on function public.is_chat_participant(uuid) to authenticated, service_role;

-- ── Habilitar RLS ─────────────────────────────────────────────────────────────
alter table public.chats             enable row level security;
alter table public.chat_participants enable row level security;
alter table public.messages          enable row level security;

-- ── chats ─────────────────────────────────────────────────────────────────────
-- SELECT: participante del chat o admin (moderación).
create policy chats_select_participant
  on public.chats for select to authenticated
  using (public.is_chat_participant(id) or public.is_admin());

-- INSERT: cualquier autenticado puede crear el contenedor `chats`; sólo será útil
-- cuando además se inserten sus participants (self, ver policy de abajo). El alta
-- del contraparte de un 1:1 la hará una RPC SECURITY DEFINER en F-N07-03.
create policy chats_insert_authenticated
  on public.chats for insert to authenticated
  with check (true);

-- ── chat_participants ─────────────────────────────────────────────────────────
-- SELECT: mi propia fila, las filas de un chat donde participo, o admin.
create policy chat_participants_select
  on public.chat_participants for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_chat_participant(chat_id)
    or public.is_admin()
  );

-- INSERT: sólo puedo añadirme a mí mismo (o admin a cualquiera).
create policy chat_participants_insert
  on public.chat_participants for insert to authenticated
  with check (user_id = auth.uid() or public.is_admin());

-- ── messages ──────────────────────────────────────────────────────────────────
-- SELECT: participante del chat o admin.
create policy messages_select_participant
  on public.messages for select to authenticated
  using (public.is_chat_participant(chat_id) or public.is_admin());

-- INSERT: participante del chat Y como remitente propio (sin suplantación).
create policy messages_insert_participant
  on public.messages for insert to authenticated
  with check (
    public.is_chat_participant(chat_id)
    and sender_id = auth.uid()
  );
