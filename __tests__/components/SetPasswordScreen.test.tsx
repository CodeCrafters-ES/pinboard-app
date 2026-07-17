import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';

import SetPasswordScreen from '@/app/(auth)/set-password';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockGetInitialURL = jest.fn();
const mockAddEventListener = jest.fn();
const mockSetSession = jest.fn();
const mockVerifyOtp = jest.fn();
const mockUpdateUser = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockUnsubscribe = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-linking', () => ({
  getInitialURL: (...args: unknown[]) => mockGetInitialURL(...args),
  addEventListener: (...args: unknown[]) => mockAddEventListener(...args),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      setSession: (...args: unknown[]) => mockSetSession(...args),
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
  },
}));

jest.mock('@/hooks/useSession', () => ({
  useSession: () => ({
    session: { userId: 'user-1', role: 'staff' },
    status: 'authenticated',
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const INVITE_URL =
  'nun-ibiza://set-password#access_token=tok123&refresh_token=ref456&type=invite';

type AuthCallback = (event: string) => void;

/**
 * Configures mocks for the "happy path": token found, setSession succeeds,
 * and the SIGNED_IN event fires so the form becomes visible.
 */
function setupReadyToken() {
  let capturedCallback: AuthCallback | null = null;

  mockOnAuthStateChange.mockImplementation((cb: AuthCallback) => {
    capturedCallback = cb;
    return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
  });

  mockGetInitialURL.mockResolvedValueOnce(INVITE_URL);
  mockSetSession.mockImplementation(async () => {
    // Simulate supabase firing SIGNED_IN after setSession resolves
    capturedCallback?.('SIGNED_IN');
    return { error: null };
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockAddEventListener.mockReturnValue({ remove: jest.fn() });
  // Default onAuthStateChange stub (no SIGNED_IN fired unless overridden)
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: mockUnsubscribe } },
  });
});

describe('SetPasswordScreen', () => {
  it('shows error state when no URL token is found', async () => {
    mockGetInitialURL.mockResolvedValueOnce(null);
    render(<SetPasswordScreen />);
    // The screen only errors after its 3 s "no valid token arrived" timeout.
    await waitFor(() => expect(screen.getByText('Enlace inválido')).toBeTruthy(), {
      timeout: 4000,
    });
  });

  it('shows error state when setSession returns an error (expired token)', async () => {
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    });
    mockGetInitialURL.mockResolvedValueOnce(INVITE_URL);
    mockSetSession.mockResolvedValueOnce({ error: new Error('JWT expired') });

    render(<SetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Enlace inválido')).toBeTruthy());
  });

  it('renders password form when SIGNED_IN fires after setSession', async () => {
    setupReadyToken();
    render(<SetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Establece tu contraseña')).toBeTruthy());
    expect(screen.getByPlaceholderText('Mínimo 8 caracteres')).toBeTruthy();
    expect(screen.getByPlaceholderText('Repite la contraseña')).toBeTruthy();
  });

  it('button is disabled when passwords are empty', async () => {
    setupReadyToken();
    render(<SetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Establece tu contraseña')).toBeTruthy());

    const btn = screen.getByRole('button', { name: 'Guardar contraseña' });
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeTruthy();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('button is disabled when password is too short', async () => {
    setupReadyToken();
    render(<SetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Establece tu contraseña')).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText('Mínimo 8 caracteres'), 'abc');
    fireEvent.changeText(screen.getByPlaceholderText('Repite la contraseña'), 'abc');

    const btn = screen.getByRole('button', { name: 'Guardar contraseña' });
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeTruthy();
  });

  it('button is disabled when passwords do not match', async () => {
    setupReadyToken();
    render(<SetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Establece tu contraseña')).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText('Mínimo 8 caracteres'), 'Password1!');
    fireEvent.changeText(screen.getByPlaceholderText('Repite la contraseña'), 'Different1!');

    const btn = screen.getByRole('button', { name: 'Guardar contraseña' });
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeTruthy();
  });

  it('calls updateUser and navigates when form is valid', async () => {
    setupReadyToken();
    mockUpdateUser.mockResolvedValueOnce({ error: null });

    render(<SetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Establece tu contraseña')).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText('Mínimo 8 caracteres'), 'SecurePass1!');
    fireEvent.changeText(screen.getByPlaceholderText('Repite la contraseña'), 'SecurePass1!');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar contraseña' }));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'SecurePass1!' });
      expect(mockReplace).toHaveBeenCalledWith('/(app)/(tabs)/tablon');
    });
  });

  it('shows server error and keeps form when updateUser fails', async () => {
    setupReadyToken();
    mockUpdateUser.mockResolvedValueOnce({ error: new Error('Password too weak') });

    render(<SetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Establece tu contraseña')).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText('Mínimo 8 caracteres'), 'SecurePass1!');
    fireEvent.changeText(screen.getByPlaceholderText('Repite la contraseña'), 'SecurePass1!');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar contraseña' }));

    await waitFor(() => expect(screen.getByText('Password too weak')).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('uses verifyOtp when URL contains token_hash (PKCE format)', async () => {
    const pkceUrl = 'nun-ibiza://set-password?token_hash=hash123&type=invite';
    let capturedCallback: AuthCallback | null = null;

    mockOnAuthStateChange.mockImplementation((cb: AuthCallback) => {
      capturedCallback = cb;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });
    mockGetInitialURL.mockResolvedValueOnce(pkceUrl);
    mockVerifyOtp.mockImplementation(async () => {
      capturedCallback?.('SIGNED_IN');
      return { error: null };
    });

    render(<SetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Establece tu contraseña')).toBeTruthy());

    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: 'hash123', type: 'invite' });
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('unsubscribes from onAuthStateChange on unmount', async () => {
    setupReadyToken();
    const { unmount } = render(<SetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Establece tu contraseña')).toBeTruthy());
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
