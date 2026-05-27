import { StyleSheet, View } from 'react-native';

import { Button } from '@/foundation/components/buttons/Button';
import { Card } from '@/foundation/components/content/Card';
import { AppText } from '@/foundation/components/layout/AppText';
import { spacing } from '@/foundation/theme';
import type { ValidationIssue } from '@/foundation/validation/types';

type ValidationSummaryCardProps = {
  title: string;
  issues: ValidationIssue[];
  onPrimaryAction?: () => void;
  primaryActionLabel?: string;
  onSecondaryAction?: () => void;
  secondaryActionLabel?: string;
};

export function ValidationSummaryCard({
  title,
  issues,
  onPrimaryAction,
  primaryActionLabel = 'Fix issues',
  onSecondaryAction,
  secondaryActionLabel = 'Continue',
}: ValidationSummaryCardProps) {
  if (!issues.length) return null;

  return (
    <Card>
      <AppText variant="cardTitle">{title}</AppText>
      <View style={styles.list}>
        {issues.map((issue) => (
          <View key={issue.key} style={styles.itemRow}>
            <AppText>{'•'}</AppText>
            <AppText style={styles.itemText}>{issue.message}</AppText>
          </View>
        ))}
      </View>
      <View style={styles.actions}>
        {onPrimaryAction ? <Button label={primaryActionLabel} onPress={onPrimaryAction} tone="orange" variant="soft" size="sm" /> : null}
        {onSecondaryAction ? <Button label={secondaryActionLabel} onPress={onSecondaryAction} tone="blue" variant="solid" size="sm" /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.xs,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  itemText: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
});
