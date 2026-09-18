import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabase';

// Tras este tiempo de inactividad se emite isTyping=false automáticamente.
export const TYPING_TIMEOUT_MS = 3000;

// Contrato del broadcast `typing` (ver docs/chat.md). No persiste en BD.
export type TypingPayload = { user_id: string; isTyping: boolean };

/**
 * Indicador de "escribiendo…" vía Supabase Realtime Broadcast (efímero, sin BD).
 * Devuelve los `user_id` que están escribiendo (excluye al propio usuario) y
 * `setTyping(isTyping)`: emite `true` al primer keypress y `false` tras 3s de
 * inactividad (o al llamarlo con `false`, o al pasar a background).
 */
export function useTyping(chatId: string) {
  const { session } = useSession();
  const userId = session?.userId ?? null;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    const channel = supabase.channel(`typing:${chatId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const { user_id, isTyping } = payload as TypingPayload;
        if (user_id === userIdRef.current) return; // ignorar el propio eco
        setTypingUserIds((prev) => {
          const set = new Set(prev);
          if (isTyping) set.add(user_id);
          else set.delete(user_id);
          return [...set];
        });
      })
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      isTypingRef.current = false;
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [chatId]);

  const emit = useCallback((isTyping: boolean) => {
    const channel = channelRef.current;
    const uid = userIdRef.current;
    if (!channel || !uid) return;
    void channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: uid, isTyping } satisfies TypingPayload,
    });
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (isTypingRef.current) {
      isTypingRef.current = false;
      emit(false);
    }
  }, [emit]);

  const setTyping = useCallback(
    (isTyping: boolean) => {
      if (!isTyping) {
        stop();
        return;
      }
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        emit(true);
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        isTypingRef.current = false;
        emit(false);
      }, TYPING_TIMEOUT_MS);
    },
    [emit, stop],
  );

  // Al pasar a background, dejar de "escribiendo…".
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') stop();
    });
    return () => sub.remove();
  }, [stop]);

  return { typingUserIds, setTyping };
}
