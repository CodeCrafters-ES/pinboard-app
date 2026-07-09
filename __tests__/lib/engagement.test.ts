import { trackLinkClick } from '@/lib/engagement';
import { supabase } from '@/lib/supabase';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

const mockInvoke = supabase.functions.invoke as jest.MockedFunction<
  typeof supabase.functions.invoke
>;

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

describe('trackLinkClick', () => {
  it('invokes track-engagement with post_id and link_clicked', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { data: {} }, error: null });

    await trackLinkClick('post-1');

    expect(mockInvoke).toHaveBeenCalledWith('track-engagement', {
      body: { post_id: 'post-1', link_clicked: true },
    });
  });

  it('throws when the edge function returns an error', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('boom') });

    await expect(trackLinkClick('post-1')).rejects.toThrow('boom');
  });
});
