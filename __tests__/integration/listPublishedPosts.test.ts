/**
 * Integration test — requires local Supabase running:
 *   npx supabase start
 *
 * Run with: npx jest --testPathPattern="integration" --no-coverage
 *
 * Exercises the real listPublishedPosts() cursor pagination against
 * Postgres + RLS (as opposed to __tests__/hooks/useFeed.test.ts, which
 * mocks listPublishedPosts entirely).
 */
import { randomUUID } from 'crypto';

import { createClient } from '@supabase/supabase-js';

import { listPublishedPosts, type PostCursor } from '@/lib/supabase/queries/posts';
import type { Database } from '@/lib/database.types';

// lib/supabase's singleton reads Constants.expoConfig.extra, which isn't
// populated under Jest — mock it so the import doesn't throw. The mocked
// default is never actually invoked: every listPublishedPosts() call below
// passes an explicit `client: localClient`.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7ACcShDMkTBHHAN4vqu6S25ULXF-V70J4fM';

const MANAGER_EMAIL = 'manager@nun-ibiza.dev';
const MANAGER_PASSWORD = 'password123';

const PAGE_SIZE = 7;
const PUBLISHED_COUNT = 17;
const RUN_MARKER = `integration_test_${Date.now()}`;

const localClient = createClient<Database>(LOCAL_URL, LOCAL_ANON_KEY);

describe('listPublishedPosts integration', () => {
  let authorId: string;
  let publishedIds: string[] = [];
  let draftId: string;
  let deletedId: string;

  beforeAll(async () => {
    const { error: signInError } = await localClient.auth.signInWithPassword({
      email: MANAGER_EMAIL,
      password: MANAGER_PASSWORD,
    });
    if (signInError) throw signInError;

    const { data: profile, error: profileError } = await localClient
      .from('profiles')
      .select('id')
      .eq('email', MANAGER_EMAIL)
      .single();
    if (profileError) throw profileError;
    authorId = profile.id;

    const baseTime = Date.now();
    const publishedRows = Array.from({ length: PUBLISHED_COUNT }, (_, i) => ({
      author_id: authorId,
      title: `${RUN_MARKER} published ${i}`,
      external_url: 'https://example.com/pagination-fixture',
      status: 'published',
      // Two rows (i === 5, 6) intentionally share the same published_at to
      // exercise the (published_at, id) tiebreaker in the cursor predicate.
      published_at: new Date(baseTime - Math.min(i, 5) * 60_000).toISOString(),
    }));

    const { data: publishedData, error: publishedError } = await localClient
      .from('posts')
      .insert(publishedRows)
      .select('id');
    if (publishedError) throw publishedError;
    publishedIds = publishedData!.map((row) => row.id);

    const { data: draftData, error: draftError } = await localClient
      .from('posts')
      .insert({
        author_id: authorId,
        title: `${RUN_MARKER} draft`,
        external_url: 'https://example.com/pagination-fixture',
        status: 'draft',
      })
      .select('id')
      .single();
    if (draftError) throw draftError;
    draftId = draftData!.id;

    // Pre-assign the id and skip `.select()`: a row that's already
    // soft-deleted at insert time fails the manager's SELECT policy, and
    // Postgres rejects `INSERT ... RETURNING` when the new row isn't
    // visible under RLS.
    deletedId = randomUUID();
    const { error: deletedError } = await localClient.from('posts').insert({
      id: deletedId,
      author_id: authorId,
      title: `${RUN_MARKER} deleted`,
      external_url: 'https://example.com/pagination-fixture',
      status: 'published',
      published_at: new Date(baseTime).toISOString(),
      deleted_at: new Date().toISOString(),
    });
    if (deletedError) throw deletedError;
  });

  afterAll(async () => {
    if (publishedIds.length > 0) {
      await localClient
        .from('posts')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', publishedIds);
    }
    await localClient.auth.signOut();
  });

  it('pages through all published posts exactly once, in order, excluding drafts and soft-deleted rows', async () => {
    const pages: Awaited<ReturnType<typeof listPublishedPosts>>[] = [];
    let cursor: PostCursor | undefined;

    do {
      const page = await listPublishedPosts({ cursor, pageSize: PAGE_SIZE, client: localClient });
      pages.push(page);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    // Structural invariants of listPublishedPosts's own contract — hold
    // regardless of whatever else is in the table: every page but the last
    // is a full page with a cursor to continue; only the last has none.
    expect(pages.length).toBeGreaterThanOrEqual(3);
    pages.slice(0, -1).forEach((page) => {
      expect(page.rows).toHaveLength(PAGE_SIZE);
      expect(page.nextCursor).not.toBeNull();
    });
    expect(pages[pages.length - 1]!.nextCursor).toBeNull();

    const allRows = pages.flatMap((p) => p.rows);

    // Draft and soft-deleted fixtures must never surface.
    const allIds = allRows.map((r) => r.id);
    expect(allIds).not.toContain(draftId);
    expect(allIds).not.toContain(deletedId);

    // Restrict to this run's fixtures so the test stays correct even if
    // other published posts already exist in the database.
    const ownRows = allRows.filter((r) => publishedIds.includes(r.id));
    const ownIds = ownRows.map((r) => r.id);

    // No duplicates, no gaps: exactly the fixture set, each exactly once.
    expect(new Set(ownIds).size).toBe(ownIds.length);
    expect(new Set(ownIds)).toEqual(new Set(publishedIds));

    // Strictly ordered by (published_at desc, id desc) — covers the
    // shared-published_at tiebreaker case.
    for (let i = 1; i < ownRows.length; i++) {
      const prev = ownRows[i - 1]!;
      const curr = ownRows[i]!;
      const prevKey = `${prev.published_at}`;
      const currKey = `${curr.published_at}`;
      const inOrder =
        prevKey > currKey || (prevKey === currKey && prev.id > curr.id);
      expect(inOrder).toBe(true);
    }
  });
});
