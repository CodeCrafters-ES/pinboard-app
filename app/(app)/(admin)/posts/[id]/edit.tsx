import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { usePosts } from '@/hooks/usePosts';
import { PostComposerForm } from '@/components/PostComposerForm';
import { Text } from '@/components/ui';
import type { Post } from '@/lib/types';
import type { PostFormData } from '@/lib/validation/postSchema';

export default function EditPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { updatePost, softDelete } = usePosts();

  const [post, setPost] = useState<Post | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from('posts')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) setLoadError(error.message);
        else setPost(data);
      });
  }, [id]);

  async function handleSubmit(data: PostFormData) {
    setSaving(true);
    const result = await updatePost(
      id,
      {
        title: data.title,
        subtitle: data.subtitle ?? null,
        external_url: data.external_url,
        body: data.body ?? null,
        status: data.status,
      },
      post?.status,
    );
    setSaving(false);

    if (result.error) {
      Alert.alert('Error', result.error);
      return;
    }

    router.back();
  }

  function handleDelete() {
    Alert.alert(
      'Eliminar post',
      '¿Estás seguro? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const result = await softDelete(id);
            if (result.error) {
              Alert.alert('Error', result.error);
              return;
            }
            router.back();
          },
        },
      ],
    );
  }

  if (loadError) {
    return (
      <View className="flex-1 bg-nun-linen items-center justify-center px-8">
        <Text className="text-nun-error text-center">{loadError}</Text>
      </View>
    );
  }

  if (!post) {
    return <View className="flex-1 bg-nun-linen" />;
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Editar post', headerShown: true }} />
      <PostComposerForm
        initialValues={{
          title: post.title,
          subtitle: post.subtitle ?? undefined,
          external_url: post.external_url,
          body: post.body ?? undefined,
          status: post.status,
        }}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
        submitLabel="Guardar cambios"
        saving={saving}
      />
    </>
  );
}
