import { Pressable, View } from 'react-native';
import { Star } from 'lucide-react-native';

import { Text } from '@/components/ui/Text';

export type StarRatingProps = {
  value: number | null; // the caller's own rating, null if not rated yet
  average: number;
  count: number;
  onRate: (value: number) => void;
  disabled?: boolean;
};

const STARS = [1, 2, 3, 4, 5];
const ACTIVE_COLOR = '#FACC15'; // text-yellow-400
const EMPTY_COLOR = '#D1D5DB'; // text-gray-300

export function StarRating({ value, average, count, onRate, disabled }: StarRatingProps) {
  const current = value ?? 0;

  return (
    <View className="border-t border-nun-parchment pt-2 mt-1 gap-1">
      <View className="flex-row items-center">
        {STARS.map((star) => {
          const filled = star <= current;
          return (
            <Pressable
              key={star}
              onPress={() => onRate(star)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`Valorar con ${star} ${star === 1 ? 'estrella' : 'estrellas'}`}
              accessibilityState={{ selected: value === star }}
              hitSlop={6}
              className="py-1 pr-1.5 active:opacity-70"
            >
              <Star
                size={26}
                color={filled ? ACTIVE_COLOR : EMPTY_COLOR}
                fill={filled ? ACTIVE_COLOR : 'transparent'}
              />
            </Pressable>
          );
        })}
      </View>
      <Text className="text-xs text-nun-muted">
        {count > 0
          ? `${average.toFixed(1)} · ${count} ${count === 1 ? 'valoración' : 'valoraciones'}`
          : 'Sé el primero en valorar'}
      </Text>
    </View>
  );
}
