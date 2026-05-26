import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/foundation/components/buttons/Button';
import { RoundIconButton } from '@/foundation/components/buttons/RoundIconButton';
import { AppScrollScreen } from '@/foundation/components/layout/AppScrollScreen';
import { AppText } from '@/foundation/components/layout/AppText';
import { ROUND_ICON_BUTTON_TYPES } from '@/foundation/components/buttons/roundIconButtonTypes';
import { spacing } from '@/foundation/theme';

export default function RoundIconLabScreen() {
  const router = useRouter();
  const [size, setSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [floating, setFloating] = useState(false);

  return (
    <AppScrollScreen>
      <View style={styles.headerRow}>
        <AppText variant="pageTitle">Round Icon Lab</AppText>
        <RoundIconButton buttonType="close" accessibilityLabel="Close round icon lab" onPress={() => router.back()} size="md" />
      </View>
      <AppText>Dev-only preview of all round icon button types and floating behavior.</AppText>

      <View style={styles.group}>
        <AppText variant="sectionTitle">Size</AppText>
        <View style={styles.row}>
          {(['sm', 'md', 'lg'] as const).map((option) => (
            <Button key={option} label={option.toUpperCase()} onPress={() => setSize(option)} variant={size === option ? 'solid' : 'outline'} tone="teal" size="sm" />
          ))}
        </View>
      </View>

      <View style={styles.group}>
        <AppText variant="sectionTitle">Mode</AppText>
        <View style={styles.row}>
          <Button label="Inline" onPress={() => setFloating(false)} variant={!floating ? 'solid' : 'outline'} tone="blue" size="sm" />
          <Button label="Floating" onPress={() => setFloating(true)} variant={floating ? 'solid' : 'outline'} tone="blue" size="sm" />
        </View>
      </View>

      <View style={styles.group}>
        <AppText variant="sectionTitle">All Button Types</AppText>
        <View style={styles.row}>
          {ROUND_ICON_BUTTON_TYPES.map((buttonType) => (
            <RoundIconButton key={buttonType} buttonType={buttonType} accessibilityLabel={buttonType} onPress={() => {}} size={size} floating={floating} />
          ))}
        </View>
      </View>
    </AppScrollScreen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
