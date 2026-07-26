import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';

import { prepareImageForUpload, uploadImage } from '@/lib/media';

export type EventImageUpload = {
  // Ruta en el bucket event-images ({userId}/{contentId}/cover.webp): se guarda
  // en events.image_url. El bucket es privado, así que la URL de lectura se firma
  // aparte al mostrar.
  path: string;
  // URI local de la imagen elegida, para previsualización inmediata en el form.
  previewUri: string;
};

export function useEventImageUpload(userId: string) {
  const [isUploading, setIsUploading] = useState(false);

  async function pickAndUpload(): Promise<EventImageUpload | null> {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (picked.canceled) return null;

    setIsUploading(true);
    try {
      const asset = picked.assets[0]!;
      const prepared = await prepareImageForUpload({ uri: asset.uri }, 'event');
      const path = `${userId}/${Date.now()}/cover.webp`;
      await uploadImage('event-images', path, prepared);
      return { path, previewUri: asset.uri };
    } finally {
      setIsUploading(false);
    }
  }

  return { pickAndUpload, isUploading };
}
