import { renderHook, act, waitFor } from '@testing-library/react-native';

import { usePosts } from '@/hooks/usePosts';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockFrom = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const POST_A = {
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
};

const POST_B = {
  ...POST_A,
  id: 'post-2',
  title: 'Segundo post',
  status: 'draft' as const,
  published_at: null,
};

function makeQueryChain(resolveWith: { data: unknown; error: unknown }) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockResolvedValue(resolveWith),
    eq: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(resolveWith),
  };
  return chain;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe('usePosts', () => {
  it('fetches posts on mount and returns them', async () => {
    const chain = makeQueryChain({ data: [POST_A, POST_B], error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => usePosts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.posts).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it('sets error when fetch fails', async () => {
    const chain = makeQueryChain({ data: null, error: { message: 'network error' } });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => usePosts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('network error');
    expect(result.current.posts).toHaveLength(0);
  });

  it('filters by authorId when provided', async () => {
    const chain = makeQueryChain({ data: [POST_A], error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => usePosts({ authorId: 'profile-1' }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(chain.eq).toHaveBeenCalledWith('author_id', 'profile-1');
  });

  it('does not filter by authorId when not provided', async () => {
    const chain = makeQueryChain({ data: [POST_A, POST_B], error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => usePosts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(chain.eq).not.toHaveBeenCalledWith('author_id', expect.anything());
  });

  it('softDelete removes the post from the list', async () => {
    const fetchChain = makeQueryChain({ data: [POST_A, POST_B], error: null });
    const deleteChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    };

    mockFrom.mockReturnValueOnce(fetchChain).mockReturnValueOnce(deleteChain);

    const { result } = renderHook(() => usePosts());
    await waitFor(() => expect(result.current.posts).toHaveLength(2));

    await act(async () => {
      const res = await result.current.softDelete('post-1');
      expect(res.error).toBeNull();
    });

    expect(result.current.posts).toHaveLength(1);
    expect(result.current.posts[0]?.id).toBe('post-2');
  });

  it('softDelete returns error on failure', async () => {
    const fetchChain = makeQueryChain({ data: [POST_A], error: null });
    const deleteChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: { message: 'delete failed' } }),
    };

    mockFrom.mockReturnValueOnce(fetchChain).mockReturnValueOnce(deleteChain);

    const { result } = renderHook(() => usePosts());
    await waitFor(() => expect(result.current.posts).toHaveLength(1));

    await act(async () => {
      const res = await result.current.softDelete('post-1');
      expect(res.error).toBe('delete failed');
    });

    expect(result.current.posts).toHaveLength(1);
  });

  it('updatePost updates the post in the list', async () => {
    const fetchChain = makeQueryChain({ data: [POST_A], error: null });
    const updateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    };

    mockFrom.mockReturnValueOnce(fetchChain).mockReturnValueOnce(updateChain);

    const { result } = renderHook(() => usePosts());
    await waitFor(() => expect(result.current.posts).toHaveLength(1));

    await act(async () => {
      await result.current.updatePost('post-1', { title: 'Título actualizado' });
    });

    expect(result.current.posts[0]?.title).toBe('Título actualizado');
  });

  it('hasMore is false when fewer than PAGE_SIZE results returned', async () => {
    const chain = makeQueryChain({ data: [POST_A], error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => usePosts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMore).toBe(false);
  });
});
