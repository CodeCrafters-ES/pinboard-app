import { useState } from 'react';
import { Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { useSession } from '@/hooks/useSession';
import { useEvents } from '@/hooks/useEvents';
import { EventComposerForm } from '@/components/EventComposerForm';
import type { EventFormData } from '@/lib/validation/eventSchema';

export default function NewEventScreen() {
  const { session } = useSession();
  const router = useRouter();
  const { createEvent } = useEvents();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(data: EventFormData) {
    if (!session) return;

    setSaving(true);
    const result = await createEvent({
      author_id: session.userId,
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

  return (
    <>
      <Stack.Screen options={{ title: 'Nuevo evento', headerShown: true }} />
      <EventComposerForm
        authorId={session?.userId ?? ''}
        onSubmit={handleSubmit}
        submitLabel="Crear evento"
        saving={saving}
      />
    </>
  );
}
