import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Text, View } from '@/components/ui';

export default function Index() {
  return (
    <SafeAreaView className="flex-1 bg-nun-linen">
      <View className="flex-1 items-center justify-center gap-4 p-6">
        <View className="h-16 w-16 items-center justify-center rounded-2xl bg-nun-brown">
          <Text className="text-2xl font-bold text-white">nūn</Text>
        </View>
        <Card>
          <Text className="text-lg font-semibold text-nun-dark">Nun Ibiza</Text>
          <Text className="text-nun-muted">PinBoard interno del equipo</Text>
        </Card>
      </View>
    </SafeAreaView>
  );
}
