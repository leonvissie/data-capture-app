import { StyleSheet, View } from 'react-native';

import { AppText } from '@/foundation/components/layout/AppText';
import { useTones } from '@/foundation/hooks/useTones';
import { radii, spacing } from '@/foundation/theme';

export function ErrorState({ message }: { message: string }) {
  const t = useTones().red;
  return (
    <View style={[styles.base, { backgroundColor: t.surface, borderColor: t.border }]}>
      <AppText>{message}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderWidth: 1, borderRadius: radii.md, padding: spacing.md },
});
