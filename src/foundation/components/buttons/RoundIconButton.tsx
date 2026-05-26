import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { useTones } from '@/foundation/hooks/useTones';
import { componentMetrics, radii, type ToneKey } from '@/foundation/theme';

import type { RoundIconButtonType } from './roundIconButtonTypes';

type IconSize = 'sm' | 'md' | 'lg' | number;
type ToneSlot = 'base' | 'emphasis' | 'onBase' | 'surface' | 'onSurface' | 'border';

const sizeMap = componentMetrics.roundIconButton.size;

type RoundIconButtonProps = {
  buttonType: RoundIconButtonType;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  disabled?: boolean;
  size?: IconSize;
  floating?: boolean;
  tone?: ToneKey;
  tokens?: {
    background?: ToneSlot;
    pressedBackground?: ToneSlot;
    icon?: ToneSlot;
    border?: ToneSlot;
  };
};

type Preset = {
  iconName: keyof typeof Ionicons.glyphMap;
  tone: ToneKey;
  backgroundToken: ToneSlot;
  pressedBackgroundToken: ToneSlot;
  iconToken: ToneSlot;
  borderToken: ToneSlot;
};

function resolveSize(size: IconSize): number {
  if (typeof size === 'number') return size;
  return sizeMap[size];
}

export function resolveRoundIconButtonPreset(type: RoundIconButtonType): Preset {
  switch (type) {
    case 'chatbubble-ellipses':
      return { iconName: 'chatbubble-ellipses', tone: 'orange', backgroundToken: 'base', pressedBackgroundToken: 'emphasis', iconToken: 'onBase', borderToken: 'base' };
    case 'copy':
      return { iconName: 'copy-outline', tone: 'blue', backgroundToken: 'base', pressedBackgroundToken: 'emphasis', iconToken: 'onBase', borderToken: 'base' };
    case 'back':
      return { iconName: 'chevron-back', tone: 'grey', backgroundToken: 'base', pressedBackgroundToken: 'emphasis', iconToken: 'onBase', borderToken: 'base' };
    case 'close':
      return { iconName: 'close', tone: 'grey', backgroundToken: 'base', pressedBackgroundToken: 'emphasis', iconToken: 'onBase', borderToken: 'base' };
    case 'rotate':
      return { iconName: 'refresh-outline', tone: 'green', backgroundToken: 'base', pressedBackgroundToken: 'emphasis', iconToken: 'onBase', borderToken: 'base' };
    case 'share':
      return { iconName: 'share-outline', tone: 'green', backgroundToken: 'base', pressedBackgroundToken: 'emphasis', iconToken: 'onBase', borderToken: 'base' };
    case 'edit':
      return { iconName: 'create-outline', tone: 'teal', backgroundToken: 'base', pressedBackgroundToken: 'emphasis', iconToken: 'onBase', borderToken: 'base' };
    case 'help':
      return { iconName: 'help-outline', tone: 'grey', backgroundToken: 'base', pressedBackgroundToken: 'emphasis', iconToken: 'onBase', borderToken: 'base' };
    case 'archive':
      return { iconName: 'archive-outline', tone: 'orange', backgroundToken: 'base', pressedBackgroundToken: 'emphasis', iconToken: 'onBase', borderToken: 'base' };
    case 'home':
      return { iconName: 'home-outline', tone: 'grey', backgroundToken: 'base', pressedBackgroundToken: 'emphasis', iconToken: 'onBase', borderToken: 'base' };
    case 'add':
      return { iconName: 'add', tone: 'teal', backgroundToken: 'base', pressedBackgroundToken: 'emphasis', iconToken: 'onBase', borderToken: 'base' };
    case 'save':
      return { iconName: 'save-outline', tone: 'teal', backgroundToken: 'base', pressedBackgroundToken: 'emphasis', iconToken: 'onBase', borderToken: 'base' };
    case 'delete':
      return { iconName: 'trash-outline', tone: 'red', backgroundToken: 'base', pressedBackgroundToken: 'emphasis', iconToken: 'onBase', borderToken: 'base' };
    case 'upload':
      return { iconName: 'folder-open-outline', tone: 'blue', backgroundToken: 'base', pressedBackgroundToken: 'emphasis', iconToken: 'onBase', borderToken: 'base' };
    case 'preview':
      return { iconName: 'eye-outline', tone: 'blue', backgroundToken: 'base', pressedBackgroundToken: 'emphasis', iconToken: 'onBase', borderToken: 'base' };
    case 'camera':
      return { iconName: 'camera-outline', tone: 'blue', backgroundToken: 'base', pressedBackgroundToken: 'emphasis', iconToken: 'onBase', borderToken: 'base' };
    case 'library':
      return { iconName: 'images-outline', tone: 'blue', backgroundToken: 'base', pressedBackgroundToken: 'emphasis', iconToken: 'onBase', borderToken: 'base' };
    case 'confirm':
      return { iconName: 'checkmark', tone: 'green', backgroundToken: 'base', pressedBackgroundToken: 'emphasis', iconToken: 'onBase', borderToken: 'base' };
    case 'stop':
      return { iconName: 'stop', tone: 'grey', backgroundToken: 'onBase', pressedBackgroundToken: 'border', iconToken: 'base', borderToken: 'border' };
    case 'ellipse-outline':
      return { iconName: 'ellipse-outline', tone: 'grey', backgroundToken: 'onBase', pressedBackgroundToken: 'surface', iconToken: 'base', borderToken: 'border' };
    default:
      return { iconName: 'add', tone: 'teal', backgroundToken: 'base', pressedBackgroundToken: 'emphasis', iconToken: 'onBase', borderToken: 'base' };
  }
}

export function RoundIconButton({
  buttonType,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  size = 'md',
  floating = false,
  tone,
  tokens,
}: RoundIconButtonProps) {
  const tones = useTones();
  const preset = resolveRoundIconButtonPreset(buttonType);
  const resolvedTone = tones[tone ?? preset.tone];
  const dimension = resolveSize(size);
  const iconSize = Math.round(dimension * 0.45);

  const backgroundColor = resolvedTone[tokens?.background ?? preset.backgroundToken];
  const pressedBackgroundColor = resolvedTone[tokens?.pressedBackground ?? preset.pressedBackgroundToken];
  const iconColor = resolvedTone[tokens?.icon ?? preset.iconToken];
  const resolvedBorderColor = resolvedTone[tokens?.border ?? preset.borderToken];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          width: dimension,
          height: dimension,
          borderRadius: radii.pill,
          backgroundColor: pressed ? pressedBackgroundColor : backgroundColor,
          borderColor: resolvedBorderColor,
          opacity: disabled ? 0.5 : 1,
        },
        floating ? styles.floating : null,
      ]}
    >
      <Ionicons name={preset.iconName} size={iconSize} color={iconColor} />
    </Pressable>
  );
}

export function FloatingRoundIconButton(props: Omit<RoundIconButtonProps, 'floating'>) {
  return <RoundIconButton {...props} floating />;
}

const styles = StyleSheet.create({
  base: {
    borderWidth: componentMetrics.roundIconButton.borderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floating: {
    shadowOpacity: componentMetrics.roundIconButton.floating.shadowOpacity,
    shadowRadius: componentMetrics.roundIconButton.floating.shadowRadius,
    shadowOffset: {
      width: componentMetrics.roundIconButton.floating.shadowOffsetWidth,
      height: componentMetrics.roundIconButton.floating.shadowOffsetHeight,
    },
    elevation: componentMetrics.roundIconButton.floating.elevation,
  },
});
