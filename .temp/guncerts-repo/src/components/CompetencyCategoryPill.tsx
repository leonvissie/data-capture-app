import React from 'react';
import { Pressable, Text, View, StyleSheet, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { useTones } from '../theme/tones';
import { CompetencyCategory } from '../data/types';

const getCategoryPalettes = (tones: ReturnType<typeof useTones>) => ({
  Handgun: tones.teal,
  Rifle: tones.teal,
  Shotgun: tones.teal,
  HandMachineCarbine: tones.teal,
});

type CompetencyCategoryPillProps = {
  category: CompetencyCategory;
  label: string;
  selected?: boolean;
  onPress?: () => void;
  size?: 'default' | 'compact';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
};

const CompetencyCategoryPill: React.FC<CompetencyCategoryPillProps> = ({
  category,
  label,
  selected = false,
  onPress,
  size = 'default',
  style,
  textStyle,
  accessibilityLabel,
}) => {
  const tones = useTones();
  const neutral = tones.grey;
  const categoryPalettes = getCategoryPalettes(tones);
  const palette = categoryPalettes[category];
  const pressable = Boolean(onPress);
  const baseStyles = [
    styles.pill,
    size === 'compact' && styles.pillCompact,
    {
      backgroundColor: selected ? palette.surface : neutral.onBase,
      borderColor: selected ? palette.base : palette.border,
      borderWidth: selected ? 2 : 1,
    },
  ];
  const combinedStyle: any[] = [...baseStyles];
  if (style) {
    if (Array.isArray(style)) {
      combinedStyle.push(...style);
    } else {
      combinedStyle.push(style);
    }
  }

  const labelStyle = [
    styles.label,
    { color: selected ? palette.onSurface : neutral.base },
    selected && styles.labelSelected,
    textStyle,
  ];

  const content = (
    <Text style={labelStyle} numberOfLines={1}>
      {label}
    </Text>
  );

  if (!pressable) {
    return <View style={combinedStyle}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [...combinedStyle, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {content}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  pillCompact: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  pressed: {
    opacity: 0.92,
  },
  label: {
    fontWeight: '600',
  },
  labelSelected: {
    fontWeight: '700',
  },
});

export default CompetencyCategoryPill;
