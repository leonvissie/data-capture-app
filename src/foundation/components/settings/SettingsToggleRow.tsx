import { StyleSheet, Switch, View } from 'react-native';

import { Divider } from '@/foundation/components/content/Divider';
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
    <View>
      <View style={styles.row}>
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
      {!hideDivider ? <Divider spacing="sm" /> : null}
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
  },
  copy: {
    flex: 1,
    gap: spacing.xs,
  },
});
