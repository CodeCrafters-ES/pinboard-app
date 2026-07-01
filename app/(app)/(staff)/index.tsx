import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFeed, type PostWithAuthor } from '@/hooks/useFeed';
import { PostCard } from '@/components/PostCard';
import { Text } from '@/components/ui';

function PostCardSkeleton() {
  return (
    <View className="bg-white mx-4 my-1.5 rounded-2xl overflow-hidden">
      <View className="w-full bg-nun-sand" style={{ height: 180 }} />
      <View className="px-4 pt-3 pb-4 gap-2">
        <View className="h-4 bg-nun-sand rounded-lg" style={{ width: '75%' }} />
        <View className="h-3 bg-nun-sand rounded-lg" style={{ width: '50%' }} />
        <View className="h-3 bg-nun-sand rounded-lg mt-1" style={{ width: '35%' }} />
      </View>
    </View>
  );
}

function FeedSkeleton() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <PostCardSkeleton key={i} />
      ))}
    </>
  );
}

export default function FeedScreen() {
  const router = useRouter();
  const { posts, loading, error, hasMore, loadMore, refresh } = useFeed();

  const isFirstLoad = loading && posts.length === 0;
  const isRefreshing = !isFirstLoad && loading && posts.length > 0;

  return (
    <SafeAreaView className="flex-1 bg-nun-linen" edges={['bottom']}>
      <Stack.Screen options={{ title: 'Noticias', headerShown: true }} />

      {error && !isFirstLoad ? (
        <View className="mx-4 mt-3 bg-red-50 border border-nun-error rounded-xl px-4 py-3 flex-row items-center justify-between">
          <Text className="text-xs text-nun-error flex-1 mr-2">{error}</Text>
          <Pressable onPress={refresh} accessibilityRole="button" accessibilityLabel="Reintentar">
            <Text className="text-xs font-semibold text-nun-brown">Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {isFirstLoad ? (
        <View className="flex-1">
          <FeedSkeleton />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item: PostWithAuthor) => item.id}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              onPress={() => router.push(`/(app)/(staff)/${item.id}` as never)}
            />
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor="#7D5A3A"
            />
          }
          contentContainerClassName="pb-6 pt-2"
          ListEmptyComponent={
            !loading ? (
              <View className="flex-1 items-center justify-center py-24">
                <Text className="text-nun-muted text-[15px] text-center px-8">
                  Aún no hay noticias.
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            loading && posts.length > 0 ? (
              <ActivityIndicator className="py-6" color="#7D5A3A" />
            ) : null
          }
        />
      )}

      {error && isFirstLoad ? (
        <View className="flex-1 items-center justify-center px-8 gap-4">
          <Text className="text-nun-muted text-center">{error}</Text>
          <Pressable
            onPress={refresh}
            accessibilityRole="button"
            className="bg-nun-brown rounded-xl px-6 py-3"
          >
            <Text className="text-white font-semibold">Reintentar</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
