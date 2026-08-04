import type { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

// Fila de la vista public.my_chats_v: un chat del usuario + su contador de no leídos.
export type MyChat = {
  chat_id: string;
  is_group: boolean;
  last_message_at: string;
  last_read_at: string;
  unread_count: number;
};

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
