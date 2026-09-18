import { parsePushTarget, routeForTarget } from '@/lib/notifications/pushTarget';

// Parseo del payload de deep-linking (ADR-003) y mapa de rutas. El `data` de una
// notificación viene de fuera: cualquier forma inesperada debe dar null, nunca lanzar.

const ID = '11111111-1111-1111-1111-111111111111';

describe('parsePushTarget', () => {
  it.each(['post', 'event', 'chat'] as const)('acepta el tipo %s', (type) => {
    expect(parsePushTarget({ type, id: ID })).toEqual({ type, id: ID });
  });

  it('ignora los campos de más', () => {
    expect(parsePushTarget({ type: 'post', id: ID, extra: 'x' })).toEqual({
      type: 'post',
      id: ID,
    });
  });

  it.each([
    ['tipo desconocido', { type: 'invoice', id: ID }],
    ['id que no es uuid', { type: 'post', id: '42' }],
    ['sin id', { type: 'post' }],
    ['sin type', { id: ID }],
    ['objeto vacío', {}],
    ['null', null],
    ['undefined', undefined],
    ['cadena', 'post'],
    ['id numérico', { type: 'post', id: 42 }],
  ])('devuelve null ante %s', (_caso, data) => {
    expect(parsePushTarget(data)).toBeNull();
  });
});

describe('routeForTarget', () => {
  it('lleva un post al detalle del tablón', () => {
    expect(routeForTarget({ type: 'post', id: ID })).toBe(`/(app)/(tabs)/tablon/${ID}`);
  });

  it('lleva un evento al detalle de la agenda', () => {
    expect(routeForTarget({ type: 'event', id: ID })).toBe(`/(app)/(tabs)/calendario/${ID}`);
  });

  // La pantalla existe desde F-N07-03; el payload solo trae el chatId, que es lo
  // único que la ruta necesita.
  it('lleva un chat a su hilo', () => {
    expect(routeForTarget({ type: 'chat', id: ID })).toBe(`/(app)/(tabs)/chat/${ID}`);
  });
});
