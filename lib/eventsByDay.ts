import { EVENT_COLOR_META } from '@/lib/eventColors';
import type { Event } from '@/lib/types';

// Máximo de puntos de color por día; a partir de aquí se muestra "+N".
export const MAX_DOTS = 3;

export type EventsByDay = Record<string, Event[]>;

// Subconjunto tipado del marcado de react-native-calendars que usamos (la lib no
// re-exporta MarkedDates desde su raíz).
export type DayMarking = {
  dots?: { key: string; color: string }[];
  selected?: boolean;
  accessibilityLabel?: string;
};
export type MarkedDates = Record<string, DayMarking>;

// Clave de día en hora local del dispositivo (YYYY-MM-DD), coherente con lo que
// el usuario ve en el calendario.
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Agrupa eventos por día local, expandiendo los multi-día a cada día que cubren.
// El rango es [event_start_at, event_end_at): el último día visible es el de
// (event_end_at - 1ms), de modo que un fin exactamente a medianoche no pinta el
// día siguiente y un all_day (…23:59:59.999) queda en su propio día.
// Cada día se ordena por event_start_at ascendente.
export function eventsByDay(events: Event[]): EventsByDay {
  const byDay: EventsByDay = {};

  for (const event of events) {
    const start = new Date(event.event_start_at);
    const lastDay = new Date(new Date(event.event_end_at).getTime() - 1);

    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const end = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate());

    while (cursor <= end) {
      const key = dayKey(cursor);
      (byDay[key] ??= []).push(event);
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  for (const day of Object.values(byDay)) {
    day.sort((a, b) => a.event_start_at.localeCompare(b.event_start_at));
  }

  return byDay;
}

// Hasta MAX_DOTS puntos de color (hex de la paleta de DESIGN.md vía eventColors).
export function dayDots(dayEvents: Event[]): { key: string; color: string }[] {
  return dayEvents.slice(0, MAX_DOTS).map((e, i) => ({
    key: `${e.id}-${i}`,
    color: EVENT_COLOR_META[e.color_tag].hex,
  }));
}

// Nº de eventos que exceden MAX_DOTS (el "+N"); 0 si no hay overflow.
export function overflowCount(dayEvents: Event[]): number {
  return Math.max(0, dayEvents.length - MAX_DOTS);
}

// Construye el marcado de react-native-calendars: dots por día + día seleccionado
// + accessibilityLabel resumen ("12 de marzo, 2 eventos").
export function markedDatesFor(byDay: EventsByDay, selectedDate: string): MarkedDates {
  const marked: MarkedDates = {};

  for (const [key, dayEvents] of Object.entries(byDay)) {
    marked[key] = {
      dots: dayDots(dayEvents),
      accessibilityLabel: dayAccessibilityLabel(key, dayEvents.length),
    };
  }

  marked[selectedDate] = { ...(marked[selectedDate] ?? {}), selected: true };

  return marked;
}

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// "12 de marzo, 2 eventos" (o "sin eventos"). Espera key 'YYYY-MM-DD'.
export function dayAccessibilityLabel(key: string, count: number): string {
  const [, month, day] = key.split('-');
  const dayNum = Number(day);
  const monthName = MONTHS_ES[Number(month) - 1] ?? '';
  const events = count === 0 ? 'sin eventos' : count === 1 ? '1 evento' : `${count} eventos`;
  return `${dayNum} de ${monthName}, ${events}`;
}
