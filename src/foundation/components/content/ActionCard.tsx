import { Pressable, StyleSheet, View } from 'react-native';

import { useSurfacePalette } from '@/foundation/hooks/useThemeMode';
import { useTones } from '@/foundation/hooks/useTones';
import { componentMetrics, type ToneKey } from '@/foundation/theme';

import { AppText } from '../layout/AppText';
import { Button } from '../buttons/Button';

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
};

function resolveColors(
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
}: ActionCardProps) {
  const palette = useSurfacePalette();
  const tones = useTones();
  const colors = resolveColors(variant, tones[tone], palette);
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
      {actions.length > 0 ? (
        <View style={[styles.actionsRow, { paddingTop: m.actionsTopPadding, gap: m.actionsGap }]}>
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
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
});
