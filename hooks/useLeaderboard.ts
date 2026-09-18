import { useCallback, useEffect, useRef, useState } from 'react';

import { reportError } from '@/lib/errors';
import {
  DEFAULT_LEADERBOARD_LIMIT,
  getLeaderboard,
  splitSelfBelowTop,
  type LeaderboardEntry,
  type LeaderboardPeriod,
} from '@/lib/gamification';

export type { LeaderboardEntry, LeaderboardPeriod };

// Hook contenedor del ranking: encapsula la llamada a la RPC, el periodo activo y
// la separación de la fila «Tu posición». La pantalla solo pinta.
export function useLeaderboard(
  initialPeriod: LeaderboardPeriod = 'weekly',
  limit: number = DEFAULT_LEADERBOARD_LIMIT,
) {
  const [period, setPeriod] = useState<LeaderboardPeriod>(initialPeriod);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const load = useCallback(async () => {
    // Descarta respuestas de peticiones ya superadas (cambio rápido de pestaña):
    // sin esto, una semanal lenta podría pisar a la mensual que llegó después.
    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const data = await getLeaderboard(period, limit);
      if (fetchIdRef.current !== fetchId) return;
      setEntries(data);
    } catch (e) {
      if (fetchIdRef.current !== fetchId) return;
      setEntries([]);
      setError(reportError('useLeaderboard', e, 'No se pudo cargar el ranking.'));
    } finally {
      if (fetchIdRef.current === fetchId) setLoading(false);
    }
  }, [period, limit]);

  useEffect(() => {
    load();
  }, [load]);

  // Vacía la lista al cambiar de pestaña para no enseñar los datos del periodo
  // anterior bajo el rótulo del nuevo. El guard evita dejarla vacía al re-pulsar
  // la pestaña activa, que no dispara recarga.
  const changePeriod = useCallback(
    (next: LeaderboardPeriod) => {
      if (next === period) return;
      setEntries([]);
      setPeriod(next);
    },
    [period],
  );

  const { top, selfBelowTop } = splitSelfBelowTop(entries, limit);

  return { top, selfBelowTop, period, setPeriod: changePeriod, loading, error, refetch: load };
}
