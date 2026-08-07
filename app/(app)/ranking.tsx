import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLeaderboard, type LeaderboardEntry, type LeaderboardPeriod } from '@/hooks/useLeaderboard';
import { Text } from '@/components/ui';

const PERIOD_TABS: { value: LeaderboardPeriod; label: string }[] = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensual' },
];

function initialsOf(fullName: string): string {
  return fullName
    .split(' ')
    .map((word) => word[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function RankRow({ entry }: { entry: LeaderboardEntry }) {
  const points = `${entry.total_points} ${entry.total_points === 1 ? 'punto' : 'puntos'}`;

  return (
    <View
      accessible
      accessibilityLabel={
        entry.is_self
          ? `Tu posición: número ${entry.rank}, ${entry.full_name}, ${points}`
          : `Número ${entry.rank}, ${entry.full_name}, ${points}`
      }
      className={`flex-row items-center gap-3 mx-4 my-1 px-4 py-3 rounded-2xl ${
        entry.is_self ? 'bg-nun-sky' : 'bg-white'
      }`}
    >
      <Text
        className={`text-[15px] font-bold w-7 ${entry.is_self ? 'text-nun-sea' : 'text-nun-muted'}`}
      >
        {entry.rank}
      </Text>

      {entry.avatar_url ? (
        <Image
          source={{ uri: entry.avatar_url }}
          contentFit="cover"
          className="w-10 h-10 rounded-full"
        />
      ) : (
        <View className="w-10 h-10 rounded-full bg-nun-sand items-center justify-center">
          <Text className="text-xs font-semibold text-nun-muted">
            {initialsOf(entry.full_name)}
          </Text>
        </View>
      )}

      <View className="flex-1 flex-row items-center gap-2">
        <Text className="text-[15px] font-semibold text-nun-dark flex-shrink" numberOfLines={1}>
          {entry.full_name}
        </Text>
        {entry.is_self ? (
          <View className="rounded-full bg-nun-sea px-2 py-0.5">
            <Text className="text-[11px] font-semibold text-white">Tú</Text>
          </View>
        ) : null}
      </View>

      <Text className="text-[15px] font-bold text-nun-brown">{entry.total_points}</Text>
    </View>
  );
}

export default function RankingScreen() {
  const router = useRouter();
  const { top, selfBelowTop, period, setPeriod, loading, error, refetch } = useLeaderboard();

  const isFirstLoad = loading && top.length === 0;
  const isRefreshing = loading && top.length > 0;

  return (
    <SafeAreaView className="flex-1 bg-nun-linen" edges={['top', 'bottom']}>
      {/* La ruta cuelga de (app), cuyo layout es un <Slot> sin chrome de navegación:
          la cabecera y el botón de volver se pintan aquí. */}
      <View className="flex-row items-center gap-2 px-4 py-3">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Volver"
          hitSlop={12}
        >
          <Text className="text-[17px] text-nun-brown">‹ Volver</Text>
        </Pressable>
      </View>

      <Text className="text-[22px] font-bold text-nun-dark px-4 pb-3">Ranking</Text>

      <View className="flex-row gap-2 px-4 pb-3">
        {PERIOD_TABS.map((tab) => {
          const active = tab.value === period;
          return (
            <Pressable
              key={tab.value}
              onPress={() => setPeriod(tab.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Ranking ${tab.label.toLowerCase()}`}
              className={`rounded-full px-4 py-2 ${active ? 'bg-nun-brown' : 'bg-nun-sand'}`}
            >
              <Text
                className={`text-[13px] font-semibold ${active ? 'text-white' : 'text-nun-muted'}`}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <View className="mx-4 mb-2 bg-red-50 border border-nun-error rounded-xl px-4 py-3 flex-row items-center justify-between">
          <Text className="text-xs text-nun-error flex-1 mr-2">{error}</Text>
          <Pressable onPress={refetch} accessibilityRole="button" accessibilityLabel="Reintentar">
            <Text className="text-xs font-semibold text-nun-brown">Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {isFirstLoad ? (
        <ActivityIndicator className="py-10" color="#7D5A3A" />
      ) : (
        <FlatList
          data={top}
          keyExtractor={(item) => item.user_id}
          renderItem={({ item }) => <RankRow entry={item} />}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={refetch} tintColor="#7D5A3A" />
          }
          contentContainerClassName="pb-6 pt-1"
          ListEmptyComponent={
            !loading ? (
              <View className="flex-1 items-center justify-center py-20 px-8 gap-2">
                <Text className="text-[40px]">🏆</Text>
                <Text className="text-nun-muted text-[15px] text-center">
                  Aún no hay puntos en este periodo. Lee posts para sumar tu primer 10.
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            selfBelowTop ? (
              <View className="pt-4">
                <View className="h-px bg-nun-parchment mx-4 mb-3" />
                <Text className="text-xs font-semibold text-nun-muted px-5 pb-1">
                  Tu posición: #{selfBelowTop.rank}
                </Text>
                <RankRow entry={selfBelowTop} />
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
