import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { Redirect, Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';

import { useSession } from '@/hooks/useSession';
import { useEvents, type Event } from '@/hooks/useEvents';
import { EVENT_COLORS, EVENT_COLOR_META, type EventColor } from '@/lib/eventColors';
import { Text } from '@/components/ui';

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(month: string, delta: number): string {
  const parts = month.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month: string): string {
  const parts = month.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  return new Date(y, m - 1, 1).toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
  });
}

function formatRange(event: Event): string {
  const start = new Date(event.event_start_at);
  const opts: Intl.DateTimeFormatOptions = event.all_day
    ? { day: '2-digit', month: 'short' }
    : { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' };
  return start.toLocaleString('es-ES', opts);
}

function isPast(event: Event): boolean {
  return new Date(event.event_end_at) < new Date();
}

function EventRow({ event, onPress }: { event: Event; onPress: () => void }) {
  const past = isPast(event);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Editar: ${event.title}`}
      className={`bg-white mx-4 my-1 rounded-xl px-4 py-3 active:opacity-70 ${past ? 'opacity-50' : ''}`}
    >
      <View className="flex-row items-center gap-3">
        <View
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: EVENT_COLOR_META[event.color_tag].hex }}
        />
        <View className="flex-1">
          <Text className="text-[15px] font-semibold text-nun-dark" numberOfLines={1}>
            {event.title}
          </Text>
          <Text className="mt-0.5 text-xs text-nun-muted">
            {formatRange(event)}
            {event.location ? ` · ${event.location}` : ''}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function EventsListScreen() {
  const { session } = useSession();
  const router = useRouter();

  const [month, setMonth] = useState<string>(currentMonth());
  const [colorFilter, setColorFilter] = useState<EventColor | undefined>(undefined);

  const isManager = session?.role === 'manager';
  const authorId = isManager ? (session?.userId ?? undefined) : undefined;

  const options = useMemo(
    () => ({ authorId, colorTag: colorFilter, month }),
    [authorId, colorFilter, month],
  );
  const { events, loading, error, refresh } = useEvents(options);

  if (session && session.role === 'staff') {
    return <Redirect href="/(app)/(tabs)/tablon" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-nun-linen" edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Eventos',
          headerShown: true,
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/(app)/(tabs)/admin/events/new')}
              accessibilityRole="button"
              accessibilityLabel="Nuevo evento"
              className="pr-2 py-1"
            >
              <Plus size={22} color="#7D5A3A" />
            </Pressable>
          ),
        }}
      />

      {/* Navegación por mes */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable
          onPress={() => setMonth((m) => shiftMonth(m, -1))}
          accessibilityRole="button"
          accessibilityLabel="Mes anterior"
          className="p-1"
        >
          <ChevronLeft size={22} color="#7D5A3A" />
        </Pressable>
        <Text className="text-[15px] font-semibold text-nun-dark capitalize">
          {monthLabel(month)}
        </Text>
        <Pressable
          onPress={() => setMonth((m) => shiftMonth(m, 1))}
          accessibilityRole="button"
          accessibilityLabel="Mes siguiente"
          className="p-1"
        >
          <ChevronRight size={22} color="#7D5A3A" />
        </Pressable>
      </View>

      {/* Filtro por color */}
      <View className="flex-row items-center gap-3 px-4 pb-3">
        <Pressable
          onPress={() => setColorFilter(undefined)}
          accessibilityRole="button"
          accessibilityLabel="Todos los colores"
          className={`px-3 py-1 rounded-full ${
            colorFilter === undefined ? 'bg-nun-brown' : 'bg-nun-sand border border-nun-parchment'
          }`}
        >
          <Text
            className={`text-xs font-semibold ${
              colorFilter === undefined ? 'text-white' : 'text-nun-dark'
            }`}
          >
            Todos
          </Text>
        </Pressable>
        {EVENT_COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => setColorFilter((prev) => (prev === c ? undefined : c))}
            accessibilityRole="button"
            accessibilityLabel={EVENT_COLOR_META[c].label}
            className={`w-7 h-7 rounded-full items-center justify-center ${
              colorFilter === c ? 'border-2 border-nun-dark' : ''
            }`}
          >
            <View
              className="w-5 h-5 rounded-full"
              style={{ backgroundColor: EVENT_COLOR_META[c].hex }}
            />
          </Pressable>
        ))}
      </View>

      {error ? (
        <View className="mx-4 mt-1 bg-red-50 border border-nun-error rounded-xl px-4 py-3">
          <Text className="text-xs text-nun-error">{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <EventRow
            event={item}
            onPress={() => router.push(`/(app)/(tabs)/admin/events/${item.id}/edit`)}
          />
        )}
        refreshing={loading && events.length === 0}
        onRefresh={refresh}
        contentContainerClassName="pb-6 pt-1"
        ListEmptyComponent={
          !loading ? (
            <View className="flex-1 items-center justify-center py-16">
              <Text className="text-nun-muted text-[15px]">No hay eventos este mes.</Text>
            </View>
          ) : (
            <ActivityIndicator className="py-8" color="#7D5A3A" />
          )
        }
      />
    </SafeAreaView>
  );
}
