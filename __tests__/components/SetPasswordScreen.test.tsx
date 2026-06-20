import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';

import SetPasswordScreen from '@/app/(auth)/set-password';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockGetInitialURL = jest.fn();
const mockSetSession = jest.fn();
const mockVerifyOtp = jest.fn();
const mockUpdateUser = jest.fn();
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

function setupReadyToken() {
  mockGetInitialURL.mockResolvedValueOnce(INVITE_URL);
  mockSetSession.mockResolvedValueOnce({ error: null });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

describe('SetPasswordScreen', () => {
  it('shows error state when no URL token is found', async () => {
    mockGetInitialURL.mockResolvedValueOnce(null);
    render(<SetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Enlace inválido')).toBeTruthy());
  });

  it('shows error state when setSession fails (expired token)', async () => {
    mockGetInitialURL.mockResolvedValueOnce(INVITE_URL);
    mockSetSession.mockResolvedValueOnce({ error: new Error('JWT expired') });
    render(<SetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Enlace inválido')).toBeTruthy());
  });

  it('renders password form when token is valid', async () => {
    setupReadyToken();
    render(<SetPasswordScreen />);
    await waitFor(() =>
      expect(screen.getByText('Establece tu contraseña')).toBeTruthy(),
    );
    expect(screen.getByPlaceholderText('Mínimo 8 caracteres')).toBeTruthy();
    expect(screen.getByPlaceholderText('Repite la contraseña')).toBeTruthy();
  });

  it('shows validation error when password is empty', async () => {
    setupReadyToken();
    render(<SetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Establece tu contraseña')).toBeTruthy());

    fireEvent.press(screen.getByRole('button', { name: 'Guardar contraseña' }));

    await waitFor(() =>
      expect(screen.getByText('La contraseña es obligatoria.')).toBeTruthy(),
    );
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('shows error when passwords do not match', async () => {
    setupReadyToken();
    render(<SetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Establece tu contraseña')).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText('Mínimo 8 caracteres'), 'Password1!');
    fireEvent.changeText(screen.getByPlaceholderText('Repite la contraseña'), 'Different1!');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar contraseña' }));

    await waitFor(() =>
      expect(screen.getByText('Las contraseñas no coinciden.')).toBeTruthy(),
    );
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('calls updateUser and navigates on valid submit', async () => {
    setupReadyToken();
    mockUpdateUser.mockResolvedValueOnce({ error: null });

    render(<SetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Establece tu contraseña')).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText('Mínimo 8 caracteres'), 'SecurePass1!');
    fireEvent.changeText(screen.getByPlaceholderText('Repite la contraseña'), 'SecurePass1!');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar contraseña' }));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'SecurePass1!' });
      expect(mockReplace).toHaveBeenCalledWith('/(app)/(staff)/');
    });
  });

  it('calls verifyOtp when URL contains token_hash (PKCE format)', async () => {
    const pkceUrl = 'nun-ibiza://set-password?token_hash=hash123&type=invite';
    mockGetInitialURL.mockResolvedValueOnce(pkceUrl);
    mockVerifyOtp.mockResolvedValueOnce({ error: null });

    render(<SetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Establece tu contraseña')).toBeTruthy());

    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: 'hash123', type: 'invite' });
    expect(mockSetSession).not.toHaveBeenCalled();
  });
});
