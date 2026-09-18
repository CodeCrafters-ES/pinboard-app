import {
  chunk,
  EXPO_BATCH_SIZE,
  sendExpoBatch,
  type ExpoTicket,
  type PushTokenRow,
} from '../../supabase/functions/send-push/expo';
import { postMessage } from '../../supabase/functions/send-push/messages';

// Envío a la Expo Push API con `fetch` inyectado: cubre el troceado en lotes de 100 y
// el manejo de errores parciales sin tocar la red.

const MESSAGE = postMessage({ id: '11111111-1111-1111-1111-111111111111', title: 'Nuevo post' });

function tokens(count: number): PushTokenRow[] {
  return Array.from({ length: count }, (_, i) => ({
    token: `ExponentPushToken[${i}]`,
    user_id: `user-${i}`,
    platform: i % 2 === 0 ? 'ios' : 'android',
  }));
}

function okResponse(size: number): Response {
  const data: ExpoTicket[] = Array.from({ length: size }, (_, i) => ({
    status: 'ok',
    id: `ticket-${i}`,
  }));
  return { ok: true, status: 200, json: async () => ({ data }) } as unknown as Response;
}

function bodyOf(call: unknown[]): Record<string, unknown>[] {
  const init = call[1] as RequestInit;
  return JSON.parse(init.body as string);
}

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

describe('chunk', () => {
  it('reparte en trozos del tamaño pedido', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('devuelve vacío para una lista vacía', () => {
    expect(chunk([], 10)).toEqual([]);
  });
});

describe('sendExpoBatch', () => {
  it('no llama a Expo cuando no hay destinatarios', async () => {
    const fetchImpl = jest.fn();

    const result = await sendExpoBatch({ tokens: [], message: MESSAGE, fetchImpl });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toEqual({ sent_count: 0, failed_count: 0, tickets: [] });
  });

  it('envía un único batch con todos los tokens y el mensaje compuesto', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(okResponse(3));

    const result = await sendExpoBatch({ tokens: tokens(3), message: MESSAGE, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const sent = bodyOf(fetchImpl.mock.calls[0]!);
    expect(sent).toHaveLength(3);
    expect(sent[0]).toEqual({
      to: 'ExponentPushToken[0]',
      sound: 'default',
      title: 'Nuevo post',
      body: 'Nuevo post',
      data: { type: 'post', id: '11111111-1111-1111-1111-111111111111' },
      channelId: 'general',
      priority: 'default',
    });
    expect(result.sent_count).toBe(3);
  });

  it('trocea en lotes de 100', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(okResponse(EXPO_BATCH_SIZE))
      .mockResolvedValueOnce(okResponse(EXPO_BATCH_SIZE))
      .mockResolvedValueOnce(okResponse(50));

    const result = await sendExpoBatch({ tokens: tokens(250), message: MESSAGE, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(bodyOf(fetchImpl.mock.calls[0]!)).toHaveLength(EXPO_BATCH_SIZE);
    expect(bodyOf(fetchImpl.mock.calls[2]!)).toHaveLength(50);
    expect(result.sent_count).toBe(250);
    expect(result.failed_count).toBe(0);
  });

  it('asocia cada ticket con su token', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { status: 'ok', id: 'ticket-0' },
          { status: 'error', message: 'DeviceNotRegistered', details: { error: 'DeviceNotRegistered' } },
        ],
      }),
    } as unknown as Response);

    const result = await sendExpoBatch({ tokens: tokens(2), message: MESSAGE, fetchImpl });

    expect(result).toMatchObject({ sent_count: 1, failed_count: 1 });
    expect(result.tickets[1]).toMatchObject({
      status: 'error',
      token: 'ExponentPushToken[1]',
      details: { error: 'DeviceNotRegistered' },
    });
  });

  // Un incidente a mitad de tanda no puede dejar sin notificación al resto.
  it('sigue con los demás lotes si uno falla por red', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(okResponse(EXPO_BATCH_SIZE))
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValueOnce(okResponse(50));

    const result = await sendExpoBatch({ tokens: tokens(250), message: MESSAGE, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.sent_count).toBe(150);
    expect(result.failed_count).toBe(100);
  });

  it('cuenta como fallido un lote que Expo rechaza con error HTTP', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) } as unknown as Response)
      .mockResolvedValueOnce(okResponse(20));

    const result = await sendExpoBatch({ tokens: tokens(120), message: MESSAGE, fetchImpl });

    expect(result.sent_count).toBe(20);
    expect(result.failed_count).toBe(EXPO_BATCH_SIZE);
  });

  it('trata como fallo un ticket que Expo no devuelve', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ status: 'ok', id: 'ticket-0' }] }),
    } as unknown as Response);

    const result = await sendExpoBatch({ tokens: tokens(2), message: MESSAGE, fetchImpl });

    expect(result).toMatchObject({ sent_count: 1, failed_count: 1 });
    expect(result.tickets[1]).toMatchObject({ status: 'error', message: 'missing ticket' });
  });

  it('despacha 200 tokens en mucho menos de 2s de trabajo propio', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(okResponse(EXPO_BATCH_SIZE));

    const startedAt = Date.now();
    await sendExpoBatch({ tokens: tokens(200), message: MESSAGE, fetchImpl });

    expect(Date.now() - startedAt).toBeLessThan(2000);
  });
});
