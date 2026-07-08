import { act, renderHook, waitFor } from '@testing-library/react-native';

import { usePostReactions } from '@/hooks/usePostReactions';
import {
  EMPTY_COUNTS,
  getMyReaction,
  getReactionCounts,
  toggleReaction,
} from '@/lib/reactions';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), auth: { getUser: jest.fn() } },
}));

jest.mock('@/lib/reactions', () => ({
  getMyReaction: jest.fn(),
  getReactionCounts: jest.fn(),
  toggleReaction: jest.fn(),
  EMPTY_COUNTS: { like: 0, dislike: 0, love: 0 },
}));

const mockGetMyReaction = getMyReaction as jest.MockedFunction<typeof getMyReaction>;
const mockGetReactionCounts = getReactionCounts as jest.MockedFunction<typeof getReactionCounts>;
const mockToggleReaction = toggleReaction as jest.MockedFunction<typeof toggleReaction>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const COUNTS_WITH_LIKE = { like: 3, dislike: 1, love: 2 };

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

describe('usePostReactions', () => {
  it('loads initial reaction and counts on mount', async () => {
    mockGetMyReaction.mockResolvedValueOnce('like');
    mockGetReactionCounts.mockResolvedValueOnce(COUNTS_WITH_LIKE);

    const { result } = renderHook(() => usePostReactions('post-1'));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.myReaction).toBe('like');
    expect(result.current.counts).toEqual(COUNTS_WITH_LIKE);
    expect(mockGetMyReaction).toHaveBeenCalledWith('post-1');
    expect(mockGetReactionCounts).toHaveBeenCalledWith('post-1');
  });

  it('falls back to empty state on fetch error', async () => {
    mockGetMyReaction.mockRejectedValueOnce(new Error('network'));
    mockGetReactionCounts.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(() => usePostReactions('post-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.myReaction).toBeNull();
    expect(result.current.counts).toEqual(EMPTY_COUNTS);
  });

  it('toggle activates a new reaction optimistically', async () => {
    mockGetMyReaction.mockResolvedValueOnce(null);
    mockGetReactionCounts.mockResolvedValueOnce({ like: 2, dislike: 0, love: 1 });
    mockToggleReaction.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => usePostReactions('post-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.toggle('like');
    });

    expect(result.current.myReaction).toBe('like');
    expect(result.current.counts.like).toBe(3);
    expect(mockToggleReaction).toHaveBeenCalledWith('post-1', 'like', null);
  });

  it('toggle off deactivates the active reaction', async () => {
    mockGetMyReaction.mockResolvedValueOnce('love');
    mockGetReactionCounts.mockResolvedValueOnce({ like: 0, dislike: 0, love: 4 });
    mockToggleReaction.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => usePostReactions('post-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.toggle('love');
    });

    expect(result.current.myReaction).toBeNull();
    expect(result.current.counts.love).toBe(3);
    expect(mockToggleReaction).toHaveBeenCalledWith('post-1', 'love', 'love');
  });

  it('toggle switches reaction type and adjusts counts', async () => {
    mockGetMyReaction.mockResolvedValueOnce('like');
    mockGetReactionCounts.mockResolvedValueOnce({ like: 5, dislike: 1, love: 0 });
    mockToggleReaction.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => usePostReactions('post-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.toggle('dislike');
    });

    expect(result.current.myReaction).toBe('dislike');
    expect(result.current.counts.like).toBe(4);
    expect(result.current.counts.dislike).toBe(2);
    expect(mockToggleReaction).toHaveBeenCalledWith('post-1', 'dislike', 'like');
  });

  it('rolls back optimistic update on network error', async () => {
    mockGetMyReaction.mockResolvedValueOnce(null);
    mockGetReactionCounts.mockResolvedValueOnce({ like: 1, dislike: 0, love: 0 });
    mockToggleReaction.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(() => usePostReactions('post-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.toggle('like');
    });

    expect(result.current.myReaction).toBeNull();
    expect(result.current.counts.like).toBe(1);
  });
});
