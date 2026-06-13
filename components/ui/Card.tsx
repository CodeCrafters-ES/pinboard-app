import { View as RNView, type ViewProps as RNViewProps } from 'react-native';

export type CardProps = RNViewProps & {
  className?: string;
};

export function Card({ className, ...props }: CardProps) {
  return <RNView className={`rounded-2xl bg-white shadow-sm p-4 ${className ?? ''}`} {...props} />;
}
