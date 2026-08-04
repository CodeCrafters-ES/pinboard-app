/**
 * Integration test — requires local Supabase running:
 *   npx supabase start
 *
 * Run with: npx jest --testPathPattern="integration/pushReceipts" --no-coverage
 *
 * Drenaje de la cola de receipts (I-F-N06-02-03) contra la base real: purga de los
 * tokens que Expo da por perdidos, respeto por los dispositivos sanos del mismo
 * usuario y limpieza de la cola. Expo se sustituye por un doble de `fetch`; lo que se
 * comprueba aquí son las queries y los GRANTs de service_role.
 */
import { createClient } from '@supabase/supabase-js';

import {
  processPendingReceipts,
  RECEIPT_DELAY_MS,
  RECEIPT_TTL_MS,
  type QueueDb,
  type ReceiptMap,
} from '../../supabase/functions/_shared/push/receipts';
import type { Database } from '@/lib/database.types';
import { withClockSkewRetry } from './_retry';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

jest.setTimeout(60000);

const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const MANAGER = { email: 'manager@nun-ibiza.dev', password: 'password123' };
const STAFF = { email: 'staff@nun-ibiza.dev', password: 'password123' };

const RUN_MARKER = `receipts_it_${Date.now()}`;

const managerClient = createClient<Database>(LOCAL_URL, LOCAL_ANON_KEY);
const staffClient = createClient<Database>(LOCAL_URL, LOCAL_ANON_KEY);
const adminClient = createClient<Database>(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY);

const db = adminClient as unknown as QueueDb;

function token(suffix: string): string {
  return `ExponentPushToken[${RUN_MARKER}-${suffix}]`;
}

/** Doble de la Expo Push API: devuelve el mapa de receipts que se le indique. */
function fakeExpo(receipts: ReceiptMap) {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: receipts }),
  } as unknown as Response);
}

/** `enqueued_at` en el pasado: la cola solo mira tickets ya vencidos. */
function dueAt(msAgo = RECEIPT_DELAY_MS + 60_000): string {
  return new Date(Date.now() - msAgo).toISOString();
}

describe('push receipts queue (integration)', () => {
  let managerUserId: string;
  let staffUserId: string;

  async function enqueue(ticketId: string, userId: string, deviceToken: string, at = dueAt()) {
    const { error } = await adminClient.from('push_receipts_pending').insert({
      ticket_id: `${RUN_MARKER}-${ticketId}`,
      user_id: userId,
      token: deviceToken,
      enqueued_at: at,
    });
    if (error) throw error;
    return `${RUN_MARKER}-${ticketId}`;
  }

  async function tokensOf(userId: string): Promise<string[]> {
    const { data, error } = await adminClient
      .from('push_tokens')
      .select('token')
      .eq('user_id', userId)
      .like('token', `%${RUN_MARKER}%`);
    if (error) throw error;
    return (data ?? []).map((r) => r.token);
  }

  async function queueSize(): Promise<number> {
    const { data, error } = await adminClient
      .from('push_receipts_pending')
      .select('ticket_id')
      .like('ticket_id', `%${RUN_MARKER}%`);
    if (error) throw error;
    return (data ?? []).length;
  }

  beforeAll(async () => {
    await withClockSkewRetry(async () => {
      const mgr = await managerClient.auth.signInWithPassword(MANAGER);
      if (mgr.error) throw mgr.error;
      const stf = await staffClient.auth.signInWithPassword(STAFF);
      if (stf.error) throw stf.error;
      managerUserId = mgr.data.user!.id;
      staffUserId = stf.data.user!.id;
    });
  });

  beforeEach(async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Cada usuario registra sus propios tokens: service_role no tiene INSERT.
    const rows = [
      { client: staffClient, user_id: staffUserId, token: token('staff-phone') },
      { client: staffClient, user_id: staffUserId, token: token('staff-tablet') },
      { client: managerClient, user_id: managerUserId, token: token('manager-phone') },
    ];
    for (const row of rows) {
      const { error } = await row.client
        .from('push_tokens')
        .upsert(
          { user_id: row.user_id, token: row.token, platform: 'android' },
          { onConflict: 'user_id,token' },
        );
      if (error) throw error;
    }
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await adminClient.from('push_receipts_pending').delete().like('ticket_id', `%${RUN_MARKER}%`);
    await adminClient.from('push_tokens').delete().like('token', `%${RUN_MARKER}%`);
  });

  it('purga el token cuyo receipt trae DeviceNotRegistered', async () => {
    const ticketId = await enqueue('t1', staffUserId, token('staff-phone'));
    const fetchImpl = fakeExpo({
      [ticketId]: { status: 'error', details: { error: 'DeviceNotRegistered' } },
    });

    const summary = await processPendingReceipts(db, { fetchImpl, url: 'http://expo.test' });

    expect(summary.purged_count).toBe(1);
    expect(await tokensOf(staffUserId)).toEqual([token('staff-tablet')]);
  });

  it('purga también con InvalidCredentials', async () => {
    const ticketId = await enqueue('t2', managerUserId, token('manager-phone'));
    const fetchImpl = fakeExpo({
      [ticketId]: { status: 'error', details: { error: 'InvalidCredentials' } },
    });

    const summary = await processPendingReceipts(db, { fetchImpl, url: 'http://expo.test' });

    expect(summary.purged_count).toBe(1);
    expect(await tokensOf(managerUserId)).toHaveLength(0);
  });

  // El AC lo pide explícito: un dispositivo caído no puede llevarse los demás.
  it('no toca los otros dispositivos del mismo usuario ni los de terceros', async () => {
    const ticketId = await enqueue('t3', staffUserId, token('staff-phone'));
    const fetchImpl = fakeExpo({
      [ticketId]: { status: 'error', details: { error: 'DeviceNotRegistered' } },
    });

    await processPendingReceipts(db, { fetchImpl, url: 'http://expo.test' });

    expect(await tokensOf(staffUserId)).toEqual([token('staff-tablet')]);
    expect(await tokensOf(managerUserId)).toEqual([token('manager-phone')]);
  });

  it('conserva el token ante MessageTooBig y lo saca de la cola', async () => {
    const ticketId = await enqueue('t4', staffUserId, token('staff-phone'));
    const fetchImpl = fakeExpo({
      [ticketId]: { status: 'error', details: { error: 'MessageTooBig' } },
    });

    const summary = await processPendingReceipts(db, { fetchImpl, url: 'http://expo.test' });

    expect(summary.purged_count).toBe(0);
    expect(summary.reasons).toEqual({ MessageTooBig: 1 });
    expect(await tokensOf(staffUserId)).toHaveLength(2);
    expect(await queueSize()).toBe(0);
  });

  it('vacía de la cola los receipts correctos', async () => {
    const ticketId = await enqueue('t5', staffUserId, token('staff-phone'));
    const fetchImpl = fakeExpo({ [ticketId]: { status: 'ok' } });

    const summary = await processPendingReceipts(db, { fetchImpl, url: 'http://expo.test' });

    expect(summary.processed).toBe(1);
    expect(await queueSize()).toBe(0);
    expect(await tokensOf(staffUserId)).toHaveLength(2);
  });

  it('ignora los tickets que aún no han vencido', async () => {
    await enqueue('t6', staffUserId, token('staff-phone'), new Date().toISOString());
    const fetchImpl = fakeExpo({});

    const summary = await processPendingReceipts(db, { fetchImpl, url: 'http://expo.test' });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(summary.processed).toBe(0);
    expect(await queueSize()).toBe(1);
  });

  // Sin respuesta de Expo se reintenta en la siguiente pasada, salvo que el ticket
  // sea tan viejo que Expo ya no vaya a contestarlo: entonces la cola lo suelta.
  it('mantiene en cola lo que Expo aún no responde y descarta lo caducado', async () => {
    await enqueue('t7-fresh', staffUserId, token('staff-phone'));
    await enqueue('t7-old', staffUserId, token('staff-tablet'), dueAt(RECEIPT_TTL_MS + 60_000));
    const fetchImpl = fakeExpo({});

    const summary = await processPendingReceipts(db, { fetchImpl, url: 'http://expo.test' });

    expect(summary.expired_count).toBe(1);
    expect(await queueSize()).toBe(1);
    expect(await tokensOf(staffUserId)).toHaveLength(2);
  });

  it('no borra la cola si la petición a Expo falla', async () => {
    await enqueue('t8', staffUserId, token('staff-phone'));
    const fetchImpl = jest.fn().mockRejectedValue(new Error('Network request failed'));

    const summary = await processPendingReceipts(db, { fetchImpl, url: 'http://expo.test' });

    expect(summary.processed).toBe(0);
    expect(await queueSize()).toBe(1);
  });

  it('no llama a Expo con la cola vacía', async () => {
    const fetchImpl = fakeExpo({});

    const summary = await processPendingReceipts(db, { fetchImpl, url: 'http://expo.test' });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(summary).toEqual({ processed: 0, purged_count: 0, expired_count: 0, reasons: {} });
  });

  it('procesa una cola de 200 tickets bastante por debajo de los 30s', async () => {
    const receipts: ReceiptMap = {};
    for (let i = 0; i < 200; i++) {
      const ticketId = await enqueue(`bulk-${i}`, staffUserId, token('staff-phone'));
      receipts[ticketId] = { status: 'ok' };
    }
    const fetchImpl = fakeExpo(receipts);

    const startedAt = Date.now();
    const summary = await processPendingReceipts(db, { fetchImpl, url: 'http://expo.test' });

    expect(summary.processed).toBe(200);
    expect(await queueSize()).toBe(0);
    expect(Date.now() - startedAt).toBeLessThan(30000);
  });
});
