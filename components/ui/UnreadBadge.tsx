import { View } from 'react-native';

import { Text } from '@/components/ui/Text';

export type UnreadBadgeProps = {
  count: number;
  max?: number;
};

// Badge de no leídos para la lista de chats. No renderiza nada cuando count <= 0
// (criterio de aceptación: el badge se oculta en 0). Satura a `max`+ (p. ej. "99+").
export function UnreadBadge({ count, max = 99 }: UnreadBadgeProps) {
  if (count <= 0) return null;
  const label = count > max ? `${max}+` : String(count);
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${count} sin leer`}
      className="min-w-5 h-5 px-1.5 rounded-full bg-nun-sea items-center justify-center"
    >
      <Text className="text-nun-white text-xs font-semibold">{label}</Text>
    </View>
  );
}
