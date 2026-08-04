import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useChat } from '@/hooks/useChat';
import { listMessages, sendMessage } from '@/lib/chat';
import type { Message } from '@/lib/chat';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Canal Realtime falso: captura los handlers por tipo de evento para poder
// emitirlos desde los tests.
const mockHandlers: Record<string, (payload: unknown) => void> = {};
const mockRemoveChannel = jest.fn();

jest.mock('@/lib/supabase', () => {
  const channel: {
    on: (t: string, c: { event: string }, cb: (p: unknown) => void) => typeof channel;
    subscribe: () => typeof channel;
  } = {
    on: (_type, config, cb) => {
      mockHandlers[config.event] = cb;
      return channel;
    },
    subscribe: () => channel,
  };
  return {
    supabase: {
      channel: jest.fn(() => channel),
      removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
    },
  };
});

jest.mock('@/hooks/useSession', () => ({
  useSession: () => ({ session: { userId: 'me', role: 'staff' }, profile: null, status: 'authenticated' }),
}));

jest.mock('@/lib/chat', () => ({
  listMessages: jest.fn(),
  sendMessage: jest.fn(),
  MESSAGES_PAGE_SIZE: 30,
  MAX_MESSAGE_LENGTH: 4000,
  MAX_MESSAGES_IN_MEMORY: 500,
}));

const mockList = listMessages as jest.MockedFunction<typeof listMessages>;
const mockSend = sendMessage as jest.MockedFunction<typeof sendMessage>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function msg(
  id: string,
  createdAt: string,
  over: Partial<Message> = {},
): Message {
  return {
    id,
    chat_id: 'c1',
    sender_id: 'other',
    content: `m-${id}`,
    created_at: createdAt,
    edited_at: null,
    deleted_at: null,
    ...over,
  };
}

const T1 = '2026-08-04T10:00:01Z';
const T2 = '2026-08-04T10:00:02Z';
const T3 = '2026-08-04T10:00:03Z';
const T4 = '2026-08-04T10:00:04Z';

function emit(event: 'INSERT' | 'UPDATE' | 'DELETE', payload: unknown) {
  act(() => {
    mockHandlers[event]?.(payload);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockHandlers)) delete mockHandlers[k];
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useChat', () => {
  it('carga inicial: 30 (aquí 3) mensajes en orden descendente', async () => {
    mockList.mockResolvedValueOnce({
      rows: [msg('3', T3), msg('2', T2), msg('1', T1)],
      nextCursor: { created_at: T1, id: '1' },
    });

    const { result } = renderHook(() => useChat('c1'));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.messages.map((m) => m.id)).toEqual(['3', '2', '1']);
    expect(result.current.hasMore).toBe(true);
    expect(mockList).toHaveBeenCalledWith({ chatId: 'c1', pageSize: 30 });
  });

  it('expone error cuando falla la carga', async () => {
    mockList.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(() => useChat('c1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('No se pudieron cargar los mensajes.');
  });

  it('un INSERT vía Realtime aparece en la lista', async () => {
    mockList.mockResolvedValueOnce({ rows: [msg('1', T1)], nextCursor: null });

    const { result } = renderHook(() => useChat('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    emit('INSERT', { new: msg('4', T4) });

    expect(result.current.messages.map((m) => m.id)).toEqual(['4', '1']);
  });

  it('un UPDATE vía Realtime (soft delete) se refleja', async () => {
    mockList.mockResolvedValueOnce({ rows: [msg('1', T1)], nextCursor: null });

    const { result } = renderHook(() => useChat('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    emit('UPDATE', { new: msg('1', T1, { deleted_at: '2026-08-04T11:00:00Z' }) });

    expect(result.current.messages[0]!.deleted_at).toBe('2026-08-04T11:00:00Z');
  });

  it('un DELETE vía Realtime elimina el mensaje', async () => {
    mockList.mockResolvedValueOnce({ rows: [msg('2', T2), msg('1', T1)], nextCursor: null });

    const { result } = renderHook(() => useChat('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    emit('DELETE', { old: { id: '1' } });

    expect(result.current.messages.map((m) => m.id)).toEqual(['2']);
  });

  it('sendMessage: optimista, reconcilia con la fila persistida y sin duplicado con Realtime', async () => {
    mockList.mockResolvedValueOnce({ rows: [], nextCursor: null });
    const persisted = msg('s1', T2, { sender_id: 'me', content: 'hola' });
    mockSend.mockResolvedValueOnce(persisted);

    const { result } = renderHook(() => useChat('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.sendMessage('hola');
    });

    // El evento Realtime del propio INSERT llega después: no debe duplicar.
    emit('INSERT', { new: persisted });

    const hola = result.current.messages.filter((m) => m.content === 'hola');
    expect(hola).toHaveLength(1);
    expect(hola[0]!.id).toBe('s1');
    expect(hola[0]!._status).toBe('sent');
    expect(mockSend).toHaveBeenCalledWith({ chatId: 'c1', content: 'hola' });
  });

  it('sendMessage fallido queda como failed y retry lo reenvía sin duplicar', async () => {
    mockList.mockResolvedValueOnce({ rows: [], nextCursor: null });
    mockSend.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(() => useChat('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.sendMessage('reintento');
    });

    expect(result.current.messages).toHaveLength(1);
    const failed = result.current.messages[0]!;
    expect(failed._status).toBe('failed');

    mockSend.mockResolvedValueOnce(msg('s2', T3, { sender_id: 'me', content: 'reintento' }));
    await act(async () => {
      await result.current.retry(failed._clientId!);
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]!.id).toBe('s2');
    expect(result.current.messages[0]!._status).toBe('sent');
  });

  it('loadMore pagina con cursor sin duplicar', async () => {
    mockList.mockResolvedValueOnce({ rows: [msg('3', T3)], nextCursor: { created_at: T3, id: '3' } });

    const { result } = renderHook(() => useChat('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMore).toBe(true);

    // La página siguiente devuelve '3' (duplicado) + '2' y '1' (nuevos).
    mockList.mockResolvedValueOnce({
      rows: [msg('3', T3), msg('2', T2), msg('1', T1)],
      nextCursor: null,
    });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.messages.map((m) => m.id)).toEqual(['3', '2', '1']);
    expect(result.current.hasMore).toBe(false);
    expect(mockList).toHaveBeenLastCalledWith({
      chatId: 'c1',
      cursor: { created_at: T3, id: '3' },
      pageSize: 30,
    });
  });

  it('no envía mensajes vacíos', async () => {
    mockList.mockResolvedValueOnce({ rows: [], nextCursor: null });

    const { result } = renderHook(() => useChat('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.sendMessage('   ');
    });

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('limpia el canal Realtime al desmontar', async () => {
    mockList.mockResolvedValueOnce({ rows: [], nextCursor: null });

    const { unmount } = renderHook(() => useChat('c1'));
    await waitFor(() => expect(mockRemoveChannel).not.toHaveBeenCalled());

    unmount();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });
});
