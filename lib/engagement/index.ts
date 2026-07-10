import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';

export { enqueue, flush, size, type EngagementPayload } from './queue';
export { createEngagementSink } from './sink';
export { startEngagementSync } from './sync';

// Records that the user opened a post's external link. Writes go through the
// track-engagement Edge Function because RLS blocks direct client writes to
// engagement_sessions; the function derives user_id from the JWT and dedups by
// (user_id, post_id). link_clicked is append-only server-side (never true → false).
// The function expects a batch (array); a single click is a one-element batch.
export async function trackLinkClick(postId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('track-engagement', {
    body: [{ session_id: Crypto.randomUUID(), post_id: postId, link_clicked: true }],
  });
  if (error) throw error;
}
