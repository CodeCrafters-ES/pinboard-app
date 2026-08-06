import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';

import { Text } from '@/components/ui';
import { ChatComposer, MessageBubble, TypingIndicator } from '@/components/chat';
import { useSession } from '@/hooks/useSession';
import { useChat } from '@/hooks/useChat';
import { usePresence } from '@/hooks/usePresence';
import { useTyping } from '@/hooks/useTyping';
import { useUserBlock } from '@/hooks/useUserBlock';
import { markChatAsRead, type ChatMessage } from '@/lib/chat';

const MARK_READ_THROTTLE_MS = 2000;

export default function ChatThreadScreen() {
  const { chatId, name, partnerId } = useLocalSearchParams<{
    chatId: string;
    name?: string;
    avatarUrl?: string;
    partnerId?: string;
  }>();
  const { session } = useSession();
  const userId = session?.userId ?? null;
  const isAdmin = session?.role === 'admin';

  const { messages, loading, loadingMore, hasMore, error, loadMore, sendMessage, retry, softDelete } =
    useChat(chatId);
  const { onlineUserIds } = usePresence(chatId);
  const { typingUserIds, setTyping } = useTyping(chatId);
  const {
    iBlocked,
    blocked,
    loading: blockLoading,
    toggle: toggleBlock,
  } = useUserBlock(partnerId ?? null);

  const partnerOnline = !!partnerId && onlineUserIds.includes(partnerId);
  const partnerTyping = typingUserIds.length > 0;

  // Marca el chat como leído al abrir y al llegar mensajes nuevos, con throttle.
  const lastMarkRef = useRef(0);
  const markRead = useCallback(() => {
    const now = Date.now();
    if (now - lastMarkRef.current < MARK_READ_THROTTLE_MS) return;
    lastMarkRef.current = now;
    markChatAsRead({ chatId }).catch(() => {});
  }, [chatId]);

  useEffect(() => {
    markRead();
  }, [markRead]);

  const newestId = messages[0]?.id;
  useEffect(() => {
    if (newestId) markRead();
  }, [newestId, markRead]);

  // Al salir del hilo, dejar de "escribiendo…": si no, quien queda con texto en el input
  // sin enviar dejaría el indicador colgado en el otro lado (useTyping no emite false en
  // su cleanup). Corre antes que el cleanup de useTyping, con el canal aún vivo.
  useEffect(() => () => setTyping(false), [setTyping]);

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <MessageBubble
        message={item}
        isOwn={item.sender_id === userId}
        isAdmin={isAdmin}
        onRetry={retry}
        onDelete={(m) => softDelete(m.id)}
      />
    ),
    [userId, isAdmin, retry, softDelete],
  );

  return (
    <SafeAreaView className="flex-1 bg-nun-linen" edges={['bottom']}>
      <Stack.Screen options={{ title: name || 'Chat' }} />

      <View className="flex-row items-center justify-between px-4 py-1 border-b border-nun-parchment">
        <Text className="text-xs text-nun-muted">
          {partnerOnline ? '● En línea' : 'Desconectado'}
        </Text>
        {partnerId ? (
          <Pressable
            onPress={toggleBlock}
            disabled={blockLoading}
            accessibilityRole="button"
            accessibilityLabel={iBlocked ? 'Desbloquear usuario' : 'Bloquear usuario'}
            hitSlop={8}
            className="active:opacity-60"
          >
            <Text className={`text-xs font-semibold ${iBlocked ? 'text-nun-muted' : 'text-nun-error'}`}>
              {iBlocked ? 'Desbloquear' : 'Bloquear'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {loading ? (
          <ActivityIndicator className="flex-1" color="#7D5A3A" />
        ) : error ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-nun-error text-center">{error}</Text>
          </View>
        ) : (
          <FlatList
            data={messages}
            inverted
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            onEndReached={hasMore ? loadMore : undefined}
            onEndReachedThreshold={0.3}
            contentContainerClassName="py-3"
            ListFooterComponent={
              loadingMore ? <ActivityIndicator className="py-3" color="#7D5A3A" /> : null
            }
            ListEmptyComponent={
              <View className="items-center justify-center pt-20">
                <Text className="text-nun-muted text-[15px]">Escribe el primer mensaje.</Text>
              </View>
            }
          />
        )}

        {blocked ? (
          <View className="px-4 py-3 border-t border-nun-parchment bg-nun-linen">
            <Text className="text-[13px] text-nun-muted text-center">
              {iBlocked
                ? 'Has bloqueado a este usuario. No puedes enviarle mensajes.'
                : 'No puedes enviar mensajes en este chat (bloqueo activo).'}
            </Text>
          </View>
        ) : (
          <>
            <TypingIndicator visible={partnerTyping} name={name} />
            <ChatComposer onSend={sendMessage} onTyping={setTyping} />
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
