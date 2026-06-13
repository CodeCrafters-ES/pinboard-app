import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

export type TextProps = RNTextProps & {
  className?: string;
};

export function Text({ className, ...props }: TextProps) {
  return <RNText className={`text-[15px] text-nun-dark font-normal ${className ?? ''}`} {...props} />;
}
