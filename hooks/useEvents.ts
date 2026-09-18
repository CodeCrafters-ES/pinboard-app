import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { Event, EventColor } from '@/lib/types';

export type { Event };

export type EventInsertData = {
  author_id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  all_day: boolean;
  event_start_at: string;
  event_end_at: string;
  color_tag: EventColor;
  image_url?: string | null;
};

export type EventUpdateData = {
  title?: string;
  description?: string | null;
  location?: string | null;
  all_day?: boolean;
  event_start_at?: string;
  event_end_at?: string;
  color_tag?: EventColor;
  image_url?: string | null;
};

export type UseEventsOptions = {
  authorId?: string;
  colorTag?: EventColor;
  // Mes a mostrar como 'YYYY-MM'; filtra por event_start_at dentro del mes.
  month?: string;
};

function monthRange(month: string): { start: string; end: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const m = Number(match[2]) - 1;
  const start = new Date(Date.UTC(year, m, 1));
  const end = new Date(Date.UTC(year, m + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

export function useEvents({ authorId, colorTag, month }: UseEventsOptions = {}) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const fetchEvents = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    setError(null);

    let query = supabase
      .from('events')
      .select('*')
      .order('event_start_at', { ascending: false });

    if (authorId) query = query.eq('author_id', authorId);
    if (colorTag) query = query.eq('color_tag', colorTag);
    if (month) {
      const range = monthRange(month);
      if (range) {
        query = query.gte('event_start_at', range.start).lt('event_start_at', range.end);
      }
    }

    const { data, error: err } = await query;

    if (fetchIdRef.current !== fetchId) return;

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    setEvents(data ?? []);
    setLoading(false);
  }, [authorId, colorTag, month]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const createEvent = useCallback(
    async (data: EventInsertData): Promise<{ event: Event | null; error: string | null }> => {
      const { data: row, error: err } = await supabase
        .from('events')
        .insert(data)
        .select('*')
        .single();

      if (err) return { event: null, error: err.message };

      // Optimista: la fila vuelve del servidor con defaults y updated_at ya resueltos.
      setEvents((prev) => [row, ...prev]);
      return { event: row, error: null };
    },
    [],
  );

  const updateEvent = useCallback(
    async (id: string, data: EventUpdateData): Promise<{ event: Event | null; error: string | null }> => {
      const { data: row, error: err } = await supabase
        .from('events')
        .update(data)
        .eq('id', id)
        .select('*')
        .single();

      if (err) return { event: null, error: err.message };

      setEvents((prev) => prev.map((e) => (e.id === id ? row : e)));
      return { event: row, error: null };
    },
    [],
  );

  const deleteEvent = useCallback(async (id: string): Promise<{ error: string | null }> => {
    const { error: err } = await supabase.from('events').delete().eq('id', id);

    if (err) return { error: err.message };

    setEvents((prev) => prev.filter((e) => e.id !== id));
    return { error: null };
  }, []);

  const refresh = useCallback(() => {
    fetchEvents();
  }, [fetchEvents]);

  return { events, loading, error, createEvent, updateEvent, deleteEvent, refresh };
}
