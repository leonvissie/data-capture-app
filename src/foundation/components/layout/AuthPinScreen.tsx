import { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/foundation/components/layout/AppText';
import { componentMetrics } from '@/foundation/theme';
import { AuthCenteredViewport } from './AuthCenteredViewport';

type AuthPinScreenProps = PropsWithChildren<{
  title: string;
  subtitle: string;
  stepLabel?: string;
  notice?: string | null;
  footer?: React.ReactNode;
}>;

export function AuthPinScreen({ title, subtitle, stepLabel, notice, footer, children }: AuthPinScreenProps) {
  return (
    <AuthCenteredViewport>
      <View style={styles.copy}>
        <AppText variant="pageTitle" style={styles.centerText}>
          {title}
        </AppText>
        <AppText style={styles.centerText}>{subtitle}</AppText>
        {notice ? <AppText style={styles.centerText}>{notice}</AppText> : null}
        {stepLabel ? <AppText style={styles.centerText}>{stepLabel}</AppText> : null}
      </View>

      {children}

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </AuthCenteredViewport>
  );
}

const styles = StyleSheet.create({
  copy: {
    gap: componentMetrics.authPinScreen.copyGap,
  },
  centerText: {
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: componentMetrics.authPinScreen.footerPaddingVertical,
  },
});
