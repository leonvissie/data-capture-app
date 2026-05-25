import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/foundation/components/layout/AppText';
import { useSurfacePalette } from '@/foundation/hooks/useThemeMode';
import { radii, spacing } from '@/foundation/theme';

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

export function PrimaryButton({ label, onPress, disabled }: PrimaryButtonProps) {
  const palette = useSurfacePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed ? palette.primaryEmphasis : palette.primary,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <AppText variant="buttonLabel" style={{ color: '#FFFFFF' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
