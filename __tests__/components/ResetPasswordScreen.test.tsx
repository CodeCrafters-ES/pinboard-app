import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';

import ResetPasswordScreen from '@/app/(auth)/reset-password';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockGetInitialURL = jest.fn();
const mockSetSession = jest.fn();
const mockVerifyOtp = jest.fn();
const mockUpdateUser = jest.fn();
const mockSignOut = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockUnsubscribe = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-linking', () => ({
  getInitialURL: (...args: unknown[]) => mockGetInitialURL(...args),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      setSession: (...args: unknown[]) => mockSetSession(...args),
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
  },
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

const RECOVERY_URL =
  'nun-ibiza://reset-password#access_token=tok789&refresh_token=ref000&type=recovery';

type AuthCallback = (event: string) => void;

/**
 * Configures mocks for the happy path: token found, setSession succeeds,
 * and PASSWORD_RECOVERY event fires so the form becomes visible.
 */
function setupReadyToken() {
  let capturedCallback: AuthCallback | null = null;

  mockOnAuthStateChange.mockImplementation((cb: AuthCallback) => {
    capturedCallback = cb;
    return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
  });

  mockGetInitialURL.mockResolvedValueOnce(RECOVERY_URL);
  mockSetSession.mockImplementation(async () => {
    capturedCallback?.('PASSWORD_RECOVERY');
    return { error: null };
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: mockUnsubscribe } },
  });
});

describe('ResetPasswordScreen', () => {
  it('shows loading state while waiting for PASSWORD_RECOVERY', async () => {
    mockGetInitialURL.mockResolvedValueOnce(null);
    render(<ResetPasswordScreen />);
    // tokenStatus stays 'loading' when URL is null (then transitions to 'error')
    // We can only catch the loading flash — just assert the initial spinner
    // renders without crashing
    expect(screen.getByText('Verificando enlace…')).toBeTruthy();
  });

  it('shows error state when no URL token is found', async () => {
    mockGetInitialURL.mockResolvedValueOnce(null);
    render(<ResetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Enlace expirado')).toBeTruthy());
  });

  it('shows error state and "Solicitar nuevo enlace" when token is expired', async () => {
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    });
    mockGetInitialURL.mockResolvedValueOnce(RECOVERY_URL);
    mockSetSession.mockResolvedValueOnce({ error: new Error('JWT expired') });

    render(<ResetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Enlace expirado')).toBeTruthy());
    expect(screen.getByText('Solicitar nuevo enlace')).toBeTruthy();
  });

  it('navigates to forgot-password when "Solicitar nuevo enlace" is pressed', async () => {
    mockGetInitialURL.mockResolvedValueOnce(RECOVERY_URL);
    mockSetSession.mockResolvedValueOnce({ error: new Error('JWT expired') });

    render(<ResetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Solicitar nuevo enlace')).toBeTruthy());
    fireEvent.press(screen.getByText('Solicitar nuevo enlace'));
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/forgot-password');
  });

  it('renders password form when PASSWORD_RECOVERY event fires', async () => {
    setupReadyToken();
    render(<ResetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Restablece tu contraseña')).toBeTruthy());
    expect(screen.getByPlaceholderText('Mínimo 8 caracteres')).toBeTruthy();
    expect(screen.getByPlaceholderText('Repite la contraseña')).toBeTruthy();
  });

  it('button is disabled when passwords are empty', async () => {
    setupReadyToken();
    render(<ResetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Restablece tu contraseña')).toBeTruthy());

    const btn = screen.getByRole('button', { name: 'Cambiar contraseña' });
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeTruthy();
  });

  it('button is disabled when password is too short', async () => {
    setupReadyToken();
    render(<ResetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Restablece tu contraseña')).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText('Mínimo 8 caracteres'), 'abc');
    fireEvent.changeText(screen.getByPlaceholderText('Repite la contraseña'), 'abc');

    const btn = screen.getByRole('button', { name: 'Cambiar contraseña' });
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeTruthy();
  });

  it('button is disabled when passwords do not match', async () => {
    setupReadyToken();
    render(<ResetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Restablece tu contraseña')).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText('Mínimo 8 caracteres'), 'Password1!');
    fireEvent.changeText(screen.getByPlaceholderText('Repite la contraseña'), 'Different1!');

    const btn = screen.getByRole('button', { name: 'Cambiar contraseña' });
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeTruthy();
  });

  it('calls updateUser then signOut and navigates to login on success', async () => {
    setupReadyToken();
    mockUpdateUser.mockResolvedValueOnce({ error: null });
    mockSignOut.mockResolvedValueOnce(undefined);

    render(<ResetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Restablece tu contraseña')).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText('Mínimo 8 caracteres'), 'NewPass99!');
    fireEvent.changeText(screen.getByPlaceholderText('Repite la contraseña'), 'NewPass99!');
    fireEvent.press(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'NewPass99!' });
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
    });
  });

  it('shows server error and keeps form when updateUser fails', async () => {
    setupReadyToken();
    mockUpdateUser.mockResolvedValueOnce({ error: new Error('Password too weak') });

    render(<ResetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Restablece tu contraseña')).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText('Mínimo 8 caracteres'), 'NewPass99!');
    fireEvent.changeText(screen.getByPlaceholderText('Repite la contraseña'), 'NewPass99!');
    fireEvent.press(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    await waitFor(() => expect(screen.getByText('Password too weak')).toBeTruthy());
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('uses verifyOtp when URL contains token_hash (PKCE format)', async () => {
    const pkceUrl = 'nun-ibiza://reset-password?token_hash=hash123&type=recovery';
    let capturedCallback: AuthCallback | null = null;

    mockOnAuthStateChange.mockImplementation((cb: AuthCallback) => {
      capturedCallback = cb;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });
    mockGetInitialURL.mockResolvedValueOnce(pkceUrl);
    mockVerifyOtp.mockImplementation(async () => {
      capturedCallback?.('PASSWORD_RECOVERY');
      return { error: null };
    });

    render(<ResetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Restablece tu contraseña')).toBeTruthy());

    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: 'hash123', type: 'recovery' });
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('unsubscribes from onAuthStateChange on unmount', async () => {
    setupReadyToken();
    const { unmount } = render(<ResetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Restablece tu contraseña')).toBeTruthy());
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
