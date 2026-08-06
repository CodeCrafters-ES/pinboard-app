import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { listMyBlocks, unblockUser, type BlockedUser } from '@/lib/blocks';

/**
 * Lista de usuarios que he bloqueado (pantalla "Mis bloqueos") con acción para
 * desbloquear. `unblock` es optimista: quita la fila al momento y la restaura si la
 * BD falla. La RLS es la fuente de verdad; el estado local es solo UX.
 */
export function useMyBlocks() {
  const [blocks, setBlocks] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Espejo síncrono del estado para capturar el snapshot al revertir un unblock fallido
  // sin depender de cuándo React ejecuta el updater de setState.
  const blocksRef = useRef<BlockedUser[]>(blocks);
  blocksRef.current = blocks;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listMyBlocks();
      setBlocks(rows);
      setError(null);
    } catch {
      setError('No se pudieron cargar tus bloqueos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const unblock = useCallback(async (userId: string) => {
    const snapshot = blocksRef.current;
    setBlocks((b) => b.filter((x) => x.userId !== userId));

    try {
      await unblockUser({ userId });
    } catch {
      setBlocks(snapshot);
      Alert.alert('Error', 'No se pudo desbloquear al usuario.');
    }
  }, []);

  return { blocks, loading, error, refresh, unblock };
}
