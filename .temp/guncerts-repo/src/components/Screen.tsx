import React, { useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, StyleSheet } from 'react-native';
import AppStatusBar from './AppStatusBar';

/**
 * Wrap tab screens with <Screen> so content respects the notch/Dynamic Island.
 * By default we protect top/left/right. Bottom is handled by the tab bar.
 */
export default function Screen(props: React.PropsWithChildren<{ padded?: boolean }>) {
  const { children, padded = true } = props;
  const styles = useMemo(() => createStyles(), []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <AppStatusBar />
      <View style={[styles.content, padded && styles.padded]}>{children}</View>
    </SafeAreaView>
  );
}

const createStyles = () =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: 'transparent' },
    content: { flex: 1 },
    padded: { paddingHorizontal: 10, paddingTop: 8 },
  });
