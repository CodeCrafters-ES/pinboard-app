import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabase';
import {
  listMessages,
  sendMessage as sendMessageToDb,
  MAX_MESSAGE_LENGTH,
  MESSAGES_PAGE_SIZE,
  MAX_MESSAGES_IN_MEMORY,
  type ChatMessage,
  type Message,
  type MessageCursor,
} from '@/lib/chat';

type State = {
  messages: ChatMessage[]; // orden descendente (más nuevo primero)
  cursor: MessageCursor | null;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
};

const INITIAL: State = {
  messages: [],
  cursor: null,
  hasMore: false,
  loading: true,
  loadingMore: false,
  error: null,
};

function compareDesc(a: ChatMessage, b: ChatMessage): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  if (a.id !== b.id) return a.id < b.id ? 1 : -1;
  return 0;
}

// Mantiene el orden desc estable y descarta los más antiguos si se supera el tope.
function sortCap(list: ChatMessage[]): ChatMessage[] {
  const sorted = [...list].sort(compareDesc);
  return sorted.length > MAX_MESSAGES_IN_MEMORY
    ? sorted.slice(0, MAX_MESSAGES_IN_MEMORY)
    : sorted;
}

// Inserta o reemplaza una fila persistida (de Realtime o del INSERT propio).
// Reconcilia el optimista pendiente que coincida en sender+content para que el
// envío optimista no deje duplicado ni parpadeo cuando llega el evento Realtime.
function upsertReal(list: ChatMessage[], row: Message): ChatMessage[] {
  const byId = list.findIndex((m) => m.id === row.id);
  if (byId >= 0) {
    const next = [...list];
    next[byId] = { ...row, _status: 'sent' };
    return sortCap(next);
  }
  const pending = list.findIndex(
    (m) => m._status === 'pending' && m.sender_id === row.sender_id && m.content === row.content,
  );
  if (pending >= 0) {
    const next = [...list];
    next[pending] = { ...row, _status: 'sent' };
    return sortCap(next);
  }
  return sortCap([{ ...row, _status: 'sent' }, ...list]);
}

let tempCounter = 0;

export function useChat(chatId: string) {
  const { session } = useSession();
  const currentUserId = session?.userId ?? null;
  const [state, setState] = useState<State>(INITIAL);

  // Espejo del estado para leer los mensajes de forma síncrona en callbacks
  // (retry) sin depender del flush diferido de setState.
  const messagesRef = useRef<ChatMessage[]>(state.messages);
  messagesRef.current = state.messages;

  // Carga inicial + suscripción Realtime; se re-montan al cambiar de chat.
  useEffect(() => {
    let cancelled = false;
    setState({ ...INITIAL });

    listMessages({ chatId, pageSize: MESSAGES_PAGE_SIZE })
      .then(({ rows, nextCursor }) => {
        if (cancelled) return;
        setState({
          messages: sortCap(rows.map((r) => ({ ...r, _status: 'sent' as const }))),
          cursor: nextCursor,
          hasMore: nextCursor !== null,
          loading: false,
          loadingMore: false,
          error: null,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState((s) => ({ ...s, loading: false, error: 'No se pudieron cargar los mensajes.' }));
      });

    const filter = `chat_id=eq.${chatId}`;
    const channel: RealtimeChannel = supabase
      .channel(`chat:${chatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter },
        (payload) =>
          setState((s) => ({ ...s, messages: upsertReal(s.messages, payload.new as Message) })),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter },
        (payload) =>
          setState((s) => ({ ...s, messages: upsertReal(s.messages, payload.new as Message) })),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages', filter },
        (payload) =>
          setState((s) => ({
            ...s,
            messages: s.messages.filter((m) => m.id !== (payload.old as { id: string }).id),
          })),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [chatId]);

  const loadMore = useCallback(async () => {
    if (state.loading || state.loadingMore || !state.hasMore || !state.cursor) return;
    const cursor = state.cursor;
    setState((s) => ({ ...s, loadingMore: true }));
    try {
      const { rows, nextCursor } = await listMessages({
        chatId,
        cursor,
        pageSize: MESSAGES_PAGE_SIZE,
      });
      setState((s) => {
        const seen = new Set(s.messages.map((m) => m.id));
        const merged = [
          ...s.messages,
          ...rows.filter((r) => !seen.has(r.id)).map((r) => ({ ...r, _status: 'sent' as const })),
        ];
        return {
          ...s,
          messages: sortCap(merged),
          cursor: nextCursor,
          hasMore: nextCursor !== null,
          loadingMore: false,
        };
      });
    } catch {
      setState((s) => ({ ...s, loadingMore: false }));
      Alert.alert('Error', 'No se pudieron cargar más mensajes.');
    }
  }, [chatId, state.loading, state.loadingMore, state.hasMore, state.cursor]);

  // INSERT en BD; el evento Realtime (o esta respuesta) reconcilia el optimista.
  const deliver = useCallback(
    async (clientId: string, content: string) => {
      try {
        const persisted = await sendMessageToDb({ chatId, content });
        setState((s) => ({ ...s, messages: upsertReal(s.messages, persisted) }));
      } catch {
        setState((s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m._clientId === clientId ? { ...m, _status: 'failed' as const } : m,
          ),
        }));
      }
    },
    [chatId],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (trimmed.length < 1 || trimmed.length > MAX_MESSAGE_LENGTH) return;

      const clientId = `temp-${++tempCounter}-${Date.now()}`;
      const now = new Date().toISOString();
      const optimistic: ChatMessage = {
        id: clientId,
        _clientId: clientId,
        _status: 'pending',
        chat_id: chatId,
        sender_id: currentUserId ?? '',
        content: trimmed,
        created_at: now,
        edited_at: null,
        deleted_at: null,
      };
      setState((s) => ({ ...s, messages: sortCap([optimistic, ...s.messages]) }));
      await deliver(clientId, trimmed);
    },
    [chatId, currentUserId, deliver],
  );

  // Reintenta un mensaje marcado como fallido, sin duplicarlo.
  const retry = useCallback(
    async (clientId: string) => {
      const failed = messagesRef.current.find(
        (x) => x._clientId === clientId && x._status === 'failed',
      );
      if (!failed) return;
      setState((s) => ({
        ...s,
        messages: s.messages.map((x) =>
          x._clientId === clientId ? { ...x, _status: 'pending' as const } : x,
        ),
      }));
      await deliver(clientId, failed.content);
    },
    [deliver],
  );

  return {
    messages: state.messages,
    loading: state.loading,
    loadingMore: state.loadingMore,
    hasMore: state.hasMore,
    error: state.error,
    loadMore,
    sendMessage,
    retry,
  };
}
