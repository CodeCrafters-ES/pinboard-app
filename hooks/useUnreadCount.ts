import { useCallback, useEffect, useRef, useState } from 'react';

import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabase';
import { listMyChats, markChatAsRead, type MyChat } from '@/lib/chat';
import { reportError } from '@/lib/errors';

// Ventana mínima entre UPDATEs de last_read_at por chat: evita escrituras excesivas
// al reabrir el chat o al llegar al fondo del hilo. Ver docs/chat.md.
export const MARK_READ_THROTTLE_MS = 2000;

/**
 * Contador global de no leídos por chat. Lee la vista `my_chats_v` (que ya excluye
 * los mensajes propios y los borrados) y la mantiene fresca:
 *  - Refetch al recibir un INSERT en `messages` de cualquiera de MIS chats
 *    (postgres_changes respeta la RLS: solo llegan filas que puedo ver).
 *  - `markAsRead(chatId)` pone el badge a 0 de forma optimista y persiste
 *    `last_read_at = now()` con throttle de 2s por chat.
 */
export function useUnreadCount() {
  const { session } = useSession();
  const userId = session?.userId ?? null;

  const [chats, setChats] = useState<MyChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Espejo de `load` para releer desde el handler Realtime sin recrear la suscripción.
  const loadRef = useRef<() => void>(() => {});
  // Throttle por chat: instante de la última escritura real y timer de flush pendiente.
  const lastMarkRef = useRef<Record<string, number>>({});
  const flushTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = useCallback(async () => {
    try {
      const rows = await listMyChats();
      setChats(rows);
      setError(null);
    } catch (e) {
      setError(reportError('useUnreadCount', e, 'No se pudieron cargar los no leídos.'));
    } finally {
      setLoading(false);
    }
  }, []);
  loadRef.current = load;

  useEffect(() => {
    if (!userId) return;
    void load();

    const channel = supabase
      .channel('unread:messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => loadRef.current(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const persistMark = useCallback(async (chatId: string) => {
    lastMarkRef.current[chatId] = Date.now();
    try {
      await markChatAsRead({ chatId });
    } catch (e) {
      // El badge ya se puso a 0 de forma optimista; un fallo de red se corrige en el
      // próximo refetch. No hay UI de error para esta acción de fondo.
      reportError('useUnreadCount.markAsRead', e, '');
    }
  }, []);

  const markAsRead = useCallback(
    (chatId: string) => {
      setChats((prev) =>
        prev.map((c) => (c.chat_id === chatId ? { ...c, unread_count: 0 } : c)),
      );

      const elapsed = Date.now() - (lastMarkRef.current[chatId] ?? 0);
      if (elapsed >= MARK_READ_THROTTLE_MS) {
        void persistMark(chatId);
        return;
      }
      // Dentro de la ventana: un único flush al borde persiste el last_read_at final.
      if (flushTimers.current[chatId]) return;
      flushTimers.current[chatId] = setTimeout(() => {
        delete flushTimers.current[chatId];
        void persistMark(chatId);
      }, MARK_READ_THROTTLE_MS - elapsed);
    },
    [persistMark],
  );

  useEffect(() => {
    const timers = flushTimers.current;
    return () => {
      for (const t of Object.values(timers)) clearTimeout(t);
    };
  }, []);

  const totalUnread = chats.reduce((sum, c) => sum + c.unread_count, 0);

  return { chats, totalUnread, loading, error, markAsRead, refresh: load };
}
