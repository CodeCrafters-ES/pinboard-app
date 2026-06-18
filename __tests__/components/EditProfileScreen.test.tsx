import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';

import EditProfileScreen from '@/app/(app)/profile/edit';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockUpdateOwnProfile = jest.fn();
const mockRefreshProfile = jest.fn();
const mockBack = jest.fn();

jest.mock('@/lib/auth', () => ({
  updateOwnProfile: (...args: unknown[]) => mockUpdateOwnProfile(...args),
}));

jest.mock('@/hooks/useAvatarUpload', () => ({
  useAvatarUpload: () => ({ upload: jest.fn(), isUploading: false }),
}));

jest.mock('@/hooks/useSession', () => ({
  useSession: () => ({
    session: { userId: 'user-1', role: 'staff' },
    profile: {
      id: 'profile-1',
      user_id: 'user-1',
      email: 'staff@test.com',
      name: 'Ana',
      surname: 'García',
      title: 'Camarera',
      avatar_url: null,
      role: 'staff',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    status: 'authenticated',
    refreshProfile: mockRefreshProfile,
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  Stack: { Screen: () => null },
}));

jest.mock('expo-image', () => ({
  Image: () => null,
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe('EditProfileScreen', () => {
  it('renders prefilled fields from profile', async () => {
    await render(<EditProfileScreen />);
    expect(screen.getByDisplayValue('Ana')).toBeTruthy();
    expect(screen.getByDisplayValue('García')).toBeTruthy();
    expect(screen.getByDisplayValue('Camarera')).toBeTruthy();
  });

  it('shows role as read-only (Staff)', async () => {
    await render(<EditProfileScreen />);
    expect(screen.getByText('Staff')).toBeTruthy();
    expect(screen.getByText('Solo lectura')).toBeTruthy();
  });

  it('calls updateOwnProfile and refreshProfile on valid submit', async () => {
    mockUpdateOwnProfile.mockResolvedValueOnce({});
    mockRefreshProfile.mockResolvedValueOnce(undefined);

    await render(<EditProfileScreen />);

    fireEvent.changeText(screen.getByDisplayValue('Ana'), 'María');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(mockUpdateOwnProfile).toHaveBeenCalledWith('user-1', {
        name: 'María',
        surname: 'García',
        title: 'Camarera',
      });
      expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });

  it('blocks submit and shows error when name is empty', async () => {
    await render(<EditProfileScreen />);
    fireEvent.changeText(screen.getByDisplayValue('Ana'), '');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(screen.getByText('El nombre es obligatorio.')).toBeTruthy();
    });
    expect(mockUpdateOwnProfile).not.toHaveBeenCalled();
  });

  it('does not allow editing role field', async () => {
    await render(<EditProfileScreen />);
    const roleField = screen.getByText('Staff');
    expect(roleField).toBeTruthy();
    // The role is inside a non-editable View, not a TextInput
    expect(screen.queryByDisplayValue('staff')).toBeNull();
  });
});
