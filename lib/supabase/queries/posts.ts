import type { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import type { Database, Tables } from '@/lib/database.types';

type ProfileSnippet = { name: string | null; surname: string | null };
type PostAuthor = { id: string; name: string | null; surname: string | null; avatar_url: string | null };

export type PostWithAuthor = Tables<'posts'> & {
  author: ProfileSnippet;
  comments_count: number;
  rating_average: number; // 0 when the post has no ratings yet
  rating_count: number;
};
export type PostDetail = Tables<'posts'> & { author: PostAuthor };
export type PostCursor = { published_at: string; id: string };

// PostgREST reverse-embed: post_comments(count) yields [{ count }] per post and
// post_ratings(rating) yields the rating rows, so the feed's comment and rating
// aggregates ride on the same query (no N+1).
type PostRow = Tables<'posts'> & {
  author: ProfileSnippet;
  post_comments: { count: number }[];
  post_ratings: { rating: number }[];
};

export async function listPublishedPosts({
  cursor,
  pageSize = 20,
  client = supabase,
}: {
  cursor?: PostCursor;
  pageSize?: number;
  client?: SupabaseClient<Database>;
}): Promise<{ rows: PostWithAuthor[]; nextCursor: PostCursor | null }> {
  let query = client
    .from('posts')
    .select('*, author:profiles!author_id(name, surname), post_comments(count), post_ratings(rating)')
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

  const rows: PostWithAuthor[] = ((data ?? []) as unknown as PostRow[]).map(
    ({ post_comments, post_ratings, ...post }) => {
      const rating_count = post_ratings.length;
      const rating_average =
        rating_count > 0
          ? post_ratings.reduce((acc, r) => acc + r.rating, 0) / rating_count
          : 0;
      return {
        ...post,
        comments_count: post_comments[0]?.count ?? 0,
        rating_average,
        rating_count,
      };
    },
  );
  const lastRow = rows[rows.length - 1];
  const nextCursor =
    rows.length === pageSize && lastRow?.published_at
      ? { published_at: lastRow.published_at, id: lastRow.id }
      : null;

  return { rows, nextCursor };
}

export async function getPostById(id: string): Promise<PostDetail> {
  const { data, error } = await supabase
    .from('posts')
    .select('*, author:profiles!author_id(id, name, surname, avatar_url)')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error) throw error;

  return data as PostDetail;
}
