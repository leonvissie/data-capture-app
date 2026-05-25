import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type Tone } from '../theme/colors';
import { useTones } from '../theme/tones';
import { ButtonVariant, type ButtonTone } from './Button';

export const iconButtonSizeMap = {
  xs: 32,
  sm: 36,
  md: 44,
  lg: 52,
} as const;

export type IconButtonSize = keyof typeof iconButtonSizeMap;

export type IconButtonProps = {
  iconName?: keyof typeof Ionicons.glyphMap;
  icon?: React.ReactNode;
  iconSize?: number;
  iconColor?: string;
  backgroundColor?: string;
  pressedBackgroundColor?: string;
  borderColor?: string;
  label?: string;
  labelPosition?: 'right' | 'bottom';
  labelStyle?: StyleProp<TextStyle>;
  labelColor?: string;
  tone?: ButtonTone;
  variant?: ButtonVariant;
  size?: IconButtonSize;
  spacing?: number;
  onPress?: PressableProps['onPress'];
  onLongPress?: PressableProps['onLongPress'];
  accessibilityLabel: string;
  accessibilityHint?: string;
  testID?: string;
  disabled?: boolean;
  loading?: boolean;
  hitSlop?: PressableProps['hitSlop'];
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

export const IconButton: React.FC<IconButtonProps> = ({
  iconName,
  icon,
  iconSize,
  iconColor,
  backgroundColor,
  pressedBackgroundColor,
  borderColor,
  label,
  labelPosition = 'right',
  labelStyle,
  labelColor,
  tone = 'default',
  variant = 'ghost',
  size = 'md',
  spacing = 6,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
  disabled = false,
  loading = false,
  hitSlop,
  style,
  contentStyle,
}) => {
  const tones = useTones();
  const neutral = tones.grey;
  const toneTheme = makeButtonTheme(resolveTone(tone, tones), neutral);
  const variantTheme = toneTheme[variant];
  const disabledTheme = toneTheme.disabled;
  const isDisabled = disabled || loading;

  const baseBackground = isDisabled
    ? disabledTheme.background
    : backgroundColor ?? variantTheme.background;
  const pressedBackground = isDisabled
    ? disabledTheme.background
    : pressedBackgroundColor ?? variantTheme.pressedBackground;
  const baseBorder = borderColor;
  const baseBorderWidth = baseBorder ? 1 : 0;
  const contentColor = iconColor ?? (isDisabled ? disabledTheme.text : variantTheme.text);
  const contentSubColor = isDisabled ? disabledTheme.subtext : variantTheme.subtext;
  const resolvedLabelColor = labelColor ?? contentSubColor;

  const dimension = iconButtonSizeMap[size] ?? iconButtonSizeMap.md;
  const resolvedIconSize = iconSize ?? Math.round(dimension * 0.45);

  const renderIcon = () => {
    if (loading) {
      return <ActivityIndicator size="small" color={contentColor} />;
    }

    if (icon) {
      return icon;
    }

    if (!iconName) {
      return null;
    }

    return <Ionicons name={iconName} size={resolvedIconSize} color={contentColor} />;
  };

  const contentDirection = labelPosition === 'bottom' ? 'column' : 'row';

  const shapeStyle = label
    ? {
        minHeight: dimension,
        paddingHorizontal: 14,
        paddingVertical: Math.max(12, Math.round(dimension / 3.5)),
        borderRadius: 16,
        width: undefined,
        height: undefined,
      }
    : {
        width: dimension,
        height: dimension,
        borderRadius: Math.round(dimension / 2),
        paddingHorizontal: 0,
        paddingVertical: 0,
      };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={isDisabled ? undefined : onPress}
      onLongPress={isDisabled ? undefined : onLongPress}
      hitSlop={hitSlop}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        shapeStyle,
        {
          backgroundColor: pressed ? pressedBackground : baseBackground,
          borderColor: baseBorder,
          borderWidth: baseBorderWidth,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.content,
          { flexDirection: contentDirection, gap: spacing },
          label ? styles.labelledContent : null,
          contentStyle,
        ]}
      >
        {renderIcon()}
        {label ? (
          <Text
            style={[
              styles.label,
              labelPosition === 'bottom' ? styles.labelBottom : styles.labelSide,
              { color: resolvedLabelColor },
              labelStyle,
            ]}
            numberOfLines={2}
          >
            {label}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
};

type VariantTheme = {
  background: string;
  pressedBackground: string;
  text: string;
  subtext: string;
  border: string;
};

type ButtonTheme = {
  solid: VariantTheme;
  outline: VariantTheme;
  ghost: VariantTheme;
  disabled: VariantTheme;
};

const makeSolid = (tone: Tone): VariantTheme => ({
  background: tone.base,
  pressedBackground: tone.emphasis,
  text: tone.onBase,
  subtext: tone.onBase,
  border: 'transparent',
});

const makeOutline = (tone: Tone, background: string): VariantTheme => ({
  background,
  pressedBackground: tone.surface,
  text: tone.base,
  subtext: tone.base,
  border: tone.border,
});

const makeGhost = (tone: Tone): VariantTheme => ({
  background: 'transparent',
  pressedBackground: tone.surface,
  text: tone.base,
  subtext: tone.base,
  border: 'transparent',
});

const makeDisabled = (background: string, text: string, border: string): VariantTheme => ({
  background,
  pressedBackground: background,
  text,
  subtext: text,
  border,
});

const resolveTone = (tone: ButtonTone, tones: ReturnType<typeof useTones>): Tone => {
  switch (tone) {
    case 'teal':
      return tones.teal;
    case 'purple':
      return tones.purple;
    case 'blue':
      return tones.blue;
    case 'green':
      return tones.green;
    case 'orange':
      return tones.orange;
    case 'pink':
      return tones.pink;
    case 'red':
      return tones.red;
    case 'grey':
      return tones.grey;
    case 'lightBlue':
      return tones.lightBlue;
    case 'default':
    default:
      return tones.teal;
  }
};

const makeButtonTheme = (tone: Tone, neutral: Tone): ButtonTheme => {
  const disabled = makeDisabled(neutral.border, neutral.base, neutral.border);

  return {
    solid: makeSolid(tone),
    outline: makeOutline(tone, neutral.onBase),
    ghost: makeGhost(tone),
    disabled,
  };
};

type IconButtonGroupProps = {
  children: React.ReactNode;
  direction?: 'row' | 'column';
  spacing?: number;
  align?: 'flex-start' | 'center' | 'flex-end';
  style?: StyleProp<ViewStyle>;
};

export const IconButtonGroup: React.FC<IconButtonGroupProps> = ({
  children,
  direction = 'row',
  spacing = 12,
  align = 'center',
  style,
}) => {
  const items = React.Children.toArray(children).filter(Boolean);

  return (
    <View style={[direction === 'row' ? styles.groupRow : styles.groupColumn, { alignItems: align }, style]}>
      {items.map((child, index) => {
        if (!React.isValidElement<{ style?: StyleProp<ViewStyle> }>(child)) {
          return child;
        }

        const spacingStyle =
          direction === 'row'
            ? { marginRight: index === items.length - 1 ? 0 : spacing }
            : { marginBottom: index === items.length - 1 ? 0 : spacing };

        return React.cloneElement(child, {
          style: StyleSheet.flatten([child.props.style, spacingStyle]),
        });
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    borderWidth: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  labelledContent: {
    width: '100%',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  labelBottom: {
    marginTop: 4,
  },
  labelSide: {
    marginLeft: 8,
  },
  groupRow: {
    flexDirection: 'row',
  },
  groupColumn: {
    flexDirection: 'column',
  },
});

export default IconButton;
