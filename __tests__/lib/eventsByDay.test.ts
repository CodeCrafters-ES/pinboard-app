import {
  eventsByDay,
  dayDots,
  overflowCount,
  markedDatesFor,
  dayAccessibilityLabel,
  MAX_DOTS,
} from '@/lib/eventsByDay';
import { EVENT_COLOR_META } from '@/lib/eventColors';
import type { Event, EventColor } from '@/lib/types';

// Fechas construidas en hora local (new Date(y, m, d, …)) y claves derivadas con
// los mismos componentes locales: el test es determinista en cualquier TZ.
function localISO(y: number, m: number, d: number, h = 0, min = 0): string {
  return new Date(y, m - 1, d, h, min, 0, 0).toISOString();
}

function makeEvent(overrides: Partial<Event> & { id: string }): Event {
  return {
    author_id: 'user-1',
    title: 'Evento',
    description: null,
    location: null,
    all_day: false,
    color_tag: 'brown',
    image_url: null,
    event_start_at: localISO(2026, 8, 1, 9),
    event_end_at: localISO(2026, 8, 1, 10),
    created_at: localISO(2026, 7, 1),
    updated_at: localISO(2026, 7, 1),
    ...overrides,
  };
}

describe('eventsByDay', () => {
  it('agrupa un evento de un solo día', () => {
    const e = makeEvent({ id: 'a' });
    expect(eventsByDay([e])).toEqual({ '2026-08-01': [e] });
  });

  it('expande eventos multi-día a cada día cubierto', () => {
    const e = makeEvent({
      id: 'a',
      event_start_at: localISO(2026, 8, 1, 20),
      event_end_at: localISO(2026, 8, 3, 2),
    });
    const byDay = eventsByDay([e]);
    expect(Object.keys(byDay).sort()).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
  });

  it('un fin exactamente a medianoche no pinta el día siguiente (rango semiabierto)', () => {
    const e = makeEvent({
      id: 'a',
      event_start_at: localISO(2026, 8, 1, 10),
      event_end_at: localISO(2026, 8, 2, 0),
    });
    expect(Object.keys(eventsByDay([e]))).toEqual(['2026-08-01']);
  });

  it('ordena los eventos de cada día por event_start_at', () => {
    const late = makeEvent({ id: 'late', event_start_at: localISO(2026, 8, 1, 18) });
    const early = makeEvent({ id: 'early', event_start_at: localISO(2026, 8, 1, 8) });
    const byDay = eventsByDay([late, early]);
    expect(byDay['2026-08-01']!.map((e) => e.id)).toEqual(['early', 'late']);
  });
});

describe('dayDots / overflowCount', () => {
  it('mapea cada color_tag a su hex de la paleta', () => {
    const colors: EventColor[] = ['brown', 'sea', 'sage', 'amber', 'parchment'];
    for (const color of colors) {
      const dot = dayDots([makeEvent({ id: color, color_tag: color })])[0]!;
      expect(dot.color).toBe(EVENT_COLOR_META[color].hex);
    }
  });

  it('limita a MAX_DOTS puntos y calcula el "+N"', () => {
    const many = Array.from({ length: 5 }, (_, i) => makeEvent({ id: `e${i}` }));
    expect(dayDots(many)).toHaveLength(MAX_DOTS);
    expect(overflowCount(many)).toBe(5 - MAX_DOTS);
  });

  it('no hay overflow con MAX_DOTS o menos', () => {
    const few = Array.from({ length: MAX_DOTS }, (_, i) => makeEvent({ id: `e${i}` }));
    expect(overflowCount(few)).toBe(0);
  });
});

describe('markedDatesFor', () => {
  it('marca el día seleccionado y añade dots + accessibilityLabel', () => {
    const byDay = eventsByDay([makeEvent({ id: 'a' }), makeEvent({ id: 'b' })]);
    const marked = markedDatesFor(byDay, '2026-08-01');
    expect(marked['2026-08-01']!.selected).toBe(true);
    expect(marked['2026-08-01']!.dots).toHaveLength(2);
    expect(marked['2026-08-01']!.accessibilityLabel).toBe('1 de agosto, 2 eventos');
  });

  it('marca como seleccionado un día sin eventos', () => {
    const marked = markedDatesFor({}, '2026-08-15');
    expect(marked['2026-08-15']!.selected).toBe(true);
  });
});

describe('dayAccessibilityLabel', () => {
  it('formatea singular, plural y vacío', () => {
    expect(dayAccessibilityLabel('2026-03-12', 2)).toBe('12 de marzo, 2 eventos');
    expect(dayAccessibilityLabel('2026-03-12', 1)).toBe('12 de marzo, 1 evento');
    expect(dayAccessibilityLabel('2026-03-12', 0)).toBe('12 de marzo, sin eventos');
  });
});
