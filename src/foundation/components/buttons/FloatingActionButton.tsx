import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/foundation/components/layout/AppText';
import { useTones } from '@/foundation/hooks/useTones';
import { radii, spacing } from '@/foundation/theme';

export function FloatingActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTones().teal;
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable style={({ pressed }) => [styles.base, { backgroundColor: pressed ? t.emphasis : t.base }]} onPress={onPress} accessibilityRole="button">
        <AppText variant="buttonLabel" style={{ color: t.onBase }}>{label}</AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: spacing.lg, bottom: spacing.lg },
  base: { minHeight: 52, borderRadius: radii.pill, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg },
});
