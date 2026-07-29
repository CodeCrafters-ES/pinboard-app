/**
 * Integration test — requires local Supabase running:
 *   npx supabase start
 *
 * Run with: npx jest --testPathPattern="integration/eventsInRange" --no-coverage
 *
 * Valida contra la BD real la semántica de la query por rango de `useEventsInRange`
 * (I-F-N05-02-02): devuelve solo los eventos cuyo `[event_start_at, event_end_at)`
 * interseca el rango pedido `[from, to)`. Cubre el ítem de DoD de EPIC-N05 sobre
 * tests de integración de queries por rango.
 */
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { withClockSkewRetry } from './_retry';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7ACcShDMkTBHHAN4vqu6S25ULXF-V70J4fM';

const MANAGER = { email: 'manager@nun-ibiza.dev', password: 'password123' };
const RUN_MARKER = `events_range_it_${Date.now()}`;

// Mismas columnas que consulta el hook useEventsInRange.
const EVENT_COLUMNS = 'id, title, event_start_at, event_end_at, all_day, color_tag, location';

const client = createClient<Database>(LOCAL_URL, LOCAL_ANON_KEY);

// UTC para que los límites del rango sean deterministas con independencia de la TZ.
function iso(y: number, m: number, d: number, h = 0, min = 0): string {
  return new Date(Date.UTC(y, m - 1, d, h, min)).toISOString();
}

const FROM = iso(2026, 9, 10); // 2026-09-10T00:00:00.000Z
const TO = iso(2026, 9, 17); // 2026-09-17T00:00:00.000Z

let authorId: string;

async function insertEvent(key: string, start: string, end: string, allDay = false): Promise<void> {
  const { error } = await client.from('events').insert({
    author_id: authorId,
    title: `${RUN_MARKER} ${key}`,
    event_start_at: start,
    event_end_at: end,
    all_day: allDay,
    color_tag: 'brown',
  });
  if (error) throw error;
}

// Reproduce la query del hook + aísla al RUN_MARKER de esta ejecución.
async function queryRangeKeys(fromISO: string, toISO: string): Promise<string[]> {
  const { data, error } = await client
    .from('events')
    .select(EVENT_COLUMNS)
    .lt('event_start_at', toISO)
    .gt('event_end_at', fromISO)
    .like('title', `${RUN_MARKER}%`)
    .order('event_start_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((e) => e.title.replace(`${RUN_MARKER} `, ''));
}

beforeAll(async () => {
  await withClockSkewRetry(async () => {
    const mgr = await client.auth.signInWithPassword(MANAGER);
    if (mgr.error) throw mgr.error;
    authorId = mgr.data.user!.id;
  });

  await Promise.all([
    // Interseccan [FROM, TO):
    insertEvent('inside', iso(2026, 9, 12, 10), iso(2026, 9, 12, 11)),
    insertEvent('spanStart', iso(2026, 9, 8), iso(2026, 9, 11)),
    insertEvent('spanEnd', iso(2026, 9, 16), iso(2026, 9, 20)),
    insertEvent('spanAll', iso(2026, 9, 5), iso(2026, 9, 25)),
    insertEvent('allDay', iso(2026, 9, 14), iso(2026, 9, 15), true),
    // Fuera del rango:
    insertEvent('before', iso(2026, 9, 1), iso(2026, 9, 5)),
    insertEvent('after', iso(2026, 9, 20), iso(2026, 9, 25)),
    // Límites semiabiertos (deben quedar excluidos):
    insertEvent('endsAtFrom', iso(2026, 9, 5), FROM), // event_end_at == FROM
    insertEvent('startsAtTo', TO, iso(2026, 9, 18)), // event_start_at == TO
  ]);
});

afterAll(async () => {
  await client.from('events').delete().like('title', `${RUN_MARKER}%`);
  await client.auth.signOut();
});

describe('eventsInRange query (integration)', () => {
  it('solo devuelve eventos cuyo rango interseca [from, to)', async () => {
    const keys = await queryRangeKeys(FROM, TO);
    expect([...keys].sort()).toEqual(['allDay', 'inside', 'spanAll', 'spanEnd', 'spanStart']);
    expect(keys).not.toContain('before');
    expect(keys).not.toContain('after');
  });

  it('trata el rango como semiabierto: excluye eventos que tocan el borde', async () => {
    const keys = await queryRangeKeys(FROM, TO);
    // fin == FROM y comienzo == TO no interseccan [FROM, TO).
    expect(keys).not.toContain('endsAtFrom');
    expect(keys).not.toContain('startsAtTo');
  });

  it('ordena por event_start_at ascendente', async () => {
    const keys = await queryRangeKeys(FROM, TO);
    expect(keys).toEqual(['spanAll', 'spanStart', 'inside', 'allDay', 'spanEnd']);
  });

  it('devuelve vacío para un rango sin eventos', async () => {
    const keys = await queryRangeKeys(iso(2030, 1, 1), iso(2030, 1, 8));
    expect(keys).toEqual([]);
  });
});
