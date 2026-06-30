import {
  registerPushToken,
  unregisterPushToken,
} from '@/lib/notifications/pushToken';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockRequestPermissionsAsync = jest.fn();
const mockGetExpoPushTokenAsync = jest.fn();
const mockFrom = jest.fn();

jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  getExpoPushTokenAsync: (...args: unknown[]) => mockGetExpoPushTokenAsync(...args),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

describe('registerPushToken', () => {
  it('returns null and skips Supabase when permission is denied', async () => {
    mockRequestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });

    const result = await registerPushToken('user-1');

    expect(result).toBeNull();
    expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns null when permission is undetermined', async () => {
    mockRequestPermissionsAsync.mockResolvedValueOnce({ status: 'undetermined' });

    const result = await registerPushToken('user-1');

    expect(result).toBeNull();
  });

  it('upserts row and returns token when permission is granted', async () => {
    mockRequestPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
    mockGetExpoPushTokenAsync.mockResolvedValueOnce({ data: 'ExponentPushToken[abc]' });
    const mockUpsert = jest.fn().mockResolvedValueOnce({ error: null });
    mockFrom.mockReturnValueOnce({ upsert: mockUpsert });

    const result = await registerPushToken('user-1');

    expect(result).toBe('ExponentPushToken[abc]');
    expect(mockFrom).toHaveBeenCalledWith('push_tokens');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        token: 'ExponentPushToken[abc]',
        platform: expect.stringMatching(/^(ios|android|web)$/),
      }),
      { onConflict: 'user_id,token' },
    );
  });

  it('throws when upsert returns a Supabase error', async () => {
    mockRequestPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
    mockGetExpoPushTokenAsync.mockResolvedValueOnce({ data: 'ExponentPushToken[abc]' });
    const mockUpsert = jest.fn().mockResolvedValueOnce({ error: new Error('DB error') });
    mockFrom.mockReturnValueOnce({ upsert: mockUpsert });

    await expect(registerPushToken('user-1')).rejects.toThrow('DB error');
  });
});

describe('unregisterPushToken', () => {
  it('deletes push_token row matching both userId and token', async () => {
    const mockMatch = jest.fn().mockResolvedValueOnce({ error: null });
    const mockDelete = jest.fn().mockReturnValueOnce({ match: mockMatch });
    mockFrom.mockReturnValueOnce({ delete: mockDelete });

    await unregisterPushToken('user-1', 'ExponentPushToken[abc]');

    expect(mockFrom).toHaveBeenCalledWith('push_tokens');
    expect(mockDelete).toHaveBeenCalled();
    expect(mockMatch).toHaveBeenCalledWith({
      user_id: 'user-1',
      token: 'ExponentPushToken[abc]',
    });
  });

  it('throws when delete returns a Supabase error', async () => {
    const mockMatch = jest.fn().mockResolvedValueOnce({ error: new Error('DB error') });
    const mockDelete = jest.fn().mockReturnValueOnce({ match: mockMatch });
    mockFrom.mockReturnValueOnce({ delete: mockDelete });

    await expect(
      unregisterPushToken('user-1', 'ExponentPushToken[abc]'),
    ).rejects.toThrow('DB error');
  });
});
