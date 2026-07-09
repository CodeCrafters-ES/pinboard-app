import type { EngagementEvent } from '@/hooks/usePostEngagement';
import { createEngagementSink } from '@/lib/engagement/sink';
import type { EngagementPayload } from '@/lib/engagement/queue';

// Cortamos la cadena de import a la cola real (y a supabase): estos tests
// inyectan su propio sink, así que enqueue nunca se usa.
jest.mock('@/lib/engagement/queue', () => ({ enqueue: jest.fn() }));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function init(overrides?: Partial<Extract<EngagementEvent, { type: 'init' }>>): EngagementEvent {
  return {
    type: 'init',
    sessionId: 'sess-1',
    postId: 'post-1',
    wordCount: 100,
    startedAt: '2026-07-09T10:00:00.000Z',
    ...overrides,
  };
}

function tick(focusedSeconds: number, maxScrollPct = 0, at = '2026-07-09T10:00:05.000Z'): EngagementEvent {
  return { type: 'tick', sessionId: 'sess-1', postId: 'post-1', focusedSeconds, maxScrollPct, at };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createEngagementSink', () => {
  it('encola un payload con delta 0 al recibir init', () => {
    const out = jest.fn<void, [EngagementPayload]>();
    const sink = createEngagementSink(out);

    sink(init());

    expect(out).toHaveBeenCalledWith({
      session_id: 'sess-1',
      post_id: 'post-1',
      focused_seconds_delta: 0,
      max_scroll_pct: 0,
      client_ts: '2026-07-09T10:00:00.000Z',
    });
  });

  it('calcula focused_seconds_delta a partir del acumulado del hook', () => {
    const out = jest.fn<void, [EngagementPayload]>();
    const sink = createEngagementSink(out);

    sink(init());
    sink(tick(5)); // 5 - 0
    sink(tick(10)); // 10 - 5
    sink(tick(10)); // 10 - 10 = 0 (background)

    const deltas = out.mock.calls.map((c) => c[0].focused_seconds_delta);
    expect(deltas).toEqual([0, 5, 5, 0]);
  });

  it('propaga max_scroll_pct y client_ts del tick', () => {
    const out = jest.fn<void, [EngagementPayload]>();
    const sink = createEngagementSink(out);

    sink(init());
    sink(tick(5, 0.72, '2026-07-09T10:00:05.500Z'));

    expect(out).toHaveBeenLastCalledWith(
      expect.objectContaining({
        max_scroll_pct: 0.72,
        client_ts: '2026-07-09T10:00:05.500Z',
        focused_seconds_delta: 5,
      }),
    );
  });

  it('reinicia el acumulado en cada init (nueva sesión)', () => {
    const out = jest.fn<void, [EngagementPayload]>();
    const sink = createEngagementSink(out);

    sink(init());
    sink(tick(15));
    sink(init({ sessionId: 'sess-2' })); // reset
    sink(tick(5));

    const last = out.mock.calls.at(-1)![0];
    expect(last.focused_seconds_delta).toBe(5); // no 5 - 15
  });
});
