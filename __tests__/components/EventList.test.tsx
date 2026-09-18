import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { EventList } from '@/components/EventList';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockUseEventsInRange = jest.fn();
const mockUseSession = jest.fn();
const mockPush = jest.fn();

jest.mock('@/hooks/useEventsInRange', () => ({
  useEventsInRange: () => mockUseEventsInRange(),
}));

jest.mock('@/hooks/useSession', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function localISO(y: number, m: number, d: number, h = 0, min = 0): string {
  return new Date(y, m - 1, d, h, min, 0, 0).toISOString();
}

const EVENT_A = {
  id: 'event-1',
  title: 'Reunión de equipo',
  event_start_at: localISO(2026, 8, 12, 9),
  event_end_at: localISO(2026, 8, 12, 10),
  all_day: false,
  color_tag: 'brown' as const,
  location: 'Sala principal',
};

const EVENT_B = {
  ...EVENT_A,
  id: 'event-2',
  title: 'Formación',
  event_start_at: localISO(2026, 8, 13, 12),
  event_end_at: localISO(2026, 8, 13, 13),
  color_tag: 'sea' as const,
};

const FROM = new Date(2026, 7, 12, 0, 0, 0, 0);
const TO = new Date(2026, 7, 13, 23, 59, 59, 999);

const BASE = { loading: false, error: null, refetch: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSession.mockReturnValue({ session: { userId: 'u1', role: 'staff' } });
});

describe('EventList', () => {
  it('muestra el skeleton mientras carga', () => {
    mockUseEventsInRange.mockReturnValue({ ...BASE, loading: true, events: [] });
    render(<EventList from={FROM} to={TO} groupBy="none" />);
    expect(screen.getByLabelText('Cargando eventos')).toBeTruthy();
  });

  it('muestra error con botón Reintentar que llama a refetch', () => {
    const refetch = jest.fn();
    mockUseEventsInRange.mockReturnValue({ ...BASE, error: new Error('boom'), events: [], refetch });
    render(<EventList from={FROM} to={TO} groupBy="none" />);

    expect(screen.getByText('No se pudieron cargar los eventos.')).toBeTruthy();
    fireEvent.press(screen.getByText('Reintentar'));
    expect(refetch).toHaveBeenCalled();
  });

  it('estado vacío: CTA "Crear evento" solo para admin/manager', () => {
    mockUseEventsInRange.mockReturnValue({ ...BASE, events: [] });

    mockUseSession.mockReturnValue({ session: { userId: 'u1', role: 'staff' } });
    const { rerender } = render(<EventList from={FROM} to={TO} groupBy="none" />);
    expect(screen.getByText('No hay eventos en este periodo.')).toBeTruthy();
    expect(screen.queryByText('Crear evento')).toBeNull();

    mockUseSession.mockReturnValue({ session: { userId: 'u1', role: 'manager' } });
    rerender(<EventList from={FROM} to={TO} groupBy="none" />);
    expect(screen.getByText('Crear evento')).toBeTruthy();
  });

  it('groupBy none: lista los eventos', () => {
    mockUseEventsInRange.mockReturnValue({ ...BASE, events: [EVENT_A, EVENT_B] });
    render(<EventList from={FROM} to={TO} groupBy="none" />);
    expect(screen.getByText('Reunión de equipo')).toBeTruthy();
    expect(screen.getByText('Formación')).toBeTruthy();
  });

  it('groupBy day: agrupa por día sin warnings de claves (incluye multi-día)', () => {
    const multiDay = {
      ...EVENT_A,
      id: 'event-3',
      title: 'Feria',
      event_start_at: localISO(2026, 8, 12, 20),
      event_end_at: localISO(2026, 8, 14, 2),
    };
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockUseEventsInRange.mockReturnValue({ ...BASE, events: [EVENT_A, EVENT_B, multiDay] });

    render(<EventList from={FROM} to={TO} groupBy="day" />);

    expect(screen.getByText('Reunión de equipo')).toBeTruthy();
    // La feria multi-día aparece en 3 secciones (12, 13, 14) sin warning de key.
    expect(screen.getAllByText('Feria')).toHaveLength(3);
    const keyWarning = errorSpy.mock.calls.find((c) => String(c[0]).toLowerCase().includes('key'));
    expect(keyWarning).toBeUndefined();
    errorSpy.mockRestore();
  });

  it('al pulsar un evento navega al detalle (o usa onPressEvent)', () => {
    mockUseEventsInRange.mockReturnValue({ ...BASE, events: [EVENT_A] });

    const onPressEvent = jest.fn();
    const { rerender } = render(
      <EventList from={FROM} to={TO} groupBy="none" onPressEvent={onPressEvent} />,
    );
    fireEvent.press(screen.getByText('Reunión de equipo'));
    expect(onPressEvent).toHaveBeenCalledWith('event-1');

    rerender(<EventList from={FROM} to={TO} groupBy="none" />);
    fireEvent.press(screen.getByText('Reunión de equipo'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/(tabs)/calendario/event-1');
  });
});
