import { PropsWithChildren } from 'react';
import { Text, TextProps } from 'react-native';

import { useSurfacePalette } from '@/foundation/hooks/useThemeMode';
import { typography } from '@/foundation/theme';

type AppTextProps = PropsWithChildren<TextProps> & {
  variant?: keyof typeof typography;
};

export function AppText({ children, variant = 'body', style, ...rest }: AppTextProps) {
  const palette = useSurfacePalette();
  return (
    <Text style={[typography[variant], { color: palette.text }, style]} {...rest}>
      {children}
    </Text>
  );
}
