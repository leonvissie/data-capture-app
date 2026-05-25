import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/foundation/components/layout/AppText';
import { useTones } from '@/foundation/hooks/useTones';
import { radii, spacing } from '@/foundation/theme';

export function SecondaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  const tones = useTones();
  const t = tones.grey;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: pressed ? t.surface : 'transparent', borderColor: t.border, opacity: disabled ? 0.5 : 1 },
      ]}
    >
      <AppText variant="buttonLabel" style={{ color: t.base }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 52, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: spacing.lg, justifyContent: 'center', alignItems: 'center' },
});
