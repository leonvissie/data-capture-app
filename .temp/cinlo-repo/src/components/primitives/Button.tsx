import React from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { componentMetrics, radii, typography } from '@/theme';
import { useSurfacePalette } from '@/providers';
import { useTones } from '@/theme/tones';

export type ButtonTone = 'teal' | 'purple' | 'blue' | 'green' | 'orange' | 'pink' | 'red' | 'grey' | 'lightBlue';
export type ButtonVariant = 'solid' | 'outline' | 'ghost';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  variant?: ButtonVariant;
  selected?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  tone = 'grey',
  variant = 'outline',
  selected = false,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  style,
}: ButtonProps) {
  const tones = useTones();
  const palette = useSurfacePalette();
  const t = tones[tone];

  const resolvedVariant = selected ? 'solid' : variant;

  const cfg =
    resolvedVariant === 'solid'
      ? { bg: t.base, text: t.onBase, border: 'transparent' }
      : resolvedVariant === 'ghost'
        ? { bg: 'transparent', text: t.base, border: 'transparent' }
        : { bg: palette.card, text: t.base, border: t.border };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed ? t.surface : cfg.bg,
          borderColor: cfg.border,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <Text style={[styles.label, { color: cfg.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: componentMetrics.chip.minHeight,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: componentMetrics.chip.horizontalPadding,
    paddingVertical: componentMetrics.chip.verticalPadding,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    ...typography.chipLabel,
    textTransform: 'none',
    textAlign: 'center',
  },
});
