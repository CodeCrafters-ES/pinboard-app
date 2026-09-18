import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabase';

/**
 * Presencia online/offline de un chat vía Supabase Realtime Presence. No persiste
 * nada en BD. Devuelve los `user_id` presentes (las claves de presence = userId).
 *
 * Usa un topic propio `presence:<chatId>` (distinto del `chat:<chatId>` de
 * postgres_changes de useChat) para no colisionar dos canales con el mismo topic.
 */
export function usePresence(chatId: string) {
  const { session } = useSession();
  const userId = session?.userId ?? null;
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel(`presence:${chatId}`, {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        setOnlineUserIds(Object.keys(channel.presenceState()));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.track({ at: new Date().toISOString() });
        }
      });

    // Background: dejar de estar presente; volver a activo: re-anunciarse.
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'background') void channel.untrack();
      else if (next === 'active') void channel.track({ at: new Date().toISOString() });
    });

    return () => {
      appStateSub.remove();
      void supabase.removeChannel(channel);
    };
  }, [chatId, userId]);

  return { onlineUserIds };
}
