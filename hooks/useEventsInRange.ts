import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { Event } from '@/lib/types';

export type { Event };

// Trae los eventos cuyo rango [event_start_at, event_end_at) interseca el rango
// visible [startISO, endISO). La intersección es `start < end_visible` y
// `end > start_visible`, así se incluyen eventos multi-día que empiezan antes
// del rango visible pero lo cruzan. Solo se consulta el rango visible, no toda
// la tabla (RLS ya permite SELECT a cualquier usuario autenticado).
export function useEventsInRange(startISO: string, endISO: string) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const fetchEvents = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    setError(null);

    const { data, error: err } = await supabase
      .from('events')
      .select('*')
      .lt('event_start_at', endISO)
      .gt('event_end_at', startISO)
      .order('event_start_at', { ascending: true });

    if (fetchIdRef.current !== fetchId) return;

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    setEvents(data ?? []);
    setLoading(false);
  }, [startISO, endISO]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const refresh = useCallback(() => {
    fetchEvents();
  }, [fetchEvents]);

  return { events, loading, error, refresh };
}
