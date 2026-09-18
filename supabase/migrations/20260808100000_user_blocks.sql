-- Migration: N07-04-02 — Bloqueo entre usuarios (#288)
-- Epic N07 (#274) / Feature F-N07-04 (#278) / Issue I-F-N07-04-02 (#288).
-- Depends on: 20260731000000_chat.sql (chats/messages), 20260803000000_rls_chat_n07_02_01.sql
--   (messages_insert_participant, is_chat_participant, is_admin) y
--   20260806000000_create_or_get_direct_chat.sql (RPC de alta del DM).
--
-- Modelo `user_blocks`: un par (blocker, blocked) impide interacciones 1:1 (enviar
-- mensajes y crear nuevos chats) sin destruir el historial. Autoservicio: cada usuario
-- gestiona sus propios bloqueos; el admin puede gestionar cualquiera.

-- ── Tabla ─────────────────────────────────────────────────────────────────────
create table public.user_blocks (
  blocker_user_id uuid        not null references auth.users(id) on delete cascade,
  blocked_user_id uuid        not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  constraint user_blocks_no_self check (blocker_user_id <> blocked_user_id)
);

-- La PK sirve el acceso por blocker; este índice sirve el acceso por bloqueado
-- (p. ej. "¿quién me ha bloqueado?" del helper bidireccional).
create index user_blocks_blocked_idx on public.user_blocks (blocked_user_id);

grant select, insert, delete on public.user_blocks to authenticated;

alter table public.user_blocks enable row level security;

-- ── RLS: cada quien gestiona SOLO sus propios bloqueos; admin cualquiera ──────
-- SELECT acota a mis filas (no revela quién me ha bloqueado): "mis bloqueos".
create policy user_blocks_select
  on public.user_blocks for select to authenticated
  using (blocker_user_id = auth.uid() or public.is_admin());

create policy user_blocks_insert
  on public.user_blocks for insert to authenticated
  with check (blocker_user_id = auth.uid() or public.is_admin());

create policy user_blocks_delete
  on public.user_blocks for delete to authenticated
  using (blocker_user_id = auth.uid() or public.is_admin());

-- ── Helper: ¿hay bloqueo entre A y B en cualquier sentido? ────────────────────
-- SECURITY DEFINER: lee user_blocks ignorando RLS (la policy de messages/RPC lo usa
-- para comprobar bloqueos del contraparte, cuyas filas el llamante no puede ver).
create or replace function public.is_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_user_id = p_a and blocked_user_id = p_b)
       or (blocker_user_id = p_b and blocked_user_id = p_a)
  );
$$;

revoke all on function public.is_blocked(uuid, uuid) from public;
grant execute on function public.is_blocked(uuid, uuid) to authenticated, service_role;

-- Versión acotada al llamante para la UI (no permite sondear pares ajenos).
create or replace function public.direct_chat_blocked(other_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_blocked(auth.uid(), other_user);
$$;

revoke all on function public.direct_chat_blocked(uuid) from public;
grant execute on function public.direct_chat_blocked(uuid) to authenticated, service_role;

-- ── Endurecer el INSERT de mensajes: no enviar si hay bloqueo con el contraparte ─
-- Reemplaza el with check de messages_insert_participant (#282) añadiendo la condición
-- de bloqueo. Se mantiene: participante del chat + remitente propio (sin suplantación).
alter policy messages_insert_participant
  on public.messages
  with check (
    public.is_chat_participant(chat_id)
    and sender_id = auth.uid()
    and not exists (
      select 1 from public.chat_participants cp_other
      where cp_other.chat_id = messages.chat_id
        and cp_other.user_id <> auth.uid()
        and public.is_blocked(auth.uid(), cp_other.user_id)
    )
  );

-- ── Endurecer la RPC de alta del DM: no crear un chat nuevo si hay bloqueo ────
-- Idéntica a 20260806000000 salvo la comprobación de bloqueo antes de crear. Un chat
-- ya existente se sigue devolviendo (el historial permanece legible); solo se impide
-- ABRIR uno nuevo entre un par bloqueado.
create or replace function public.create_or_get_direct_chat(other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me       uuid := auth.uid();
  pair_a   uuid;
  pair_b   uuid;
  existing uuid;
  new_chat uuid;
begin
  if me is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  if other_user is null or other_user = me then
    raise exception 'Interlocutor inválido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where user_id = other_user) then
    raise exception 'El usuario no existe' using errcode = '23503';
  end if;

  -- Par ordenado: la unicidad de chat_direct_pairs es sobre (user_a < user_b).
  pair_a := least(me, other_user);
  pair_b := greatest(me, other_user);

  select chat_id into existing
  from public.chat_direct_pairs
  where user_a = pair_a and user_b = pair_b;
  if existing is not null then
    return existing;
  end if;

  -- Sin chat previo: si hay bloqueo en cualquier sentido, no se puede abrir uno nuevo.
  if public.is_blocked(me, other_user) then
    raise exception 'Bloqueo activo entre los usuarios' using errcode = '42501';
  end if;

  insert into public.chats (is_group) values (false) returning id into new_chat;
  -- Una fila por sentencia: el trigger chat_direct_pairs_sync materializa el par al
  -- completarse el segundo participante (un INSERT multi-fila lo intentaría dos veces).
  insert into public.chat_participants (chat_id, user_id) values (new_chat, me);
  insert into public.chat_participants (chat_id, user_id) values (new_chat, other_user);

  return new_chat;
exception
  -- Carrera: otra sesión creó el mismo par entre el select y el insert. El bloque
  -- revierte los inserts de este intento (incluido el chat huérfano) y devolvemos el
  -- que ganó.
  when unique_violation then
    select chat_id into existing
    from public.chat_direct_pairs
    where user_a = pair_a and user_b = pair_b;
    return existing;
end;
$$;

revoke all on function public.create_or_get_direct_chat(uuid) from public;
grant execute on function public.create_or_get_direct_chat(uuid) to authenticated, service_role;
