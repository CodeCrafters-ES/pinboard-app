import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { EventListItem } from '@/lib/types';

export type { EventListItem };

// Columnas mínimas para listas/calendario (query eficiente).
const EVENT_LIST_COLUMNS = 'id, title, event_start_at, event_end_at, all_day, color_tag, location';

// Trae los eventos cuyo rango [event_start_at, event_end_at) interseca [from, to).
// La intersección es `start < to` y `end > from`, así se incluyen eventos multi-día
// que empiezan antes del rango visible pero lo cruzan. Solo se consulta el rango
// pedido, no toda la tabla (RLS permite SELECT a cualquier usuario autenticado).
export function useEventsInRange(from: Date, to: Date) {
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const fetchIdRef = useRef(0);

  const fromISO = from.toISOString();
  const toISO = to.toISOString();

  const load = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    setError(null);

    const { data, error: err } = await supabase
      .from('events')
      .select(EVENT_LIST_COLUMNS)
      .lt('event_start_at', toISO)
      .gt('event_end_at', fromISO)
      .order('event_start_at', { ascending: true });

    if (fetchIdRef.current !== fetchId) return;

    if (err) {
      setError(new Error(err.message));
      setLoading(false);
      return;
    }

    setEvents(data ?? []);
    setLoading(false);
  }, [fromISO, toISO]);

  useEffect(() => {
    load();
  }, [load]);

  const refetch = useCallback(() => {
    load();
  }, [load]);

  return { events, loading, error, refetch };
}
