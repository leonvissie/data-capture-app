import { Pressable, StyleSheet, View } from 'react-native';

import { Divider } from '@/foundation/components/content/Divider';
import { AppText } from '@/foundation/components/layout/AppText';
import { useTones } from '@/foundation/hooks/useTones';
import { radii, spacing } from '@/foundation/theme';

type SettingsChoiceRowOption<T extends string | number> = {
  label: string;
  value: T;
};

type SettingsChoiceRowProps<T extends string | number> = {
  label: string;
  help: string;
  value: T;
  options: SettingsChoiceRowOption<T>[];
  onChange: (value: T) => void;
  hideDivider?: boolean;
};

export function SettingsChoiceRow<T extends string | number>({
  label,
  help,
  value,
  options,
  onChange,
  hideDivider = false,
}: SettingsChoiceRowProps<T>) {
  const tones = useTones();
  const grey = tones.grey;
  const teal = tones.teal;

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.copy}>
          <AppText variant="bodyStrong">{label}</AppText>
          <AppText variant="bodySmall" style={{ color: grey.base }}>
            {help}
          </AppText>
        </View>
        <View style={styles.options}>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <Pressable
                key={String(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onChange(option.value)}
                style={[
                  styles.option,
                  {
                    borderColor: selected ? teal.base : grey.border,
                    backgroundColor: selected ? teal.surface : 'transparent',
                  },
                ]}
              >
                <AppText variant="chipLabel" style={{ color: selected ? teal.emphasis : grey.base }}>
                  {option.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>
      {!hideDivider ? <Divider spacing="sm" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  copy: {
    gap: spacing.xs,
  },
  options: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  option: {
    minHeight: 34,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
});
