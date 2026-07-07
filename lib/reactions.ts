import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

export type ReactionType = Database['public']['Enums']['reaction_type'];
export type ReactionCounts = Record<ReactionType, number>;

export const EMPTY_COUNTS: ReactionCounts = { like: 0, dislike: 0, love: 0 };

export async function getMyReaction(postId: string): Promise<ReactionType | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('post_reactions')
    .select('type')
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw error;
  return data?.type ?? null;
}

export async function getReactionCounts(postId: string): Promise<ReactionCounts> {
  const { data, error } = await supabase
    .from('post_reactions')
    .select('type')
    .eq('post_id', postId);

  if (error) throw error;

  const counts = { ...EMPTY_COUNTS };
  for (const row of data ?? []) {
    counts[row.type]++;
  }
  return counts;
}

export async function toggleReaction(
  postId: string,
  type: ReactionType,
  currentType: ReactionType | null,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  if (currentType === type) {
    const { error } = await supabase
      .from('post_reactions')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', user.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('post_reactions').upsert(
    { post_id: postId, user_id: user.id, type, updated_at: new Date().toISOString() },
    { onConflict: 'post_id,user_id' },
  );
  if (error) throw error;
}
