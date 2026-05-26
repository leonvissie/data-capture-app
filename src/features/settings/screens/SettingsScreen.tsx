import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { DestructiveButton } from '@/foundation/components/buttons/DestructiveButton';
import { SecondaryButton } from '@/foundation/components/buttons/SecondaryButton';
import { AppScrollScreen } from '@/foundation/components/layout/AppScrollScreen';
import { AppText } from '@/foundation/components/layout/AppText';
import { SettingsChoiceRow } from '@/foundation/components/settings/SettingsChoiceRow';
import { SettingsSection } from '@/foundation/components/settings/SettingsSection';
import { SettingsToggleRow } from '@/foundation/components/settings/SettingsToggleRow';
import { canUseBiometrics } from '@/foundation/services/security/biometric';
import { useAppLock } from '@/foundation/services/security/AppLockProvider';
import { getOrCreateUserPrefs, updateUserPrefs } from '@/foundation/services/storage/userPrefsRepository';
import { spacing } from '@/foundation/theme';

export function SettingsScreen() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Awaited<ReturnType<typeof getOrCreateUserPrefs>> | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(true);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const { lock, requestDestructiveReset } = useAppLock();

  const autoLockOptions = useMemo(
    () => [
      { value: 1, label: '1 min' },
      { value: 2, label: '2 min' },
      { value: 5, label: '5 min' },
    ],
    [],
  );

  useEffect(() => {
    void (async () => {
      const [nextPrefs, supportsBiometric] = await Promise.all([getOrCreateUserPrefs(), canUseBiometrics()]);
      setPrefs(nextPrefs);
      setBiometricSupported(supportsBiometric);
    })();
  }, []);

  const setBiometricEnabled = async (value: boolean) => {
    if (!prefs) return;
    if (value && !biometricSupported) {
      if (Platform.OS !== 'web') {
        Alert.alert(
          'Biometrics unavailable',
          'Set up Face ID or Touch ID in your device settings, then try again.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open settings', onPress: () => void Linking.openSettings() },
          ],
        );
      }
      return;
    }

    const updated = await updateUserPrefs({ biometricEnabled: value });
    setPrefs(updated);
  };

  const setAutoLockMinutes = async (value: number) => {
    const updated = await updateUserPrefs({ autoLockMinutes: value });
    setPrefs(updated);
  };

  return (
    <AppScrollScreen>
      <AppText variant="pageTitle">Settings</AppText>
      <AppText>Configure security and lock behavior.</AppText>

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
        {__DEV__ ? <SecondaryButton label="Open Button Lab" onPress={() => router.push('/dev/button-lab')} /> : null}
        {__DEV__ ? <SecondaryButton label="Open Round Icon Lab" onPress={() => router.push('/dev/round-icon-lab')} /> : null}
        <DestructiveButton label="Lock app now" onPress={lock} />
        <DestructiveButton label="Reset app data" onPress={() => void requestDestructiveReset()} />
      </View>
    </AppScrollScreen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
});
