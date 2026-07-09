import React from 'react';
import { Linking } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

import PostDetailScreen from '@/app/(app)/(tabs)/tablon/[id]';
import type { PostDetail } from '@/hooks/usePostDetail';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockUsePostDetail = jest.fn();
const mockBack = jest.fn();

jest.mock('@/hooks/usePostDetail', () => ({
  usePostDetail: () => mockUsePostDetail(),
}));

jest.mock('@/hooks/usePostReactions', () => ({
  usePostReactions: () => ({
    myReaction: null,
    counts: { like: 0, dislike: 0, love: 0 },
    loading: false,
    toggle: jest.fn(),
  }),
}));

jest.mock('@/hooks/usePostRating', () => ({
  usePostRating: () => ({
    myRating: null,
    average: 0,
    count: 0,
    loading: false,
    rate: jest.fn(),
  }),
}));

jest.mock('@/components/reactions', () => ({
  ReactionPicker: () => null,
}));

jest.mock('@/hooks/useComments', () => ({
  useComments: () => ({
    comments: [],
    total: 0,
    loading: false,
    loadingMore: false,
    hasMore: false,
    error: null,
    loadMore: jest.fn(),
    refresh: jest.fn(),
    add: jest.fn(),
    remove: jest.fn(),
  }),
}));

jest.mock('@/hooks/useSession', () => ({
  useSession: () => ({ session: null, profile: null }),
}));

jest.mock('@/components/comments', () => ({
  CommentComposer: () => null,
  CommentsList: () => null,
}));

const mockTrackLinkClick = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/engagement', () => ({
  trackLinkClick: (...args: unknown[]) => mockTrackLinkClick(...args),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'post-1' }),
  useRouter: () => ({ back: mockBack }),
  Stack: { Screen: () => null },
}));

jest.mock('expo-image', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    Image: (props: Record<string, unknown>) => (
      <View testID="post-image" accessibilityLabel={props['accessibilityLabel'] as string} />
    ),
  };
});

jest.mock('react-native-markdown-display', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: string }) => <Text testID="markdown-body">{children}</Text>,
  };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const POST: PostDetail = {
  id: 'post-1',
  author_id: 'profile-1',
  title: 'Noticias del restaurante',
  subtitle: 'Un subtítulo de prueba',
  external_url: 'https://example.com/noticia',
  body: '## Contenido\n\nTexto en **markdown**.',
  cover_image_url: 'https://abc.supabase.co/storage/v1/object/public/post-images/test.webp',
  status: 'published',
  published_at: '2026-06-30T10:00:00Z',
  created_at: '2026-06-30T09:00:00Z',
  updated_at: '2026-06-30T09:00:00Z',
  deleted_at: null,
  author: { id: 'profile-1', name: 'Juan', surname: 'García', avatar_url: null },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PostDetailScreen', () => {
  it('renders the full post', async () => {
    mockUsePostDetail.mockReturnValue({ post: POST, loading: false, error: null });

    render(<PostDetailScreen />);

    expect(screen.getByText('Noticias del restaurante')).toBeTruthy();
    expect(screen.getByText('Un subtítulo de prueba')).toBeTruthy();
    expect(screen.getByTestId('markdown-body')).toBeTruthy();
  });

  it('does not render subtitle when absent', () => {
    mockUsePostDetail.mockReturnValue({
      post: { ...POST, subtitle: null },
      loading: false,
      error: null,
    });

    render(<PostDetailScreen />);

    expect(screen.queryByText('Un subtítulo de prueba')).toBeNull();
  });

  it('does not render markdown section when body is absent', () => {
    mockUsePostDetail.mockReturnValue({
      post: { ...POST, body: null },
      loading: false,
      error: null,
    });

    render(<PostDetailScreen />);

    expect(screen.queryByTestId('markdown-body')).toBeNull();
  });

  it('tracks the click and opens external_url when "Leer noticia" is tapped', () => {
    const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    mockUsePostDetail.mockReturnValue({ post: POST, loading: false, error: null });

    render(<PostDetailScreen />);
    fireEvent.press(screen.getByLabelText('Leer noticia →'));

    expect(mockTrackLinkClick).toHaveBeenCalledWith('post-1');
    expect(openURLSpy).toHaveBeenCalledWith('https://example.com/noticia');
  });

  it('still opens external_url even if tracking rejects (fire-and-no-wait)', () => {
    mockTrackLinkClick.mockRejectedValueOnce(new Error('network'));
    const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    mockUsePostDetail.mockReturnValue({ post: POST, loading: false, error: null });

    render(<PostDetailScreen />);
    fireEvent.press(screen.getByLabelText('Leer noticia →'));

    expect(openURLSpy).toHaveBeenCalledWith('https://example.com/noticia');
  });

  it('shows a skeleton while loading', () => {
    mockUsePostDetail.mockReturnValue({ post: null, loading: true, error: null });

    render(<PostDetailScreen />);

    expect(screen.queryByText('Noticias del restaurante')).toBeNull();
  });

  it('shows "No disponible" on error', async () => {
    mockUsePostDetail.mockReturnValue({ post: null, loading: false, error: 'No disponible' });

    render(<PostDetailScreen />);

    await waitFor(() => expect(screen.getByText('No disponible')).toBeTruthy());
  });
});
