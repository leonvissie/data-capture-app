import { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { useSurfacePalette } from '@/foundation/hooks/useThemeMode';
import { radii, spacing } from '@/foundation/theme';

type CardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
}>;

export function Card({ children, style }: CardProps) {
  const palette = useSurfacePalette();
  return <View style={[styles.base, { backgroundColor: palette.card, borderColor: palette.border }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.sm },
});
