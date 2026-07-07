import { useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { Heart, ThumbsDown, ThumbsUp } from 'lucide-react-native';

import { Text } from '@/components/ui';
import type { ReactionCounts, ReactionType } from '@/lib/reactions';

type Props = {
  activeReaction: ReactionType | null;
  counts: ReactionCounts;
  onToggle: (type: ReactionType) => void;
  loading?: boolean;
};

const REACTIONS: Array<{
  type: ReactionType;
  label: string;
  Icon: typeof ThumbsUp;
  activeColor: string;
}> = [
  { type: 'like', label: 'Me gusta', Icon: ThumbsUp, activeColor: '#7D5A3A' },
  { type: 'dislike', label: 'No me gusta', Icon: ThumbsDown, activeColor: '#C0392B' },
  { type: 'love', label: 'Me encanta', Icon: Heart, activeColor: '#7A9060' },
];

function ReactionButton({
  label,
  Icon,
  activeColor,
  isActive,
  count,
  onPress,
  disabled,
}: {
  label: string;
  Icon: typeof ThumbsUp;
  activeColor: string;
  isActive: boolean;
  count: number;
  onPress: () => void;
  disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  function handlePress() {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.2, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    onPress();
  }

  const color = isActive ? activeColor : '#8C7B6A';
  const a11yLabel = `${label}${isActive ? ', activo' : ''}, ${count} ${count === 1 ? 'reacción' : 'reacciones'}`;

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityState={{ selected: isActive }}
      hitSlop={8}
      className="flex-row items-center gap-1 px-3 py-1.5 active:opacity-70"
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Icon size={18} color={color} />
      </Animated.View>
      {count > 0 ? (
        <Text className="text-[13px]" style={{ color }}>
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function ReactionPicker({ activeReaction, counts, onToggle, loading }: Props) {
  return (
    <View className="flex-row items-center border-t border-nun-parchment pt-2 mt-1">
      {REACTIONS.map(({ type, label, Icon, activeColor }) => (
        <ReactionButton
          key={type}
          label={label}
          Icon={Icon}
          activeColor={activeColor}
          isActive={activeReaction === type}
          count={counts[type]}
          onPress={() => onToggle(type)}
          disabled={loading}
        />
      ))}
    </View>
  );
}
