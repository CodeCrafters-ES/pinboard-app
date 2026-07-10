/**
 * Integration test — requires local Supabase running with functions served:
 *   npx supabase start           # CI: serves functions via the edge runtime
 *   # or, locally: npx supabase functions serve track-engagement
 *
 * Run with: npx jest --testPathPattern="integration/trackEngagement" --no-coverage
 *
 * Exercises the real track-engagement Edge Function end-to-end against the local
 * stack: array (batch) contract, JWT auth, and the append-only / accumulation
 * UPSERT (via the apply_engagement_events RPC). The pure write logic is also
 * covered by supabase/tests/rls/rpc_track_engagement.sql (pgTAP).
 */
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7ACcShDMkTBHHAN4vqu6S25ULXF-V70J4fM';

const FN_URL = `${LOCAL_URL}/functions/v1/track-engagement`;

const MANAGER = { email: 'manager@nun-ibiza.dev', password: 'password123' };
const STAFF = { email: 'staff@nun-ibiza.dev', password: 'password123' };
const RUN_MARKER = `track_engagement_it_${Date.now()}`;

const managerClient = createClient<Database>(LOCAL_URL, LOCAL_ANON_KEY);
const staffClient = createClient<Database>(LOCAL_URL, LOCAL_ANON_KEY);

type FnResponse = { status: number; body: unknown };

async function callFn(events: unknown, token: string | null): Promise<FnResponse> {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: LOCAL_ANON_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(events),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function sessionRow(postId: string) {
  const { data, error } = await staffClient
    .from('engagement_sessions')
    .select('status, link_clicked, focused_seconds, max_scroll_pct')
    .eq('post_id', postId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

describe('track-engagement Edge Function (integration)', () => {
  let staffToken: string;
  const postIds: string[] = [];

  async function createPost(): Promise<string> {
    const { data, error } = await managerClient
      .from('posts')
      .insert({
        author_id: authorId,
        title: `${RUN_MARKER} ${postIds.length}`,
        external_url: 'https://example.com/track-engagement',
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;
    postIds.push(data!.id);
    return data!.id;
  }

  let authorId: string;

  beforeAll(async () => {
    const mgr = await managerClient.auth.signInWithPassword(MANAGER);
    if (mgr.error) throw mgr.error;
    const { data: profile, error: pErr } = await managerClient
      .from('profiles')
      .select('id')
      .eq('email', MANAGER.email)
      .single();
    if (pErr) throw pErr;
    authorId = profile.id;

    const staff = await staffClient.auth.signInWithPassword(STAFF);
    if (staff.error) throw staff.error;
    staffToken = staff.data.session!.access_token;
  });

  afterAll(async () => {
    if (postIds.length > 0) {
      await managerClient
        .from('posts')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', postIds);
    }
    await managerClient.auth.signOut();
    await staffClient.auth.signOut();
  });

  it('processes a batch (array) of events and creates the session as viewed', async () => {
    const postId = await createPost();
    const { status } = await callFn(
      [
        {
          session_id: crypto.randomUUID(),
          post_id: postId,
          focused_seconds_delta: 0,
          max_scroll_pct: 0,
        },
      ],
      staffToken,
    );
    expect(status).toBe(200);

    const row = await sessionRow(postId);
    expect(row).toMatchObject({ status: 'viewed', link_clicked: false });
  });

  it('also accepts the { events: [...] } envelope', async () => {
    const postId = await createPost();
    const { status } = await callFn(
      { events: [{ session_id: crypto.randomUUID(), post_id: postId }] },
      staffToken,
    );
    expect(status).toBe(200);
    expect(await sessionRow(postId)).toMatchObject({ status: 'viewed' });
  });

  it('sets clicked on link_clicked and never reverts it (append-only)', async () => {
    const postId = await createPost();
    const sid = crypto.randomUUID();

    await callFn([{ session_id: sid, post_id: postId, link_clicked: true }], staffToken);
    expect(await sessionRow(postId)).toMatchObject({ status: 'clicked', link_clicked: true });

    // A later event without a click must not revert clicked → viewed.
    await callFn(
      [{ session_id: sid, post_id: postId, link_clicked: false, focused_seconds_delta: 3 }],
      staffToken,
    );
    expect(await sessionRow(postId)).toMatchObject({ status: 'clicked', link_clicked: true });
  });

  it('accumulates focused_seconds and takes the max of max_scroll_pct; one row per post', async () => {
    const postId = await createPost();
    const sid = crypto.randomUUID();

    await callFn(
      [{ session_id: sid, post_id: postId, focused_seconds_delta: 5, max_scroll_pct: 0.3 }],
      staffToken,
    );
    await callFn(
      [{ session_id: sid, post_id: postId, focused_seconds_delta: 7, max_scroll_pct: 0.1 }],
      staffToken,
    );

    const row = await sessionRow(postId);
    expect(row).toMatchObject({ focused_seconds: 12, max_scroll_pct: 0.3 });

    const { count, error } = await staffClient
      .from('engagement_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', postId);
    if (error) throw error;
    expect(count).toBe(1);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const postId = await createPost();
    const { status } = await callFn(
      [{ session_id: crypto.randomUUID(), post_id: postId }],
      null,
    );
    expect(status).toBe(401);
  });

  it('rejects an invalid payload with 400', async () => {
    const { status } = await callFn([{ post_id: 'not-a-uuid' }], staffToken);
    expect(status).toBe(400);
  });
});
