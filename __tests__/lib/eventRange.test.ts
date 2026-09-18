import { getRangeForView, getDayRange } from '@/lib/eventRange';

// Fechas construidas en hora local para ser deterministas en cualquier TZ.
// 2026-08-12 es miércoles.
const WED = new Date(2026, 7, 12, 15, 30);

describe('getRangeForView', () => {
  it('week: lunes 00:00 → domingo 23:59:59.999', () => {
    const { from, to } = getRangeForView('week', WED);
    // Lunes de esa semana = 2026-08-10, domingo = 2026-08-16.
    expect(from).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 7, 16, 23, 59, 59, 999));
  });

  it('week: un domingo ancla en el lunes anterior', () => {
    const sunday = new Date(2026, 7, 16, 10, 0); // domingo
    const { from, to } = getRangeForView('week', sunday);
    expect(from).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 7, 16, 23, 59, 59, 999));
  });

  it('month: día 1 00:00 → último día 23:59:59.999', () => {
    const { from, to } = getRangeForView('month', WED);
    expect(from).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999));
  });

  it('month: febrero (28 días en 2026)', () => {
    const { from, to } = getRangeForView('month', new Date(2026, 1, 15));
    expect(from).toEqual(new Date(2026, 1, 1, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 1, 28, 23, 59, 59, 999));
  });
});

describe('getDayRange', () => {
  it('devuelve inicio y fin del día local', () => {
    const { from, to } = getDayRange(WED);
    expect(from).toEqual(new Date(2026, 7, 12, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 7, 12, 23, 59, 59, 999));
  });
});
