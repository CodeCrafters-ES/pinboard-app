import { Text } from 'react-native';
import { render, renderHook, act, waitFor } from '@testing-library/react-native';

import { SessionProvider, useSession } from '@/hooks/useSession';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockUnsubscribe = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockGetSession = jest.fn();
const mockFrom = jest.fn();
const mockAuthSignOut = jest.fn();
const mockRegisterPushToken = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

jest.mock('@/lib/auth', () => ({
  signOut: (...args: unknown[]) => mockAuthSignOut(...args),
}));

jest.mock('@/lib/notifications/pushToken', () => ({
  registerPushToken: (...args: unknown[]) => mockRegisterPushToken(...args),
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

// ─── Wrapper ─────────────────────────────────────────────────────────────────

// The session state lives in the provider, so the hook is always rendered inside it.
function wrapper({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockRegisterPushToken.mockResolvedValue(null);
});

describe('useSession', () => {
  it('starts with loading status', async () => {
    setupNoSession();
    const { result } = await renderHook(() => useSession(), { wrapper });
    expect(result.current.status).toBe('loading');
    expect(result.current.session).toBeNull();
    expect(result.current.profile).toBeNull();
  });

  it('returns unauthenticated when no session exists', async () => {
    setupNoSession();
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    expect(result.current.session).toBeNull();
    expect(result.current.profile).toBeNull();
  });

  it('returns authenticated with session and profile when session exists', async () => {
    setupWithSession();
    const { result } = await renderHook(() => useSession(), { wrapper });
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

    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await act(async () => {
      capturedCallback?.('SIGNED_OUT', null);
    });

    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.session).toBeNull();
  });

  it('unsubscribes from auth changes on unmount', async () => {
    setupNoSession();
    const { unmount } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('signOut calls authSignOut and resolves', async () => {
    setupWithSession();
    mockAuthSignOut.mockResolvedValueOnce(undefined);

    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await act(async () => {
      await result.current.signOut();
    });

    expect(mockAuthSignOut).toHaveBeenCalledTimes(1);
  });

  it('signOut resolves without throwing when network fails (offline resilience)', async () => {
    setupWithSession();
    mockAuthSignOut.mockRejectedValueOnce(new Error('Network request failed'));

    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await act(async () => {
      // Must NOT throw — swallows network error so user still reaches login
      await expect(result.current.signOut()).resolves.toBeUndefined();
    });
  });

  it('registers push token when SIGNED_IN event fires', async () => {
    setupWithSession();
    let capturedCallback: ((event: string, session: unknown) => void) | null = null;
    mockOnAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
      capturedCallback = cb;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });
    mockRegisterPushToken.mockResolvedValueOnce('ExponentPushToken[abc]');

    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await act(async () => {
      capturedCallback?.('SIGNED_IN', { user: { id: 'user-1' } });
      await Promise.resolve();
    });

    await waitFor(() => expect(mockRegisterPushToken).toHaveBeenCalledTimes(1));
    expect(mockRegisterPushToken).toHaveBeenCalledWith('user-1');
  });

  // Regression: resolving the session per-consumer sent every new consumer back to
  // 'loading', which made the role guard in (app)/_layout unmount its own <Redirect>
  // and loop forever (blank screen for manager/staff landing on the admin tab).
  it('does not reset to loading when another consumer mounts', async () => {
    setupWithSession();

    function StatusProbe({ label }: { label: string }) {
      const { status } = useSession();
      return <Text testID={label}>{status}</Text>;
    }

    const { rerender, getByTestId } = render(
      <SessionProvider>
        <StatusProbe label="first" />
      </SessionProvider>,
    );
    await waitFor(() => expect(getByTestId('first').props.children).toBe('authenticated'));

    rerender(
      <SessionProvider>
        <StatusProbe label="first" />
        <StatusProbe label="late" />
      </SessionProvider>,
    );

    expect(getByTestId('late').props.children).toBe('authenticated');
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it('does not register push token on non-SIGNED_IN events', async () => {
    setupWithSession();
    let capturedCallback: ((event: string, session: unknown) => void) | null = null;
    mockOnAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
      capturedCallback = cb;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });

    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await act(async () => {
      capturedCallback?.('TOKEN_REFRESHED', { user: { id: 'user-1' } });
      await Promise.resolve();
    });

    expect(mockRegisterPushToken).not.toHaveBeenCalled();
  });
});
