import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

import UserListScreen from '@/app/(app)/(admin)/users/index';

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

jest.mock('expo-router', () => ({
  Redirect: () => null,
  Stack: { Screen: () => null },
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

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockRole = 'admin';
});

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
