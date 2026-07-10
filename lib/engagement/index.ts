import { enqueue } from './queue';

export { enqueue, flush, size, type EngagementPayload } from './queue';
export { createEngagementSink } from './sink';
export { startEngagementSync } from './sync';

// Records that the user opened a post's external link. The click is ENQUEUED into
// the shared engagement queue (AsyncStorage @engagement/queue) instead of hitting
// track-engagement directly, so a click made offline survives and is retried on
// reconnect (startEngagementSync → flush). It rides the same batch (array) as the
// rest of the engagement events. link_clicked is append-only server-side.
export function trackLinkClick(postId: string, sessionId: string): Promise<void> {
  return enqueue({
    session_id: sessionId,
    post_id: postId,
    link_clicked: true,
    focused_seconds_delta: 0,
    max_scroll_pct: 0,
    client_ts: new Date().toISOString(),
  });
}
