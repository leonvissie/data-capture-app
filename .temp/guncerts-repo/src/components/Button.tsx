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
import { useTones } from '../theme/tones';
import { type Tone } from '../theme/colors';

export type ButtonTone =
  | 'default'
  | 'teal'
  | 'purple'
  | 'blue'
  | 'green'
  | 'orange'
  | 'pink'
  | 'red'
  | 'grey'
  | 'lightBlue';

export type ButtonVariant = 'solid' | 'outline' | 'ghost';

export type ButtonProps = {
  label: string;
  sublabel?: string;
  tone?: ButtonTone;
  variant?: ButtonVariant;
  onPress: PressableProps['onPress'];
  onLongPress?: PressableProps['onLongPress'];
  accessibilityHint?: string;
  testID?: string;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  align?: 'flex-start' | 'center' | 'flex-end';
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  sublabelStyle?: StyleProp<TextStyle>;
  backgroundColor?: string;
  pressedBackgroundColor?: string;
  textColor?: string;
  sublabelColor?: string;
  borderColor?: string;
  hitSlop?: PressableProps['hitSlop'];
  centerText?: boolean;
  centerContent?: boolean;
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

export const Button: React.FC<ButtonProps> = ({
  label,
  sublabel,
  tone = 'default',
  variant = 'solid',
  onPress,
  onLongPress,
  accessibilityHint,
  testID,
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = true,
  align = 'flex-start',
  style,
  contentStyle,
  labelStyle,
  sublabelStyle,
  backgroundColor,
  pressedBackgroundColor,
  textColor,
  sublabelColor,
  borderColor,
  hitSlop,
  centerText = false,
  centerContent = false,
}) => {
  const tones = useTones();
  const neutral = tones.grey;
  const toneTheme = makeButtonTheme(resolveTone(tone, tones), neutral);
  const variantTheme = toneTheme[variant];
  const disabledTheme = toneTheme.disabled;
  const isDisabled = disabled || loading;

  const baseBackground = isDisabled ? disabledTheme.background : backgroundColor ?? variantTheme.background;
  const pressedBackground = isDisabled
    ? disabledTheme.background
    : pressedBackgroundColor ?? variantTheme.pressedBackground;
  const baseBorder = borderColor;
  const baseBorderWidth = baseBorder ? 1 : 0;

  const baseTextColor = isDisabled ? disabledTheme.text : textColor ?? variantTheme.text;
  const baseSubColor = isDisabled ? disabledTheme.subtext : sublabelColor ?? variantTheme.subtext;

  const renderIcon = () => {
    if (loading) {
      return <ActivityIndicator size="small" color={baseTextColor} />;
    }

    if (!icon) {
      return null;
    }

    return <View style={styles.iconContainer}>{icon}</View>;
  };

  const iconLeft = iconPosition === 'left' ? renderIcon() : null;
  const iconRight = iconPosition === 'right' ? renderIcon() : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint ?? sublabel}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={isDisabled ? undefined : onPress}
      onLongPress={isDisabled ? undefined : onLongPress}
      hitSlop={hitSlop}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        fullWidth ? styles.fullWidth : null,
        {
          backgroundColor: pressed ? pressedBackground : baseBackground,
          borderColor: baseBorder,
          borderWidth: baseBorderWidth,
          alignItems: align,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.content,
          iconPosition === 'right' ? styles.contentReversed : null,
          contentStyle,
        ]}
      >
        <View
          style={[
            styles.inline,
            centerContent ? styles.inlineCentered : null,
            iconPosition === 'right' ? styles.inlineReversed : null,
          ]}
        >
          {iconLeft}
          <View
            style={[
              styles.textBlock,
              centerText && (centerContent ? styles.textBlockCenteredTight : styles.textBlockCentered),
            ]}
          >
            <Text
              style={[
                styles.label,
                centerText && styles.labelCentered,
                { color: baseTextColor },
                labelStyle,
              ]}
            >
              {label}
            </Text>
            {sublabel ? (
              <Text
                style={[
                  styles.sublabel,
                  centerText && styles.labelCentered,
                  { color: baseSubColor },
                  sublabelStyle,
                ]}
              >
                {sublabel}
              </Text>
            ) : null}
          </View>
          {iconRight}
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 0,
    flexDirection: 'row',
  },
  fullWidth: {
    width: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flex: 1,
  },
  contentReversed: {
    flexDirection: 'row-reverse',
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inlineReversed: {
    flexDirection: 'row-reverse',
  },
  inlineCentered: {
    justifyContent: 'center',
    flex: 1,
  },
  textBlock: {
    flexShrink: 1,
  },
  textBlockCentered: {
    alignItems: 'center',
  },
  textBlockCenteredTight: {
    alignItems: 'center',
  },
  label: {
    fontSize: 18,
    fontWeight: '700',
  },
  labelCentered: {
    textAlign: 'center',
  },
  sublabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default Button;
