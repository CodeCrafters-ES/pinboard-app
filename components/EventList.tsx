import { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { useEventsInRange } from '@/hooks/useEventsInRange';
import { eventsByDay } from '@/lib/eventsByDay';
import { useSession } from '@/hooks/useSession';
import type { EventListItem } from '@/lib/types';
import { Button, Text } from '@/components/ui';
import { EventRow } from '@/components/EventRow';

export type EventListProps = {
  from: Date;
  to: Date;
  groupBy: 'day' | 'none';
  onPressEvent?: (id: string) => void;
};

function dayHeaderLabel(dayKey: string): string {
  const label = new Date(`${dayKey}T00:00:00`).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function Skeleton() {
  return (
    <View className="pt-1" accessibilityLabel="Cargando eventos">
      {[0, 1, 2, 3].map((i) => (
        <View key={i} className="bg-nun-sand mx-4 my-1 rounded-xl h-16 opacity-60" />
      ))}
    </View>
  );
}

export function EventList({ from, to, groupBy, onPressEvent }: EventListProps) {
  const router = useRouter();
  const { session } = useSession();
  const { events, loading, error, refetch } = useEventsInRange(from, to);

  const canCreate = session?.role === 'admin' || session?.role === 'manager';

  const sections = useMemo(() => {
    if (groupBy !== 'day') return null;
    const byDay = eventsByDay(events);
    return Object.keys(byDay)
      .sort()
      .map((day) => ({ day, events: byDay[day]! }));
  }, [events, groupBy]);

  const openEvent = (id: string) =>
    onPressEvent ? onPressEvent(id) : router.push(`/(app)/(tabs)/calendario/${id}`);

  if (loading) return <Skeleton />;

  if (error) {
    return (
      <View className="items-center justify-center py-10 px-8 gap-3">
        <Text className="text-nun-muted text-[15px] text-center">
          No se pudieron cargar los eventos.
        </Text>
        <Button label="Reintentar" variant="secondary" onPress={refetch} className="px-6" />
      </View>
    );
  }

  if (events.length === 0) {
    return (
      <View className="items-center justify-center py-12 px-8 gap-3">
        <Text className="text-nun-muted text-[15px] text-center">No hay eventos en este periodo.</Text>
        {canCreate ? (
          <Button
            label="Crear evento"
            variant="primary"
            onPress={() => router.push('/(app)/(tabs)/admin/events/new')}
            className="px-6"
          />
        ) : null}
      </View>
    );
  }

  if (groupBy === 'day' && sections) {
    return (
      <View className="pt-1">
        {sections.map((section) => (
          <View key={section.day}>
            <Text className="px-4 pt-3 pb-1 text-xs font-semibold text-nun-muted uppercase">
              {dayHeaderLabel(section.day)}
            </Text>
            {section.events.map((event) => (
              <EventRow
                key={`${section.day}-${event.id}`}
                event={event}
                onPress={() => openEvent(event.id)}
              />
            ))}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View className="pt-1">
      {events.map((event: EventListItem) => (
        <EventRow key={event.id} event={event} onPress={() => openEvent(event.id)} />
      ))}
    </View>
  );
}
