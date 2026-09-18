import { renderHook, act, waitFor } from '@testing-library/react-native';

import { useLeaderboard } from '@/hooks/useLeaderboard';
import type { LeaderboardEntry } from '@/lib/gamification';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function entry(over: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    user_id: 'user-1',
    full_name: 'Dev Admin',
    avatar_url: '',
    total_points: 30,
    rank: 1,
    is_self: false,
    ...over,
  };
}

const TOP = [
  entry({ user_id: 'u1', full_name: 'Ana', total_points: 30, rank: 1 }),
  entry({ user_id: 'u2', full_name: 'Beto', total_points: 20, rank: 2 }),
];

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: TOP, error: null });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useLeaderboard', () => {
  it('carga el ranking semanal por defecto', async () => {
    const { result } = renderHook(() => useLeaderboard());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockRpc).toHaveBeenCalledWith('leaderboard', expect.objectContaining({ limit_n: 20 }));
    expect(result.current.period).toBe('weekly');
    expect(result.current.top).toHaveLength(2);
    expect(result.current.selfBelowTop).toBeNull();
  });

  it('cambiar a mensual recarga con un rango distinto', async () => {
    const { result } = renderHook(() => useLeaderboard());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const weeklyArgs = mockRpc.mock.calls[0]?.[1] as { period_start: string };

    act(() => result.current.setPeriod('monthly'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const monthlyArgs = mockRpc.mock.calls[1]?.[1] as { period_start: string };

    expect(result.current.period).toBe('monthly');
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(monthlyArgs.period_start).not.toBe(weeklyArgs.period_start);
  });

  it('re-pulsar la pestaña activa no recarga ni vacía la lista', async () => {
    const { result } = renderHook(() => useLeaderboard());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setPeriod('weekly'));

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(result.current.top).toHaveLength(2);
  });

  it('separa la fila propia cuando el usuario queda fuera del top', async () => {
    mockRpc.mockResolvedValue({
      data: [...TOP, entry({ user_id: 'u9', full_name: 'Yo', total_points: 3, rank: 7, is_self: true })],
      error: null,
    });

    const { result } = renderHook(() => useLeaderboard('weekly', 2));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.top).toHaveLength(2);
    expect(result.current.selfBelowTop?.rank).toBe(7);
  });

  it('deja la fila propia dentro de la lista si está en el top', async () => {
    mockRpc.mockResolvedValue({
      data: [TOP[0], entry({ user_id: 'u2', full_name: 'Yo', rank: 2, is_self: true })],
      error: null,
    });

    const { result } = renderHook(() => useLeaderboard('weekly', 20));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.top).toHaveLength(2);
    expect(result.current.selfBelowTop).toBeNull();
  });

  it('expone un mensaje de error y vacía la lista si la RPC falla', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    const { result } = renderHook(() => useLeaderboard());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('No se pudo cargar el ranking.');
    expect(result.current.top).toEqual([]);
  });
});
