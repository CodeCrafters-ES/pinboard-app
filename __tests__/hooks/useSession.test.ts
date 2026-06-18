import { renderHook, act, waitFor } from '@testing-library/react-native';

import { useSession } from '@/hooks/useSession';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockUnsubscribe = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockGetSession = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STAFF_PROFILE = {
  id: 'profile-1',
  user_id: 'user-1',
  email: 'staff@test.com',
  name: 'Ana',
  surname: 'García',
  title: 'Camarera',
  avatar_url: null,
  role: 'staff' as const,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function setupNoSession() {
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: mockUnsubscribe } },
  });
}

function setupWithSession() {
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: 'user-1' } } },
  });
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: mockUnsubscribe } },
  });
  mockFrom.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: STAFF_PROFILE }),
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useSession', () => {
  it('starts with loading status', async () => {
    setupNoSession();
    const { result } = await renderHook(() => useSession());
    expect(result.current.status).toBe('loading');
    expect(result.current.session).toBeNull();
    expect(result.current.profile).toBeNull();
  });

  it('returns unauthenticated when no session exists', async () => {
    setupNoSession();
    const { result } = await renderHook(() => useSession());
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    expect(result.current.session).toBeNull();
    expect(result.current.profile).toBeNull();
  });

  it('returns authenticated with session and profile when session exists', async () => {
    setupWithSession();
    const { result } = await renderHook(() => useSession());
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.session).toEqual({ userId: 'user-1', role: 'staff' });
    expect(result.current.profile).toEqual(STAFF_PROFILE);
  });

  it('updates to unauthenticated when onAuthStateChange fires with null', async () => {
    setupWithSession();
    let capturedCallback: ((event: string, session: unknown) => void) | null = null;
    mockOnAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
      capturedCallback = cb;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });

    const { result } = await renderHook(() => useSession());
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await act(async () => {
      capturedCallback?.('SIGNED_OUT', null);
    });

    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.session).toBeNull();
  });

  it('unsubscribes from auth changes on unmount', async () => {
    setupNoSession();
    const { unmount } = await renderHook(() => useSession());
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
