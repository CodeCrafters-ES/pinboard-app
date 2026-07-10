import { trackLinkClick } from '@/lib/engagement';
import { enqueue } from '@/lib/engagement/queue';
import { supabase } from '@/lib/supabase';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@/lib/engagement/queue', () => ({
  enqueue: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

const mockEnqueue = enqueue as jest.MockedFunction<typeof enqueue>;

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

describe('trackLinkClick', () => {
  it('enqueues a link_clicked event into the shared engagement queue', async () => {
    await trackLinkClick('post-1', 'sess-1');

    expect(mockEnqueue).toHaveBeenCalledWith({
      session_id: 'sess-1',
      post_id: 'post-1',
      link_clicked: true,
      focused_seconds_delta: 0,
      max_scroll_pct: 0,
      client_ts: expect.any(String),
    });
  });

  it('does not call the edge function directly (goes through the offline queue)', async () => {
    await trackLinkClick('post-1', 'sess-1');

    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });
});
