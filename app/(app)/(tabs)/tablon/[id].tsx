import { useMemo } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Markdown from 'react-native-markdown-display';

import { usePostDetail } from '@/hooks/usePostDetail';
import { usePostReactions } from '@/hooks/usePostReactions';
import { useComments } from '@/hooks/useComments';
import { useSession } from '@/hooks/useSession';
import { Button, Text } from '@/components/ui';
import { ReactionPicker } from '@/components/reactions';
import { CommentComposer, CommentsList } from '@/components/comments';
import type { CommentAuthor } from '@/lib/comments';

function getCoverUrl(url: string): string {
  return (
    url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') +
    '?width=1080&quality=85'
  );
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `Hace ${Math.max(1, minutes)} min`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `Hace ${hours} h`;
  return new Date(isoDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

function PostDetailSkeleton() {
  return (
    <View className="flex-1 bg-nun-white">
      <View className="w-full bg-nun-sand" style={{ aspectRatio: 16 / 9 }} />
      <View className="px-5 pt-4 gap-2">
        <View className="h-6 bg-nun-sand rounded-lg" style={{ width: '85%' }} />
        <View className="h-4 bg-nun-sand rounded-lg" style={{ width: '60%' }} />
        <View className="h-3 bg-nun-sand rounded-lg mt-2" style={{ width: '40%' }} />
      </View>
    </View>
  );
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { post, loading, error } = usePostDetail(id);
  const { myReaction, counts, loading: reactionsLoading, toggle } = usePostReactions(id ?? '');
  const { session, profile } = useSession();

  const currentUser = useMemo<CommentAuthor | null>(() => {
    if (!session) return null;
    return {
      user_id: session.userId,
      full_name: [profile?.name, profile?.surname].filter(Boolean).join(' ') || null,
      avatar_url: profile?.avatar_url ?? null,
    };
  }, [session, profile?.name, profile?.surname, profile?.avatar_url]);

  const {
    comments,
    total: commentsTotal,
    loading: commentsLoading,
    loadingMore: commentsLoadingMore,
    hasMore: commentsHasMore,
    loadMore: loadMoreComments,
    add: addComment,
    remove: removeComment,
  } = useComments(id ?? '', currentUser);

  // Punto de inserción para el futuro tracker de engagement (EPIC-N04, ADR-001):
  // aquí se registrará el evento `view` una vez cargado `post`. No implementado en este issue.

  return (
    <View className="flex-1 bg-nun-white">
      <Stack.Screen options={{ headerShown: true, title: '' }} />

      {loading ? <PostDetailSkeleton /> : null}

      {!loading && (error || !post) ? (
        <View className="flex-1 items-center justify-center px-8 gap-4 bg-nun-linen">
          <Text className="text-nun-muted text-center">No disponible</Text>
          <Button label="Volver" variant="secondary" onPress={() => router.back()} />
        </View>
      ) : null}

      {!loading && post ? (
        <ScrollView contentContainerClassName="pb-10" keyboardShouldPersistTaps="handled">
          {post.cover_image_url ? (
            <Image
              source={{ uri: getCoverUrl(post.cover_image_url) }}
              contentFit="cover"
              transition={200}
              accessibilityLabel={post.title}
              style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#F0E5D0' }}
            />
          ) : null}

          <View className="px-5 pt-4 gap-3">
            <Text className="text-[24px] font-bold text-nun-dark leading-tight">
              {post.title}
            </Text>

            {post.subtitle ? (
              <Text className="text-[15px] text-nun-muted">{post.subtitle}</Text>
            ) : null}

            <View className="flex-row items-center gap-2">
              {post.author.avatar_url ? (
                <Image
                  source={{ uri: post.author.avatar_url }}
                  contentFit="cover"
                  style={{ width: 32, height: 32, borderRadius: 16 }}
                />
              ) : (
                <View className="w-8 h-8 rounded-full bg-nun-sand items-center justify-center">
                  <Text className="text-xs font-semibold text-nun-muted">
                    {[post.author.name, post.author.surname]
                      .filter(Boolean)
                      .map((w) => w![0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase() || '—'}
                  </Text>
                </View>
              )}
              <Text className="text-xs text-nun-muted flex-1" numberOfLines={1}>
                {[post.author.name, post.author.surname].filter(Boolean).join(' ') || '—'}
                {post.published_at ? ` · ${formatRelativeTime(post.published_at)}` : ''}
              </Text>
            </View>

            <ReactionPicker
              activeReaction={myReaction}
              counts={counts}
              onToggle={toggle}
              loading={reactionsLoading}
            />

            <Button
              label="Leer noticia →"
              variant="primary"
              onPress={() => Linking.openURL(post.external_url)}
              className="mt-1"
            />

            {post.body ? (
              <View className="mt-3">
                <Markdown>{post.body}</Markdown>
              </View>
            ) : null}

            <View className="mt-6 border-t border-nun-parchment pt-5 gap-4">
              <Text className="text-[17px] font-bold text-nun-dark">
                Comentarios{commentsLoading ? '' : ` (${commentsTotal})`}
              </Text>
              <CommentComposer onSubmit={addComment} />
              <CommentsList
                comments={comments}
                currentUserId={session?.userId ?? null}
                isAdmin={session?.role === 'admin'}
                loading={commentsLoading}
                hasMore={commentsHasMore}
                loadingMore={commentsLoadingMore}
                onLoadMore={loadMoreComments}
                onDelete={removeComment}
              />
            </View>
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}
