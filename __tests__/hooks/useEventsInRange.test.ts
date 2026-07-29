import { renderHook, act, waitFor } from '@testing-library/react-native';

import { useEventsInRange } from '@/hooks/useEventsInRange';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockFrom = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EVENT_A = {
  id: 'event-1',
  title: 'Reunión',
  event_start_at: '2026-08-01T09:00:00.000Z',
  event_end_at: '2026-08-01T10:00:00.000Z',
  all_day: false,
  color_tag: 'brown' as const,
  location: null,
};

const EVENT_B = { ...EVENT_A, id: 'event-2', title: 'Formación', color_tag: 'sea' as const };

// El query builder de supabase es "thenable": `await query` invoca `.then`.
function makeChain(resolveWith: { data: unknown; error: unknown }) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(resolveWith).then(onF, onR),
  };
  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
});

const FROM = new Date('2026-08-01T00:00:00.000Z');
const TO = new Date('2026-09-01T00:00:00.000Z');

describe('useEventsInRange', () => {
  it('fetches events intersecting the range on mount', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [EVENT_A, EVENT_B], error: null }));

    const { result } = renderHook(() => useEventsInRange(FROM, TO));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it('queries with the efficient column subset and range-intersection predicates', async () => {
    const chain = makeChain({ data: [EVENT_A], error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useEventsInRange(FROM, TO));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(chain.select).toHaveBeenCalledWith(
      'id, title, event_start_at, event_end_at, all_day, color_tag, location',
    );
    // [from, to) ∩ [event_start_at, event_end_at): start < to && end > from
    expect(chain.lt).toHaveBeenCalledWith('event_start_at', TO.toISOString());
    expect(chain.gt).toHaveBeenCalledWith('event_end_at', FROM.toISOString());
    expect(chain.order).toHaveBeenCalledWith('event_start_at', { ascending: true });
  });

  it('returns an empty array when there are no results', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }));

    const { result } = renderHook(() => useEventsInRange(FROM, TO));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events).toEqual([]);
  });

  it('sets an Error when the fetch fails', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'network error' } }));

    const { result } = renderHook(() => useEventsInRange(FROM, TO));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('network error');
  });

  it('refetch re-runs the query', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [EVENT_A], error: null }));

    const { result } = renderHook(() => useEventsInRange(FROM, TO));
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFrom.mockClear();
    await act(async () => {
      result.current.refetch();
    });
    expect(mockFrom).toHaveBeenCalledWith('events');
  });
});
