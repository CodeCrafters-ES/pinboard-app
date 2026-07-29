import { Pressable, View } from 'react-native';

import { EVENT_COLOR_META } from '@/lib/eventColors';
import type { EventListItem } from '@/lib/types';
import { Text } from '@/components/ui';

function eventTime(event: EventListItem): string {
  if (event.all_day) return 'Todo el día';
  return new Date(event.event_start_at).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isPast(event: EventListItem): boolean {
  return new Date(event.event_end_at) < new Date();
}

export function EventRow({ event, onPress }: { event: EventListItem; onPress: () => void }) {
  const past = isPast(event);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ver evento: ${event.title}`}
      className={`bg-white mx-4 my-1 rounded-xl overflow-hidden active:opacity-70 ${past ? 'opacity-50' : ''}`}
    >
      <View className="flex-row items-stretch">
        <View className="w-1.5" style={{ backgroundColor: EVENT_COLOR_META[event.color_tag].hex }} />
        <View className="flex-1 px-4 py-3">
          <Text className="text-[15px] font-semibold text-nun-dark" numberOfLines={1}>
            {event.title}
          </Text>
          <Text className="mt-0.5 text-xs text-nun-muted">
            {eventTime(event)}
            {event.location ? ` · ${event.location}` : ''}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
