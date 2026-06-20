import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';

import LoginScreen from '@/app/(auth)/login';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockSignIn = jest.fn();
const mockPush = jest.fn();

jest.mock('@/lib/auth', () => ({
  signInWithPassword: (...args: unknown[]) => mockSignIn(...args),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('expo-notifications', () => ({
  getExpoPushTokenAsync: jest.fn(),
}));

jest.mock('lucide-react-native', () => ({
  AtSign: () => null,
  Lock: () => null,
}));

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe('LoginScreen', () => {
  it('renders correctly (snapshot)', async () => {
    const { toJSON } = await render(<LoginScreen />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('shows email validation error for empty email', async () => {
    await render(<LoginScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => {
      expect(screen.getByText('El correo es obligatorio.')).toBeTruthy();
    });
  });

  it('shows email format error for invalid email', async () => {
    await render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('nombre@nunibiza.com'), 'notanemail');
    fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => {
      expect(screen.getByText('Introduce un correo válido.')).toBeTruthy();
    });
  });

  it('shows password length error for short password', async () => {
    await render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('nombre@nunibiza.com'), 'user@test.com');
    fireEvent.changeText(screen.getByPlaceholderText('••••••••'), '1234567');
    fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => {
      expect(screen.getByText('Mínimo 8 caracteres.')).toBeTruthy();
    });
  });

  it('calls signInWithPassword with trimmed credentials', async () => {
    mockSignIn.mockResolvedValueOnce({});
    await render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('nombre@nunibiza.com'), 'user@test.com');
    fireEvent.changeText(screen.getByPlaceholderText('••••••••'), 'password123');
    fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('user@test.com', 'password123');
    });
  });

  it('shows error message on invalid credentials', async () => {
    mockSignIn.mockRejectedValueOnce(new Error('Invalid login credentials'));
    await render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('nombre@nunibiza.com'), 'user@test.com');
    fireEvent.changeText(screen.getByPlaceholderText('••••••••'), 'wrongpass1');
    fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => {
      expect(screen.getByText('Correo o contraseña incorrectos.')).toBeTruthy();
    });
  });

  it('navigates to forgot-password screen when link is pressed', async () => {
    await render(<LoginScreen />);
    fireEvent.press(screen.getByText('¿Olvidaste tu contraseña?'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/forgot-password');
  });
});
