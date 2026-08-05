import { View } from 'react-native';
import { Image } from 'expo-image';

import { Text } from '@/components/ui';

type Props = {
  url?: string | null;
  name?: string | null;
  size?: number;
};

function initials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

// Avatar del interlocutor: foto si la hay, si no un círculo con las iniciales.
export function ChatAvatar({ url, name, size = 48 }: Props) {
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        contentFit="cover"
        transition={150}
        accessibilityIgnoresInvertColors
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#F0E5D0' }}
      />
    );
  }
  return (
    <View
      className="bg-nun-parchment items-center justify-center"
      style={{ width: size, height: size, borderRadius: size / 2 }}
    >
      <Text className="text-nun-brown font-semibold" style={{ fontSize: size * 0.38 }}>
        {initials(name)}
      </Text>
    </View>
  );
}
