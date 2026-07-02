import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { Text, Button } from '@/components/ui';

export default function ManagerPanel() {
  const router = useRouter();
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-nun-linen">
      <Text className="text-[22px] font-bold">Manager Panel</Text>
      <Button
        label="Gestionar posts"
        variant="primary"
        onPress={() => router.push('/(app)/(admin)/posts')}
      />
      <Button label="Mi perfil" variant="secondary" onPress={() => router.push('/profile')} />
    </View>
  );
}
