import { Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { DestructiveButton } from '@/foundation/components/buttons/DestructiveButton';
import { SecondaryButton } from '@/foundation/components/buttons/SecondaryButton';
import { Button } from '@/foundation/components/buttons/Button';
import { AppScrollScreen } from '@/foundation/components/layout/AppScrollScreen';
import { PageHeader } from '@/foundation/components/layout/PageHeader';
import { SettingsChoiceRow } from '@/foundation/components/settings/SettingsChoiceRow';
import { SettingsSection } from '@/foundation/components/settings/SettingsSection';
import { SettingsToggleRow } from '@/foundation/components/settings/SettingsToggleRow';
import { spacing } from '@/foundation/theme';
import { appConfig } from '@/config/appConfig';
import { useSecuritySettings } from '@/features/settings/hooks/useSecuritySettings';

export function SettingsScreen() {
  const router = useRouter();
  const {
    prefs,
    preferencesOpen,
    setPreferencesOpen,
    devOpen,
    setDevOpen,
    autoLockOptions,
    setBiometricEnabled,
    setAutoLockMinutes,
    lockNow,
    resetNow,
  } = useSecuritySettings();

  return (
    <AppScrollScreen>
      <PageHeader title="Settings" subtitle="Configure security and lock behavior." />

      <SettingsSection title="Preferences" open={preferencesOpen} onToggle={setPreferencesOpen}>
        <SettingsToggleRow
          label="Biometric unlock"
          help={Platform.OS === 'web' ? 'Not available on web.' : 'Use Face ID / Touch ID after PIN setup.'}
          value={prefs?.biometricEnabled ?? false}
          onValueChange={(value) => void setBiometricEnabled(value)}
          disabled={Platform.OS === 'web'}
        />
        <SettingsChoiceRow
          label="Auto-lock"
          help="Lock the app after this background time."
          value={prefs?.autoLockMinutes ?? 1}
          options={autoLockOptions}
          onChange={(value) => void setAutoLockMinutes(value)}
          hideDivider
        />
      </SettingsSection>

      <View style={styles.actions}>
        <Button label="Lock app now" onPress={lockNow} tone="blue" variant="solid" />
        <DestructiveButton label="Reset app data" onPress={() => void resetNow()} />
      </View>

      {appConfig.features.showDevTools ? (
        <SettingsSection title="Dev" open={devOpen} onToggle={setDevOpen}>
          <View style={styles.devActions}>
            <SecondaryButton label="Open Button Lab" onPress={() => router.push('/dev/button-lab')} />
            <SecondaryButton label="Open Round Icon Lab" onPress={() => router.push('/dev/round-icon-lab')} />
          </View>
        </SettingsSection>
      ) : null}
    </AppScrollScreen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  devActions: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
});
