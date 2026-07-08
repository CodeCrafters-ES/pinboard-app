import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MessageCircle } from 'lucide-react-native';

import { Text } from '@/components/ui';

export default function ChatScreen() {
  return (
    <SafeAreaView className="flex-1 bg-nun-linen" edges={['top', 'bottom']}>
      <View className="px-5 pt-2 pb-4">
        <Text className="text-[28px] font-bold text-nun-dark">Chat</Text>
      </View>

      <View className="flex-1 items-center justify-center px-10 gap-4">
        <View className="w-16 h-16 rounded-full bg-nun-sand items-center justify-center">
          <MessageCircle size={28} color="#8C7B6A" />
        </View>
        <Text className="text-[17px] font-semibold text-nun-dark text-center">Próximamente</Text>
        <Text className="text-[15px] text-nun-muted text-center leading-snug">
          La mensajería con tu equipo estará disponible muy pronto.
        </Text>
      </View>
    </SafeAreaView>
  );
}
