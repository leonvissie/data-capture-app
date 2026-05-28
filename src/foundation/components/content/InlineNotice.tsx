import { StyleSheet, View } from 'react-native';

import { AppText } from '@/foundation/components/layout/AppText';
import { useTones } from '@/foundation/hooks/useTones';
import { radii, spacing, type ToneKey } from '@/foundation/theme';

export function InlineNotice({ message, tone = 'orange' }: { message: string; tone?: ToneKey }) {
  const t = useTones()[tone];
  return (
    <View style={[styles.base, { backgroundColor: t.surface, borderColor: t.border }]}>
      <AppText style={{ color: t.emphasis }}>{message}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderWidth: 1, borderRadius: radii.md, padding: spacing.md },
});
