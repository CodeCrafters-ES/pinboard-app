import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useUnreadCount, MARK_READ_THROTTLE_MS } from '@/hooks/useUnreadCount';
import { listMyChats, markChatAsRead, type MyChat } from '@/lib/chat';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Canal Realtime falso: captura el handler de INSERT para poder emitirlo.
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
  useSession: () => ({
    session: { userId: 'me', role: 'staff' },
    profile: null,
    status: 'authenticated',
  }),
}));

jest.mock('@/lib/chat', () => ({
  listMyChats: jest.fn(),
  markChatAsRead: jest.fn(),
}));

const mockList = listMyChats as jest.MockedFunction<typeof listMyChats>;
const mockMark = markChatAsRead as jest.MockedFunction<typeof markChatAsRead>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function chat(chatId: string, unread: number): MyChat {
  return {
    chat_id: chatId,
    is_group: false,
    last_message_at: '2026-08-04T10:00:00Z',
    last_read_at: '2026-08-04T09:00:00Z',
    unread_count: unread,
  };
}

function emitInsert() {
  act(() => {
    mockHandlers.INSERT?.({ new: {} });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  for (const k of Object.keys(mockHandlers)) delete mockHandlers[k];
  mockMark.mockResolvedValue(undefined);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useUnreadCount', () => {
  it('carga inicial: expone los chats y el total de no leídos', async () => {
    mockList.mockResolvedValueOnce([chat('a', 2), chat('b', 3)]);

    const { result } = renderHook(() => useUnreadCount());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.chats.map((c) => c.chat_id)).toEqual(['a', 'b']);
    expect(result.current.totalUnread).toBe(5);
  });

  it('un INSERT de Realtime refresca la vista y el unread sube', async () => {
    mockList.mockResolvedValueOnce([chat('a', 0)]);

    const { result } = renderHook(() => useUnreadCount());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.totalUnread).toBe(0);

    // Llega un mensaje de otro sin abrir el chat → el refetch trae unread = 1.
    mockList.mockResolvedValueOnce([chat('a', 1)]);
    emitInsert();

    await waitFor(() => expect(result.current.totalUnread).toBe(1));
  });

  it('markAsRead pone el badge a 0 de forma optimista y persiste last_read_at', async () => {
    mockList.mockResolvedValueOnce([chat('a', 4)]);

    const { result } = renderHook(() => useUnreadCount());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.totalUnread).toBe(4);

    await act(async () => {
      result.current.markAsRead('a');
    });

    expect(result.current.totalUnread).toBe(0);
    expect(mockMark).toHaveBeenCalledWith({ chatId: 'a' });
    expect(mockMark).toHaveBeenCalledTimes(1);
  });

  it('throttle de 2s: llamadas seguidas colapsan en un único flush', async () => {
    jest.useFakeTimers();
    mockList.mockResolvedValueOnce([chat('a', 1)]);

    const { result } = renderHook(() => useUnreadCount());
    await act(async () => {}); // deja resolver la carga inicial

    // Primera llamada: escribe al vuelo (leading edge).
    act(() => result.current.markAsRead('a'));
    expect(mockMark).toHaveBeenCalledTimes(1);

    // Segunda dentro de la ventana: no escribe aún, agenda un flush.
    act(() => result.current.markAsRead('a'));
    expect(mockMark).toHaveBeenCalledTimes(1);

    // Al vencer la ventana, el flush persiste el last_read_at final.
    await act(async () => {
      jest.advanceTimersByTime(MARK_READ_THROTTLE_MS);
    });
    expect(mockMark).toHaveBeenCalledTimes(2);
  });

  it('limpia el canal Realtime al desmontar', async () => {
    mockList.mockResolvedValueOnce([]);

    const { unmount } = renderHook(() => useUnreadCount());
    await waitFor(() => expect(mockRemoveChannel).not.toHaveBeenCalled());

    unmount();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });
});
