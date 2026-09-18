import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

import EventsListScreen from '@/app/(app)/(tabs)/admin/events/index';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockUseSession = jest.fn();
const mockUseEvents = jest.fn();
const mockPush = jest.fn();

jest.mock('@/hooks/useSession', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('@/hooks/useEvents', () => ({
  useEvents: () => mockUseEvents(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  Redirect: () => null,
  Stack: { Screen: () => null },
}));

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('lucide-react-native', () => ({
  Plus: () => null,
  ChevronLeft: () => null,
  ChevronRight: () => null,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EVENT = {
  id: 'event-1',
  author_id: 'user-1',
  title: 'Reunión de equipo',
  description: null,
  location: 'Sala principal',
  all_day: false,
  event_start_at: '2026-08-01T09:00:00.000Z',
  event_end_at: '2026-08-01T10:00:00.000Z',
  color_tag: 'brown' as const,
  image_url: null,
  created_at: '2026-07-01T09:00:00.000Z',
  updated_at: '2026-07-01T09:00:00.000Z',
};

const BASE_HOOK = {
  loading: false,
  error: null,
  createEvent: jest.fn(),
  updateEvent: jest.fn(),
  deleteEvent: jest.fn(),
  refresh: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('EventsListScreen', () => {
  it('renders event titles for admin', async () => {
    mockUseSession.mockReturnValue({ session: { userId: 'user-1', role: 'admin' } });
    mockUseEvents.mockReturnValue({ ...BASE_HOOK, events: [EVENT] });

    render(<EventsListScreen />);

    await waitFor(() => {
      expect(screen.getByText('Reunión de equipo')).toBeTruthy();
    });
  });

  it('redirects staff — renders nothing', () => {
    mockUseSession.mockReturnValue({ session: { userId: 'user-3', role: 'staff' } });
    mockUseEvents.mockReturnValue({ ...BASE_HOOK, events: [] });

    const { toJSON } = render(<EventsListScreen />);
    expect(toJSON()).toBeNull();
  });

  it('shows empty state when no events', async () => {
    mockUseSession.mockReturnValue({ session: { userId: 'user-1', role: 'admin' } });
    mockUseEvents.mockReturnValue({ ...BASE_HOOK, events: [] });

    render(<EventsListScreen />);

    await waitFor(() => {
      expect(screen.getByText('No hay eventos este mes.')).toBeTruthy();
    });
  });
});
