import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/database.types';

type ProfileSnippet = { name: string | null; surname: string | null };

export type PostWithAuthor = Tables<'posts'> & { author: ProfileSnippet };
export type PostCursor = { published_at: string; id: string };

export async function listPublishedPosts({
  cursor,
  pageSize = 20,
}: {
  cursor?: PostCursor;
  pageSize?: number;
}): Promise<{ rows: PostWithAuthor[]; nextCursor: PostCursor | null }> {
  let query = supabase
    .from('posts')
    .select('*, author:profiles!author_id(name, surname)')
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('published_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(pageSize);

  if (cursor) {
    query = query.or(
      `published_at.lt.${cursor.published_at},and(published_at.eq.${cursor.published_at},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;

  if (error) throw error;

  const rows = (data ?? []) as PostWithAuthor[];
  const lastRow = rows[rows.length - 1];
  const nextCursor =
    rows.length === pageSize && lastRow?.published_at
      ? { published_at: lastRow.published_at, id: lastRow.id }
      : null;

  return { rows, nextCursor };
}
