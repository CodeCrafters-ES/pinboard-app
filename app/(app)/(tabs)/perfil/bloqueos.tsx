import { ActivityIndicator, Alert, FlatList, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { useMyBlocks } from '@/hooks/useMyBlocks';
import type { BlockedUser } from '@/lib/blocks';

function toThumbnailUrl(url: string | null): string | null {
  if (!url) return null;
  const base = url.split('?')[0]?.replace('/object/public/', '/render/image/public/') ?? '';
  return `${base}?width=64&height=64&resize=cover`;
}

function initials(fullName: string): string {
  return (
    fullName
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

function BlockedRow({ item, onUnblock }: { item: BlockedUser; onUnblock: (u: BlockedUser) => void }) {
  const thumbUrl = toThumbnailUrl(item.avatarUrl);

  return (
    <View className="flex-row items-center gap-3 bg-white mx-4 my-1 rounded-xl px-3 py-3">
      {thumbUrl ? (
        <Image
          source={{ uri: thumbUrl }}
          contentFit="cover"
          className="w-14 h-14 rounded-full"
          accessibilityLabel={`Avatar de ${item.fullName}`}
        />
      ) : (
        <View className="w-14 h-14 rounded-full bg-nun-sand items-center justify-center">
          <Text className="text-base font-semibold text-nun-muted">{initials(item.fullName)}</Text>
        </View>
      )}

      <View className="flex-1">
        <Text className="text-[15px] font-semibold text-nun-dark">{item.fullName}</Text>
      </View>

      <Pressable
        onPress={() => onUnblock(item)}
        accessibilityRole="button"
        accessibilityLabel={`Desbloquear a ${item.fullName}`}
        className="px-3 py-1.5 rounded-full bg-nun-sand active:opacity-60"
      >
        <Text className="text-xs font-semibold text-nun-dark">Desbloquear</Text>
      </Pressable>
    </View>
  );
}

export default function BlockedUsersScreen() {
  const { blocks, loading, error, refresh, unblock } = useMyBlocks();

  function handleUnblock(item: BlockedUser) {
    Alert.alert('Desbloquear', `¿Desbloquear a ${item.fullName}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Desbloquear', onPress: () => unblock(item.userId) },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-nun-linen" edges={['bottom']}>
      <Stack.Screen options={{ title: 'Usuarios bloqueados' }} />

      {loading && blocks.length === 0 ? (
        <ActivityIndicator className="flex-1" color="#7D5A3A" />
      ) : error ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-nun-error text-center">{error}</Text>
        </View>
      ) : (
        <FlatList
          data={blocks}
          keyExtractor={(item) => item.userId}
          renderItem={({ item }) => <BlockedRow item={item} onUnblock={handleUnblock} />}
          refreshing={loading}
          onRefresh={refresh}
          contentContainerClassName="pt-2 pb-6"
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center pt-24 px-8">
              <Text className="text-nun-muted text-[15px] text-center">
                No has bloqueado a nadie.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
