import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { supabase } from '@/lib/supabase';

export type AvatarUploadResult = { publicUrl: string };

export function useAvatarUpload(userId: string) {
  const [isUploading, setIsUploading] = useState(false);

  async function pickAndUpload(): Promise<AvatarUploadResult | null> {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (picked.canceled) return null;

    setIsUploading(true);
    try {
      const asset = picked.assets[0]!;

      const manipulated = await manipulateAsync(
        asset.uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.8, format: SaveFormat.WEBP },
      );

      const response = await fetch(manipulated.uri);
      const blob = await response.blob();

      const path = `${userId}/avatar.webp`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: 'image/webp', upsert: true });

      if (uploadError) throw uploadError;

      // Append cache-buster so expo-image reloads the new image
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      return { publicUrl: `${data.publicUrl}?t=${Date.now()}` };
    } finally {
      setIsUploading(false);
    }
  }

  return { pickAndUpload, isUploading };
}
