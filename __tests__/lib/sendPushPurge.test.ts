import {
  enqueueReceipts,
  processTickets,
  purgeTokens,
  type PurgeDb,
} from '../../supabase/functions/_shared/push/purge';
import {
  classifyTickets,
  receiptsToTickets,
  type ExpoTicket,
} from '../../supabase/functions/_shared/push/tickets';

// Clasificación de acuses de Expo y borrado de tokens inválidos (I-F-N06-02-03).
// Módulos puros con el cliente Supabase inyectado: no hace falta base ni red.

function ticket(overrides: Partial<ExpoTicket> = {}): ExpoTicket {
  return {
    status: 'ok',
    id: 'ticket-1',
    token: 'ExponentPushToken[abc]',
    user_id: 'user-1',
    ...overrides,
  };
}

function errorTicket(error: string, overrides: Partial<ExpoTicket> = {}): ExpoTicket {
  return ticket({ status: 'error', id: undefined, message: error, details: { error }, ...overrides });
}

// Doble del cliente Supabase que registra los borrados y los encolados.
function fakeDb() {
  const deleted: { user_id: string; token: string }[] = [];
  const inserted: unknown[][] = [];
  let deleteError: { message: string } | null = null;

  const db: PurgeDb = {
    from(table: 'push_tokens' | 'push_receipts_pending') {
      if (table === 'push_receipts_pending') {
        return {
          insert: (rows: unknown[]) => {
            inserted.push(rows);
            return Promise.resolve({ error: null });
          },
        };
      }
      return {
        delete: () => ({
          eq: (_c: 'user_id', user_id: string) => ({
            eq: (_c2: 'token', token: string) => {
              if (!deleteError) deleted.push({ user_id, token });
              return Promise.resolve({ error: deleteError });
            },
          }),
        }),
      };
    },
  } as PurgeDb;

  return {
    db,
    deleted,
    inserted,
    failDeletes: (message: string) => {
      deleteError = { message };
    },
  };
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('classifyTickets', () => {
  it('marca DeviceNotRegistered para purga', () => {
    const { purge } = classifyTickets([errorTicket('DeviceNotRegistered')]);

    expect(purge).toEqual([{ user_id: 'user-1', token: 'ExponentPushToken[abc]' }]);
  });

  it('marca InvalidCredentials para purga', () => {
    const { purge } = classifyTickets([errorTicket('InvalidCredentials')]);

    expect(purge).toHaveLength(1);
  });

  // El token es válido: el problema fue el mensaje o el ritmo de envío.
  it.each(['MessageTooBig', 'MessageRateExceeded'])('conserva el token ante %s', (error) => {
    const { purge, transient } = classifyTickets([errorTicket(error)]);

    expect(purge).toHaveLength(0);
    expect(transient).toEqual([{ token: 'ExponentPushToken[abc]', error }]);
  });

  // Ante un código nuevo de Expo, no purgar: reenviar es más barato que perder el token.
  it('no purga ante un error desconocido', () => {
    const { purge, unknown } = classifyTickets([errorTicket('SomethingBrandNew')]);

    expect(purge).toHaveLength(0);
    expect(unknown).toEqual([{ token: 'ExponentPushToken[abc]', error: 'SomethingBrandNew' }]);
  });

  it('deja los aceptados pendientes de receipt', () => {
    const { pending } = classifyTickets([ticket()]);

    expect(pending).toEqual([
      { ticket_id: 'ticket-1', user_id: 'user-1', token: 'ExponentPushToken[abc]' },
    ]);
  });

  it('ignora un aceptado sin ticketId: no hay receipt que consultar', () => {
    const { pending } = classifyTickets([ticket({ id: undefined })]);

    expect(pending).toHaveLength(0);
  });

  it('ignora tickets sin el par (user_id, token)', () => {
    const { purge } = classifyTickets([errorTicket('DeviceNotRegistered', { user_id: undefined })]);

    expect(purge).toHaveLength(0);
  });
});

describe('receiptsToTickets', () => {
  const pending = [
    { ticket_id: 't1', user_id: 'user-1', token: 'ExponentPushToken[a]' },
    { ticket_id: 't2', user_id: 'user-2', token: 'ExponentPushToken[b]' },
  ];

  it('recupera el par del token a partir del ticketId', () => {
    const tickets = receiptsToTickets(
      { t2: { status: 'error', details: { error: 'DeviceNotRegistered' } } },
      pending,
    );

    expect(tickets).toEqual([
      {
        status: 'error',
        id: 't2',
        message: undefined,
        details: { error: 'DeviceNotRegistered' },
        token: 'ExponentPushToken[b]',
        user_id: 'user-2',
      },
    ]);
  });

  it('descarta receipts de tickets que no están en la cola', () => {
    expect(receiptsToTickets({ desconocido: { status: 'ok' } }, pending)).toEqual([]);
  });
});

describe('purgeTokens', () => {
  it('borra por par (user_id, token), no solo por token', async () => {
    const { db, deleted } = fakeDb();

    const purged = await purgeTokens(db, [
      { user_id: 'user-1', token: 'ExponentPushToken[a]' },
      { user_id: 'user-2', token: 'ExponentPushToken[b]' },
    ]);

    expect(purged).toBe(2);
    expect(deleted).toEqual([
      { user_id: 'user-1', token: 'ExponentPushToken[a]' },
      { user_id: 'user-2', token: 'ExponentPushToken[b]' },
    ]);
  });

  it('no toca la base si no hay nada que purgar', async () => {
    const { db, deleted } = fakeDb();

    await expect(purgeTokens(db, [])).resolves.toBe(0);
    expect(deleted).toHaveLength(0);
  });

  it('no rompe el flujo si el borrado falla', async () => {
    const fake = fakeDb();
    fake.failDeletes('permission denied');

    await expect(
      purgeTokens(fake.db, [{ user_id: 'user-1', token: 'ExponentPushToken[a]' }]),
    ).resolves.toBe(0);
  });
});

describe('enqueueReceipts', () => {
  it('inserta los pendientes en una sola llamada', async () => {
    const { db, inserted } = fakeDb();
    const pending = [{ ticket_id: 't1', user_id: 'user-1', token: 'ExponentPushToken[a]' }];

    await expect(enqueueReceipts(db, pending)).resolves.toBe(1);
    expect(inserted).toEqual([pending]);
  });

  it('no inserta nada con la lista vacía', async () => {
    const { db, inserted } = fakeDb();

    await expect(enqueueReceipts(db, [])).resolves.toBe(0);
    expect(inserted).toHaveLength(0);
  });
});

describe('processTickets', () => {
  it('purga, encola y resume por motivos', async () => {
    const { db, deleted, inserted } = fakeDb();

    const summary = await processTickets(db, [
      ticket({ id: 'ok-1' }),
      errorTicket('DeviceNotRegistered', { token: 'ExponentPushToken[dead]' }),
      errorTicket('MessageTooBig', { token: 'ExponentPushToken[big]' }),
    ]);

    expect(summary.purged_count).toBe(1);
    expect(summary.enqueued_count).toBe(1);
    expect(summary.reasons).toEqual({ purged: 1, MessageTooBig: 1 });
    expect(deleted).toEqual([{ user_id: 'user-1', token: 'ExponentPushToken[dead]' }]);
    expect(inserted[0]).toHaveLength(1);
  });

  it('resume en cero cuando todo fue bien y no había ticketId', async () => {
    const { db } = fakeDb();

    const summary = await processTickets(db, [ticket({ id: undefined })]);

    expect(summary).toEqual({ purged_count: 0, enqueued_count: 0, reasons: {} });
  });
});
