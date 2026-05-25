import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { AntDesign, Ionicons } from '@expo/vector-icons';
import IconButton, { IconButtonProps, IconButtonSize, iconButtonSizeMap } from './IconButton';
import { useThemeMode } from '../providers/ThemeModeProvider';
import { getShadowColor } from '../theme/effects';
import { useTones } from '../theme/tones';
import type { ButtonTone } from './Button';
import type { IconRoundButtonType } from './roundIconButtonTypes';
export { ICON_ROUND_BUTTON_TYPES, LEGACY_ICON_ROUND_BUTTON_TYPES } from './roundIconButtonTypes';
export type { IconRoundButtonType } from './roundIconButtonTypes';

type IconRoundButtonSize = IconButtonSize | number;

type IconRoundPreset = {
  iconName?: keyof typeof Ionicons.glyphMap;
  antIconName?: keyof typeof AntDesign.glyphMap;
  tone: ButtonTone;
  backgroundColor: string;
  pressedBackgroundColor: string;
  iconColor: string;
};

type BaseRoundProps = Omit<
  IconButtonProps,
  | 'size'
  | 'label'
  | 'labelPosition'
  | 'labelStyle'
  | 'labelColor'
  | 'spacing'
  | 'iconName'
  | 'icon'
  | 'iconColor'
  | 'backgroundColor'
  | 'pressedBackgroundColor'
  | 'tone'
> & {
  buttonType: IconRoundButtonType;
  size?: IconRoundButtonSize;
  floating?: boolean;
  style?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  pressedBackgroundColor?: string;
  iconColor?: string;
};

const resolveDimension = (size?: IconRoundButtonSize): number => {
  if (typeof size === 'number' && Number.isFinite(size) && size > 0) {
    return Math.round(size);
  }

  const key = typeof size === 'string' ? size : 'md';
  return iconButtonSizeMap[key] ?? iconButtonSizeMap.md;
};

export const IconRoundButton: React.FC<BaseRoundProps> = ({
  buttonType,
  size = 'md',
  floating = false,
  iconSize,
  style,
  borderColor,
  backgroundColor,
  pressedBackgroundColor,
  iconColor,
  ...buttonProps
}) => {
  const tones = useTones();
  const { effectiveMode } = useThemeMode();
  const preset = resolveButtonType(buttonType, tones);
  const dimension = resolveDimension(size);
  const resolvedIconSize = iconSize ?? Math.round(dimension * 0.45);
  const resolvedIcon =
    preset.antIconName
      ? <AntDesign name={preset.antIconName} size={resolvedIconSize} color={preset.iconColor} />
      : undefined;
  const passthroughSize: IconButtonSize = typeof size === 'string' ? size : 'md';
  const styles = useMemo(() => createStyles(getShadowColor(effectiveMode)), [effectiveMode]);

  return (
    <IconButton
      {...buttonProps}
      iconName={resolvedIcon ? undefined : preset.iconName}
      icon={resolvedIcon}
      tone={preset.tone}
      backgroundColor={backgroundColor ?? preset.backgroundColor}
      pressedBackgroundColor={pressedBackgroundColor ?? preset.pressedBackgroundColor}
      borderColor={borderColor}
      iconColor={iconColor ?? preset.iconColor}
      size={passthroughSize}
      iconSize={resolvedIconSize}
      style={[
        styles.base,
        floating ? styles.floating : null,
        { width: dimension, height: dimension, borderRadius: Math.round(dimension / 2) },
        style,
      ]}
    />
  );
};

export const FloatingIconRoundButton: React.FC<Omit<BaseRoundProps, 'floating'>> = (props) => (
  <IconRoundButton {...props} floating />
);

const resolveButtonType = (
  buttonType: IconRoundButtonType,
  tones: ReturnType<typeof useTones>,
): IconRoundPreset => {
  const neutral = tones.grey;
  const closePreset = (tone: ReturnType<typeof useTones>['grey']) => ({
    iconName: 'close' as const,
    tone: 'grey' as const,
    backgroundColor: tone.base,
    pressedBackgroundColor: tone.emphasis,
    iconColor: tone.onBase,
  });

  switch (buttonType) {
    case 'chatbubble-ellipses':
      return {
        iconName: 'chatbubble-ellipses',
        tone: 'orange',
        backgroundColor: tones.orange.base,
        pressedBackgroundColor: tones.orange.emphasis,
        iconColor: tones.orange.onBase,
      };
    case 'copy':
      return {
        iconName: 'copy-outline',
        tone: 'blue',
        backgroundColor: tones.blue.base,
        pressedBackgroundColor: tones.blue.emphasis,
        iconColor: tones.blue.onBase,
      };
    case 'back':
      return {
        iconName: 'chevron-back',
        tone: 'grey',
        backgroundColor: neutral.base,
        pressedBackgroundColor: neutral.surface,
        iconColor: neutral.onBase,
      };
    case 'close':
      return closePreset(neutral);
    case 'rotate':
      return {
        antIconName: 'rotate-left',
        tone: 'green',
        backgroundColor: tones.green.base,
        pressedBackgroundColor: tones.green.emphasis,
        iconColor: neutral.onBase,
      };
    case 'share':
      return {
        iconName: 'share-outline',
        tone: 'green',
        backgroundColor: tones.green.base,
        pressedBackgroundColor: tones.green.emphasis,
        iconColor: tones.green.onBase,
      };
    case 'edit':
      return {
        iconName: 'create-outline',
        tone: 'teal',
        backgroundColor: tones.teal.base,
        pressedBackgroundColor: tones.teal.emphasis,
        iconColor: tones.teal.onBase,
      };
    case 'help':
      return {
        iconName: 'help-outline',
        tone: 'grey',
        backgroundColor: neutral.base,
        pressedBackgroundColor: neutral.emphasis,
        iconColor: neutral.onBase,
      };
    case 'archive':
      return {
        iconName: 'archive-outline',
        tone: 'orange',
        backgroundColor: tones.orange.base,
        pressedBackgroundColor: tones.orange.emphasis,
        iconColor: neutral.onBase,
      };
    case 'home':
      return {
        iconName: 'home-outline',
        tone: 'grey',
        backgroundColor: neutral.base,
        pressedBackgroundColor: neutral.emphasis,
        iconColor: neutral.onBase,
      };
    case 'add':
      return {
        iconName: 'add',
        tone: 'teal',
        backgroundColor: tones.teal.base,
        pressedBackgroundColor: tones.teal.emphasis,
        iconColor: tones.teal.onBase,
      };
    case 'save':
      return {
        iconName: 'save-outline',
        tone: 'teal',
        backgroundColor: tones.teal.base,
        pressedBackgroundColor: tones.teal.emphasis,
        iconColor: tones.teal.onBase,
      };
    case 'delete':
      return {
        iconName: 'trash-outline',
        tone: 'red',
        backgroundColor: tones.red.base,
        pressedBackgroundColor: tones.red.emphasis,
        iconColor: tones.red.onBase,
      };
    case 'upload':
      return {
        iconName: 'folder-open-outline',
        tone: 'purple',
        backgroundColor: tones.purple.base,
        pressedBackgroundColor: tones.purple.emphasis,
        iconColor: tones.purple.onBase,
      };
    case 'preview':
      return {
        iconName: 'eye-outline',
        tone: 'blue',
        backgroundColor: tones.blue.base,
        pressedBackgroundColor: tones.blue.emphasis,
        iconColor: tones.blue.onBase,
      };
    case 'camera':
      return {
        iconName: 'camera-outline',
        tone: 'blue',
        backgroundColor: tones.blue.base,
        pressedBackgroundColor: tones.blue.emphasis,
        iconColor: tones.blue.onBase,
      };
    case 'library':
      return {
        iconName: 'images-outline',
        tone: 'blue',
        backgroundColor: tones.blue.base,
        pressedBackgroundColor: tones.blue.emphasis,
        iconColor: tones.blue.onBase,
      };
    case 'confirm':
      return {
        iconName: 'checkmark',
        tone: 'green',
        backgroundColor: tones.green.base,
        pressedBackgroundColor: tones.green.emphasis,
        iconColor: tones.green.onBase,
      };
    case 'stop':
      return {
        iconName: 'stop',
        tone: 'grey',
        backgroundColor: neutral.onBase,
        pressedBackgroundColor: neutral.border,
        iconColor: neutral.base,
      };
    case 'ellipse-outline':
      return {
        iconName: 'ellipse-outline',
        tone: 'grey',
        backgroundColor: neutral.onBase,
        pressedBackgroundColor: neutral.surface,
        iconColor: neutral.base,
      };
    default:
      return {
        iconName: 'add',
        tone: 'teal',
        backgroundColor: tones.teal.base,
        pressedBackgroundColor: tones.teal.emphasis,
        iconColor: tones.teal.onBase,
      };
  }
};

const createStyles = (shadowColor: string) =>
  StyleSheet.create({
    base: {
      width: iconButtonSizeMap.md,
      height: iconButtonSizeMap.md,
      borderRadius: Math.round(iconButtonSizeMap.md / 2),
    },
    floating: {
      shadowColor,
      shadowOpacity: 0.08,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    },
  });

export default IconRoundButton;
