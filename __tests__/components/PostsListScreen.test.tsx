import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

import PostsListScreen from '@/app/(app)/(admin)/posts/index';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockUseSession = jest.fn();
const mockUsePosts = jest.fn();
const mockPush = jest.fn();

jest.mock('@/hooks/useSession', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('@/hooks/usePosts', () => ({
  usePosts: () => mockUsePosts(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  Redirect: () => null,
  Stack: { Screen: () => null },
}));

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

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

const BASE_POSTS_HOOK = {
  loading: false,
  error: null,
  hasMore: false,
  loadNextPage: jest.fn(),
  refresh: jest.fn(),
  createPost: jest.fn(),
  updatePost: jest.fn(),
  softDelete: jest.fn(),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PostsListScreen', () => {
  it('renders post titles for admin', async () => {
    mockUseSession.mockReturnValue({
      session: { userId: 'user-1', role: 'admin' },
      profile: { id: 'profile-1' },
    });
    mockUsePosts.mockReturnValue({ ...BASE_POSTS_HOOK, posts: [POST] });

    render(<PostsListScreen />);

    await waitFor(() => {
      expect(screen.getByText('Noticias del restaurante')).toBeTruthy();
    });
  });

  it('redirects staff — renders nothing', () => {
    mockUseSession.mockReturnValue({
      session: { userId: 'user-2', role: 'staff' },
      profile: { id: 'profile-2' },
    });
    mockUsePosts.mockReturnValue({ ...BASE_POSTS_HOOK, posts: [] });

    const { toJSON } = render(<PostsListScreen />);
    expect(toJSON()).toBeNull();
  });

  it('shows empty state when no posts', async () => {
    mockUseSession.mockReturnValue({
      session: { userId: 'user-1', role: 'admin' },
      profile: { id: 'profile-1' },
    });
    mockUsePosts.mockReturnValue({ ...BASE_POSTS_HOOK, posts: [] });

    render(<PostsListScreen />);

    await waitFor(() => {
      expect(screen.getByText('No hay posts todavía.')).toBeTruthy();
    });
  });
});
