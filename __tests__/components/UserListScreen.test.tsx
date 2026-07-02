import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';

import UserListScreen from '@/app/(app)/(admin)/users/index';
import { supabase } from '@/lib/supabase';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockProfiles = [
  {
    id: 'p1',
    user_id: 'u1',
    email: 'ana@nunibiza.com',
    name: 'Ana',
    surname: 'García',
    title: 'Jefa de sala',
    avatar_url: null,
    role: 'manager' as const,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'p2',
    user_id: 'u2',
    email: 'carlos@nunibiza.com',
    name: 'Carlos',
    surname: 'López',
    title: 'Camarero',
    avatar_url: null,
    role: 'staff' as const,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

// Mutable so individual tests can set a different role
let mockRole: 'admin' | 'manager' | 'staff' = 'admin';

jest.mock('@/hooks/useSession', () => ({
  useSession: () => ({
    session: { userId: 'test-user', role: mockRole },
    profile: null,
    status: 'authenticated',
  }),
}));

jest.mock('@/hooks/useUserList', () => ({
  useUserList: () => ({
    profiles: mockProfiles,
    loading: false,
    error: null,
    inputValue: '',
    setInputValue: jest.fn(),
    roleFilter: 'all',
    setRoleFilter: jest.fn(),
    hasMore: false,
    loadNextPage: jest.fn(),
    changeRole: jest.fn().mockResolvedValue({ error: null }),
    refresh: jest.fn(),
  }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
  },
}));

// Stack.Screen renders headerRight so the invite button is reachable in tests
jest.mock('expo-router', () => ({
  Redirect: () => null,
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) =>
      options?.headerRight?.() ?? null,
  },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

// Modal renders in a native portal that RNTL cannot query. Replace with an
// inline conditional so findByRole works across modal content.
jest.mock('react-native/Libraries/Modal/Modal', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return function MockModal({ children, visible }: { children: React.ReactNode; visible: boolean }) {
    return visible ? <View>{children}</View> : null;
  };
});

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockRole = 'admin';
  jest.mocked(supabase.functions.invoke).mockReset();
});

// ─── Tests: admin view ────────────────────────────────────────────────────────

describe('UserListScreen — admin', () => {
  it('renders the list with user data', async () => {
    render(<UserListScreen />);

    await waitFor(() => {
      expect(screen.getByText('Ana García')).toBeTruthy();
      expect(screen.getByText('ana@nunibiza.com')).toBeTruthy();
      expect(screen.getByText('Carlos López')).toBeTruthy();
      expect(screen.getByText('carlos@nunibiza.com')).toBeTruthy();
    });
  });

  it('shows role badges for each user', async () => {
    render(<UserListScreen />);

    await waitFor(() => {
      // "Manager" appears in the role badge AND in the filter chip → at least 2
      expect(screen.getAllByText('Manager').length).toBeGreaterThanOrEqual(2);
      // "Staff" appears in the role badge AND in the filter chip → at least 2
      expect(screen.getAllByText('Staff').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('shows "Cambiar rol" action for each user when role is admin', async () => {
    render(<UserListScreen />);

    await waitFor(() => {
      const changeRoleButtons = screen.getAllByRole('button', { name: /Cambiar rol de/ });
      expect(changeRoleButtons.length).toBe(mockProfiles.length);
    });
  });

  it('renders search input', async () => {
    render(<UserListScreen />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Buscar por nombre o email…')).toBeTruthy();
    });
  });

  it('renders role filter chips', async () => {
    render(<UserListScreen />);

    await waitFor(() => {
      expect(screen.getByText('Todos')).toBeTruthy();
      expect(screen.getByText('Admin')).toBeTruthy();
    });
  });
});

// ─── Tests: manager view ─────────────────────────────────────────────────────

describe('UserListScreen — manager', () => {
  beforeEach(() => {
    mockRole = 'manager';
  });

  it('hides "Cambiar rol" action when role is manager', async () => {
    render(<UserListScreen />);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Cambiar rol de/ })).toBeNull();
    });
  });

  it('still shows the user list', async () => {
    render(<UserListScreen />);

    await waitFor(() => {
      expect(screen.getByText('Ana García')).toBeTruthy();
      expect(screen.getByText('Carlos López')).toBeTruthy();
    });
  });
});

// ─── Tests: InviteModal ───────────────────────────────────────────────────────

describe('UserListScreen — InviteModal', () => {
  it('admin ve el botón "+ Invitar"', async () => {
    render(<UserListScreen />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Invitar usuario' })).toBeTruthy();
    });
  });

  it('manager no ve el botón "+ Invitar"', async () => {
    mockRole = 'manager';
    render(<UserListScreen />);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Invitar usuario' })).toBeNull();
    });
  });

  it('submit sin email muestra error de validación', async () => {
    render(<UserListScreen />);

    fireEvent.press(await screen.findByRole('button', { name: 'Invitar usuario' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Invitar' }));

    await waitFor(() => {
      expect(screen.getByText('El email es obligatorio.')).toBeTruthy();
    });
  });

  it('submit con email válido llama a invite-user con los parámetros correctos', async () => {
    jest.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: null, error: null });
    render(<UserListScreen />);

    fireEvent.press(await screen.findByRole('button', { name: 'Invitar usuario' }));
    fireEvent.changeText(
      await screen.findByPlaceholderText('nombre@nunibiza.com'),
      'nuevo@nunibiza.com',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Invitar' }));

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith('invite-user', {
        body: { email: 'nuevo@nunibiza.com', role: 'staff' },
      });
    });
  });

  it('error de la edge function muestra el mensaje en el modal', async () => {
    jest.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: null,
      error: { message: 'User already registered' },
    });
    render(<UserListScreen />);

    fireEvent.press(await screen.findByRole('button', { name: 'Invitar usuario' }));
    fireEvent.changeText(
      await screen.findByPlaceholderText('nombre@nunibiza.com'),
      'existente@nunibiza.com',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Invitar' }));

    await waitFor(() => {
      expect(screen.getByText('User already registered')).toBeTruthy();
    });
  });

  it('Cancelar cierra el modal sin llamar a la edge function', async () => {
    render(<UserListScreen />);

    fireEvent.press(await screen.findByRole('button', { name: 'Invitar usuario' }));
    await screen.findByPlaceholderText('nombre@nunibiza.com');

    fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('nombre@nunibiza.com')).toBeNull();
    });
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });
});
