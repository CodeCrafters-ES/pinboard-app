import { useState } from 'react';

export type AvatarUploadResult = { publicUrl: string };

/**
 * Stub — full implementation (ImagePicker + resize + WebP + Storage) in I-F-N01-01-04.
 */
export function useAvatarUpload() {
  const [isUploading, setIsUploading] = useState(false);

  async function upload(_: string): Promise<AvatarUploadResult> {
    setIsUploading(true);
    try {
      throw new Error('Avatar upload not yet implemented (I-F-N01-01-04)');
    } finally {
      setIsUploading(false);
    }
  }

  return { upload, isUploading };
}
