import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/foundation/components/layout/AppText';
import { useTones } from '@/foundation/hooks/useTones';
import { radii } from '@/foundation/theme';

export function IconButton({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTones().grey;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.base, { backgroundColor: pressed ? t.emphasis : t.base }]}>
      <AppText style={{ color: t.onBase }}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { width: 44, height: 44, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
});
