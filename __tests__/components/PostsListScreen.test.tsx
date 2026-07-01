import { render, screen, waitFor } from '@testing-library/react-native';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockUseSession = jest.fn();
const mockUsePosts = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('@/hooks/useSession', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('@/hooks/usePosts', () => ({
  usePosts: () => mockUsePosts(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text testID="redirect">{href}</Text>;
  },
  Stack: {
    Screen: () => null,
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{children}</View>;
  },
}));

jest.mock('lucide-react-native', () => ({
  Plus: () => null,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const POST = {
  id: 'post-1',
  author_id: 'profile-1',
  title: 'Noticias del restaurante',
  subtitle: 'Un subtítulo',
  external_url: 'https://example.com',
  body: null,
  cover_image_url: null,
  status: 'published' as const,
  published_at: '2026-06-30T10:00:00Z',
  created_at: '2026-06-30T09:00:00Z',
  updated_at: '2026-06-30T09:00:00Z',
  deleted_at: null,
};

function setupAdmin() {
  mockUseSession.mockReturnValue({
    session: { userId: 'user-1', role: 'admin' },
    profile: { id: 'profile-1' },
  });
  mockUsePosts.mockReturnValue({
    posts: [POST],
    loading: false,
    error: null,
    hasMore: false,
    loadNextPage: jest.fn(),
    refresh: jest.fn(),
    createPost: jest.fn(),
    updatePost: jest.fn(),
    softDelete: jest.fn(),
  });
}

function setupStaff() {
  mockUseSession.mockReturnValue({
    session: { userId: 'user-2', role: 'staff' },
    profile: { id: 'profile-2' },
  });
  mockUsePosts.mockReturnValue({
    posts: [],
    loading: false,
    error: null,
    hasMore: false,
    loadNextPage: jest.fn(),
    refresh: jest.fn(),
    createPost: jest.fn(),
    updatePost: jest.fn(),
    softDelete: jest.fn(),
  });
}

// Import after mocks
// eslint-disable-next-line import/first
import PostsListScreen from '@/app/(app)/(admin)/posts/index';
import React from 'react';

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PostsListScreen', () => {
  it('renders post titles for admin', async () => {
    setupAdmin();
    render(<PostsListScreen />);
    await waitFor(() => {
      expect(screen.getByText('Noticias del restaurante')).toBeTruthy();
    });
  });

  it('redirects staff to staff area', async () => {
    setupStaff();
    render(<PostsListScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('redirect')).toBeTruthy();
    });
  });

  it('shows empty state when no posts', async () => {
    mockUseSession.mockReturnValue({
      session: { userId: 'user-1', role: 'admin' },
      profile: { id: 'profile-1' },
    });
    mockUsePosts.mockReturnValue({
      posts: [],
      loading: false,
      error: null,
      hasMore: false,
      loadNextPage: jest.fn(),
      refresh: jest.fn(),
      createPost: jest.fn(),
      updatePost: jest.fn(),
      softDelete: jest.fn(),
    });

    render(<PostsListScreen />);
    await waitFor(() => {
      expect(screen.getByText('No hay posts todavía.')).toBeTruthy();
    });
  });
});
