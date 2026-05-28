import { forwardRef } from 'react';
import { TextInput, TextInputProps, StyleSheet } from 'react-native';

import { useTones } from '@/foundation/hooks/useTones';
import { radii, spacing } from '@/foundation/theme';
import type { Tone } from '@/foundation/theme/colors';

type ValidationState = 'default' | 'warning' | 'blocking';
type TextFieldProps = TextInputProps & {
  validationState?: ValidationState;
};

export function resolveTextFieldColors(validationState: ValidationState, neutral: Tone, warning: Tone) {
  if (validationState === 'default') {
    return {
      borderColor: neutral.border,
      textColor: neutral.onSurface,
      backgroundColor: neutral.surface,
    };
  }

  return {
    borderColor: warning.border,
    textColor: warning.emphasis,
    backgroundColor: warning.surface,
  };
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField({ validationState = 'default', style, ...rest }, ref) {
  const tones = useTones();
  const neutral = tones.grey;
  const warning = tones.orange;
  const colors = resolveTextFieldColors(validationState, neutral, warning);

  return (
    <TextInput
      ref={ref}
      {...rest}
      placeholderTextColor={neutral.border}
      style={[
        styles.base,
        {
          borderColor: colors.borderColor,
          color: colors.textColor,
          backgroundColor: colors.backgroundColor,
        },
        style,
      ]}
    />
  );
});

const styles = StyleSheet.create({ base: { minHeight: 52, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.lg } });
