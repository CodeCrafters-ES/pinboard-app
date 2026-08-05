import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui';
import { displayContent, type ChatMessage } from '@/lib/chat';

type Props = {
  message: ChatMessage;
  isOwn: boolean;
  onRetry: (clientId: string) => void;
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

// Burbuja de un mensaje. Alinea a la derecha las propias; muestra el estado del envío
// optimista (enviando / no enviado + reintentar) y enmascara el soft delete.
export function MessageBubble({ message, isOwn, onRetry }: Props) {
  const deleted = message.deleted_at !== null;
  const failed = message._status === 'failed';
  const pending = message._status === 'pending';

  return (
    <View className={`px-4 my-0.5 ${isOwn ? 'items-end' : 'items-start'}`}>
      <View
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${
          isOwn ? 'bg-nun-brown' : 'bg-white'
        } ${pending ? 'opacity-60' : ''}`}
      >
        <Text
          className={`text-[15px] leading-snug ${
            deleted ? 'italic ' : ''
          }${isOwn ? 'text-nun-white' : 'text-nun-dark'}`}
        >
          {displayContent(message)}
        </Text>
      </View>

      <View className="flex-row items-center gap-1.5 mt-0.5 px-1">
        {failed ? (
          <Pressable
            onPress={() => message._clientId && onRetry(message._clientId)}
            accessibilityRole="button"
            accessibilityLabel="Reintentar envío"
            hitSlop={6}
          >
            <Text className="text-[11px] text-nun-error font-semibold">No enviado · Reintentar</Text>
          </Pressable>
        ) : pending ? (
          <Text className="text-[11px] text-nun-muted">Enviando…</Text>
        ) : (
          <Text className="text-[11px] text-nun-muted">{formatTime(message.created_at)}</Text>
        )}
      </View>
    </View>
  );
}
