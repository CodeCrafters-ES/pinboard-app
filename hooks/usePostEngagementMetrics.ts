import { useCallback, useEffect, useRef, useState } from 'react';

import {
  listPostEngagement,
  DEFAULT_DAYS,
  type PostEngagement,
} from '@/lib/supabase/queries/engagement';

export function usePostEngagementMetrics(days: number = DEFAULT_DAYS) {
  const [rows, setRows] = useState<PostEngagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const load = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await listPostEngagement({ days });
      if (fetchId !== fetchIdRef.current) return; // respuesta obsoleta
      setRows(data);
    } catch (e) {
      if (fetchId !== fetchIdRef.current) return;
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las métricas.');
    } finally {
      if (fetchId === fetchIdRef.current) setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  return { rows, loading, error, refresh: load };
}
