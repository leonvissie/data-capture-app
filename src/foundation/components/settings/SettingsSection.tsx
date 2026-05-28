import { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/foundation/components/layout/AppText';
import { useSurfacePalette } from '@/foundation/hooks/useThemeMode';
import { useTones } from '@/foundation/hooks/useTones';
import { radii, spacing } from '@/foundation/theme';

type SettingsSectionProps = PropsWithChildren<{
  title: string;
  open: boolean;
  onToggle: (next: boolean) => void;
}>;

export function SettingsSection({ title, open, onToggle, children }: SettingsSectionProps) {
  const tones = useTones();
  const palette = useSurfacePalette();
  const grey = tones.grey;

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${open ? 'Collapse' : 'Expand'} ${title}`}
        onPress={() => onToggle(!open)}
        style={styles.header}
      >
        <AppText variant="sectionTitle">{title}</AppText>
        <AppText variant="bodyStrong" style={{ color: grey.base }}>
          {open ? 'Hide' : 'Show'}
        </AppText>
      </Pressable>
      {open ? <View style={[styles.body, { borderColor: grey.border, backgroundColor: palette.card }]}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  header: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  body: {
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
  },
});
