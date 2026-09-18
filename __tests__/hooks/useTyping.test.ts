import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { useTyping } from '@/hooks/useTyping';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockSend = jest.fn((..._a: unknown[]) => Promise.resolve('ok'));
const mockRemoveChannel = jest.fn();
let mockBroadcastCb: ((arg: { payload: unknown }) => void) | undefined;

jest.mock('@/lib/supabase', () => {
  const channel: {
    on: (t: string, c: { event: string }, cb: (arg: { payload: unknown }) => void) => typeof channel;
    subscribe: () => typeof channel;
    send: (...a: unknown[]) => Promise<unknown>;
  } = {
    on: (_t, _c, cb) => {
      mockBroadcastCb = cb;
      return channel;
    },
    subscribe: () => channel,
    send: (...a) => mockSend(...a),
  };
  return {
    supabase: {
      channel: () => channel,
      removeChannel: (...a: unknown[]) => mockRemoveChannel(...a),
    },
  };
});

jest.mock('@/hooks/useSession', () => ({
  useSession: () => ({ session: { userId: 'me', role: 'staff' }, profile: null, status: 'authenticated' }),
}));

let appStateHandler: (state: string) => void = () => {};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  mockBroadcastCb = undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_e: string, cb: (s: string) => void) => {
    appStateHandler = cb;
    return { remove: jest.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any);
});

const typingEvent = (isTyping: boolean) => ({
  type: 'broadcast',
  event: 'typing',
  payload: { user_id: 'me', isTyping },
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useTyping', () => {
  it('refleja el typing de otros y descarta el propio eco', () => {
    const { result } = renderHook(() => useTyping('c1'));

    act(() => mockBroadcastCb?.({ payload: { user_id: 'other', isTyping: true } }));
    expect(result.current.typingUserIds).toEqual(['other']);

    act(() => mockBroadcastCb?.({ payload: { user_id: 'other', isTyping: false } }));
    expect(result.current.typingUserIds).toEqual([]);

    act(() => mockBroadcastCb?.({ payload: { user_id: 'me', isTyping: true } }));
    expect(result.current.typingUserIds).toEqual([]);
  });

  it('emite true al empezar y false automáticamente tras 3s de inactividad', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useTyping('c1'));

    act(() => result.current.setTyping(true));
    expect(mockSend).toHaveBeenCalledWith(typingEvent(true));

    // Reiterar mientras ya escribe no reemite true.
    mockSend.mockClear();
    act(() => result.current.setTyping(true));
    expect(mockSend).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(mockSend).toHaveBeenCalledWith(typingEvent(false));
  });

  it('emite false al llamar setTyping(false)', () => {
    const { result } = renderHook(() => useTyping('c1'));

    act(() => result.current.setTyping(true));
    mockSend.mockClear();
    act(() => result.current.setTyping(false));
    expect(mockSend).toHaveBeenCalledWith(typingEvent(false));
  });

  it('emite false al pasar a background', () => {
    const { result } = renderHook(() => useTyping('c1'));

    act(() => result.current.setTyping(true));
    mockSend.mockClear();
    act(() => appStateHandler('background'));
    expect(mockSend).toHaveBeenCalledWith(typingEvent(false));
  });

  it('limpia el canal al desmontar', () => {
    const { unmount } = renderHook(() => useTyping('c1'));
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });
});
