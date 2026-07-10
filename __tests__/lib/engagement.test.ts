import { trackLinkClick } from '@/lib/engagement';
import { supabase } from '@/lib/supabase';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'sess-fixed') }));

const mockInvoke = supabase.functions.invoke as jest.MockedFunction<
  typeof supabase.functions.invoke
>;

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

describe('trackLinkClick', () => {
  it('invokes track-engagement with a one-event batch (session_id + link_clicked)', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { ok: true }, error: null });

    await trackLinkClick('post-1');

    expect(mockInvoke).toHaveBeenCalledWith('track-engagement', {
      body: [{ session_id: 'sess-fixed', post_id: 'post-1', link_clicked: true }],
    });
  });

  it('throws when the edge function returns an error', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('boom') });

    await expect(trackLinkClick('post-1')).rejects.toThrow('boom');
  });
});
