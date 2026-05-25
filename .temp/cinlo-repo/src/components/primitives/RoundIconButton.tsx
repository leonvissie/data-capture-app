import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useTones } from '@/theme/tones';
import { radii } from '@/theme';
import type { IconRoundButtonType } from './roundIconButtonTypes';

export function RoundIconButton({
  buttonType,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  size = 44,
}: {
  buttonType: IconRoundButtonType;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  size?: number;
}) {
  const tones = useTones();
  const iconName = buttonType === 'close' ? 'close' : buttonType === 'back' ? 'chevron-back' : buttonType === 'add' ? 'add' : 'settings-outline';
  const base = tones.grey;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: radii.pill,
          backgroundColor: pressed ? base.emphasis : base.base,
        },
      ]}
    >
      <Ionicons name={iconName as any} size={Math.round(size * 0.45)} color={base.onBase} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
