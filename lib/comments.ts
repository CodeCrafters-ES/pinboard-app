import type { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import type { Database, Tables } from '@/lib/database.types';

export type PostComment = Tables<'post_comments'>;
export type CommentAuthor = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
};
export type CommentWithAuthor = PostComment & { author: CommentAuthor | null };
export type CommentCursor = { created_at: string; id: string };

export const MAX_COMMENT_LENGTH = 2000;

// post_comments.author_id → auth.users(id), so there is no PostgREST FK to embed
// profiles_public. Authors are fetched in a second query and merged client-side.
async function attachAuthors(
  comments: PostComment[],
  client: SupabaseClient<Database>,
): Promise<CommentWithAuthor[]> {
  if (comments.length === 0) return [];

  const authorIds = [...new Set(comments.map((c) => c.author_id))];
  const { data, error } = await client
    .from('profiles_public')
    .select('user_id, full_name, avatar_url')
    .in('user_id', authorIds);

  if (error) throw error;

  const byId = new Map<string, CommentAuthor>();
  for (const row of data ?? []) {
    if (row.user_id) {
      byId.set(row.user_id, {
        user_id: row.user_id,
        full_name: row.full_name,
        avatar_url: row.avatar_url,
      });
    }
  }

  return comments.map((c) => ({ ...c, author: byId.get(c.author_id) ?? null }));
}

export async function listComments({
  postId,
  cursor,
  pageSize = 20,
  client = supabase,
}: {
  postId: string;
  cursor?: CommentCursor;
  pageSize?: number;
  client?: SupabaseClient<Database>;
}): Promise<{ rows: CommentWithAuthor[]; nextCursor: CommentCursor | null }> {
  let query = client
    .from('post_comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(pageSize);

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  const comments = data ?? [];
  const rows = await attachAuthors(comments, client);

  const lastRow = comments[comments.length - 1];
  const nextCursor =
    comments.length === pageSize && lastRow
      ? { created_at: lastRow.created_at, id: lastRow.id }
      : null;

  return { rows, nextCursor };
}

export async function createComment({
  postId,
  body,
  client = supabase,
}: {
  postId: string;
  body: string;
  client?: SupabaseClient<Database>;
}): Promise<PostComment> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data, error } = await client
    .from('post_comments')
    .insert({ post_id: postId, author_id: user.id, body })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function deleteComment(
  commentId: string,
  client: SupabaseClient<Database> = supabase,
): Promise<void> {
  const { error } = await client.from('post_comments').delete().eq('id', commentId);
  if (error) throw error;
}
