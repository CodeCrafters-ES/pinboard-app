import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { supabase } from '@/lib/supabase';

export type ImageTarget = 'post' | 'event' | 'avatar';
export type ImageBucket = 'avatars' | 'post-images' | 'event-images';

export type PreparedImage = {
  blob: Blob;
  mime: 'image/webp';
  width: number;
  height: number;
  sizeKB: number;
};

export type UploadResult =
  | { path: string; publicUrl: string }
  | { path: string; signedUrl: string };

type TargetConfig = { maxDimension: number; quality: number };

// Larger side is capped at maxDimension; quality is WebP compression (0–100).
const TARGET_CONFIG: Record<ImageTarget, TargetConfig> = {
  post: { maxDimension: 1920, quality: 85 },
  event: { maxDimension: 1920, quality: 85 },
  avatar: { maxDimension: 1024, quality: 80 },
};

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 3600;

// Client-side thumbnail/full variant presets. MVP generates these in-client;
// consumers pick a preset when they need a specific rendition.
export const IMAGE_VARIANTS = {
  AVATAR_SM: { width: 64, height: 64, quality: 75 },
  AVATAR_MD: { width: 200, height: 200, quality: 80 },
  POST_THUMB: { width: 400, height: 400, quality: 75 },
  POST_FULL: { width: 1080, quality: 85 },
  EVENT_THUMB: { width: 400, height: 300, quality: 75 },
  EVENT_FULL: { width: 1080, quality: 85 },
} as const;

async function fetchBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  return response.blob();
}

/**
 * Resize + compress an image to WebP before upload. Caps the larger side to the
 * target's max dimension and rejects inputs over 10 MB without processing.
 */
export async function prepareImageForUpload(
  input: { uri: string },
  target: ImageTarget,
): Promise<PreparedImage> {
  const original = await fetchBlob(input.uri);
  if (original.size > MAX_INPUT_BYTES) {
    throw new Error('La imagen supera el límite de 10 MB');
  }

  const { maxDimension, quality } = TARGET_CONFIG[target];

  // A no-op pass reads the source dimensions so we can cap the larger side.
  const source = await manipulateAsync(input.uri, []);
  const resize =
    source.width >= source.height
      ? { width: maxDimension }
      : { height: maxDimension };

  const manipulated = await manipulateAsync(input.uri, [{ resize }], {
    compress: quality / 100,
    format: SaveFormat.WEBP,
  });

  const blob = await fetchBlob(manipulated.uri);

  return {
    blob,
    mime: 'image/webp',
    width: manipulated.width,
    height: manipulated.height,
    sizeKB: Math.round(blob.size / 1024),
  };
}

/**
 * Upload a prepared WebP to Storage. Public `avatars` bucket returns a public
 * URL; private `post-images`/`event-images` return a time-limited signed URL.
 */
export async function uploadImage(
  bucket: ImageBucket,
  path: string,
  prepared: PreparedImage,
): Promise<UploadResult> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, prepared.blob, { contentType: 'image/webp', upsert: true });

  if (error) throw error;

  if (bucket === 'avatars') {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { path, publicUrl: data.publicUrl };
  }

  const { data, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (signError) throw signError;
  return { path, signedUrl: data.signedUrl };
}
