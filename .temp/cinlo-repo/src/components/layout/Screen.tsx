import React from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppStatusBar } from '@/components/system';
import { useSurfacePalette } from '@/providers';
import { spacing } from '@/theme';

type ScreenProps = React.PropsWithChildren<{
  padded?: boolean;
  style?: ViewStyle;
}>;

export default function Screen({ children, padded = true, style }: ScreenProps) {
  const palette = useSurfacePalette();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, 0) : 0;
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top', 'left', 'right']}>
      <AppStatusBar />
      <View style={[styles.content, padded && styles.padded, { paddingBottom: bottomInset + spacing.sm }, style]}>
        {children}
      </View>
      {Platform.OS === 'android' && bottomInset > 0 ? (
        <View
          pointerEvents="none"
          style={[
            styles.bottomScrim,
            {
              height: bottomInset,
              backgroundColor: palette.background,
            },
          ]}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1 },
  padded: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  bottomScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.96,
  },
});
