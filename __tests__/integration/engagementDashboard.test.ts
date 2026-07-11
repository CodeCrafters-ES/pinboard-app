/**
 * Integration test — requires local Supabase running:
 *   npx supabase start
 *
 * Run with: npx jest --testPathPattern="integration/engagementDashboard" --no-coverage
 *
 * Test e2e del DoD de F-N04-03 (#175): siembra sesiones de engagement reales,
 * fuerza el refresco manual de la vista materializada y valida que los números que
 * consume la pantalla (listPostEngagement) son los esperados. Ejercita la cadena
 * completa: engagement_sessions → MV private.post_engagement_daily → vista pública
 * → listPostEngagement(). Incluye el RBAC (staff no ve nada ni puede refrescar).
 */
import { createClient } from '@supabase/supabase-js';

import { listPostEngagement } from '@/lib/supabase/queries/engagement';
import type { Database } from '@/lib/database.types';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

jest.setTimeout(30000);

const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7ACcShDMkTBHHAN4vqu6S25ULXF-V70J4fM';
// Las sesiones solo se pueden escribir con service_role (RLS + la RPC del tracking):
// es el mismo camino que usa la Edge Function track-engagement.
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const MANAGER = { email: 'manager@nun-ibiza.dev', password: 'password123' };
const STAFF = { email: 'staff@nun-ibiza.dev', password: 'password123' };
const RUN_MARKER = `engagement_dashboard_it_${Date.now()}`;

const managerClient = createClient<Database>(LOCAL_URL, LOCAL_ANON_KEY);
const staffClient = createClient<Database>(LOCAL_URL, LOCAL_ANON_KEY);
const serviceClient = createClient<Database>(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

describe('engagement dashboard (integration)', () => {
  let postId: string;
  let managerUserId: string;
  let staffUserId: string;

  beforeAll(async () => {
    const mgr = await managerClient.auth.signInWithPassword(MANAGER);
    if (mgr.error) throw mgr.error;
    managerUserId = mgr.data.user!.id;

    const staff = await staffClient.auth.signInWithPassword(STAFF);
    if (staff.error) throw staff.error;
    staffUserId = staff.data.user!.id;

    const { data: profile, error: pErr } = await managerClient
      .from('profiles')
      .select('id')
      .eq('email', MANAGER.email)
      .single();
    if (pErr) throw pErr;

    // Borrador a propósito: Jest corre los ficheros en paralelo y un post publicado
    // entraría en el feed que listPublishedPosts está paginando, rompiendo sus
    // invariantes. El dashboard no depende del status del post (lee por id).
    const { data: post, error: postErr } = await managerClient
      .from('posts')
      .insert({
        author_id: profile.id,
        title: `${RUN_MARKER} post`,
        external_url: 'https://example.com/dashboard',
        status: 'draft',
      })
      .select('id')
      .single();
    if (postErr) throw postErr;
    postId = post!.id;

    // Sesiones: staff clica el enlace (10s, scroll 0.8); manager solo lo ve (20s, 0.4).
    // → 2 lectores únicos, 1 clic ⇒ click_rate 0.5 · avg_seconds 15 · avg_scroll 0.6
    const seed = async (userId: string, event: Record<string, unknown>) => {
      const { error } = await serviceClient.rpc('apply_engagement_events', {
        p_user_id: userId,
        p_events: [{ session_id: crypto.randomUUID(), post_id: postId, ...event }],
      });
      if (error) throw error;
    };
    await seed(staffUserId, { link_clicked: true, focused_seconds_delta: 10, max_scroll_pct: 0.8 });
    await seed(managerUserId, { focused_seconds_delta: 20, max_scroll_pct: 0.4 });

    // Valoraciones (staff 5, manager 3 ⇒ media 4) y una reacción del staff.
    const { error: r1 } = await staffClient
      .from('post_ratings')
      .insert({ post_id: postId, user_id: staffUserId, rating: 5 });
    if (r1) throw r1;
    const { error: r2 } = await managerClient
      .from('post_ratings')
      .insert({ post_id: postId, user_id: managerUserId, rating: 3 });
    if (r2) throw r2;
    const { error: rx } = await staffClient
      .from('post_reactions')
      .insert({ post_id: postId, user_id: staffUserId, type: 'like' });
    if (rx) throw rx;
  });

  afterAll(async () => {
    if (postId) {
      await managerClient
        .from('posts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', postId);
    }
    // scope 'local': un signOut global revocaría las sesiones de estos usuarios en el
    // servidor, y Jest corre los ficheros en paralelo — tumbaría el JWT que otro test
    // (trackEngagement) está validando contra GoTrue.
    await managerClient.auth.signOut({ scope: 'local' });
    await staffClient.auth.signOut({ scope: 'local' });
  });

  it('does not surface the fresh activity until the view is refreshed', async () => {
    // El dashboard lee datos materializados: hasta que no se refresca, la actividad
    // recién registrada no aparece (lag documentado de hasta 1h).
    const rows = await listPostEngagement({ client: managerClient });

    expect(rows.find((r) => r.post_id === postId)).toBeUndefined();
  });

  it('shows the expected numbers after a manual refresh', async () => {
    const { error } = await managerClient.rpc('refresh_post_engagement_daily');
    if (error) throw error;

    const rows = await listPostEngagement({ client: managerClient });
    const row = rows.find((r) => r.post_id === postId);

    expect(row).toBeDefined();
    expect(row).toMatchObject({
      title: `${RUN_MARKER} post`,
      unique_readers: 2,
      unique_clicks: 1,
      total_reactions: 1,
      // engaged (ADR-001): el manager valoró sin clicar; el staff clicó, así que no cuenta.
      engaged_users: 1,
    });
    expect(row!.click_rate).toBeCloseTo(0.5);
    expect(row!.avg_rating).toBeCloseTo(4);
    // Señales opcionales (ADR-0006): media de (10, 20) y de (0.8, 0.4).
    expect(row!.avg_seconds).toBeCloseTo(15);
    expect(row!.avg_scroll).toBeCloseTo(0.6);
  });

  it('returns nothing to staff: the view is guarded in Postgres', async () => {
    const rows = await listPostEngagement({ client: staffClient });

    expect(rows).toEqual([]);
  });

  it('does not let staff refresh the dashboard', async () => {
    const { error } = await staffClient.rpc('refresh_post_engagement_daily');

    expect(error).not.toBeNull();
  });
});
