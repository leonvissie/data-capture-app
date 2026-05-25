import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/foundation/components/layout/AppText';
import { useTones } from '@/foundation/hooks/useTones';
import { radii, spacing } from '@/foundation/theme';

export function DateTimeField({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTones().grey;
  return (
    <Pressable onPress={onPress} style={[styles.base, { borderColor: t.border, backgroundColor: t.surface }]} accessibilityRole="button">
      <AppText>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({ base: { minHeight: 52, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.lg, justifyContent: 'center' } });
