import React from 'react';
import { RefreshControl } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import RankingScreen from '@/app/(app)/ranking';
import type { LeaderboardEntry } from '@/lib/gamification';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockUseLeaderboard = jest.fn();
const mockSetPeriod = jest.fn();
const mockRefetch = jest.fn();
const mockBack = jest.fn();

// El hook arrastra el singleton de Supabase, que lee Constants.expoConfig.extra
// (no poblado bajo Jest).
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

jest.mock('@/hooks/useLeaderboard', () => ({
  useLeaderboard: () => mockUseLeaderboard(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

jest.mock('expo-image', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Image } = require('react-native');
  return { Image };
});

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function entry(over: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    user_id: 'u1',
    full_name: 'Ana Ruiz',
    avatar_url: '',
    total_points: 30,
    rank: 1,
    is_self: false,
    ...over,
  };
}

function setHook(over: Partial<ReturnType<typeof buildState>> = {}) {
  mockUseLeaderboard.mockReturnValue({ ...buildState(), ...over });
}

function buildState() {
  return {
    top: [] as LeaderboardEntry[],
    selfBelowTop: null as LeaderboardEntry | null,
    period: 'weekly' as const,
    setPeriod: mockSetPeriod,
    loading: false,
    error: null as string | null,
    refetch: mockRefetch,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  setHook();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RankingScreen', () => {
  it('muestra el top con puesto, nombre y puntos', () => {
    setHook({
      top: [
        entry({ user_id: 'u1', full_name: 'Ana Ruiz', total_points: 30, rank: 1 }),
        entry({ user_id: 'u2', full_name: 'Beto Gil', total_points: 20, rank: 2 }),
      ],
    });

    render(<RankingScreen />);

    expect(screen.getByText('Ana Ruiz')).toBeTruthy();
    expect(screen.getByText('Beto Gil')).toBeTruthy();
    expect(screen.getByLabelText('Número 1, Ana Ruiz, 30 puntos')).toBeTruthy();
  });

  it('destaca la fila propia con el chip "Tú"', () => {
    setHook({
      top: [entry({ user_id: 'u1', full_name: 'Yo Mismo', total_points: 12, rank: 1, is_self: true })],
    });

    render(<RankingScreen />);

    expect(screen.getByText('Tú')).toBeTruthy();
    expect(screen.getByLabelText('Tu posición: número 1, Yo Mismo, 12 puntos')).toBeTruthy();
  });

  it('muestra "Tu posición" cuando el usuario queda fuera del top', () => {
    setHook({
      top: [entry({ user_id: 'u1', rank: 1 })],
      selfBelowTop: entry({ user_id: 'u9', full_name: 'Yo Mismo', total_points: 3, rank: 27, is_self: true }),
    });

    render(<RankingScreen />);

    expect(screen.getByText('Tu posición: #27')).toBeTruthy();
    expect(screen.getByLabelText('Tu posición: número 27, Yo Mismo, 3 puntos')).toBeTruthy();
  });

  it('cambia de periodo al pulsar la pestaña Mensual', () => {
    render(<RankingScreen />);

    fireEvent.press(screen.getByLabelText('Ranking mensual'));

    expect(mockSetPeriod).toHaveBeenCalledWith('monthly');
  });

  it('renderiza el estado vacío cuando no hay puntos en el periodo', () => {
    setHook({ top: [], loading: false });

    render(<RankingScreen />);

    expect(
      screen.getByText('Aún no hay puntos en este periodo. Lee posts para sumar tu primer 10.'),
    ).toBeTruthy();
  });

  it('no muestra el estado vacío durante la primera carga', () => {
    setHook({ top: [], loading: true });

    render(<RankingScreen />);

    expect(screen.queryByText(/Aún no hay puntos/)).toBeNull();
  });

  it('permite reintentar cuando la carga falla', () => {
    setHook({ error: 'No se pudo cargar el ranking.' });

    render(<RankingScreen />);
    fireEvent.press(screen.getByLabelText('Reintentar'));

    expect(mockRefetch).toHaveBeenCalled();
  });

  it('el pull-to-refresh vuelve a pedir los datos', () => {
    setHook({ top: [entry()] });

    const view = render(<RankingScreen />);
    act(() => view.UNSAFE_getByType(RefreshControl).props.onRefresh());

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('no marca el pull-to-refresh como activo durante la primera carga', () => {
    setHook({ top: [], loading: true });

    const view = render(<RankingScreen />);

    // Con la lista vacía se pinta el spinner de carga inicial, no la FlatList:
    // mostrar además el indicador de refresco duplicaría el feedback.
    expect(view.UNSAFE_queryByType(RefreshControl)).toBeNull();
  });

  it('usa el singular en la etiqueta accesible con un solo punto', () => {
    setHook({ top: [entry({ total_points: 1, rank: 4, full_name: 'Ana Ruiz' })] });

    render(<RankingScreen />);

    expect(screen.getByLabelText('Número 4, Ana Ruiz, 1 punto')).toBeTruthy();
  });
});
