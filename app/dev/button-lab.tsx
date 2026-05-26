import { AppScrollScreen } from '@/foundation/components/layout/AppScrollScreen';
import { AppText } from '@/foundation/components/layout/AppText';
import { Button, type ButtonSize, type ButtonVariant } from '@/foundation/components/buttons/Button';
import { PageHeader } from '@/foundation/components/layout/PageHeader';
import { spacing, type ToneKey } from '@/foundation/theme';
import { StyleSheet, View } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Redirect } from 'expo-router';
import { appConfig } from '@/config/appConfig';

const tones: ToneKey[] = ['teal', 'blue', 'green', 'orange', 'red', 'grey'];
const sizeOptions: ButtonSize[] = ['sm', 'md', 'lg'];
const variantOptions: ButtonVariant[] = ['solid', 'outline', 'soft'];

export default function ButtonLabScreen() {
  if (!appConfig.features.showDevTools) return <Redirect href="/(tabs)/settings" />;

  const router = useRouter();
  const [size, setSize] = useState<ButtonSize>('sm');
  const [variant, setVariant] = useState<ButtonVariant>('solid');

  return (
    <AppScrollScreen>
      <PageHeader title="Button Lab" subtitle="Dev-only preview for button tone, variant, size, and token-slot overrides." rightAction={{ buttonType: 'close', accessibilityLabel: 'Close button lab', onPress: () => router.back() }} />

      <View style={styles.group}>
        <AppText variant="sectionTitle">Height</AppText>
        <View style={styles.row}>
          {sizeOptions.map((option) => (
            <Button
              key={option}
              label={option.toUpperCase()}
              onPress={() => setSize(option)}
              variant={size === option ? 'solid' : 'outline'}
              tone="teal"
              size="sm"
            />
          ))}
        </View>
      </View>

      <View style={styles.group}>
        <AppText variant="sectionTitle">Variant</AppText>
        <View style={styles.row}>
          {variantOptions.map((option) => (
            <Button
              key={option}
              label={option}
              onPress={() => setVariant(option)}
              variant={variant === option ? 'solid' : 'outline'}
              tone="blue"
              size="sm"
            />
          ))}
        </View>
      </View>

      <View style={styles.group}>
        <AppText variant="sectionTitle">{variant}</AppText>
        <View style={styles.row}>
          {tones.map((tone) => (
            <Button key={`${variant}-${tone}`} label={tone} onPress={() => {}} variant={variant} tone={tone} size={size} />
          ))}
        </View>
      </View>

      <View style={styles.group}>
        <AppText variant="sectionTitle">Token Override Example</AppText>
        <Button
          label="Soft Orange Custom"
          onPress={() => {}}
          variant="soft"
          tone="orange"
          size={size}
          tokens={{ background: 'surface', border: 'border', text: 'base', pressedBackground: 'base' }}
        />
      </View>
    </AppScrollScreen>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.sm,
  },
  row: {
    gap: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
