import { Alert, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Trash2 } from 'lucide-react-native';

import { Button, Text } from '@/components/ui';
import type { CommentWithAuthor } from '@/lib/comments';

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `Hace ${hours} h`;
  return new Date(isoDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

function initials(fullName: string | null): string {
  if (!fullName) return '—';
  return (
    fullName
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '—'
  );
}

function CommentItem({
  comment,
  canDelete,
  onDelete,
}: {
  comment: CommentWithAuthor;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const name = comment.author?.full_name ?? 'Usuario';

  function handleDelete() {
    Alert.alert('Borrar comentario', '¿Seguro que quieres borrar este comentario?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: onDelete },
    ]);
  }

  return (
    <View className="flex-row gap-3">
      {comment.author?.avatar_url ? (
        <Image
          source={{ uri: comment.author.avatar_url }}
          contentFit="cover"
          style={{ width: 32, height: 32, borderRadius: 16 }}
        />
      ) : (
        <View className="w-8 h-8 rounded-full bg-nun-sand items-center justify-center">
          <Text className="text-xs font-semibold text-nun-muted">
            {initials(comment.author?.full_name ?? null)}
          </Text>
        </View>
      )}

      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text className="text-[13px] font-semibold text-nun-dark flex-1" numberOfLines={1}>
            {name}
          </Text>
          <Text className="text-xs text-nun-muted">{formatRelativeTime(comment.created_at)}</Text>
          {canDelete ? (
            <Pressable
              onPress={handleDelete}
              accessibilityRole="button"
              accessibilityLabel="Borrar comentario"
              hitSlop={8}
              className="active:opacity-60"
            >
              <Trash2 size={16} color="#C0392B" />
            </Pressable>
          ) : null}
        </View>
        <Text className="text-[15px] text-nun-dark">{comment.body}</Text>
      </View>
    </View>
  );
}

type Props = {
  comments: CommentWithAuthor[];
  currentUserId: string | null;
  isAdmin: boolean;
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onDelete: (commentId: string) => void;
};

export function CommentsList({
  comments,
  currentUserId,
  isAdmin,
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  onDelete,
}: Props) {
  if (loading) {
    return <Text className="text-nun-muted text-[14px]">Cargando comentarios…</Text>;
  }

  if (comments.length === 0) {
    return (
      <View className="items-center py-6">
        <Text className="text-nun-muted text-[14px]">Sé el primero en comentar</Text>
      </View>
    );
  }

  return (
    <View className="gap-4">
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          canDelete={comment.author_id === currentUserId || isAdmin}
          onDelete={() => onDelete(comment.id)}
        />
      ))}

      {hasMore ? (
        <Button
          label={loadingMore ? 'Cargando…' : 'Ver más comentarios'}
          variant="ghost"
          onPress={onLoadMore}
          disabled={loadingMore}
        />
      ) : null}
    </View>
  );
}
