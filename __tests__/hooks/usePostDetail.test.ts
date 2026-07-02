import { renderHook, waitFor } from '@testing-library/react-native';

import { usePostDetail } from '@/hooks/usePostDetail';
import { getPostById } from '@/lib/supabase/queries/posts';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('@/lib/supabase/queries/posts', () => ({
  getPostById: jest.fn(),
}));

const mockGetPostById = getPostById as jest.MockedFunction<typeof getPostById>;

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
  author: { id: 'profile-1', name: 'Juan', surname: 'García', avatar_url: null },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

describe('usePostDetail', () => {
  it('loads the post on mount', async () => {
    mockGetPostById.mockResolvedValueOnce(BASE_POST);

    const { result } = renderHook(() => usePostDetail('post-1'));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.post).toEqual(BASE_POST);
    expect(result.current.error).toBeNull();
    expect(mockGetPostById).toHaveBeenCalledWith('post-1');
  });

  it('sets "No disponible" error on fetch failure', async () => {
    mockGetPostById.mockRejectedValueOnce(new Error('not found'));

    const { result } = renderHook(() => usePostDetail('post-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('No disponible');
    expect(result.current.post).toBeNull();
  });

  it('returns an error state immediately when id is undefined', async () => {
    const { result } = renderHook(() => usePostDetail(undefined));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('No disponible');
    expect(result.current.post).toBeNull();
    expect(mockGetPostById).not.toHaveBeenCalled();
  });

  it('refetches when id changes', async () => {
    mockGetPostById
      .mockResolvedValueOnce(BASE_POST)
      .mockResolvedValueOnce({ ...BASE_POST, id: 'post-2', title: 'Segundo post' });

    const { result, rerender } = renderHook<ReturnType<typeof usePostDetail>, { id: string }>(
      ({ id }) => usePostDetail(id),
      { initialProps: { id: 'post-1' } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.post?.id).toBe('post-1');

    rerender({ id: 'post-2' });

    await waitFor(() => expect(result.current.post?.id).toBe('post-2'));
    expect(mockGetPostById).toHaveBeenNthCalledWith(2, 'post-2');
  });
});
