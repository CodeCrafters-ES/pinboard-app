import { ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Text, View } from '@/components/ui';
import { usePostEngagementMetrics } from '@/hooks/usePostEngagementMetrics';
import { useSession } from '@/hooks/useSession';
import { DEFAULT_DAYS, type PostEngagement } from '@/lib/supabase/queries/engagement';

function formatPct(value: number | null): string {
  if (value === null) return '—';
  return `${Math.round(value * 100)}%`;
}

function formatRating(value: number | null): string {
  if (value === null) return '—';
  return value.toFixed(1);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-[17px] font-bold text-nun-dark">{value}</Text>
      <Text className="text-[11px] text-nun-muted">{label}</Text>
    </View>
  );
}

function EngagementRow({ row }: { row: PostEngagement }) {
  return (
    <Card className="mx-4 mt-3">
      <Text className="text-[15px] font-semibold text-nun-dark" numberOfLines={2}>
        {row.title}
      </Text>
      <View className="mt-3 flex-row">
        <Metric label="Clics" value={String(row.unique_clicks)} />
        <Metric label="Click rate" value={formatPct(row.click_rate)} />
        <Metric label="Valoración" value={formatRating(row.avg_rating)} />
        <Metric label="Reacciones" value={String(row.total_reactions)} />
      </View>
      {/* engaged (ADR-001): interactuaron pero no llegaron al enlace externo. */}
      <Text className="mt-2 text-[11px] text-nun-muted">
        {row.unique_readers} {row.unique_readers === 1 ? 'lector único' : 'lectores únicos'} ·{' '}
        {row.engaged_users} {row.engaged_users === 1 ? 'interactuó' : 'interactuaron'} sin clicar
      </Text>
    </Card>
  );
}

export default function EngagementScreen() {
  const { session } = useSession();
  const { rows, loading, error, refresh } = usePostEngagementMetrics();

  // Gate de UX: la seguridad real la impone Postgres (la vista lleva el guard
  // is_manager(), así que a staff le devolvería 0 filas aunque entrase por URL).
  if (session && session.role === 'staff') {
    return <Redirect href="/(app)/(tabs)/tablon" />;
  }

  const isInitialLoading = loading && rows.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-nun-linen" edges={['bottom']}>
      <Stack.Screen options={{ title: 'Engagement', headerShown: true }} />

      {error ? (
        <View className="mx-4 mt-3 rounded-xl border border-nun-error bg-red-50 px-4 py-3">
          <Text className="text-xs text-nun-error">{error}</Text>
        </View>
      ) : null}

      {isInitialLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#7D5A3A" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.post_id}
          renderItem={({ item }) => <EngagementRow row={item} />}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
          ListHeaderComponent={
            <Text className="mx-4 mt-4 text-xs text-nun-muted">
              Últimos {DEFAULT_DAYS} días · se actualiza cada hora
            </Text>
          }
          ListEmptyComponent={
            error ? null : (
              <View className="mt-16 items-center px-8">
                <Text className="text-center text-sm text-nun-muted">
                  Todavía no hay actividad registrada en los últimos {DEFAULT_DAYS} días.
                </Text>
              </View>
            )
          }
          contentContainerClassName="pb-8"
        />
      )}
    </SafeAreaView>
  );
}
