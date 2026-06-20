import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';

import ResetPasswordScreen from '@/app/(auth)/reset-password';

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
    session: { userId: 'user-1', role: 'manager' },
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

const RECOVERY_URL =
  'nun-ibiza://reset-password#access_token=tok789&refresh_token=ref000&type=recovery';

function setupReadyToken() {
  mockGetInitialURL.mockResolvedValueOnce(RECOVERY_URL);
  mockSetSession.mockResolvedValueOnce({ error: null });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

describe('ResetPasswordScreen', () => {
  it('shows error state when link is expired or missing', async () => {
    mockGetInitialURL.mockResolvedValueOnce(null);
    render(<ResetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Enlace expirado')).toBeTruthy());
  });

  it('renders password form when token is valid', async () => {
    setupReadyToken();
    render(<ResetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Restablece tu contraseña')).toBeTruthy());
    expect(screen.getByPlaceholderText('Mínimo 8 caracteres')).toBeTruthy();
  });

  it('blocks submit when passwords do not match', async () => {
    setupReadyToken();
    render(<ResetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Restablece tu contraseña')).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText('Mínimo 8 caracteres'), 'Password1!');
    fireEvent.changeText(screen.getByPlaceholderText('Repite la contraseña'), 'Other1234!');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar contraseña' }));

    await waitFor(() =>
      expect(screen.getByText('Las contraseñas no coinciden.')).toBeTruthy(),
    );
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('calls updateUser and navigates to manager screen on success', async () => {
    setupReadyToken();
    mockUpdateUser.mockResolvedValueOnce({ error: null });

    render(<ResetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Restablece tu contraseña')).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText('Mínimo 8 caracteres'), 'NewPass99!');
    fireEvent.changeText(screen.getByPlaceholderText('Repite la contraseña'), 'NewPass99!');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar contraseña' }));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'NewPass99!' });
      expect(mockReplace).toHaveBeenCalledWith('/(app)/(manager)/');
    });
  });

  it('shows server error message when updateUser fails', async () => {
    setupReadyToken();
    mockUpdateUser.mockResolvedValueOnce({ error: new Error('Password too weak') });

    render(<ResetPasswordScreen />);
    await waitFor(() => expect(screen.getByText('Restablece tu contraseña')).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText('Mínimo 8 caracteres'), 'NewPass99!');
    fireEvent.changeText(screen.getByPlaceholderText('Repite la contraseña'), 'NewPass99!');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar contraseña' }));

    await waitFor(() =>
      expect(screen.getByText('Password too weak')).toBeTruthy(),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
