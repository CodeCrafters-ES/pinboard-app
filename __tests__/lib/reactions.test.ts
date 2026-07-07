import { getMyReaction } from '@/lib/reactions';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

const mockAuth = supabase.auth.getUser as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

function buildQueryChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValueOnce(result),
  };
  return chain;
}

beforeEach(() => jest.clearAllMocks());

describe('getMyReaction', () => {
  it('filtra por post_id Y user_id del usuario en sesión', async () => {
    const USER_ID = 'user-abc';
    const POST_ID = 'post-xyz';

    mockAuth.mockResolvedValueOnce({ data: { user: { id: USER_ID } } });
    const chain = buildQueryChain({ data: { type: 'love' }, error: null });
    mockFrom.mockReturnValueOnce(chain);

    const result = await getMyReaction(POST_ID);

    expect(result).toBe('love');
    expect(chain.eq).toHaveBeenCalledWith('post_id', POST_ID);
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
  });

  it('devuelve null sin consultar la BD cuando no hay sesión', async () => {
    mockAuth.mockResolvedValueOnce({ data: { user: null } });

    const result = await getMyReaction('post-xyz');

    expect(result).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('devuelve null cuando el usuario no ha reaccionado al post', async () => {
    mockAuth.mockResolvedValueOnce({ data: { user: { id: 'user-abc' } } });
    const chain = buildQueryChain({ data: null, error: null });
    mockFrom.mockReturnValueOnce(chain);

    const result = await getMyReaction('post-xyz');

    expect(result).toBeNull();
  });

  it('propaga el error de Supabase', async () => {
    mockAuth.mockResolvedValueOnce({ data: { user: { id: 'user-abc' } } });
    const chain = buildQueryChain({ data: null, error: new Error('db error') });
    mockFrom.mockReturnValueOnce(chain);

    await expect(getMyReaction('post-xyz')).rejects.toThrow('db error');
  });
});
