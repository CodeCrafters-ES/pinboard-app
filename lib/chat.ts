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
