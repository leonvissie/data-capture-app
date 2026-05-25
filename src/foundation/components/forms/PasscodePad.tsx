import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/foundation/components/layout/AppText';
import { useTones } from '@/foundation/hooks/useTones';
import { minimumTouchTarget } from '@/foundation/lib/accessibility';
import { componentMetrics, radii, typography } from '@/foundation/theme';

type PasscodePadProps = {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
};

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const SUBTITLES: Record<string, string> = {
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

export function PasscodePad({ length = 6, value, onChange, onComplete, disabled = false }: PasscodePadProps) {
  const tones = useTones();
  const grey = tones.grey;
  const keySize = componentMetrics.passcodePad.keySize;

  const addDigit = (digit: string) => () => {
    if (disabled || value.length >= length) return;
    const next = `${value}${digit}`;
    onChange(next);
    if (next.length === length && onComplete) {
      setTimeout(() => onComplete(next), 0);
    }
  };

  const deleteDigit = () => {
    if (disabled || value.length === 0) return;
    onChange(value.slice(0, -1));
  };

  const dotIndexes = useMemo(() => Array.from({ length }, (_, index) => index), [length]);

  return (
    <View style={styles.wrap}>
      <View style={[styles.dots, { gap: componentMetrics.passcodePad.dotGap }]}>
        {dotIndexes.map((index) => (
          <View
            key={index}
            style={[
              styles.dot,
              {
                width: componentMetrics.passcodePad.dotSize,
                height: componentMetrics.passcodePad.dotSize,
                borderRadius: componentMetrics.passcodePad.dotRadius,
                borderWidth: componentMetrics.passcodePad.dotBorderWidth,
                borderColor: grey.onSurface,
              },
              index < value.length ? { backgroundColor: grey.onSurface } : null,
            ]}
          />
        ))}
      </View>

      <View style={[styles.grid, { rowGap: componentMetrics.passcodePad.rowGap }]}>
        <View style={[styles.row, { columnGap: componentMetrics.passcodePad.gridGap }]}>
          <PasscodeKey size={keySize} label={DIGITS[0]} subtitle={SUBTITLES[DIGITS[0]]} onPress={addDigit(DIGITS[0])} disabled={disabled} />
          <PasscodeKey size={keySize} label={DIGITS[1]} subtitle={SUBTITLES[DIGITS[1]]} onPress={addDigit(DIGITS[1])} disabled={disabled} />
          <PasscodeKey size={keySize} label={DIGITS[2]} subtitle={SUBTITLES[DIGITS[2]]} onPress={addDigit(DIGITS[2])} disabled={disabled} />
        </View>

        <View style={[styles.row, { columnGap: componentMetrics.passcodePad.gridGap }]}>
          <PasscodeKey size={keySize} label={DIGITS[3]} subtitle={SUBTITLES[DIGITS[3]]} onPress={addDigit(DIGITS[3])} disabled={disabled} />
          <PasscodeKey size={keySize} label={DIGITS[4]} subtitle={SUBTITLES[DIGITS[4]]} onPress={addDigit(DIGITS[4])} disabled={disabled} />
          <PasscodeKey size={keySize} label={DIGITS[5]} subtitle={SUBTITLES[DIGITS[5]]} onPress={addDigit(DIGITS[5])} disabled={disabled} />
        </View>

        <View style={[styles.row, { columnGap: componentMetrics.passcodePad.gridGap }]}>
          <PasscodeKey size={keySize} label={DIGITS[6]} subtitle={SUBTITLES[DIGITS[6]]} onPress={addDigit(DIGITS[6])} disabled={disabled} />
          <PasscodeKey size={keySize} label={DIGITS[7]} subtitle={SUBTITLES[DIGITS[7]]} onPress={addDigit(DIGITS[7])} disabled={disabled} />
          <PasscodeKey size={keySize} label={DIGITS[8]} subtitle={SUBTITLES[DIGITS[8]]} onPress={addDigit(DIGITS[8])} disabled={disabled} />
        </View>

        <View style={[styles.row, { columnGap: componentMetrics.passcodePad.gridGap }]}>
          <View style={{ width: keySize, height: keySize }} />
          <PasscodeKey size={keySize} label="0" subtitle={SUBTITLES['0']} onPress={addDigit('0')} disabled={disabled} />
          <PasscodeKey size={keySize} label="⌫" onPress={deleteDigit} disabled={disabled} accessibilityLabel="Delete" />
        </View>
      </View>
    </View>
  );
}

function PasscodeKey({
  size,
  label,
  subtitle,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  size: number;
  label: string;
  subtitle?: string;
  onPress: () => void;
  disabled: boolean;
  accessibilityLabel?: string;
}) {
  const tones = useTones();
  const grey = tones.grey;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `Key ${label}`}
      style={({ pressed }) => [
        styles.key,
        {
          width: size,
          height: size,
          borderRadius: radii.pill,
          borderColor: grey.border,
          backgroundColor: grey.onBase,
          opacity: disabled ? componentMetrics.passcodePad.keyDisabledOpacity : 1,
        },
        pressed ? { opacity: componentMetrics.passcodePad.keyPressedOpacity } : null,
      ]}
    >
      <View style={[styles.keyContent, { minHeight: componentMetrics.passcodePad.keyContentMinHeight }]}> 
        <AppText style={typography.keypadLabel}>{label}</AppText>
        {subtitle ? <AppText style={typography.keypadSubLabel}>{subtitle}</AppText> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: componentMetrics.passcodePad.sectionGap },
  dots: { flexDirection: 'row', marginTop: componentMetrics.passcodePad.dotsMarginTop },
  dot: { backgroundColor: 'transparent' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  row: { flexDirection: 'row', justifyContent: 'center' },
  key: {
    minWidth: minimumTouchTarget.minWidth,
    minHeight: minimumTouchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  keyContent: { alignItems: 'center', justifyContent: 'center' },
});
