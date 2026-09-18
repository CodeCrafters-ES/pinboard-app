import { Pressable, View } from 'react-native';

import { Text, UnreadBadge } from '@/components/ui';
import type { MyChat } from '@/lib/chat';
import { ChatAvatar } from './ChatAvatar';

type Props = {
  chat: MyChat;
  currentUserId: string | null;
  onPress: () => void;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 24 * 3_600_000) {
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 7 * 24 * 3_600_000) return d.toLocaleDateString('es-ES', { weekday: 'short' });
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

function previewText(chat: MyChat, currentUserId: string | null): string {
  if (!chat.last_message_sender_id) return 'Sin mensajes aún';
  const body = chat.last_message_content ?? 'Mensaje eliminado';
  return chat.last_message_sender_id === currentUserId ? `Tú: ${body}` : body;
}

// Fila de la lista de chats: avatar + nombre del interlocutor, preview del último
// mensaje, hora y badge de no leídos.
export function ChatListRow({ chat, currentUserId, onPress }: Props) {
  const name = chat.partner_name ?? 'Chat';
  const hasUnread = chat.unread_count > 0;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Chat con ${name}`}
      className="flex-row items-center gap-3 px-4 py-3 active:bg-nun-sand"
    >
      <ChatAvatar url={chat.partner_avatar_url} name={name} size={52} />

      <View className="flex-1">
        <View className="flex-row items-center justify-between">
          <Text
            className={`text-[16px] flex-1 mr-2 ${hasUnread ? 'font-bold text-nun-dark' : 'font-semibold text-nun-dark'}`}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text className="text-xs text-nun-muted">{formatWhen(chat.last_message_at)}</Text>
        </View>

        <View className="flex-row items-center justify-between mt-0.5">
          <Text
            className={`text-[14px] flex-1 mr-2 ${hasUnread ? 'text-nun-dark' : 'text-nun-muted'}`}
            numberOfLines={1}
          >
            {previewText(chat, currentUserId)}
          </Text>
          <UnreadBadge count={chat.unread_count} />
        </View>
      </View>
    </Pressable>
  );
}
