import { PropsWithChildren } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function AuthCenteredViewport({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const usableHeight = Math.max(0, height - insets.top - insets.bottom);

  return (
    <View style={[styles.container, { minHeight: usableHeight }]}>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
  },
  content: {
    width: '100%',
  },
});
