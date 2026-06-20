import {
  requestPermissionsAndGetToken,
  registerPushToken,
  deletePushToken,
} from '@/lib/notifications/pushToken';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockRequestPermissionsAsync = jest.fn();
const mockGetExpoPushTokenAsync = jest.fn();
const mockFrom = jest.fn();

jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  getExpoPushTokenAsync: (...args: unknown[]) => mockGetExpoPushTokenAsync(...args),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { eas: { projectId: 'test-project-id' } } },
  },
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

describe('requestPermissionsAndGetToken', () => {
  it('returns null when permission is denied', async () => {
    mockRequestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });

    const result = await requestPermissionsAndGetToken();

    expect(result).toBeNull();
    expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('returns null when permission is undetermined', async () => {
    mockRequestPermissionsAsync.mockResolvedValueOnce({ status: 'undetermined' });

    const result = await requestPermissionsAndGetToken();

    expect(result).toBeNull();
  });

  it('returns token when permission is granted', async () => {
    mockRequestPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
    mockGetExpoPushTokenAsync.mockResolvedValueOnce({ data: 'ExponentPushToken[test123]' });

    const result = await requestPermissionsAndGetToken();

    expect(result).toBe('ExponentPushToken[test123]');
    expect(mockGetExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'test-project-id' });
  });
});

describe('registerPushToken', () => {
  it('upserts row in push_tokens with correct fields', async () => {
    const mockUpsert = jest.fn().mockResolvedValueOnce({ error: null });
    mockFrom.mockReturnValueOnce({ upsert: mockUpsert });

    await registerPushToken('user-1', 'ExponentPushToken[test123]');

    expect(mockFrom).toHaveBeenCalledWith('push_tokens');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        token: 'ExponentPushToken[test123]',
        platform: expect.stringMatching(/^(android|ios)$/),
      }),
      { onConflict: 'user_id' },
    );
  });

  it('includes updated_at timestamp in upsert payload', async () => {
    const mockUpsert = jest.fn().mockResolvedValueOnce({ error: null });
    mockFrom.mockReturnValueOnce({ upsert: mockUpsert });

    await registerPushToken('user-1', 'ExponentPushToken[test123]');

    const payload = mockUpsert.mock.calls[0][0] as Record<string, unknown>;
    expect(typeof payload.updated_at).toBe('string');
    expect(new Date(payload.updated_at as string).getTime()).not.toBeNaN();
  });
});

describe('deletePushToken', () => {
  it('deletes push_tokens row for the given userId', async () => {
    const mockEq = jest.fn().mockResolvedValueOnce({ error: null });
    const mockDelete = jest.fn().mockReturnValueOnce({ eq: mockEq });
    mockFrom.mockReturnValueOnce({ delete: mockDelete });

    await deletePushToken('user-1');

    expect(mockFrom).toHaveBeenCalledWith('push_tokens');
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-1');
  });
});
