import React, { useMemo } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTones } from '../theme/tones';

export type CollapseToggleTone =
  | 'teal'
  | 'purple'
  | 'blue'
  | 'green'
  | 'orange'
  | 'pink'
  | 'red'
  | 'grey'
  | 'lightBlue';

type Props = {
  expanded: boolean;
  disabled?: boolean;
  onPress: () => void;
  tone?: CollapseToggleTone;
  showLabel?: boolean;
  expandLabel?: string;
  collapseLabel?: string;
  style?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  iconColor?: string;
};

const CollapseToggleChip: React.FC<Props> = ({
  expanded,
  disabled = false,
  onPress,
  tone = 'grey',
  showLabel = true,
  expandLabel = 'Expand',
  collapseLabel = 'Collapse',
  style,
  backgroundColor,
  borderColor,
  textColor,
  iconColor,
}) => {
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral), [neutral]);
  const tonePalette = tones[tone];
  const resolvedBackground = backgroundColor ?? tonePalette.surface;
  const resolvedBorder = borderColor ?? tonePalette.border;
  const resolvedText = textColor ?? tonePalette.onSurface;
  const resolvedIcon = iconColor ?? tonePalette.onSurface;

  return (
    <Pressable
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: resolvedBackground,
          borderColor: resolvedBorder,
        },
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.pressed : null,
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled, expanded }}
    >
      {showLabel ? (
        <Text style={[styles.text, { color: resolvedText }]}>{expanded ? collapseLabel : expandLabel}</Text>
      ) : null}
      <Ionicons
        name={expanded ? 'chevron-up' : 'chevron-down'}
        size={16}
        color={disabled ? neutral.base : resolvedIcon}
      />
    </Pressable>
  );
};

const createStyles = (neutral: ReturnType<typeof useTones>['grey']) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      minHeight: 30,
    },
    text: {
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    disabled: {
      opacity: 0.55,
    },
    pressed: {
      opacity: 0.88,
    },
  });

export default CollapseToggleChip;
