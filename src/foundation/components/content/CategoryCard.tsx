import { Pressable, StyleSheet, View } from 'react-native';

import { useSurfacePalette } from '@/foundation/hooks/useThemeMode';
import { useTones } from '@/foundation/hooks/useTones';
import { radii } from '@/foundation/theme/radii';
import { spacing } from '@/foundation/theme/spacing';

import { AppText } from '../layout/AppText';
import { Card } from './Card';

type CategoryCardProps = {
  title: string;
  typeLabel: string;
  subtitle?: string;
  onPress: () => void;
};

export function CategoryCard({ title, typeLabel, subtitle, onPress }: CategoryCardProps) {
  const palette = useSurfacePalette();
  const tones = useTones();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open category ${title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed ? styles.pressed : null]}
    >
      <Card>
        <View style={styles.row}>
          <AppText variant="cardTitle">{title}</AppText>
          <View style={[styles.badge, { borderColor: tones.blue.border, backgroundColor: tones.blue.surface }]}>
            <AppText variant="chipLabel" style={{ color: tones.blue.onSurface }}>
              {typeLabel}
            </AppText>
          </View>
        </View>
        {subtitle ? <AppText variant="bodySmall" style={{ color: palette.textMuted }}>{subtitle}</AppText> : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: radii.lg,
  },
  pressed: {
    opacity: 0.85,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  badge: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
});
