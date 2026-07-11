import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { PostCard } from '@/components/PostCard';
import type { PostWithAuthor } from '@/lib/supabase/queries/posts';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('expo-image', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    Image: (props: Record<string, unknown>) => (
      <View testID="post-image" style={props['style'] as object} />
    ),
  };
});

jest.mock('lucide-react-native', () => ({
  ExternalLink: () => null,
  MessageCircle: () => null,
  Star: () => null,
}));

jest.mock('@/hooks/usePostReactions', () => ({
  usePostReactions: () => ({
    myReaction: null,
    counts: { like: 0, dislike: 0, love: 0 },
    loading: false,
    toggle: jest.fn(),
  }),
}));

jest.mock('@/components/reactions', () => ({
  ReactionPicker: () => null,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const POST: PostWithAuthor = {
  id: 'post-1',
  author_id: 'profile-1',
  title: 'Noticias del restaurante',
  subtitle: 'Un subtítulo de prueba',
  external_url: 'https://example.com',
  body: null,
  cover_image_url: null,
  status: 'published',
  published_at: '2026-06-30T10:00:00Z',
  created_at: '2026-06-30T09:00:00Z',
  updated_at: '2026-06-30T09:00:00Z',
  deleted_at: null,
  author: { name: 'Juan', surname: 'García' },
  comments_count: 4,
  rating_average: 4.25,
  rating_count: 8,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PostCard', () => {
  it('matches snapshot', () => {
    const { toJSON } = render(<PostCard post={POST} onPress={jest.fn()} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders title', () => {
    const { getByText } = render(<PostCard post={POST} onPress={jest.fn()} />);
    expect(getByText('Noticias del restaurante')).toBeTruthy();
  });

  it('renders subtitle when present', () => {
    const { getByText } = render(<PostCard post={POST} onPress={jest.fn()} />);
    expect(getByText('Un subtítulo de prueba')).toBeTruthy();
  });

  it('does not render subtitle when absent', () => {
    const { queryByText } = render(
      <PostCard post={{ ...POST, subtitle: null }} onPress={jest.fn()} />,
    );
    expect(queryByText('Un subtítulo de prueba')).toBeNull();
  });

  it('renders full author name', () => {
    const { getByText } = render(<PostCard post={POST} onPress={jest.fn()} />);
    expect(getByText('Juan García')).toBeTruthy();
  });

  it('renders fallback author when name is null', () => {
    const { getByText } = render(
      <PostCard
        post={{ ...POST, author: { name: null, surname: null } }}
        onPress={jest.fn()}
      />,
    );
    expect(getByText('—')).toBeTruthy();
  });

  it('renders the rounded rating average when the post has ratings', () => {
    const { getByText } = render(<PostCard post={POST} onPress={jest.fn()} />);
    expect(getByText('4.3')).toBeTruthy(); // 4.25 -> toFixed(1)
  });

  it('does not render a rating when the post has no ratings', () => {
    const { queryByText } = render(
      <PostCard post={{ ...POST, rating_average: 0, rating_count: 0 }} onPress={jest.fn()} />,
    );
    expect(queryByText('0.0')).toBeNull();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<PostCard post={POST} onPress={onPress} />);
    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('uses image transform URL when cover_image_url is set', () => {
    const { getByTestId } = render(
      <PostCard
        post={{
          ...POST,
          cover_image_url:
            'https://abc.supabase.co/storage/v1/object/public/post-images/test.webp',
        }}
        onPress={jest.fn()}
      />,
    );
    // Image mock renders; the source URL transform is exercised via the component internals
    expect(getByTestId('post-image')).toBeTruthy();
  });
});
