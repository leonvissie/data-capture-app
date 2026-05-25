import React from 'react';
import { PressableProps, StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Button, { ButtonProps, ButtonVariant } from './Button';
import { IconButtonSize } from './IconButton';
import { IconRoundButton } from './RoundIconButton';
import { useTones } from '../theme/tones';

export type ButtonSaveMode = 'button' | 'icon';

export type ButtonSaveProps = {
  mode?: ButtonSaveMode;
  label?: string;
  onPress?: PressableProps['onPress'];
  onLongPress?: PressableProps['onLongPress'];
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  iconPosition?: ButtonProps['iconPosition'];
  align?: ButtonProps['align'];
  fullWidth?: boolean;
  buttonVariant?: ButtonVariant;
  buttonIconSize?: number;
  iconButtonSize?: IconButtonSize | number;
  hitSlop?: PressableProps['hitSlop'];
};

const defaultLabel = 'Save';

const ButtonSave: React.FC<ButtonSaveProps> = ({
  mode = 'button',
  label = defaultLabel,
  onPress,
  onLongPress,
  disabled = false,
  loading = false,
  accessibilityHint,
  accessibilityLabel,
  testID,
  style,
  contentStyle,
  labelStyle,
  iconPosition = 'left',
  align = 'center',
  fullWidth = true,
  buttonVariant = 'solid',
  buttonIconSize = 22,
  iconButtonSize = 'sm',
  hitSlop,
}) => {
  const tones = useTones();
  const iconColor = disabled ? tones.grey.base : tones.teal.onBase;
  const resolvedAccessibilityLabel = accessibilityLabel ?? label;

  if (mode === 'icon') {
    return (
      <IconRoundButton
        buttonType="save"
        accessibilityLabel={resolvedAccessibilityLabel}
        accessibilityHint={accessibilityHint ?? label}
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={disabled}
        loading={loading}
        size={iconButtonSize}
        hitSlop={hitSlop}
        testID={testID}
        style={style}
      />
    );
  }

  return (
    <Button
      label={label}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      loading={loading}
      tone="teal"
      variant={buttonVariant}
      align={align}
      iconPosition={iconPosition}
      fullWidth={fullWidth}
      centerText
      centerContent
      contentStyle={[{ justifyContent: 'center' }, contentStyle]}
      icon={<Ionicons name="save-outline" size={buttonIconSize} color={iconColor} />}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={style}
      labelStyle={labelStyle}
      hitSlop={hitSlop}
    />
  );
};

export default ButtonSave;
