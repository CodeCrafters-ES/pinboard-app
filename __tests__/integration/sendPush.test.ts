/**
 * Integration test — requires local Supabase with functions served:
 *   npx supabase start
 *   npx supabase functions serve --env-file supabase/functions/.env.test
 *
 * Run with: npx jest --testPathPattern="integration/sendPush" --no-coverage
 *
 * Cubre el CONTRATO de transporte de send-push (I-F-N06-02-01): autenticación por
 * secreto compartido, validación del payload de Database Webhooks, idempotencia y
 * respuesta rápida. La resolución de destinatarios y el envío a Expo llegan con
 * I-F-N06-02-02, así que aquí `dispatched: true` significa "aceptado para envío".
 */
import { randomUUID } from 'crypto';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

// Cold start del edge runtime en la primera invocación real.
jest.setTimeout(30000);

const FN_URL = 'http://127.0.0.1:54321/functions/v1/send-push';

// Debe coincidir con supabase/functions/.env.test (el mismo fichero que usa CI).
const WEBHOOK_SECRET = 'local-test-webhook-secret';

type FnResponse = { status: number; body: Record<string, unknown> | null };

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mismo criterio que el test de track-engagement: `policy = "per_worker"` recicla
// workers, así que un 5xx suelto es transitorio y se reintenta; los 4xx son
// definitivos y se devuelven tal cual (los tests de 400/401 dependen de ello).
async function callFn(
  body: unknown,
  { secret = WEBHOOK_SECRET, method = 'POST', rawBody }: {
    secret?: string | null;
    method?: string;
    rawBody?: string;
  } = {},
): Promise<FnResponse> {
  let last: FnResponse = { status: 0, body: null };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(FN_URL, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
        ...(method === 'POST' ? { body: rawBody ?? JSON.stringify(body) } : {}),
      });
      last = { status: res.status, body: await res.json().catch(() => null) };
      if (res.status < 500) return last;
    } catch (e) {
      last = { status: 0, body: { error: String(e) } }; // error de red
    }
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }

  return last;
}

// ─── Payloads de ejemplo (formato de Supabase Database Webhooks) ─────────────

function postPayload(overrides: Record<string, unknown> = {}) {
  return {
    type: 'INSERT',
    table: 'posts',
    schema: 'public',
    record: {
      id: randomUUID(),
      title: 'Nueva carta de temporada',
      author_id: randomUUID(),
      created_at: new Date().toISOString(),
      status: 'published',
      published_at: new Date().toISOString(),
      external_url: 'https://example.com/nun',
    },
    old_record: null,
    ...overrides,
  };
}

function eventPayload(overrides: Record<string, unknown> = {}) {
  return {
    type: 'INSERT',
    table: 'events',
    schema: 'public',
    record: {
      id: randomUUID(),
      title: 'Briefing de sala',
      author_id: randomUUID(),
      created_at: new Date().toISOString(),
      event_start_at: new Date().toISOString(),
      event_end_at: new Date().toISOString(),
      all_day: false,
    },
    old_record: null,
    ...overrides,
  };
}

function messagePayload(overrides: Record<string, unknown> = {}) {
  return {
    type: 'INSERT',
    table: 'messages',
    schema: 'public',
    record: {
      id: randomUUID(),
      chat_id: randomUUID(),
      sender_id: randomUUID(),
      content: 'Hola equipo',
      created_at: new Date().toISOString(),
    },
    old_record: null,
    ...overrides,
  };
}

describe('send-push Edge Function (integration)', () => {
  describe('autenticación', () => {
    it('rechaza sin cabecera Authorization', async () => {
      const { status, body } = await callFn(postPayload(), { secret: null });

      expect(status).toBe(401);
      expect(body).toEqual({ error: 'Unauthorized' });
    });

    it('rechaza con un secreto incorrecto', async () => {
      const { status } = await callFn(postPayload(), { secret: 'not-the-secret' });

      expect(status).toBe(401);
    });

    it('rechaza métodos distintos de POST', async () => {
      const { status } = await callFn(null, { method: 'GET' });

      expect(status).toBe(405);
    });
  });

  describe('validación del payload', () => {
    it('devuelve 400 (no 500) ante JSON malformado', async () => {
      const { status, body } = await callFn(null, { rawBody: '{ no-json' });

      expect(status).toBe(400);
      expect(body?.error).toBe('Invalid JSON body');
    });

    it('devuelve 400 con detalle si falta un campo requerido', async () => {
      const payload = postPayload();
      delete (payload.record as Record<string, unknown>).title;

      const { status, body } = await callFn(payload);

      expect(status).toBe(400);
      expect(body?.error).toBe('Invalid payload');
      expect(Array.isArray(body?.issues)).toBe(true);
    });

    it('devuelve 400 ante una tabla no contemplada', async () => {
      const { status } = await callFn(postPayload({ table: 'profiles' }));

      expect(status).toBe(400);
    });

    it('devuelve 400 si el id del record no es un uuid', async () => {
      const { status } = await callFn(postPayload({ record: { ...postPayload().record, id: 'x' } }));

      expect(status).toBe(400);
    });
  });

  describe('despacho por tabla', () => {
    it('acepta el INSERT de un post publicado', async () => {
      const { status, body } = await callFn(postPayload());

      expect(status).toBe(200);
      expect(body).toEqual({ ok: true, dispatched: true });
    });

    it('acepta el INSERT de un evento', async () => {
      const { status, body } = await callFn(eventPayload());

      expect(status).toBe(200);
      expect(body).toEqual({ ok: true, dispatched: true });
    });

    it('acepta un evento sin autor (author_id nullable)', async () => {
      const { status, body } = await callFn(
        eventPayload({ record: { ...eventPayload().record, author_id: null } }),
      );

      expect(status).toBe(200);
      expect(body?.dispatched).toBe(true);
    });

    // El webhook de messages se activa en Hito 3; el contrato ya responde 200.
    it('acepta el INSERT de un mensaje', async () => {
      const { status, body } = await callFn(messagePayload());

      expect(status).toBe(200);
      expect(body?.dispatched).toBe(true);
    });
  });

  describe('notificabilidad', () => {
    it('ignora el INSERT de un post en borrador', async () => {
      const draft = postPayload();
      (draft.record as Record<string, unknown>).status = 'draft';
      (draft.record as Record<string, unknown>).published_at = null;

      const { status, body } = await callFn(draft);

      expect(status).toBe(200);
      expect(body).toEqual({ ok: true, dispatched: false, reason: 'post_not_published' });
    });

    // Los posts nacen como borrador y se publican con un UPDATE (hooks/usePosts.ts):
    // sin este caso, el flujo real de publicación no notificaría nunca.
    it('notifica la transición draft → published', async () => {
      const record = { ...postPayload().record, status: 'published' };
      const { status, body } = await callFn({
        type: 'UPDATE',
        table: 'posts',
        schema: 'public',
        record,
        old_record: { ...record, status: 'draft', published_at: null },
      });

      expect(status).toBe(200);
      expect(body).toEqual({ ok: true, dispatched: true });
    });

    it('no vuelve a notificar al editar un post ya publicado', async () => {
      const record = { ...postPayload().record, status: 'published' };
      const { status, body } = await callFn({
        type: 'UPDATE',
        table: 'posts',
        schema: 'public',
        record,
        old_record: { ...record, title: 'Título anterior' },
      });

      expect(status).toBe(200);
      expect(body).toEqual({ ok: true, dispatched: false, reason: 'post_already_published' });
    });

    it('ignora operaciones que no son INSERT en events', async () => {
      const { status, body } = await callFn(eventPayload({ type: 'DELETE' }));

      expect(status).toBe(200);
      expect(body?.reason).toBe('operation_not_notifiable');
    });
  });

  describe('idempotencia', () => {
    it('descarta el mismo record repetido dentro de la ventana', async () => {
      const payload = postPayload();

      const first = await callFn(payload);
      const second = await callFn(payload);

      expect(first.body).toEqual({ ok: true, dispatched: true });
      expect(second.status).toBe(200);
      expect(second.body).toEqual({ ok: true, dispatched: false, deduplicated: true });
    });

    it('no confunde records distintos de la misma tabla', async () => {
      const first = await callFn(postPayload());
      const second = await callFn(postPayload());

      expect(first.body?.dispatched).toBe(true);
      expect(second.body?.dispatched).toBe(true);
    });
  });

  it('responde en bastante menos de los 10s que exige el webhook', async () => {
    const startedAt = Date.now();
    await callFn(eventPayload());

    expect(Date.now() - startedAt).toBeLessThan(5000);
  });
});
