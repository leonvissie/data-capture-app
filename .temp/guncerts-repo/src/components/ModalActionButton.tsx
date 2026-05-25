import React from 'react';
import { StyleSheet } from 'react-native';
import Button, { ButtonProps } from './Button';
import { useTones } from '../theme/tones';

type ModalActionButtonProps = Omit<ButtonProps, 'align' | 'iconPosition' | 'contentStyle' | 'labelStyle'> & {
  style?: ButtonProps['style'];
  contentStyle?: ButtonProps['contentStyle'];
  labelStyle?: ButtonProps['labelStyle'];
};

const ModalActionButton: React.FC<ModalActionButtonProps> = ({
  icon,
  style,
  contentStyle,
  labelStyle,
  fullWidth = true,
  variant = 'outline',
  backgroundColor,
  pressedBackgroundColor,
  borderColor,
  ...buttonProps
}) => {
  const tones = useTones();
  const neutral = tones.grey;

  return (
    <Button
      {...buttonProps}
      variant={variant}
      icon={icon}
      align="center"
      fullWidth={fullWidth}
      iconPosition="left"
      backgroundColor={backgroundColor ?? neutral.onBase}
      pressedBackgroundColor={pressedBackgroundColor ?? neutral.surface}
      borderColor={borderColor ?? neutral.border}
      style={style}
      contentStyle={[
        styles.content,
        icon ? styles.contentWithIcon : styles.contentNoIcon,
        contentStyle,
      ]}
      labelStyle={[styles.label, labelStyle]}
    />
  );
};

const styles = StyleSheet.create({
  content: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  contentWithIcon: {
    gap: 8,
  },
  contentNoIcon: {
    gap: 0,
  },
  label: {
    textAlign: 'center',
  },
});

export default ModalActionButton;
