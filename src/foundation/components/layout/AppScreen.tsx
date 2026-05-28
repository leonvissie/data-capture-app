import { PropsWithChildren } from 'react';
import { ImageBackground, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSurfacePalette, useThemeMode } from '@/foundation/hooks/useThemeMode';
import { spacing } from '@/foundation/theme';
import darkBackground from '../../../../assets/datira-bg-dark.png';
import lightBackground from '../../../../assets/datira-bg-light.png';

export function AppScreen({ children }: PropsWithChildren) {
  const palette = useSurfacePalette();
  const { effectiveMode } = useThemeMode();
  const backgroundSource = effectiveMode === 'dark' ? darkBackground : lightBackground;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <ImageBackground source={backgroundSource} style={styles.background} resizeMode="cover">
        <View style={styles.overlay}>
          <View style={styles.content}>{children}</View>
        </View>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  background: { flex: 1 },
  overlay: { flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
});
