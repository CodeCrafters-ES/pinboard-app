import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { MapPin } from 'lucide-react-native';

import { supabase } from '@/lib/supabase';
import { getSignedImageUrl } from '@/lib/media';
import { useSession } from '@/hooks/useSession';
import { EVENT_COLOR_META } from '@/lib/eventColors';
import { Button, Text } from '@/components/ui';
import type { Event } from '@/lib/types';

function formatDate(iso: string, allDay: boolean): string {
  const opts: Intl.DateTimeFormatOptions = allDay
    ? { weekday: 'long', day: '2-digit', month: 'long' }
    : { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' };
  return new Date(iso).toLocaleString('es-ES', opts);
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();

  const [event, setEvent] = useState<Event | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single()
      .then(async ({ data, error }) => {
        if (!active) return;
        if (error) {
          setLoadError(error.message);
          return;
        }
        setEvent(data);
        if (data.image_url) {
          const url = await getSignedImageUrl('event-images', data.image_url);
          if (active) setCoverUrl(url);
        }
      });
    return () => {
      active = false;
    };
  }, [id]);

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

  const color = EVENT_COLOR_META[event.color_tag];
  const canEdit = session?.role === 'admin' || event.author_id === session?.userId;

  return (
    <>
      <Stack.Screen options={{ title: event.title }} />
      <ScrollView className="flex-1 bg-nun-linen" contentContainerClassName="pb-10">
        {coverUrl ? (
          <Image
            source={{ uri: coverUrl }}
            style={{ width: '100%', height: 200 }}
            contentFit="cover"
            transition={150}
          />
        ) : null}

        <View className="px-5 pt-4 gap-3">
          <View className="flex-row items-center gap-2">
            <View className="w-3 h-3 rounded-full" style={{ backgroundColor: color.hex }} />
            <Text className="text-xs text-nun-muted">{color.label}</Text>
          </View>

          <Text className="text-[24px] font-bold text-nun-dark">{event.title}</Text>

          <View className="gap-0.5">
            <Text className="text-[15px] text-nun-dark capitalize">
              {formatDate(event.event_start_at, event.all_day)}
            </Text>
            <Text className="text-[15px] text-nun-muted capitalize">
              → {formatDate(event.event_end_at, event.all_day)}
            </Text>
          </View>

          {event.location ? (
            <View className="flex-row items-center gap-1.5">
              <MapPin size={16} color="#8C7B6A" />
              <Text className="text-[15px] text-nun-muted">{event.location}</Text>
            </View>
          ) : null}

          {event.description ? (
            <Text className="text-[15px] text-nun-dark leading-relaxed mt-1">{event.description}</Text>
          ) : null}

          {canEdit ? (
            <Button
              label="Editar"
              variant="ghost"
              className="mt-3 self-start px-0"
              onPress={() => router.push(`/(app)/(tabs)/admin/events/${event.id}/edit`)}
            />
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}
