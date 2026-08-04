import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { usePresence } from '@/hooks/usePresence';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockTrack = jest.fn((..._a: unknown[]) => Promise.resolve('ok'));
const mockUntrack = jest.fn((..._a: unknown[]) => Promise.resolve('ok'));
const mockPresenceState = jest.fn<Record<string, unknown>, []>(() => ({}));
const mockRemoveChannel = jest.fn();
let mockSyncCb: (() => void) | undefined;
let mockChannelConfig: unknown;

jest.mock('@/lib/supabase', () => {
  const channel: {
    on: (t: string, c: { event: string }, cb: () => void) => typeof channel;
    subscribe: (cb?: (status: string) => void) => typeof channel;
    track: (...a: unknown[]) => Promise<unknown>;
    untrack: (...a: unknown[]) => Promise<unknown>;
    presenceState: () => Record<string, unknown>;
  } = {
    on: (_t, _c, cb) => {
      mockSyncCb = cb;
      return channel;
    },
    subscribe: (cb) => {
      cb?.('SUBSCRIBED');
      return channel;
    },
    track: (...a) => mockTrack(...a),
    untrack: (...a) => mockUntrack(...a),
    presenceState: () => mockPresenceState(),
  };
  return {
    supabase: {
      channel: (_name: string, config?: unknown) => {
        mockChannelConfig = config;
        return channel;
      },
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
  mockPresenceState.mockReturnValue({});
  mockSyncCb = undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_e: string, cb: (s: string) => void) => {
    appStateHandler = cb;
    return { remove: jest.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('usePresence', () => {
  it('se anuncia (track) al suscribirse con el topic y key correctos', () => {
    renderHook(() => usePresence('c1'));

    expect(mockChannelConfig).toEqual({ config: { presence: { key: 'me' } } });
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });

  it('expone los user_id online desde el evento presence sync', () => {
    const { result } = renderHook(() => usePresence('c1'));

    mockPresenceState.mockReturnValue({ me: [{}], other: [{}] });
    act(() => mockSyncCb?.());

    expect([...result.current.onlineUserIds].sort()).toEqual(['me', 'other']);
  });

  it('deja de estar presente en background y se re-anuncia al volver a activo', () => {
    renderHook(() => usePresence('c1'));

    act(() => appStateHandler('background'));
    expect(mockUntrack).toHaveBeenCalledTimes(1);

    mockTrack.mockClear();
    act(() => appStateHandler('active'));
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });

  it('limpia el canal al desmontar', () => {
    const { unmount } = renderHook(() => usePresence('c1'));
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });
});
