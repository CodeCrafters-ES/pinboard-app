import { renderHook, act, waitFor } from '@testing-library/react-native';

import { useEvents } from '@/hooks/useEvents';

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
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(resolveWith),
    then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(resolveWith).then(onF, onR),
  };
  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useEvents', () => {
  it('fetches events on mount', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [EVENT_A, EVENT_B], error: null }));

    const { result } = renderHook(() => useEvents());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it('sets error when fetch fails', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'network error' } }));

    const { result } = renderHook(() => useEvents());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('network error');
  });

  it('filters by authorId', async () => {
    const chain = makeChain({ data: [EVENT_A], error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useEvents({ authorId: 'user-1' }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(chain.eq).toHaveBeenCalledWith('author_id', 'user-1');
  });

  it('filters by colorTag', async () => {
    const chain = makeChain({ data: [EVENT_B], error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useEvents({ colorTag: 'sea' }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(chain.eq).toHaveBeenCalledWith('color_tag', 'sea');
  });

  it('filters by month range', async () => {
    const chain = makeChain({ data: [EVENT_A], error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useEvents({ month: '2026-08' }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(chain.gte).toHaveBeenCalledWith('event_start_at', '2026-08-01T00:00:00.000Z');
    expect(chain.lt).toHaveBeenCalledWith('event_start_at', '2026-09-01T00:00:00.000Z');
  });

  it('createEvent prepends the new event', async () => {
    const fetchChain = makeChain({ data: [EVENT_A], error: null });
    const insertChain = makeChain({ data: EVENT_B, error: null });
    mockFrom.mockReturnValueOnce(fetchChain).mockReturnValueOnce(insertChain);

    const { result } = renderHook(() => useEvents());
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    await act(async () => {
      const res = await result.current.createEvent({
        author_id: 'user-1',
        title: 'Formación',
        all_day: false,
        event_start_at: '2026-08-01T09:00:00.000Z',
        event_end_at: '2026-08-01T10:00:00.000Z',
        color_tag: 'sea',
      });
      expect(res.error).toBeNull();
    });

    expect(result.current.events).toHaveLength(2);
    expect(result.current.events[0]?.id).toBe('event-2');
  });

  it('updateEvent replaces the event in the list', async () => {
    const fetchChain = makeChain({ data: [EVENT_A], error: null });
    const updateChain = makeChain({ data: { ...EVENT_A, title: 'Actualizado' }, error: null });
    mockFrom.mockReturnValueOnce(fetchChain).mockReturnValueOnce(updateChain);

    const { result } = renderHook(() => useEvents());
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    await act(async () => {
      await result.current.updateEvent('event-1', { title: 'Actualizado' });
    });

    expect(result.current.events[0]?.title).toBe('Actualizado');
  });

  it('deleteEvent removes the event', async () => {
    const fetchChain = makeChain({ data: [EVENT_A, EVENT_B], error: null });
    const deleteChain = makeChain({ data: null, error: null });
    mockFrom.mockReturnValueOnce(fetchChain).mockReturnValueOnce(deleteChain);

    const { result } = renderHook(() => useEvents());
    await waitFor(() => expect(result.current.events).toHaveLength(2));

    await act(async () => {
      const res = await result.current.deleteEvent('event-1');
      expect(res.error).toBeNull();
    });

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0]?.id).toBe('event-2');
  });
});
