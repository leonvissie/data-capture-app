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
  size?: ButtonSize;
  variant?: ButtonVariant;
  shape?: ButtonShape;
  tone?: ToneKey;
  tokens?: ButtonTokenOverrides;
};

const buttonHeights = componentMetrics.button.size;

export function Button({
  label,
  onPress,
  disabled = false,
  size = 'md',
  variant = 'solid',
  shape = 'pill',
  tone = 'teal',
  tokens,
}: ButtonProps) {
  const tones = useTones();
  const t = tones[tone];

  const defaults =
    variant === 'solid'
      ? { background: t.base, pressedBackground: t.emphasis, border: t.base, text: t.onBase }
      : variant === 'outline'
        ? { background: 'transparent', pressedBackground: t.surface, border: t.border, text: t.base }
        : variant === 'ghost'
          ? { background: 'transparent', pressedBackground: t.surface, border: 'transparent', text: t.base }
          : { background: t.surface, pressedBackground: t.base, border: t.border, text: t.base };

  const backgroundColor = tokens?.background ? t[tokens.background] : defaults.background;
  const pressedBackgroundColor = tokens?.pressedBackground ? t[tokens.pressedBackground] : defaults.pressedBackground;
  const borderColor = tokens?.border ? t[tokens.border] : defaults.border;
  const textColor = tokens?.text ? t[tokens.text] : defaults.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: buttonHeights[size],
          borderRadius: shape === 'pill' ? radii.pill : radii.lg,
          backgroundColor: pressed ? pressedBackgroundColor : backgroundColor,
          borderColor,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      {({ pressed }) => (
        <AppText variant="buttonLabel" style={{ color: pressed && variant === 'soft' && !disabled ? t.onBase : textColor }}>
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
