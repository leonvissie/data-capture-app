import { Pressable, StyleSheet, View } from 'react-native';

import { useSurfacePalette } from '@/foundation/hooks/useThemeMode';
import { useTones } from '@/foundation/hooks/useTones';
import { componentMetrics, type ToneKey } from '@/foundation/theme';

import { AppText } from '../layout/AppText';
import { Button } from '../buttons/Button';
import { RoundIconButton } from '../buttons/RoundIconButton';
import type { RoundIconButtonType } from '../buttons/roundIconButtonTypes';

type ActionCardVariant = 'solid' | 'soft' | 'neutral';

type ActionCardProps = {
  title: string;
  subtitle?: string;
  tone?: ToneKey;
  variant?: ActionCardVariant;
  disabled?: boolean;
  accessibilityLabel?: string;
  onPress: () => void;
  actions?: Array<{
    id: string;
    label: string;
    onPress: () => void;
    tone?: ToneKey;
    variant?: 'solid' | 'outline' | 'ghost' | 'soft';
    size?: 'sm' | 'md' | 'lg';
  }>;
  iconActions?: Array<{
    id: string;
    buttonType: RoundIconButtonType;
    accessibilityLabel: string;
    onPress: () => void;
    size?: 'sm' | 'md' | 'lg';
    tone?: ToneKey;
    tokens?: {
      background?: 'base' | 'emphasis' | 'onBase' | 'surface' | 'onSurface' | 'border';
      pressedBackground?: 'base' | 'emphasis' | 'onBase' | 'surface' | 'onSurface' | 'border';
      icon?: 'base' | 'emphasis' | 'onBase' | 'surface' | 'onSurface' | 'border';
      border?: 'base' | 'emphasis' | 'onBase' | 'surface' | 'onSurface' | 'border';
    };
  }>;
  actionHint?: string;
};

export function resolveActionCardColors(
  variant: ActionCardVariant,
  tone: ReturnType<typeof useTones>[ToneKey],
  palette: ReturnType<typeof useSurfacePalette>,
) {
  if (variant === 'solid') {
    return {
      backgroundColor: tone.base,
      pressedBackgroundColor: tone.emphasis,
      borderColor: tone.base,
      titleColor: tone.onBase,
      subtitleColor: tone.onBase,
    };
  }

  if (variant === 'soft') {
    return {
      backgroundColor: tone.surface,
      pressedBackgroundColor: tone.border,
      borderColor: tone.border,
      titleColor: tone.onSurface,
      subtitleColor: tone.onSurface,
    };
  }

  return {
    backgroundColor: palette.cardMuted,
    pressedBackgroundColor: palette.divider,
    borderColor: palette.border,
    titleColor: palette.text,
    subtitleColor: palette.textMuted,
  };
}

export function ActionCard({
  title,
  subtitle,
  tone = 'teal',
  variant = 'soft',
  disabled = false,
  accessibilityLabel,
  onPress,
  actions = [],
  iconActions = [],
  actionHint,
}: ActionCardProps) {
  const palette = useSurfacePalette();
  const tones = useTones();
  const colors = resolveActionCardColors(variant, tones[tone], palette);
  const m = componentMetrics.actionCard;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: m.minHeight,
          borderRadius: m.borderRadius,
          borderWidth: m.borderWidth,
          paddingHorizontal: m.horizontalPadding,
          paddingVertical: m.verticalPadding,
          gap: m.contentGap,
          backgroundColor: pressed ? colors.pressedBackgroundColor : colors.backgroundColor,
          borderColor: colors.borderColor,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <View>
        <AppText variant="sectionTitle" style={{ color: colors.titleColor }}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="body" style={{ color: colors.subtitleColor }}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {actions.length > 0 || iconActions.length > 0 || actionHint ? (
        <View style={[styles.actionsRow, { paddingTop: m.actionsTopPadding, gap: m.actionsGap }]}>
          {actionHint ? (
            <AppText variant="bodySmall" style={{ color: colors.subtitleColor }}>
              {actionHint}
            </AppText>
          ) : null}
          <View style={[styles.actionsGroup, { gap: m.actionsGap }]}>
            {iconActions.map((action) => (
              <RoundIconButton
                key={action.id}
                buttonType={action.buttonType}
                accessibilityLabel={action.accessibilityLabel}
                onPress={action.onPress}
                size={action.size ?? 'sm'}
                tone={action.tone}
                tokens={action.tokens}
              />
            ))}
            {actions.map((action) => (
              <Button
                key={action.id}
                label={action.label}
                onPress={action.onPress}
                tone={action.tone ?? (variant === 'solid' ? 'grey' : 'blue')}
                variant={action.variant ?? 'soft'}
                size={action.size ?? 'sm'}
              />
            ))}
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionsGroup: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
});
