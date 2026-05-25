import { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '@/foundation/theme';

export function StickyHeaderLayout({ header, children }: PropsWithChildren<{ header: ReactNode }>) {
  return (
    <View style={styles.root}>
      <View style={styles.header}>{header}</View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingBottom: spacing.sm },
  body: { flex: 1 },
});
