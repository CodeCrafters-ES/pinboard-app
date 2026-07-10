import { useMemo } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Markdown from 'react-native-markdown-display';

import { usePostDetail } from '@/hooks/usePostDetail';
import { usePostReactions } from '@/hooks/usePostReactions';
import { usePostRating } from '@/hooks/usePostRating';
import { useComments } from '@/hooks/useComments';
import { useSession } from '@/hooks/useSession';
import { usePostEngagement } from '@/hooks/usePostEngagement';
import { createEngagementSink, trackLinkClick } from '@/lib/engagement';
import { Button, StarRating, Text } from '@/components/ui';
import { ReactionPicker } from '@/components/reactions';
import { CommentComposer, CommentsList } from '@/components/comments';
import type { CommentAuthor } from '@/lib/comments';

function getCoverUrl(url: string): string {
  return (
    url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') +
    '?width=1080&quality=85'
  );
}

// Host only, without www. — regex-based so it doesn't rely on RN's partial URL impl.
function getDomain(url: string): string {
  const match = url.match(/^https?:\/\/([^/]+)/i);
  return match ? match[1]!.replace(/^www\./, '') : url;
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
  const {
    myRating,
    average: ratingAverage,
    count: ratingCount,
    loading: ratingLoading,
    rate,
  } = usePostRating(id ?? '');
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

  // Engagement (EPIC-N04, ADR-001): un sink por apertura de pantalla que encola los
  // heartbeats hacia la Edge Function track-engagement. El evento `init` (fila `viewed`)
  // se emite al montar; `onScroll` alimenta el scroll monótono al ScrollView del post.
  // El sink se auto-reinicia en cada `init`, así que no depende de `id`.
  const onEngagementEvent = useMemo(() => createEngagementSink(), []);
  const { onScroll, sessionId } = usePostEngagement(id ?? '', { onEvent: onEngagementEvent });

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
        <ScrollView
          contentContainerClassName="pb-10"
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
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

            <StarRating
              value={myRating}
              average={ratingAverage}
              count={ratingCount}
              onRate={rate}
              disabled={ratingLoading}
            />

            <View className="mt-1 gap-1">
              <Button
                label="Leer noticia →"
                variant="primary"
                accessibilityRole="link"
                onPress={() => {
                  // Enqueue before opening: the browser opens regardless, and the
                  // click survives offline in the shared queue (retried on reconnect).
                  trackLinkClick(post.id, sessionId).catch(() => {});
                  Linking.openURL(post.external_url);
                }}
              />
              <Text className="text-xs text-nun-muted self-center">
                {getDomain(post.external_url)}
              </Text>
            </View>

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
