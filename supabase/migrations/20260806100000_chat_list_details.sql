-- Migration: N07-03 — Enriquecer my_chats_v para la lista de chats (feature #277)
-- Epic N07 (#274) / Feature F-N07-03 (#277).
-- Depends on: 20260805100000_chat_unread_counts.sql (my_chats_v base) y
--   20260702000000_profiles_public_view.sql (profiles_public).
--
-- La ChatList necesita, además del unread_count, el interlocutor (nombre + avatar) y un
-- preview del último mensaje. Se añaden columnas aditivas (no rompen a #286): unread_count
-- y su semántica no cambian. Sigue con security_invoker: la RLS del que consulta acota
-- mis chats y los mensajes; profiles_public expone las columnas públicas del perfil.

create or replace view public.my_chats_v
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
  )::int as unread_count,
  partner.user_id   as partner_user_id,
  pp.full_name      as partner_name,
  pp.avatar_url     as partner_avatar_url,
  last_msg.sender_id as last_message_sender_id,
  -- El preview enmascara el soft delete: el content borrado no llega al cliente.
  case when last_msg.deleted_at is not null then null else last_msg.content end
    as last_message_content
from public.chats c
join public.chat_participants cp
  on cp.chat_id = c.id and cp.user_id = auth.uid()
-- El otro participante del 1:1 (para grupos, el de menor user_id; fuera de alcance).
left join lateral (
  select cp2.user_id
  from public.chat_participants cp2
  where cp2.chat_id = c.id and cp2.user_id <> cp.user_id
  order by cp2.user_id
  limit 1
) partner on true
left join public.profiles_public pp on pp.user_id = partner.user_id
-- Último mensaje del hilo (mismo orden que la paginación).
left join lateral (
  select m.sender_id, m.content, m.deleted_at
  from public.messages m
  where m.chat_id = c.id
  order by m.created_at desc, m.id desc
  limit 1
) last_msg on true;

grant select on public.my_chats_v to authenticated;
