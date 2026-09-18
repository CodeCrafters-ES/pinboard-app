import { currentMonthRangeMadrid, currentWeekRangeMadrid } from '@/lib/gamification/dateRange';

// Los instantes esperados están comprobados contra Intl de forma independiente:
// p. ej. 2026-08-02T22:00:00Z es «lunes, 3 de agosto de 2026, 0:00:00 CEST».
// Madrid va +2 en verano (CEST) y +1 en invierno (CET).

describe('currentWeekRangeMadrid', () => {
  it('devuelve lunes 00:00 → lunes siguiente 00:00 en horario de verano', () => {
    // Jueves 6 de agosto de 2026, 12:00 Madrid.
    const { start, end } = currentWeekRangeMadrid(new Date('2026-08-06T10:00:00Z'));

    expect(start.toISOString()).toBe('2026-08-02T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-09T22:00:00.000Z');
  });

  it('aplica el offset de invierno (CET) en la misma lógica', () => {
    // Jueves 15 de enero de 2026.
    const { start } = currentWeekRangeMadrid(new Date('2026-01-15T12:00:00Z'));

    expect(start.toISOString()).toBe('2026-01-11T23:00:00.000Z');
  });

  it('mantiene el domingo dentro de su semana, no en la siguiente', () => {
    // Domingo 9 de agosto de 2026, 23:30 Madrid — último día de la ventana.
    const { start, end } = currentWeekRangeMadrid(new Date('2026-08-09T21:30:00Z'));

    expect(start.toISOString()).toBe('2026-08-02T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-09T22:00:00.000Z');
  });

  it('usa el día de la semana de Madrid, no el de UTC', () => {
    // 2026-08-09T22:30:00Z todavía es domingo en UTC pero ya es lunes en Madrid:
    // la semana tiene que ser la nueva. Es el caso que rompería usar la hora del
    // dispositivo si estuviera configurado en UTC.
    const { start, end } = currentWeekRangeMadrid(new Date('2026-08-09T22:30:00Z'));

    expect(start.toISOString()).toBe('2026-08-09T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-16T22:00:00.000Z');
  });

  it('el fin es exclusivo y encadena con el inicio de la semana siguiente', () => {
    const current = currentWeekRangeMadrid(new Date('2026-08-06T10:00:00Z'));
    const next = currentWeekRangeMadrid(new Date('2026-08-12T10:00:00Z'));

    expect(current.end.toISOString()).toBe(next.start.toISOString());
  });
});

describe('currentMonthRangeMadrid', () => {
  it('cubre el mes natural en horario de verano', () => {
    const { start, end } = currentMonthRangeMadrid(new Date('2026-08-06T10:00:00Z'));

    expect(start.toISOString()).toBe('2026-07-31T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-31T22:00:00.000Z');
  });

  it('cubre el mes natural en horario de invierno', () => {
    const { start, end } = currentMonthRangeMadrid(new Date('2026-01-15T12:00:00Z'));

    expect(start.toISOString()).toBe('2025-12-31T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-01-31T23:00:00.000Z');
  });

  it('cruza el cambio de año en diciembre', () => {
    const { start, end } = currentMonthRangeMadrid(new Date('2026-12-15T12:00:00Z'));

    expect(start.toISOString()).toBe('2026-11-30T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-12-31T23:00:00.000Z');
  });

  it('un mes que contiene el cambio a horario de verano empieza y acaba en offsets distintos', () => {
    // Marzo 2026: empieza en CET (+1) y termina ya en CEST (+2).
    const { start, end } = currentMonthRangeMadrid(new Date('2026-03-15T12:00:00Z'));

    expect(start.toISOString()).toBe('2026-02-28T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-31T22:00:00.000Z');
  });
});
