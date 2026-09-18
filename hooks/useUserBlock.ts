import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { blockUser, unblockUser, getBlockState } from '@/lib/blocks';

/**
 * Estado de bloqueo con un interlocutor 1:1 y acción para alternar mi bloqueo.
 * `iBlocked`: lo he bloqueado yo (controla el botón Bloquear/Desbloquear).
 * `blocked`: hay bloqueo en cualquier sentido (controla si puedo escribir).
 */
export function useUserBlock(partnerId: string | null) {
  const [iBlocked, setIBlocked] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!partnerId) return;
    try {
      const state = await getBlockState({ partnerId });
      setIBlocked(state.iBlocked);
      setBlocked(state.blocked);
    } catch {
      // Silencioso: el estado de bloqueo es accesorio; la RLS es la fuente de verdad.
    }
  }, [partnerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggle = useCallback(async () => {
    if (!partnerId || loading) return;
    setLoading(true);
    try {
      if (iBlocked) {
        await unblockUser({ userId: partnerId });
      } else {
        await blockUser({ userId: partnerId });
      }
      await refresh();
    } catch {
      Alert.alert('Error', 'No se pudo actualizar el bloqueo.');
    } finally {
      setLoading(false);
    }
  }, [iBlocked, loading, partnerId, refresh]);

  return { iBlocked, blocked, loading, toggle, refresh };
}
