import { Pressable, Text, type PressableProps } from 'react-native';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: ButtonVariant;
  className?: string;
};

const containerVariants: Record<ButtonVariant, string> = {
  primary: 'bg-nun-brown',
  secondary: 'bg-nun-sand border border-nun-parchment',
  ghost: 'bg-transparent',
  danger: 'bg-nun-error',
};

const labelVariants: Record<ButtonVariant, string> = {
  primary: 'text-white',
  secondary: 'text-nun-dark',
  ghost: 'text-nun-brown',
  danger: 'text-white',
};

export function Button({ label, variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`rounded-xl px-5 py-3 items-center justify-center active:opacity-80 ${containerVariants[variant]} ${className ?? ''}`}
      {...props}
    >
      <Text className={`text-[15px] font-semibold ${labelVariants[variant]}`}>{label}</Text>
    </Pressable>
  );
}
