import { renderHook, waitFor } from '@testing-library/react-native';

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
  author_id: 'user-1',
  title: 'Reunión',
  description: null,
  location: null,
  all_day: false,
  event_start_at: '2026-08-01T09:00:00.000Z',
  event_end_at: '2026-08-01T10:00:00.000Z',
  color_tag: 'brown' as const,
  image_url: null,
  created_at: '2026-07-01T09:00:00.000Z',
  updated_at: '2026-07-01T09:00:00.000Z',
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

const START = '2026-08-01T00:00:00.000Z';
const END = '2026-09-01T00:00:00.000Z';

describe('useEventsInRange', () => {
  it('fetches events intersecting the range on mount', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [EVENT_A, EVENT_B], error: null }));

    const { result } = renderHook(() => useEventsInRange(START, END));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it('queries with range-intersection predicates', async () => {
    const chain = makeChain({ data: [EVENT_A], error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useEventsInRange(START, END));

    await waitFor(() => expect(result.current.loading).toBe(false));
    // [start, end) ∩ [event_start_at, event_end_at): start < end_visible && end > start_visible
    expect(chain.lt).toHaveBeenCalledWith('event_start_at', END);
    expect(chain.gt).toHaveBeenCalledWith('event_end_at', START);
    expect(chain.order).toHaveBeenCalledWith('event_start_at', { ascending: true });
  });

  it('sets error when fetch fails', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'network error' } }));

    const { result } = renderHook(() => useEventsInRange(START, END));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('network error');
  });
});
