import type { EngagementEvent } from '@/hooks/usePostEngagement';

import { enqueue, type EngagementPayload } from './queue';

// Adaptador entre los eventos del hook usePostEngagement (que emite focusedSeconds
// acumulado) y el payload que espera la cola/servidor (focused_seconds_delta).
// Se crea uno por montaje de pantalla: el closure recuerda el acumulado previo
// para calcular el delta de cada heartbeat.
export function createEngagementSink(
  sink: (payload: EngagementPayload) => void = (p) => void enqueue(p),
): (event: EngagementEvent) => void {
  let prevFocusedSeconds = 0;

  return (event) => {
    if (event.type === 'init') {
      prevFocusedSeconds = 0;
      // Crea la fila de sesión cuanto antes (estado inicial "viewed").
      sink({
        session_id: event.sessionId,
        post_id: event.postId,
        focused_seconds_delta: 0,
        max_scroll_pct: 0,
        client_ts: event.startedAt,
      });
      return;
    }

    const delta = event.focusedSeconds - prevFocusedSeconds;
    prevFocusedSeconds = event.focusedSeconds;
    sink({
      session_id: event.sessionId,
      post_id: event.postId,
      focused_seconds_delta: delta,
      max_scroll_pct: event.maxScrollPct,
      client_ts: event.at,
    });
  };
}
