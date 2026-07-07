import { useState } from 'react';
import { Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { useSession } from '@/hooks/useSession';
import { usePosts } from '@/hooks/usePosts';
import { PostComposerForm } from '@/components/PostComposerForm';
import type { PostFormData } from '@/lib/validation/postSchema';

export default function NewPostScreen() {
  const { profile } = useSession();
  const router = useRouter();
  const { createPost } = usePosts();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(data: PostFormData) {
    if (!profile) return;

    setSaving(true);
    const result = await createPost({
      author_id: profile.id,
      title: data.title,
      subtitle: data.subtitle ?? null,
      external_url: data.external_url,
      body: data.body ?? null,
      status: data.status,
    });
    setSaving(false);

    if (result.error) {
      Alert.alert('Error', result.error);
      return;
    }

    router.back();
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Nuevo post', headerShown: true }} />
      <PostComposerForm onSubmit={handleSubmit} submitLabel="Crear post" saving={saving} />
    </>
  );
}
