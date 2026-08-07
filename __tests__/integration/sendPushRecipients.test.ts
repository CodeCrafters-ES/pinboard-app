/**
 * Integration test — requires local Supabase running:
 *   npx supabase start
 *
 * Run with: npx jest --testPathPattern="integration/sendPushRecipients" --no-coverage
 *
 * Ejercita la resolución de destinatarios de send-push (I-F-N06-02-02) contra la base
 * real: el mapeo `posts.author_id` (profiles.id) → `profiles.user_id` y la exclusión
 * del autor. No pasa por la Edge Function porque lo que se comprueba aquí son las
 * queries y los GRANTs de service_role, no el transporte HTTP.
 */
import { createClient } from '@supabase/supabase-js';

import {
  authorUserId,
  chatRecipientTokens,
  recipientTokens,
  senderDisplayName,
  type PushDb,
} from '../../supabase/functions/send-push/recipients';
import type { Database } from '@/lib/database.types';
import { withClockSkewRetry } from './_retry';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

jest.setTimeout(30000);

const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const MANAGER = { email: 'manager@nun-ibiza.dev', password: 'password123' };
const STAFF = { email: 'staff@nun-ibiza.dev', password: 'password123' };

const RUN_MARKER = `send_push_it_${Date.now()}`;

// UUID con formato válido que no corresponde a ningún chat: sirve para el caso "sin
// participantes" sin tener que crear (ni limpiar) un chat de un solo miembro.
const NONEXISTENT_CHAT_ID = '00000000-0000-4000-8000-000000000000';

const managerClient = createClient<Database>(LOCAL_URL, LOCAL_ANON_KEY);
const staffClient = createClient<Database>(LOCAL_URL, LOCAL_ANON_KEY);
const adminClient = createClient<Database>(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY);

// La Edge Function hace el mismo cast: `PushDb` declara solo lo que send-push usa.
const db = adminClient as unknown as PushDb;

describe('send-push recipients (integration)', () => {
  let managerUserId: string;
  let staffUserId: string;
  let managerProfileId: string;

  beforeAll(async () => {
    await withClockSkewRetry(async () => {
      const mgr = await managerClient.auth.signInWithPassword(MANAGER);
      if (mgr.error) throw mgr.error;
      const stf = await staffClient.auth.signInWithPassword(STAFF);
      if (stf.error) throw stf.error;
      managerUserId = mgr.data.user!.id;
      staffUserId = stf.data.user!.id;
    });

    const { data, error } = await adminClient
      .from('profiles')
      .select('id')
      .eq('user_id', managerUserId)
      .single();
    if (error) throw error;
    managerProfileId = data!.id;

    // Cada usuario registra su propio token, como hace el cliente real: service_role
    // tiene GRANT de select y delete sobre push_tokens, pero no de insert.
    const inserts = [
      managerClient.from('push_tokens').insert({
        user_id: managerUserId,
        token: `ExponentPushToken[${RUN_MARKER}-manager]`,
        platform: 'ios',
      }),
      staffClient.from('push_tokens').insert({
        user_id: staffUserId,
        token: `ExponentPushToken[${RUN_MARKER}-staff]`,
        platform: 'android',
      }),
      staffClient.from('push_tokens').insert({
        user_id: staffUserId,
        token: `ExponentPushToken[${RUN_MARKER}-staff-tablet]`,
        platform: 'android',
      }),
    ];
    for (const pending of inserts) {
      const { error: insertError } = await pending;
      if (insertError) throw insertError;
    }
  });

  afterAll(async () => {
    await adminClient.from('push_tokens').delete().like('token', `%${RUN_MARKER}%`);
  });

  describe('authorUserId', () => {
    // Sin el GRANT de select sobre profiles (20260804000000) esto devolvía null y el
    // autor acababa recibiendo su propia publicación.
    it('traduce profiles.id a user_id', async () => {
      await expect(authorUserId(db, managerProfileId)).resolves.toBe(managerUserId);
    });

    it('devuelve null si el perfil no existe', async () => {
      await expect(
        authorUserId(db, '00000000-0000-0000-0000-000000000000'),
      ).resolves.toBeNull();
    });
  });

  describe('recipientTokens', () => {
    it('excluye todos los dispositivos del autor', async () => {
      const tokens = await recipientTokens(db, staffUserId);

      const mine = tokens.filter((t) => t.user_id === staffUserId);
      expect(mine).toHaveLength(0);
      expect(tokens.map((t) => t.token)).toContain(`ExponentPushToken[${RUN_MARKER}-manager]`);
    });

    // Se filtra por el marcador de esta ejecución: otras suites de integración usan
    // los mismos usuarios del seed y podrían tener tokens vivos a la vez.
    it('devuelve los varios dispositivos de un mismo destinatario', async () => {
      const tokens = await recipientTokens(db, managerUserId);

      const staffTokens = tokens.filter(
        (t) => t.user_id === staffUserId && t.token.includes(RUN_MARKER),
      );
      expect(staffTokens).toHaveLength(2);
    });

    it('incluye a todos cuando no hay autor que excluir', async () => {
      const tokens = await recipientTokens(db, null);

      const users = new Set(tokens.map((t) => t.user_id));
      expect(users.has(managerUserId)).toBe(true);
      expect(users.has(staffUserId)).toBe(true);
    });

    it('devuelve token, user_id y platform', async () => {
      const tokens = await recipientTokens(db, managerUserId);

      expect(tokens.find((t) => t.token.includes(RUN_MARKER))).toEqual({
        token: expect.any(String),
        user_id: expect.any(String),
        platform: expect.stringMatching(/^(ios|android|web)$/),
      });
    });
  });

  // Destinatarios acotados a un chat 1:1 (F-N07-05). A diferencia del broadcast de
  // posts/eventos, aquí solo se notifica a los participantes del chat menos el remitente.
  describe('chat recipients', () => {
    let chatId: string;

    beforeAll(async () => {
      // El chat se crea con la RPC (SECURITY DEFINER), que da de alta a ambos
      // participantes. No se usa el adminClient (service_role) para insertar en `chats`:
      // esa tabla se concede solo a `authenticated`, y send-push nunca escribe ahí — solo
      // LEE chat_participants (grant de 20260810000000). La RPC es idempotente por par.
      const { data, error } = await managerClient.rpc('create_or_get_direct_chat', {
        other_user: staffUserId,
      });
      if (error) throw error;
      chatId = data as string;
    });

    it('excluye al remitente y devuelve los tokens del otro participante', async () => {
      const tokens = await chatRecipientTokens(db, chatId, managerUserId);

      expect(tokens.some((t) => t.user_id === managerUserId)).toBe(false);
      const staffMarked = tokens.filter(
        (t) => t.user_id === staffUserId && t.token.includes(RUN_MARKER),
      );
      expect(staffMarked).toHaveLength(2);
    });

    it('resuelve al otro sentido: el remitente staff no recibe, el manager sí', async () => {
      const tokens = await chatRecipientTokens(db, chatId, staffUserId);

      expect(tokens.some((t) => t.user_id === staffUserId)).toBe(false);
      expect(tokens.map((t) => t.token)).toContain(`ExponentPushToken[${RUN_MARKER}-manager]`);
    });

    it('sin participantes distintos del remitente no hay destinatarios', async () => {
      // Un chat inexistente no tiene participantes: no hay a quién notificar.
      const tokens = await chatRecipientTokens(db, NONEXISTENT_CHAT_ID, managerUserId);
      expect(tokens).toEqual([]);
    });

    it('senderDisplayName resuelve el nombre público del remitente (grant service_role)', async () => {
      const name = await senderDisplayName(db, managerUserId);

      expect(typeof name).toBe('string');
      expect((name ?? '').length).toBeGreaterThan(0);
    });
  });
});
