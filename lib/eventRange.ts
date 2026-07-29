// Rangos temporales en la zona horaria del dispositivo (Europe/Madrid por
// defecto). Los límites usan `[from, to]` con `to` al final del día
// (23:59:59.999); el hook los consulta con `event_start_at < to` y
// `event_end_at > from`.

export type CalendarView = 'week' | 'month';
export type DateRange = { from: Date; to: Date };

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

// Día completo local del `anchor`.
export function getDayRange(anchor: Date): DateRange {
  return { from: startOfDay(anchor), to: endOfDay(anchor) };
}

// Rango de la vista: semana (lunes 00:00 → domingo 23:59:59.999) o mes
// (día 1 00:00 → último día 23:59:59.999), en hora local.
export function getRangeForView(view: CalendarView, anchor: Date): DateRange {
  if (view === 'week') {
    const daysSinceMonday = (anchor.getDay() + 6) % 7; // getDay(): 0=domingo
    const monday = new Date(
      anchor.getFullYear(),
      anchor.getMonth(),
      anchor.getDate() - daysSinceMonday,
      0, 0, 0, 0,
    );
    const sunday = new Date(
      monday.getFullYear(),
      monday.getMonth(),
      monday.getDate() + 6,
      23, 59, 59, 999,
    );
    return { from: monday, to: sunday };
  }

  const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 0, 0, 0, 0);
  // Día 0 del mes siguiente = último día del mes del anchor.
  const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to };
}
