import type { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import type { Database, Tables } from '@/lib/database.types';

export type Message = Tables<'messages'>;

// Cursor de paginación: tupla (created_at, id) de la última fila entregada.
// Ver docs/chat.md para el contrato completo.
export type MessageCursor = { created_at: string; id: string };

export type MessageStatus = 'sent' | 'pending' | 'failed';

// Mensaje con metadatos solo-cliente para el envío optimista (no persisten en BD).
export type ChatMessage = Message & { _status?: MessageStatus; _clientId?: string };

// Fila de la vista public.my_chats_v: un chat del usuario + su contador de no leídos.
export type MyChat = {
  chat_id: string;
  is_group: boolean;
  last_message_at: string;
  last_read_at: string;
  unread_count: number;
};

export const MESSAGES_PAGE_SIZE = 30;
export const MAX_MESSAGE_LENGTH = 4000;
// Tope de mensajes en memoria; al superarlo se descartan los más antiguos.
export const MAX_MESSAGES_IN_MEMORY = 500;

// Columnas explícitas: el content de mensajes borrados llega igual (se enmascara en
// cliente), la paginación no filtra por deleted_at (ver docs/chat.md).
const MESSAGE_COLUMNS = 'id, chat_id, sender_id, content, created_at, edited_at, deleted_at';

/**
 * Página de mensajes de un chat, orden `created_at desc, id desc` (más nuevo
 * primero). Con `cursor` trae los anteriores a esa tupla (comparación de tupla vía
 * `.or`), sin duplicados ni gaps aunque coincida `created_at`.
 */
export async function listMessages({
  chatId,
  cursor,
  pageSize = MESSAGES_PAGE_SIZE,
  client = supabase,
}: {
  chatId: string;
  cursor?: MessageCursor;
  pageSize?: number;
  client?: SupabaseClient<Database>;
}): Promise<{ rows: Message[]; nextCursor: MessageCursor | null }> {
  let query = client
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(pageSize);

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const lastRow = rows[rows.length - 1];
  const nextCursor =
    rows.length === pageSize && lastRow
      ? { created_at: lastRow.created_at, id: lastRow.id }
      : null;

  return { rows, nextCursor };
}

/**
 * Inserta un mensaje como el usuario autenticado. La RLS exige
 * `sender_id = auth.uid()` (F-N07-02), así que el sender lo pone el servidor a
 * partir de la sesión, no el cliente.
 */
export async function sendMessage({
  chatId,
  content,
  client = supabase,
}: {
  chatId: string;
  content: string;
  client?: SupabaseClient<Database>;
}): Promise<Message> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data, error } = await client
    .from('messages')
    .insert({ chat_id: chatId, sender_id: user.id, content })
    .select(MESSAGE_COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Mis chats con su contador de no leídos, ordenados por actividad. Lee la vista
 * `my_chats_v` (security_invoker): el propio auth.uid() acota las filas y el
 * unread_count ya excluye mensajes propios y borrados. Ver docs/chat.md.
 */
export async function listMyChats({
  client = supabase,
}: {
  client?: SupabaseClient<Database>;
} = {}): Promise<MyChat[]> {
  const { data, error } = await client
    .from('my_chats_v')
    .select('chat_id, is_group, last_message_at, last_read_at, unread_count')
    .order('last_message_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((r) => ({
    chat_id: r.chat_id ?? '',
    is_group: r.is_group ?? false,
    last_message_at: r.last_message_at ?? '',
    last_read_at: r.last_read_at ?? '',
    unread_count: r.unread_count ?? 0,
  }));
}

/**
 * Marca el chat como leído: `last_read_at = now()` en mi fila de chat_participants.
 * La RLS (chat_participants_update_own) solo permite tocar la fila propia; el
 * throttle de las escrituras vive en el hook useUnreadCount.
 */
export async function markChatAsRead({
  chatId,
  client = supabase,
}: {
  chatId: string;
  client?: SupabaseClient<Database>;
}): Promise<void> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { error } = await client
    .from('chat_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('chat_id', chatId)
    .eq('user_id', user.id);

  if (error) throw error;
}
