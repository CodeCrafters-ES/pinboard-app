import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Calendar,
  CalendarProvider,
  WeekCalendar,
  LocaleConfig,
  type DateData,
} from 'react-native-calendars';

import { useEventsInRange } from '@/hooks/useEventsInRange';
import {
  dayKey,
  eventsByDay,
  markedDatesFor,
  overflowCount,
  type EventsByDay,
  type DayMarking,
} from '@/lib/eventsByDay';
import { EVENT_COLOR_META } from '@/lib/eventColors';
import type { Event } from '@/lib/types';
import { Text } from '@/components/ui';

// ─── Locale ES (una vez al importar) ─────────────────────────────────────────
LocaleConfig.locales.es = {
  monthNames: [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ],
  monthNamesShort: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  dayNames: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  dayNamesShort: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
  today: 'hoy',
};
LocaleConfig.defaultLocale = 'es';

type ViewMode = 'month' | 'week';
type Marking = DayMarking;

// ─── Rangos visibles ─────────────────────────────────────────────────────────
// El grid del mes muestra días de meses adyacentes; se acolcha ±7 días para
// cubrir esos eventos sin traer toda la tabla.
function monthVisibleRange(anchor: string): { startISO: string; endISO: string } {
  const d = new Date(`${anchor}T00:00:00`);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  start.setDate(start.getDate() - 7);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  end.setDate(end.getDate() + 7);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

function weekVisibleRange(anchor: string): { startISO: string; endISO: string } {
  const d = new Date(`${anchor}T00:00:00`);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  start.setDate(start.getDate() - start.getDay()); // domingo como inicio (RN calendars por defecto)
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

function todayKey(): string {
  return dayKey(new Date());
}

// ─── Celda de día custom (dots de color + "+N") ──────────────────────────────
function CalendarDay({
  date,
  state,
  marking,
  overflow,
  onPress,
}: {
  date?: DateData;
  state?: string;
  marking?: Marking;
  overflow: number;
  onPress?: (date?: DateData) => void;
}) {
  const selected = marking?.selected;
  const isToday = state === 'today';
  const faded = state === 'disabled' || state === 'inactive';
  const dots = marking?.dots ?? [];

  return (
    <Pressable
      onPress={() => onPress?.(date)}
      accessibilityRole="button"
      accessibilityLabel={marking?.accessibilityLabel}
      className="items-center justify-start w-9 pt-1"
    >
      <View
        className={`w-8 h-8 rounded-full items-center justify-center ${selected ? 'bg-nun-brown' : ''}`}
      >
        <Text
          className={`text-[15px] ${
            selected
              ? 'text-white font-semibold'
              : faded
                ? 'text-nun-muted opacity-40'
                : isToday
                  ? 'text-nun-brown font-bold'
                  : 'text-nun-dark'
          }`}
        >
          {date?.day}
        </Text>
      </View>
      <View className="flex-row items-center gap-0.5 h-2 mt-0.5">
        {dots.map((dot) => (
          <View key={dot.key} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dot.color }} />
        ))}
      </View>
      {overflow > 0 ? <Text className="text-[9px] text-nun-muted leading-none">+{overflow}</Text> : null}
    </Pressable>
  );
}

// ─── Tarjeta de evento (lista del día) ───────────────────────────────────────
function eventTime(event: Event): string {
  if (event.all_day) return 'Todo el día';
  return new Date(event.event_start_at).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isPast(event: Event): boolean {
  return new Date(event.event_end_at) < new Date();
}

function EventCard({ event, onPress }: { event: Event; onPress: () => void }) {
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

export default function CalendarioScreen() {
  const router = useRouter();
  const scheme = useColorScheme();

  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [selectedDate, setSelectedDate] = useState<string>(todayKey());
  const [monthAnchor, setMonthAnchor] = useState<string>(todayKey());
  const [refreshing, setRefreshing] = useState(false);

  const range = useMemo(
    () => (viewMode === 'month' ? monthVisibleRange(monthAnchor) : weekVisibleRange(selectedDate)),
    [viewMode, monthAnchor, selectedDate],
  );

  const { events, refresh } = useEventsInRange(range.startISO, range.endISO);

  const byDay = useMemo(() => eventsByDay(events), [events]);
  const marked = useMemo(() => markedDatesFor(byDay, selectedDate), [byDay, selectedDate]);

  // La celda custom se define una vez y lee byDay para el "+N" sin recrearse.
  const byDayRef = useRef<EventsByDay>(byDay);
  byDayRef.current = byDay;

  const dayComponent = useCallback(
    (props: { date?: DateData; state?: string; marking?: Marking; onPress?: (d?: DateData) => void }) => {
      const key = props.date?.dateString ?? '';
      return <CalendarDay {...props} overflow={overflowCount(byDayRef.current[key] ?? [])} />;
    },
    [],
  );

  const dayEvents = byDay[selectedDate] ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const calendarTheme = useMemo(
    () => ({
      calendarBackground: scheme === 'dark' ? '#26201A' : '#F7F1E7',
      monthTextColor: scheme === 'dark' ? '#F7F1E7' : '#4F453C',
      textSectionTitleColor: '#8C7B6A',
      arrowColor: '#7D5A3A',
      todayTextColor: '#7D5A3A',
    }),
    [scheme],
  );

  return (
    <SafeAreaView className="flex-1 bg-nun-linen" edges={['top']}>
      <View className="flex-row items-center justify-between px-5 pt-2 pb-3">
        <Text className="text-[28px] font-bold text-nun-dark">Agenda</Text>
        <View className="flex-row bg-nun-sand rounded-full p-1">
          {(['month', 'week'] as ViewMode[]).map((mode) => (
            <Pressable
              key={mode}
              onPress={() => setViewMode(mode)}
              accessibilityRole="button"
              accessibilityState={{ selected: viewMode === mode }}
              accessibilityLabel={mode === 'month' ? 'Vista mes' : 'Vista semana'}
              className={`px-4 py-1.5 rounded-full ${viewMode === mode ? 'bg-nun-brown' : ''}`}
            >
              <Text
                className={`text-[13px] font-semibold ${viewMode === mode ? 'text-white' : 'text-nun-dark'}`}
              >
                {mode === 'month' ? 'Mes' : 'Semana'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7D5A3A" />
        }
      >
        {viewMode === 'month' ? (
          <Calendar
            current={monthAnchor}
            markingType="multi-dot"
            markedDates={marked}
            dayComponent={dayComponent}
            onDayPress={(d: DateData) => setSelectedDate(d.dateString)}
            onMonthChange={(m: DateData) => setMonthAnchor(m.dateString)}
            theme={calendarTheme}
            hideExtraDays={false}
          />
        ) : (
          <CalendarProvider date={selectedDate} onDateChanged={(date: string) => setSelectedDate(date)}>
            <WeekCalendar
              markingType="multi-dot"
              markedDates={marked}
              allowShadow={false}
              theme={calendarTheme}
            />
          </CalendarProvider>
        )}

        <View className="mt-2 pb-8">
          {dayEvents.length === 0 ? (
            <View className="items-center justify-center py-10">
              <Text className="text-nun-muted text-[15px]">No hay eventos este día.</Text>
            </View>
          ) : (
            dayEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onPress={() => router.push(`/(app)/(tabs)/calendario/${event.id}`)}
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
