import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { RoundIconButton } from '@/foundation/components/buttons/RoundIconButton';
import type { RoundIconButtonType } from '@/foundation/components/buttons/roundIconButtonTypes';
import { spacing } from '@/foundation/theme';

import { AppText } from './AppText';

type HeaderAction = {
  buttonType: RoundIconButtonType;
  accessibilityLabel: string;
  onPress: () => void;
};

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  leftAction?: HeaderAction;
  rightAction?: HeaderAction;
  rightContent?: ReactNode;
};

export function PageHeader({ title, subtitle, leftAction, rightAction, rightContent }: PageHeaderProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={[styles.leftSlot, leftAction ? styles.leftSlotWithAction : null]}>
          {leftAction ? <RoundIconButton buttonType={leftAction.buttonType} accessibilityLabel={leftAction.accessibilityLabel} onPress={leftAction.onPress} size="md" /> : null}
        </View>
        <View style={styles.copy}>
          <AppText variant="pageTitle" style={styles.title} numberOfLines={1}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="bodySmall" style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        <View style={styles.rightSlot}>
          {rightContent}
          {rightAction ? <RoundIconButton buttonType={rightAction.buttonType} accessibilityLabel={rightAction.accessibilityLabel} onPress={rightAction.onPress} size="md" /> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  leftSlot: { minHeight: 48, justifyContent: 'center' },
  leftSlotWithAction: { width: 48, marginRight: spacing.sm },
  rightSlot: { marginLeft: spacing.sm, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  copy: { flex: 1, gap: spacing.xs },
  title: { textAlign: 'left' },
  subtitle: { textAlign: 'left' },
});
