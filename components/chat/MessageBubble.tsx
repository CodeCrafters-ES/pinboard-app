import { Alert, Pressable, View } from 'react-native';

import { Text } from '@/components/ui';
import { displayContent, type ChatMessage } from '@/lib/chat';

type Props = {
  message: ChatMessage;
  isOwn: boolean;
  isAdmin: boolean;
  onRetry: (clientId: string) => void;
  onDelete: (message: ChatMessage) => void;
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

// Burbuja de un mensaje. Alinea a la derecha las propias; muestra el estado del envío
// optimista (enviando / no enviado + reintentar) y enmascara el soft delete.
// Long-press en un mensaje borrable abre confirmación: el autor borra el suyo; un admin
// puede moderar cualquiera.
export function MessageBubble({ message, isOwn, isAdmin, onRetry, onDelete }: Props) {
  const deleted = message.deleted_at !== null;
  const failed = message._status === 'failed';
  const pending = message._status === 'pending';

  // Solo mensajes persistidos y no borrados: el autor o un admin (moderación).
  const canDelete = (isOwn || isAdmin) && !deleted && !pending && !failed;

  function handleLongPress() {
    if (!canDelete) return;
    Alert.alert(
      isOwn ? 'Borrar mensaje' : 'Borrar mensaje (moderación)',
      '¿Seguro que quieres borrar este mensaje?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: isOwn ? 'Borrar' : 'Borrar (moderación)',
          style: 'destructive',
          onPress: () => onDelete(message),
        },
      ],
    );
  }

  return (
    <View className={`px-4 my-0.5 ${isOwn ? 'items-end' : 'items-start'}`}>
      <Pressable
        onLongPress={canDelete ? handleLongPress : undefined}
        delayLongPress={350}
        accessibilityRole={canDelete ? 'button' : undefined}
        accessibilityLabel={canDelete ? 'Mantén pulsado para borrar' : undefined}
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
      </Pressable>

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
