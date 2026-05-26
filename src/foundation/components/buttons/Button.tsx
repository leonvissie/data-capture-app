import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/foundation/components/layout/AppText';
import { useTones } from '@/foundation/hooks/useTones';
import { componentMetrics, radii, spacing, type ToneKey } from '@/foundation/theme';

export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonVariant = 'solid' | 'outline' | 'ghost' | 'soft';
export type ButtonShape = 'pill' | 'rounded';
export type ToneSlot = 'base' | 'emphasis' | 'onBase' | 'surface' | 'onSurface' | 'border';

type ButtonTokenOverrides = {
  background?: ToneSlot;
  pressedBackground?: ToneSlot;
  border?: ToneSlot;
  text?: ToneSlot;
};

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  selected?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
  shape?: ButtonShape;
  tone?: ToneKey;
  tokens?: ButtonTokenOverrides;
};

const buttonHeights = componentMetrics.button.size;

export function resolveButtonDefaults(variant: ButtonVariant, tone: ReturnType<typeof useTones>[ToneKey]) {
  if (variant === 'solid') {
    return { background: tone.base, pressedBackground: tone.emphasis, border: tone.base, text: tone.onBase };
  }
  if (variant === 'outline') {
    return { background: 'transparent', pressedBackground: tone.surface, border: tone.border, text: tone.base };
  }
  if (variant === 'ghost') {
    return { background: 'transparent', pressedBackground: tone.surface, border: 'transparent', text: tone.base };
  }
  return { background: tone.surface, pressedBackground: tone.base, border: tone.border, text: tone.base };
}

export function Button({
  label,
  onPress,
  disabled = false,
  loading = false,
  selected = false,
  size = 'md',
  variant = 'solid',
  shape = 'pill',
  tone = 'teal',
  tokens,
}: ButtonProps) {
  const tones = useTones();
  const t = tones[tone];

  const resolvedVariant = selected ? 'solid' : variant;

  const defaults = resolveButtonDefaults(resolvedVariant, t);

  const backgroundColor = tokens?.background ? t[tokens.background] : defaults.background;
  const pressedBackgroundColor = tokens?.pressedBackground ? t[tokens.pressedBackground] : defaults.pressedBackground;
  const borderColor = tokens?.border ? t[tokens.border] : defaults.border;
  const textColor = tokens?.text ? t[tokens.text] : defaults.text;

  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, selected, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: buttonHeights[size],
          borderRadius: shape === 'pill' ? radii.pill : radii.lg,
          backgroundColor: pressed ? pressedBackgroundColor : backgroundColor,
          borderColor,
          opacity: isDisabled ? 0.5 : 1,
        },
      ]}
    >
      {({ pressed }) => (
        <AppText variant="buttonLabel" style={{ color: pressed && resolvedVariant === 'soft' && !isDisabled ? t.onBase : textColor }}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export type { ButtonProps };
