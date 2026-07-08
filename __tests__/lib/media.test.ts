import { prepareImageForUpload, uploadImage, IMAGE_VARIANTS } from '@/lib/media';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockManipulateAsync = jest.fn();
const mockStorageUpload = jest.fn();
const mockGetPublicUrl = jest.fn();
const mockCreateSignedUrl = jest.fn();

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
        createSignedUrl: (...args: unknown[]) => mockCreateSignedUrl(...args),
      }),
    },
  },
}));

function mockFetchReturningBlob(size: number) {
  const blob = { size, type: 'image/webp' } as unknown as Blob;
  global.fetch = jest.fn().mockResolvedValue({
    blob: jest.fn().mockResolvedValue(blob),
  }) as jest.Mock;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

describe('prepareImageForUpload', () => {
  it('caps the larger side to 1920px and compresses at 0.85 for posts', async () => {
    mockFetchReturningBlob(120 * 1024);
    // First call = dimension probe (landscape), second = real resize.
    mockManipulateAsync
      .mockResolvedValueOnce({ uri: 'file://probe', width: 4000, height: 3000 })
      .mockResolvedValueOnce({ uri: 'file://out.webp', width: 1920, height: 1440 });

    const result = await prepareImageForUpload({ uri: 'file://photo.jpg' }, 'post');

    expect(mockManipulateAsync).toHaveBeenLastCalledWith(
      'file://photo.jpg',
      [{ resize: { width: 1920 } }],
      { compress: 0.85, format: 'webp' },
    );
    expect(result).toEqual({
      blob: expect.anything(),
      mime: 'image/webp',
      width: 1920,
      height: 1440,
      sizeKB: 120,
    });
  });

  it('resizes portrait images by height', async () => {
    mockFetchReturningBlob(80 * 1024);
    mockManipulateAsync
      .mockResolvedValueOnce({ uri: 'file://probe', width: 1000, height: 2000 })
      .mockResolvedValueOnce({ uri: 'file://out.webp', width: 960, height: 1920 });

    await prepareImageForUpload({ uri: 'file://tall.jpg' }, 'post');

    expect(mockManipulateAsync).toHaveBeenLastCalledWith(
      'file://tall.jpg',
      [{ resize: { height: 1920 } }],
      { compress: 0.85, format: 'webp' },
    );
  });

  it('uses 1024px limit and 0.8 quality for avatars', async () => {
    mockFetchReturningBlob(40 * 1024);
    mockManipulateAsync
      .mockResolvedValueOnce({ uri: 'file://probe', width: 2048, height: 2048 })
      .mockResolvedValueOnce({ uri: 'file://out.webp', width: 1024, height: 1024 });

    await prepareImageForUpload({ uri: 'file://me.jpg' }, 'avatar');

    expect(mockManipulateAsync).toHaveBeenLastCalledWith(
      'file://me.jpg',
      [{ resize: { width: 1024 } }],
      { compress: 0.8, format: 'webp' },
    );
  });

  it('rejects inputs over 10 MB without processing them', async () => {
    mockFetchReturningBlob(11 * 1024 * 1024);

    await expect(
      prepareImageForUpload({ uri: 'file://huge.jpg' }, 'post'),
    ).rejects.toThrow(/10 MB/);
    expect(mockManipulateAsync).not.toHaveBeenCalled();
  });
});

describe('uploadImage', () => {
  const prepared = {
    blob: {} as Blob,
    mime: 'image/webp' as const,
    width: 1920,
    height: 1080,
    sizeKB: 100,
  };

  it('returns a public URL for the avatars bucket', async () => {
    mockStorageUpload.mockResolvedValueOnce({ error: null });
    mockGetPublicUrl.mockReturnValueOnce({
      data: { publicUrl: 'https://cdn.example.com/avatars/u/avatar.webp' },
    });

    const result = await uploadImage('avatars', 'u/avatar.webp', prepared);

    expect(mockStorageUpload).toHaveBeenCalledWith(
      'u/avatar.webp',
      prepared.blob,
      { contentType: 'image/webp', upsert: true },
    );
    expect(result).toEqual({
      path: 'u/avatar.webp',
      publicUrl: 'https://cdn.example.com/avatars/u/avatar.webp',
    });
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it('returns a signed URL (TTL 3600) for the post-images bucket', async () => {
    mockStorageUpload.mockResolvedValueOnce({ error: null });
    mockCreateSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: 'https://cdn.example.com/signed?token=abc' },
      error: null,
    });

    const result = await uploadImage('post-images', 'a/p/cover.webp', prepared);

    expect(mockCreateSignedUrl).toHaveBeenCalledWith('a/p/cover.webp', 3600);
    expect(result).toEqual({
      path: 'a/p/cover.webp',
      signedUrl: 'https://cdn.example.com/signed?token=abc',
    });
    expect(mockGetPublicUrl).not.toHaveBeenCalled();
  });

  it('throws when the storage upload fails', async () => {
    mockStorageUpload.mockResolvedValueOnce({ error: new Error('Bucket not found') });

    await expect(
      uploadImage('post-images', 'a/p/cover.webp', prepared),
    ).rejects.toThrow('Bucket not found');
  });
});

describe('IMAGE_VARIANTS', () => {
  it('exposes the six documented presets', () => {
    expect(IMAGE_VARIANTS.AVATAR_SM).toEqual({ width: 64, height: 64, quality: 75 });
    expect(IMAGE_VARIANTS.POST_FULL).toEqual({ width: 1080, quality: 85 });
    expect(IMAGE_VARIANTS.EVENT_THUMB).toEqual({ width: 400, height: 300, quality: 75 });
  });
});
