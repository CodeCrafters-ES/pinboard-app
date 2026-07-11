import type { NetInfoState } from '@react-native-community/netinfo';

import { startEngagementSync } from '@/lib/engagement/sync';
import { flush } from '@/lib/engagement/queue';

// ─── Mocks ──────────────────────────────────────────────────────────────────

let netInfoHandler: ((state: NetInfoState) => void) | undefined;
const mockUnsubscribe = jest.fn();
const mockAddEventListener = jest.fn((cb: (state: NetInfoState) => void) => {
  netInfoHandler = cb;
  return mockUnsubscribe;
});

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: (cb: (state: NetInfoState) => void) => mockAddEventListener(cb) },
}));

jest.mock('@/lib/engagement/queue', () => ({ flush: jest.fn() }));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function state(isConnected: boolean, isInternetReachable: boolean | null): NetInfoState {
  return { isConnected, isInternetReachable } as NetInfoState;
}

beforeEach(() => {
  jest.clearAllMocks();
  netInfoHandler = undefined;
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('startEngagementSync', () => {
  it('vacía la cola al recuperar conectividad real', () => {
    startEngagementSync();
    netInfoHandler!(state(true, true));

    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('no vacía si no hay conexión o internet no es alcanzable', () => {
    startEngagementSync();

    netInfoHandler!(state(false, false));
    netInfoHandler!(state(true, false));
    netInfoHandler!(state(true, null));

    expect(flush).not.toHaveBeenCalled();
  });

  it('devuelve la función de desuscripción de NetInfo', () => {
    const unsubscribe = startEngagementSync();
    expect(unsubscribe).toBe(mockUnsubscribe);
  });
});
