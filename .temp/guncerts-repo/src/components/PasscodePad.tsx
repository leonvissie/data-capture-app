import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, AccessibilityRole } from 'react-native';
import { useTones } from '../theme/tones';

type Props = {
  length?: number;                   // default 6
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;  // called once value reaches length
  disabled?: boolean;                // disable input while verifying/saving
};

export const PasscodePad: React.FC<Props> = ({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled = false
}) => {
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);

  const add = (d: string) => () => {
    if (disabled) return;
    if (value.length >= length) return;
    const next = value + d;
    onChange(next);
    if (next.length === length && onComplete) {
      // Let state update first so callers see the finished value
      setTimeout(() => onComplete(next), 0);
    }
  };

  const del = () => {
    if (disabled) return;
    if (value.length > 0) onChange(value.slice(0, -1));
  };

  const digitSubtitles: Record<string, string> = {
    '1': '',
    '2': 'ABC',
    '3': 'DEF',
    '4': 'GHI',
    '5': 'JKL',
    '6': 'MNO',
    '7': 'PQRS',
    '8': 'TUV',
    '9': 'WXYZ',
    '0': '',
  };

  const Button = ({
    label,
    subtitle,
    onPress,
    ariaLabel,
  }: {
    label: string;
    subtitle?: string;
    onPress: () => void;
    ariaLabel?: string;
  }) => (
    <Pressable
      accessibilityRole={'button' as AccessibilityRole}
      accessibilityLabel={ariaLabel ?? `Key ${label}`}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.key,
        pressed && styles.keyPressed,
        disabled && styles.keyDisabled,
      ]}
    >
      <View style={styles.keyContent}>
        <Text style={styles.keyText}>{label}</Text>
        {subtitle ? <Text style={styles.keySubText}>{subtitle}</Text> : null}
      </View>
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.dots}>
        {Array.from({ length }).map((_, i) => (
          <View key={i} style={[styles.dot, i < value.length && styles.dotFilled]} />
        ))}
      </View>

      <View style={styles.grid}>
        {['1','2','3','4','5','6','7','8','9'].map((d) => (
          <Button key={d} label={d} subtitle={digitSubtitles[d]} onPress={add(d)} />
        ))}

        {/* left spacer to center the 0 on the last row */}
        <View style={{ width: KEY_SIZE, height: KEY_SIZE }} />

        <Button label="0" subtitle={digitSubtitles['0']} onPress={add('0')} />
        <Button label="⌫" onPress={del} ariaLabel="Delete" />
      </View>
    </View>
  );
};

const KEY_SIZE = 68; // round key size (>=44 for accessibility)

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    wrap: { alignItems: 'center', gap: 20 },
    dots: { flexDirection: 'row', gap: 12, marginTop: 4, marginBottom: 8 },
    dot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: neutral.onSurface,
      backgroundColor: 'transparent',
    },
    dotFilled: { backgroundColor: neutral.onSurface },

    grid: {
      width: KEY_SIZE * 3 + 20 * 2, // 3 columns + gaps
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 18,
    },

    // ROUND KEY STYLE
    key: {
      width: KEY_SIZE,
      height: KEY_SIZE,
      borderRadius: KEY_SIZE / 2, // makes it a circle
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.onBase,
      alignItems: 'center',
      justifyContent: 'center',
    },
    keyPressed: {
      opacity: 0.8,
      borderColor: tones.teal.emphasis,
    },
    keyDisabled: {
      opacity: 0.5,
    },
    keyContent: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 38,
    },
    keyText: { fontSize: 22, color: neutral.onSurface, fontWeight: '600' },
    keySubText: {
      marginTop: -1,
      fontSize: 9,
      lineHeight: 11,
      letterSpacing: 1.2,
      color: neutral.base,
      fontWeight: '700',
    },
  });
