import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTones } from '../theme/tones';

type RadioPillProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  error?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function RadioPill({ label, selected, onPress, error, style }: RadioPillProps) {
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        selected && styles.rowSelected,
        error && styles.rowError,
        pressed && styles.rowPressed,
        style,
      ]}
      accessibilityRole="button"
    >
      <View style={[styles.outer, selected && styles.outerActive]}>
        {selected ? <View style={styles.inner} /> : null}
      </View>
      <Text style={[styles.label, error && styles.labelError]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: neutral.border,
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: neutral.onBase,
    },
    rowSelected: {
      borderColor: tones.teal.emphasis,
      backgroundColor: tones.teal.surface,
    },
    rowError: {
      borderColor: tones.orange.base,
    },
    rowPressed: {
      opacity: 0.92,
    },
    outer: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: neutral.onSurface,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
    outerActive: {
      borderColor: tones.teal.emphasis,
    },
    inner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: tones.teal.emphasis,
    },
    label: {
      fontSize: 14,
      color: neutral.onSurface,
      fontWeight: '600',
    },
    labelError: {
      color: tones.orange.base,
    },
  });
