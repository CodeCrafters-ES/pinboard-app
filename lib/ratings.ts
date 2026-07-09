import { supabase } from '@/lib/supabase';

export type RatingState = {
  myRating: number | null;
  average: number; // 0 when the post has no ratings yet
  count: number;
};

export const EMPTY_RATING: RatingState = { myRating: null, average: 0, count: 0 };

// Reads every rating for a post (RLS allows select to any authenticated user) and
// derives the caller's own rating plus the aggregate in a single round trip.
export async function getRatingState(postId: string): Promise<RatingState> {
  const [ratingsResult, userResult] = await Promise.all([
    supabase.from('post_ratings').select('user_id, rating').eq('post_id', postId),
    supabase.auth.getUser(),
  ]);

  if (ratingsResult.error) throw ratingsResult.error;

  const ratings = ratingsResult.data ?? [];
  const count = ratings.length;
  const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
  const average = count > 0 ? sum / count : 0;

  const userId = userResult.data.user?.id;
  const myRating = userId
    ? (ratings.find((r) => r.user_id === userId)?.rating ?? null)
    : null;

  return { myRating, average, count };
}

// Idempotent upsert keyed on the composite PK (post_id, user_id): rating a post
// again overwrites the previous value instead of inserting a new row.
export async function upsertRating(postId: string, rating: number): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { error } = await supabase.from('post_ratings').upsert(
    { post_id: postId, user_id: user.id, rating, updated_at: new Date().toISOString() },
    { onConflict: 'post_id,user_id' },
  );
  if (error) throw error;
}
