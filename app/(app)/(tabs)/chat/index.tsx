import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MessageCircle, PenSquare } from 'lucide-react-native';

import { Text } from '@/components/ui';
import { ChatListRow } from '@/components/chat';
import { useSession } from '@/hooks/useSession';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import type { MyChat } from '@/lib/chat';

export default function ChatListScreen() {
  const router = useRouter();
  const { session } = useSession();
  const userId = session?.userId ?? null;
  const { chats, loading, error, refresh } = useUnreadCount();

  // Al volver del hilo, refrescar para reflejar el last_read_at actualizado.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const isFirstLoad = loading && chats.length === 0;

  function openChat(chat: MyChat) {
    router.push({
      pathname: '/(app)/(tabs)/chat/[chatId]',
      params: {
        chatId: chat.chat_id,
        name: chat.partner_name ?? 'Chat',
        avatarUrl: chat.partner_avatar_url ?? '',
        partnerId: chat.partner_user_id ?? '',
      },
    } as never);
  }

  return (
    <SafeAreaView className="flex-1 bg-nun-linen" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-5 pt-2 pb-3">
        <Text className="text-[28px] font-bold text-nun-dark">Chat</Text>
        <Pressable
          onPress={() => router.push('/(app)/(tabs)/chat/nuevo' as never)}
          accessibilityRole="button"
          accessibilityLabel="Nuevo chat"
          hitSlop={8}
          className="w-10 h-10 rounded-full bg-nun-sand items-center justify-center active:opacity-70"
        >
          <PenSquare size={20} color="#7D5A3A" />
        </Pressable>
      </View>

      {error && !isFirstLoad ? (
        <View className="mx-4 mb-2 bg-red-50 border border-nun-error rounded-xl px-4 py-3 flex-row items-center justify-between">
          <Text className="text-xs text-nun-error flex-1 mr-2">{error}</Text>
          <Pressable onPress={refresh} accessibilityRole="button" accessibilityLabel="Reintentar">
            <Text className="text-xs font-semibold text-nun-brown">Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {isFirstLoad ? (
        <ActivityIndicator className="mt-10" color="#7D5A3A" />
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item.chat_id}
          renderItem={({ item }) => (
            <ChatListRow chat={item} currentUserId={userId} onPress={() => openChat(item)} />
          )}
          ItemSeparatorComponent={() => <View className="h-px bg-nun-parchment ml-[76px]" />}
          refreshControl={
            <RefreshControl
              refreshing={loading && chats.length > 0}
              onRefresh={refresh}
              tintColor="#7D5A3A"
            />
          }
          ListEmptyComponent={
            !loading ? (
              <View className="flex-1 items-center justify-center px-10 gap-4 pt-24">
                <View className="w-16 h-16 rounded-full bg-nun-sand items-center justify-center">
                  <MessageCircle size={28} color="#8C7B6A" />
                </View>
                <Text className="text-[15px] text-nun-muted text-center leading-snug">
                  Aún no tienes conversaciones. Empieza una nueva con tu equipo.
                </Text>
                <Pressable
                  onPress={() => router.push('/(app)/(tabs)/chat/nuevo' as never)}
                  accessibilityRole="button"
                  className="bg-nun-brown rounded-xl px-6 py-3 active:opacity-80"
                >
                  <Text className="text-nun-white font-semibold">Nuevo chat</Text>
                </Pressable>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
