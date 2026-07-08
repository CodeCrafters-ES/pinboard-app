import { renderHook, act, waitFor } from '@testing-library/react-native';

import { useFeed } from '@/hooks/useFeed';
import { listPublishedPosts } from '@/lib/supabase/queries/posts';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('@/lib/supabase/queries/posts', () => ({
  listPublishedPosts: jest.fn(),
}));

const mockList = listPublishedPosts as jest.MockedFunction<typeof listPublishedPosts>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE_POST = {
  id: 'post-1',
  author_id: 'profile-1',
  title: 'Primer post',
  subtitle: null,
  external_url: 'https://example.com',
  body: null,
  cover_image_url: null,
  status: 'published' as const,
  published_at: '2026-06-30T10:00:00Z',
  created_at: '2026-06-30T09:00:00Z',
  updated_at: '2026-06-30T09:00:00Z',
  deleted_at: null,
  author: { name: 'Juan', surname: 'García' },
  comments_count: 0,
};

function makePosts(count: number) {
  return Array.from({ length: count }, (_, i) => ({ ...BASE_POST, id: `post-${i}` }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

describe('useFeed', () => {
  it('loads first page on mount', async () => {
    mockList.mockResolvedValueOnce({ rows: [BASE_POST], nextCursor: null });

    const { result } = renderHook(() => useFeed());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.posts).toHaveLength(1);
    expect(result.current.error).toBeNull();
    expect(result.current.hasMore).toBe(false);
  });

  it('sets error on fetch failure', async () => {
    mockList.mockRejectedValueOnce(new Error('network error'));

    const { result } = renderHook(() => useFeed());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('network error');
    expect(result.current.posts).toHaveLength(0);
  });

  it('hasMore is true when a nextCursor is returned', async () => {
    const cursor = { published_at: '2026-06-30T10:00:00Z', id: 'post-19' };
    mockList.mockResolvedValueOnce({ rows: makePosts(20), nextCursor: cursor });

    const { result } = renderHook(() => useFeed());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMore).toBe(true);
  });

  it('loadMore appends to the list and passes cursor', async () => {
    const cursor = { published_at: '2026-06-30T10:00:00Z', id: 'post-19' };
    mockList
      .mockResolvedValueOnce({ rows: makePosts(20), nextCursor: cursor })
      .mockResolvedValueOnce({ rows: [{ ...BASE_POST, id: 'post-20' }], nextCursor: null });

    const { result } = renderHook(() => useFeed());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.posts).toHaveLength(20);

    await act(async () => result.current.loadMore());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.posts).toHaveLength(21);
    expect(result.current.hasMore).toBe(false);
    expect(mockList).toHaveBeenNthCalledWith(2, { cursor });
  });

  it('refresh resets the list to the first page', async () => {
    const cursor = { published_at: '2026-06-30T10:00:00Z', id: 'post-19' };
    mockList
      .mockResolvedValueOnce({ rows: makePosts(20), nextCursor: cursor })
      .mockResolvedValueOnce({ rows: [BASE_POST], nextCursor: null });

    const { result } = renderHook(() => useFeed());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.posts).toHaveLength(20);

    await act(async () => result.current.refresh());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.posts).toHaveLength(1);
    expect(result.current.hasMore).toBe(false);
    expect(mockList).toHaveBeenNthCalledWith(2, { cursor: undefined });
  });

  it('loadMore does nothing when already loading', async () => {
    let resolveFirst!: (v: Awaited<ReturnType<typeof listPublishedPosts>>) => void;
    mockList.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveFirst = res;
        }),
    );

    const { result } = renderHook(() => useFeed());

    // While loading, calling loadMore should not trigger another fetch
    act(() => result.current.loadMore());
    expect(mockList).toHaveBeenCalledTimes(1);

    resolveFirst({ rows: [], nextCursor: null });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
