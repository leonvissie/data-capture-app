import { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSurfacePalette } from '@/foundation/hooks/useThemeMode';
import { radii, spacing } from '@/foundation/theme';

export function Card({ children }: PropsWithChildren) {
  const palette = useSurfacePalette();
  return <View style={[styles.base, { backgroundColor: palette.card, borderColor: palette.border }]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.sm },
});
