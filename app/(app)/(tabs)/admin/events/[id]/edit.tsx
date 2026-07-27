import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useEvents } from '@/hooks/useEvents';
import { EventComposerForm } from '@/components/EventComposerForm';
import { Text } from '@/components/ui';
import type { Event } from '@/lib/types';
import type { EventFormData } from '@/lib/validation/eventSchema';

export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const { updateEvent, deleteEvent } = useEvents();

  const [event, setEvent] = useState<Event | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) setLoadError(error.message);
        else setEvent(data);
      });
  }, [id]);

  async function handleSubmit(data: EventFormData) {
    setSaving(true);
    const result = await updateEvent(id, {
      title: data.title,
      description: data.description ?? null,
      location: data.location ?? null,
      all_day: data.all_day,
      event_start_at: data.event_start_at,
      event_end_at: data.event_end_at,
      color_tag: data.color_tag,
      image_url: data.image_url ?? null,
    });
    setSaving(false);

    if (result.error) {
      Alert.alert('Error', result.error);
      return;
    }

    router.back();
  }

  function handleDelete() {
    Alert.alert('Eliminar evento', '¿Estás seguro? Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const result = await deleteEvent(id);
          if (result.error) {
            Alert.alert('Error', result.error);
            return;
          }
          router.back();
        },
      },
    ]);
  }

  if (loadError) {
    return (
      <View className="flex-1 bg-nun-linen items-center justify-center px-8">
        <Text className="text-nun-error text-center">{loadError}</Text>
      </View>
    );
  }

  if (!event) {
    return <View className="flex-1 bg-nun-linen" />;
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Editar evento', headerShown: true }} />
      <EventComposerForm
        authorId={session?.userId ?? ''}
        initialValues={{
          title: event.title,
          description: event.description ?? undefined,
          location: event.location ?? undefined,
          all_day: event.all_day,
          event_start_at: event.event_start_at,
          event_end_at: event.event_end_at,
          color_tag: event.color_tag,
          image_url: event.image_url ?? undefined,
        }}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
        submitLabel="Guardar cambios"
        saving={saving}
      />
    </>
  );
}
