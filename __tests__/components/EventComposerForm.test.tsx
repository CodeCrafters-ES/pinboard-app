import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { EventComposerForm } from '@/components/EventComposerForm';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPickAndUpload = jest.fn();

jest.mock('@/hooks/useEventImageUpload', () => ({
  useEventImageUpload: () => ({ pickAndUpload: mockPickAndUpload, isUploading: false }),
}));

jest.mock('expo-image', () => ({
  Image: () => null,
}));

const VALID_INITIAL = {
  title: 'Reunión de equipo',
  all_day: false,
  event_start_at: '2026-08-01T09:00:00.000Z',
  event_end_at: '2026-08-01T10:00:00.000Z',
  color_tag: 'brown' as const,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('EventComposerForm', () => {
  it('renders the submit label', () => {
    render(
      <EventComposerForm
        authorId="user-1"
        onSubmit={jest.fn()}
        submitLabel="Crear evento"
        saving={false}
      />,
    );
    expect(screen.getByLabelText('Crear evento')).toBeTruthy();
  });

  it('does not submit an empty form and shows a validation error', async () => {
    const onSubmit = jest.fn();
    render(
      <EventComposerForm
        authorId="user-1"
        onSubmit={onSubmit}
        submitLabel="Crear evento"
        saving={false}
      />,
    );

    fireEvent.press(screen.getByLabelText('Crear evento'));

    await waitFor(() => {
      expect(screen.getByText('Fecha/hora de inicio no válida')).toBeTruthy();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits parsed data when initial values are valid', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <EventComposerForm
        authorId="user-1"
        initialValues={VALID_INITIAL}
        onSubmit={onSubmit}
        submitLabel="Guardar cambios"
        saving={false}
      />,
    );

    fireEvent.press(screen.getByLabelText('Guardar cambios'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Reunión de equipo', color_tag: 'brown', all_day: false }),
      );
    });
  });

  it('renders a delete button only when onDelete is provided', () => {
    const { rerender } = render(
      <EventComposerForm
        authorId="user-1"
        onSubmit={jest.fn()}
        submitLabel="Crear evento"
        saving={false}
      />,
    );
    expect(screen.queryByLabelText('Eliminar evento')).toBeNull();

    rerender(
      <EventComposerForm
        authorId="user-1"
        onSubmit={jest.fn()}
        onDelete={jest.fn()}
        submitLabel="Guardar cambios"
        saving={false}
      />,
    );
    expect(screen.getByLabelText('Eliminar evento')).toBeTruthy();
  });

  it('creates an all-day event, normalizing start to 00:00 and end to 23:59:59.999', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <EventComposerForm
        authorId="user-1"
        onSubmit={onSubmit}
        submitLabel="Crear evento"
        saving={false}
      />,
    );

    fireEvent.changeText(screen.getByPlaceholderText('Título del evento…'), 'Fiesta de verano');

    // Con el input de hora oculto (all_day), solo se rellenan las fechas.
    fireEvent(screen.getByLabelText('Todo el día'), 'valueChange', true);

    const [startDate, endDate] = screen.getAllByPlaceholderText('AAAA-MM-DD');
    fireEvent.changeText(startDate, '2026-08-01');
    fireEvent.changeText(endDate, '2026-08-01');

    fireEvent.press(screen.getByLabelText('Crear evento'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    const submitted = onSubmit.mock.calls[0][0];
    expect(submitted.all_day).toBe(true);
    // Inicio a medianoche local, fin al último ms del día local.
    expect(new Date(submitted.event_start_at).getHours()).toBe(0);
    expect(new Date(submitted.event_start_at).getMinutes()).toBe(0);
    expect(new Date(submitted.event_end_at).getHours()).toBe(23);
    expect(new Date(submitted.event_end_at).getMinutes()).toBe(59);
    expect(new Date(submitted.event_end_at) > new Date(submitted.event_start_at)).toBe(true);
  });
});
