import { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSurfacePalette } from '@/foundation/hooks/useThemeMode';
import { spacing } from '@/foundation/theme';

export function AppScreen({ children }: PropsWithChildren) {
  const palette = useSurfacePalette();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <View style={styles.content}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
});
