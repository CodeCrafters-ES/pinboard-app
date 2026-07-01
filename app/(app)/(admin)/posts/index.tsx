import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { Redirect, Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus } from 'lucide-react-native';

import { useSession } from '@/hooks/useSession';
import { usePosts, type Post } from '@/hooks/usePosts';
import { Text } from '@/components/ui';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  published: 'Publicado',
};

const STATUS_BG: Record<string, string> = {
  draft: 'bg-nun-parchment',
  published: 'bg-nun-sage',
};

const STATUS_TEXT: Record<string, string> = {
  draft: 'text-nun-dark',
  published: 'text-white',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function PostRow({ post, onPress }: { post: Post; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Editar: ${post.title}`}
      className="bg-white mx-4 my-1 rounded-xl px-4 py-3 active:opacity-70"
    >
      <View className="flex-row items-start justify-between gap-2">
        <Text className="flex-1 text-[15px] font-semibold text-nun-dark" numberOfLines={2}>
          {post.title}
        </Text>
        <View className={`rounded-full px-2 py-0.5 ${STATUS_BG[post.status]}`}>
          <Text className={`text-[11px] font-semibold ${STATUS_TEXT[post.status]}`}>
            {STATUS_LABEL[post.status]}
          </Text>
        </View>
      </View>

      {post.subtitle ? (
        <Text className="mt-0.5 text-xs text-nun-muted" numberOfLines={1}>
          {post.subtitle}
        </Text>
      ) : null}

      <Text className="mt-1 text-xs text-nun-muted">{formatDate(post.created_at)}</Text>
    </Pressable>
  );
}

export default function PostsListScreen() {
  const { session, profile } = useSession();
  const router = useRouter();

  const isManager = session?.role === 'manager';
  const authorId = isManager ? (profile?.id ?? undefined) : undefined;

  const { posts, loading, error, hasMore, loadNextPage, refresh } = usePosts({ authorId });

  if (session && session.role === 'staff') {
    return <Redirect href="/(app)/(staff)/" />;
  }

  const isRefreshing = loading && posts.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-nun-linen" edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Posts',
          headerShown: true,
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/(app)/(admin)/posts/new')}
              accessibilityRole="button"
              accessibilityLabel="Nuevo post"
              className="pr-2 py-1"
            >
              <Plus size={22} color="#7D5A3A" />
            </Pressable>
          ),
        }}
      />

      {error ? (
        <View className="mx-4 mt-3 bg-red-50 border border-nun-error rounded-xl px-4 py-3">
          <Text className="text-xs text-nun-error">{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostRow post={item} onPress={() => router.push(`/(app)/(admin)/posts/${item.id}/edit`)} />
        )}
        onEndReached={loadNextPage}
        onEndReachedThreshold={0.3}
        refreshing={isRefreshing}
        onRefresh={refresh}
        contentContainerClassName="pb-6 pt-2"
        ListEmptyComponent={
          !loading ? (
            <View className="flex-1 items-center justify-center py-16">
              <Text className="text-nun-muted text-[15px]">No hay posts todavía.</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          loading && posts.length > 0 ? (
            <ActivityIndicator className="py-4" color="#7D5A3A" />
          ) : hasMore && !loading && posts.length > 0 ? (
            <View className="py-4 items-center">
              <Text className="text-xs text-nun-muted">Cargando más…</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
