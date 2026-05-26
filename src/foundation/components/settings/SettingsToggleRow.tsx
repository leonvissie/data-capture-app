import { StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/foundation/components/layout/AppText';
import { useTones } from '@/foundation/hooks/useTones';
import { spacing } from '@/foundation/theme';

type SettingsToggleRowProps = {
  label: string;
  help: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  hideDivider?: boolean;
};

export function SettingsToggleRow({
  label,
  help,
  value,
  onValueChange,
  disabled = false,
  hideDivider = false,
}: SettingsToggleRowProps) {
  const tones = useTones();
  const grey = tones.grey;

  return (
    <View style={[styles.row, !hideDivider && { borderBottomColor: grey.border }]}>
      <View style={styles.copy}>
        <AppText variant="bodyStrong">{label}</AppText>
        <AppText variant="bodySmall" style={{ color: grey.base }}>
          {help}
        </AppText>
      </View>
      <Switch
        accessibilityLabel={label}
        accessibilityHint={help}
        accessibilityRole="switch"
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 68,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: 1,
  },
  copy: {
    flex: 1,
    gap: spacing.xs,
  },
});
