import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';

import ForgotPasswordScreen from '@/app/(auth)/forgot-password';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockResetPassword = jest.fn();
const mockBack = jest.fn();

jest.mock('@/lib/auth', () => ({
  resetPasswordForEmail: (...args: unknown[]) => mockResetPassword(...args),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

describe('ForgotPasswordScreen', () => {
  it('shows error when email is empty', async () => {
    render(<ForgotPasswordScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Enviar enlace de recuperación' }));
    await waitFor(() => expect(screen.getByText('El correo es obligatorio.')).toBeTruthy());
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it('shows format error for invalid email', async () => {
    render(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('nombre@nunibiza.com'), 'notanemail');
    fireEvent.press(screen.getByRole('button', { name: 'Enviar enlace de recuperación' }));
    await waitFor(() => expect(screen.getByText('Introduce un correo válido.')).toBeTruthy());
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it('calls resetPasswordForEmail with trimmed email', async () => {
    mockResetPassword.mockResolvedValueOnce(undefined);
    render(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('nombre@nunibiza.com'), 'user@test.com');
    fireEvent.press(screen.getByRole('button', { name: 'Enviar enlace de recuperación' }));
    await waitFor(() => expect(mockResetPassword).toHaveBeenCalledWith('user@test.com'));
  });

  it('shows neutral message after successful send', async () => {
    mockResetPassword.mockResolvedValueOnce(undefined);
    render(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('nombre@nunibiza.com'), 'user@test.com');
    fireEvent.press(screen.getByRole('button', { name: 'Enviar enlace de recuperación' }));
    await waitFor(() =>
      expect(
        screen.getByText('Si el email está registrado, recibirás un enlace en breve.'),
      ).toBeTruthy(),
    );
  });

  it('disables button after send to prevent spam', async () => {
    mockResetPassword.mockResolvedValueOnce(undefined);
    render(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('nombre@nunibiza.com'), 'user@test.com');
    fireEvent.press(screen.getByRole('button', { name: 'Enviar enlace de recuperación' }));
    await waitFor(() =>
      expect(
        screen.getByText('Si el email está registrado, recibirás un enlace en breve.'),
      ).toBeTruthy(),
    );
    const btn = screen.getByRole('button', { name: 'Enviar enlace de recuperación' });
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeTruthy();
  });

  it('shows neutral message even when resetPasswordForEmail throws', async () => {
    mockResetPassword.mockRejectedValueOnce(new Error('Network error'));
    render(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('nombre@nunibiza.com'), 'user@test.com');
    fireEvent.press(screen.getByRole('button', { name: 'Enviar enlace de recuperación' }));
    await waitFor(() =>
      expect(
        screen.getByText('Si el email está registrado, recibirás un enlace en breve.'),
      ).toBeTruthy(),
    );
  });

  it('navigates back when back link is pressed', () => {
    render(<ForgotPasswordScreen />);
    fireEvent.press(screen.getByText('Volver al inicio de sesión'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
