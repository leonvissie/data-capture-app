import { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { componentMetrics, spacing } from '@/foundation/theme';

export function AuthFooterActions({ children }: PropsWithChildren) {
  return <View style={styles.container}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: componentMetrics.authPinScreen.footerActionsMaxWidth,
    alignSelf: 'center',
    gap: spacing.sm,
    paddingTop: componentMetrics.authPinScreen.footerActionsTopPadding,
  },
});
