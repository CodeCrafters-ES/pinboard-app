import { act, renderHook, waitFor } from '@testing-library/react-native';

import { usePostRating } from '@/hooks/usePostRating';
import { getRatingState, upsertRating } from '@/lib/ratings';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), auth: { getUser: jest.fn() } },
}));

jest.mock('@/lib/ratings', () => ({
  getRatingState: jest.fn(),
  upsertRating: jest.fn(),
  EMPTY_RATING: { myRating: null, average: 0, count: 0 },
}));

const mockGetRatingState = getRatingState as jest.MockedFunction<typeof getRatingState>;
const mockUpsertRating = upsertRating as jest.MockedFunction<typeof upsertRating>;

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

describe('usePostRating', () => {
  it('loads the initial rating state on mount', async () => {
    mockGetRatingState.mockResolvedValueOnce({ myRating: 4, average: 4.2, count: 5 });

    const { result } = renderHook(() => usePostRating('post-1'));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.myRating).toBe(4);
    expect(result.current.average).toBe(4.2);
    expect(result.current.count).toBe(5);
    expect(mockGetRatingState).toHaveBeenCalledWith('post-1');
  });

  it('falls back to empty state on fetch error', async () => {
    mockGetRatingState.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(() => usePostRating('post-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.myRating).toBeNull();
    expect(result.current.average).toBe(0);
    expect(result.current.count).toBe(0);
  });

  it('adds a first rating optimistically and increments the count', async () => {
    mockGetRatingState.mockResolvedValueOnce({ myRating: null, average: 4, count: 2 });
    mockUpsertRating.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => usePostRating('post-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.rate(5);
    });

    // previous sum 4*2=8, +5 → 13 over 3 ratings
    expect(result.current.myRating).toBe(5);
    expect(result.current.count).toBe(3);
    expect(result.current.average).toBeCloseTo(13 / 3);
    expect(mockUpsertRating).toHaveBeenCalledWith('post-1', 5);
  });

  it('updates an existing rating in place without changing the count', async () => {
    mockGetRatingState.mockResolvedValueOnce({ myRating: 2, average: 3, count: 4 });
    mockUpsertRating.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => usePostRating('post-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.rate(4);
    });

    // previous sum 3*4=12, -2 +4 → 14 over 4 ratings
    expect(result.current.myRating).toBe(4);
    expect(result.current.count).toBe(4);
    expect(result.current.average).toBeCloseTo(3.5);
    expect(mockUpsertRating).toHaveBeenCalledWith('post-1', 4);
  });

  it('does not upsert when reselecting the same rating', async () => {
    mockGetRatingState.mockResolvedValueOnce({ myRating: 3, average: 3, count: 1 });

    const { result } = renderHook(() => usePostRating('post-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.rate(3);
    });

    expect(mockUpsertRating).not.toHaveBeenCalled();
    expect(result.current.myRating).toBe(3);
    expect(result.current.count).toBe(1);
  });

  it('rolls back the optimistic update on error', async () => {
    mockGetRatingState.mockResolvedValueOnce({ myRating: null, average: 2, count: 1 });
    mockUpsertRating.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(() => usePostRating('post-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.rate(5);
    });

    expect(result.current.myRating).toBeNull();
    expect(result.current.average).toBe(2);
    expect(result.current.count).toBe(1);
    expect(mockUpsertRating).toHaveBeenCalledWith('post-1', 5);
  });
});
