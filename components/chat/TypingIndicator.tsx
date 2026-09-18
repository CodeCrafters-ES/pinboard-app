import { View } from 'react-native';

import { Text } from '@/components/ui';

type Props = {
  visible: boolean;
  name?: string | null;
};

// Indicador "escribiendo…" bajo la cabecera del hilo. No renderiza nada si no aplica.
export function TypingIndicator({ visible, name }: Props) {
  if (!visible) return null;
  return (
    <View className="px-4 py-1">
      <Text className="text-xs text-nun-muted italic">
        {name ? `${name} está escribiendo…` : 'Escribiendo…'}
      </Text>
    </View>
  );
}
