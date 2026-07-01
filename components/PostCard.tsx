import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { ExternalLink } from 'lucide-react-native';

import { Text } from '@/components/ui';
import type { PostWithAuthor } from '@/lib/supabase/queries/posts';

type Props = {
  post: PostWithAuthor;
  onPress: () => void;
};

function getThumbUrl(url: string): string {
  return (
    url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') +
    '?width=400&height=400&resize=cover&quality=75'
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

export function PostCard({ post, onPress }: Props) {
  const thumbSource = post.cover_image_url ? { uri: getThumbUrl(post.cover_image_url) } : null;
  const authorName =
    [post.author.name, post.author.surname].filter(Boolean).join(' ') || '—';
  const publishedAt = post.published_at ? formatRelativeTime(post.published_at) : '';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={post.title}
      hitSlop={4}
      className="bg-white mx-4 my-1.5 rounded-2xl overflow-hidden active:opacity-70"
    >
      <Image
        source={thumbSource}
        contentFit="cover"
        transition={200}
        accessibilityIgnoresInvertColors
        style={{ width: '100%', height: 180, backgroundColor: '#F0E5D0' }}
      />

      <View className="px-4 pt-3 pb-4 gap-1">
        <Text className="text-[16px] font-bold text-nun-dark leading-snug" numberOfLines={2}>
          {post.title}
        </Text>

        {post.subtitle ? (
          <Text className="text-[13px] text-nun-muted" numberOfLines={1}>
            {post.subtitle}
          </Text>
        ) : null}

        <View className="flex-row items-center justify-between mt-1.5">
          <View className="flex-row items-center gap-1.5 flex-1 mr-2">
            <Text className="text-xs text-nun-muted" numberOfLines={1}>
              {authorName}
            </Text>
            {publishedAt ? (
              <>
                <Text className="text-xs text-nun-muted">·</Text>
                <Text className="text-xs text-nun-muted">{publishedAt}</Text>
              </>
            ) : null}
          </View>
          <ExternalLink size={14} color="#8C7B6A" />
        </View>
      </View>
    </Pressable>
  );
}
