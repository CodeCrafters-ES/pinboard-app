-- Migration: N07-03 — RPC para iniciar/abrir un chat 1:1 (feature #277)
-- Epic N07 (#274) / Feature F-N07-03 (#277).
-- Depends on: 20260731000000_chat.sql (chats, chat_participants, chat_direct_pairs +
--   trigger de par) y 20260803000000_rls_chat_n07_02_01.sql (RLS).
--
-- La RLS chat_participants_insert solo deja añadirte a ti mismo, así que el cliente no
-- puede dar de alta al contraparte de un 1:1. La EPIC ya lo previó: "el alta del
-- contraparte la hará una RPC SECURITY DEFINER en F-N07-03". Esta función crea (o
-- reutiliza) el chat directo del par y devuelve su id. Idempotente: mismo par → mismo
-- chat, respaldado por la unicidad de chat_direct_pairs(user_a, user_b).

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
