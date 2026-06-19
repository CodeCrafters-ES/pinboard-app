import { renderHook, act } from '@testing-library/react-native';
import { useAvatarUpload } from '@/hooks/useAvatarUpload';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockLaunchImageLibraryAsync = jest.fn();
const mockManipulateAsync = jest.fn();
const mockStorageUpload = jest.fn();
const mockGetPublicUrl = jest.fn();

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibraryAsync(...args),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: (...args: unknown[]) => mockManipulateAsync(...args),
  SaveFormat: { WEBP: 'webp' },
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => mockStorageUpload(...args),
        getPublicUrl: (...args: unknown[]) => mockGetPublicUrl(...args),
      }),
    },
  },
}));

global.fetch = jest.fn().mockResolvedValue({
  blob: jest.fn().mockResolvedValue(new Blob(['img'], { type: 'image/webp' })),
}) as jest.Mock;

const USER_ID = 'user-abc-123';

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

describe('useAvatarUpload', () => {
  it('returns null and skips upload when picker is cancelled', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({ canceled: true, assets: [] });

    const { result } = renderHook(() => useAvatarUpload(USER_ID));

    let returned: unknown;
    await act(async () => {
      returned = await result.current.pickAndUpload();
    });

    expect(returned).toBeNull();
    expect(mockManipulateAsync).not.toHaveBeenCalled();
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  it('resizes to 1024px WebP and uploads to {userId}/avatar.webp on success', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg' }],
    });
    mockManipulateAsync.mockResolvedValueOnce({ uri: 'file://resized.webp' });
    mockStorageUpload.mockResolvedValueOnce({ error: null });
    mockGetPublicUrl.mockReturnValueOnce({
      data: { publicUrl: 'https://cdn.example.com/avatars/user-abc-123/avatar.webp' },
    });

    const { result } = renderHook(() => useAvatarUpload(USER_ID));

    let returned: unknown;
    await act(async () => {
      returned = await result.current.pickAndUpload();
    });

    expect(mockManipulateAsync).toHaveBeenCalledWith(
      'file://photo.jpg',
      [{ resize: { width: 1024 } }],
      { compress: 0.8, format: 'webp' },
    );
    expect(mockStorageUpload).toHaveBeenCalledWith(
      `${USER_ID}/avatar.webp`,
      expect.any(Blob),
      { contentType: 'image/webp', upsert: true },
    );
    expect((returned as { publicUrl: string }).publicUrl).toMatch(
      /^https:\/\/cdn\.example\.com\/avatars\/user-abc-123\/avatar\.webp\?t=\d+$/,
    );
  });

  it('throws and resets isUploading when storage upload fails', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg' }],
    });
    mockManipulateAsync.mockResolvedValueOnce({ uri: 'file://resized.webp' });
    mockStorageUpload.mockResolvedValueOnce({ error: new Error('Bucket not found') });

    const { result } = renderHook(() => useAvatarUpload(USER_ID));

    await act(async () => {
      await expect(result.current.pickAndUpload()).rejects.toThrow('Bucket not found');
    });

    expect(result.current.isUploading).toBe(false);
  });

  it('passes aspect [1,1] and full quality to launchImageLibraryAsync', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({ canceled: true, assets: [] });

    const { result } = renderHook(() => useAvatarUpload(USER_ID));
    await act(async () => { await result.current.pickAndUpload(); });

    expect(mockLaunchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ aspect: [1, 1], allowsEditing: true, quality: 1 }),
    );
  });
});
