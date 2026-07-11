import React from 'react';
import { render, screen } from '@testing-library/react-native';

import EngagementScreen from '@/app/(app)/(tabs)/admin/engagement/index';
import type { PostEngagement } from '@/lib/supabase/queries/engagement';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockUseSession = jest.fn();
const mockUseMetrics = jest.fn();

// El módulo de queries arrastra el singleton de Supabase, que lee
// Constants.expoConfig.extra (no poblado bajo Jest).
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

jest.mock('@/hooks/useSession', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('@/hooks/usePostEngagementMetrics', () => ({
  usePostEngagementMetrics: () => mockUseMetrics(),
}));

jest.mock('expo-router', () => ({
  Redirect: () => null,
  Stack: { Screen: () => null },
}));

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

const ROWS: PostEngagement[] = [
  {
    post_id: 'p1',
    title: 'Nueva carta de temporada',
    unique_readers: 4,
    unique_clicks: 3,
    click_rate: 0.75,
    avg_rating: 4.5,
    total_reactions: 6,
    engaged_users: 2,
    avg_seconds: 12,
    avg_scroll: 0.8,
  },
];

function metrics(overrides: Partial<ReturnType<typeof mockUseMetrics>> = {}) {
  return {
    rows: ROWS,
    loading: false,
    error: null,
    refresh: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSession.mockReturnValue({ session: { userId: 'u1', role: 'admin' } });
  mockUseMetrics.mockReturnValue(metrics());
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EngagementScreen', () => {
  it('shows the metrics of each post to an admin', () => {
    render(<EngagementScreen />);

    expect(screen.getByText('Nueva carta de temporada')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy(); // unique_clicks
    expect(screen.getByText('75%')).toBeTruthy(); // click_rate
    expect(screen.getByText('4.5')).toBeTruthy(); // avg_rating
    expect(screen.getByText('6')).toBeTruthy(); // total_reactions
    // engaged (ADR-001): interactuaron pero no llegaron al enlace externo.
    expect(screen.getByText(/2 interactuaron sin clicar/)).toBeTruthy();
  });

  it('shows the metrics to a manager too', () => {
    mockUseSession.mockReturnValue({ session: { userId: 'u2', role: 'manager' } });

    render(<EngagementScreen />);

    expect(screen.getByText('Nueva carta de temporada')).toBeTruthy();
  });

  it('does not render the metrics for staff (redirects away)', () => {
    mockUseSession.mockReturnValue({ session: { userId: 'u3', role: 'staff' } });

    render(<EngagementScreen />);

    expect(screen.queryByText('Nueva carta de temporada')).toBeNull();
  });

  it('renders an em dash when a post has no readers or ratings', () => {
    mockUseMetrics.mockReturnValue(
      metrics({
        rows: [{ ...ROWS[0]!, unique_readers: 0, unique_clicks: 0, click_rate: null, avg_rating: null }],
      }),
    );

    render(<EngagementScreen />);

    expect(screen.getAllByText('—')).toHaveLength(2); // click_rate y avg_rating
  });

  it('shows the empty state when there is no activity', () => {
    mockUseMetrics.mockReturnValue(metrics({ rows: [] }));

    render(<EngagementScreen />);

    expect(screen.getByText(/Todavía no hay actividad registrada/)).toBeTruthy();
  });

  it('shows the error state', () => {
    mockUseMetrics.mockReturnValue(metrics({ rows: [], error: 'Fallo de red' }));

    render(<EngagementScreen />);

    expect(screen.getByText('Fallo de red')).toBeTruthy();
  });
});
