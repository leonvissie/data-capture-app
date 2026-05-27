import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';

import { canUseBiometrics } from '@/foundation/services/security/biometric';
import { useAppLock } from '@/foundation/services/security/AppLockProvider';
import { getOrCreateUserPrefs, type UserPrefs, updateUserPrefs } from '@/foundation/services/storage/userPrefsRepository';

type AlertLike = {
  alert: (title: string, message?: string, buttons?: Array<{ text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }>) => void;
};

type SecuritySettingsControllerDeps = {
  getPrefs: () => UserPrefs | null;
  setPrefs: (next: UserPrefs) => void;
  biometricSupported: boolean;
  platformOS: string;
  updatePrefs: typeof updateUserPrefs;
  alert: AlertLike['alert'];
  openSettings: typeof Linking.openSettings;
  lock: () => void;
  requestDestructiveReset: () => Promise<void>;
};

export function createSecuritySettingsController(deps: SecuritySettingsControllerDeps) {
  return {
    async setBiometricEnabled(value: boolean) {
      const prefs = deps.getPrefs();
      if (!prefs) return;
      if (value && !deps.biometricSupported) {
        if (deps.platformOS !== 'web') {
          deps.alert('Biometrics unavailable', 'Set up Face ID or Touch ID in your device settings, then try again.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open settings', onPress: () => void deps.openSettings() },
          ]);
        }
        return;
      }
      const updated = await deps.updatePrefs({ biometricEnabled: value });
      deps.setPrefs(updated);
    },
    async setAutoLockMinutes(value: number) {
      const updated = await deps.updatePrefs({ autoLockMinutes: value });
      deps.setPrefs(updated);
    },
    async setShowHomeTutorialCta(value: boolean) {
      const updated = await deps.updatePrefs({ showHomeTutorialCta: value });
      deps.setPrefs(updated);
    },
    lockNow() {
      deps.lock();
    },
    async resetNow() {
      await deps.requestDestructiveReset();
    },
  };
}

export function useSecuritySettings() {
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(true);
  const [devOpen, setDevOpen] = useState(true);
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

  const controller = useMemo(
    () =>
      createSecuritySettingsController({
        getPrefs: () => prefs,
        setPrefs,
        biometricSupported,
        platformOS: Platform.OS,
        updatePrefs: updateUserPrefs,
        alert: Alert.alert,
        openSettings: Linking.openSettings,
        lock,
        requestDestructiveReset,
      }),
    [biometricSupported, lock, prefs, requestDestructiveReset],
  );

  return {
    prefs,
    preferencesOpen,
    setPreferencesOpen,
    devOpen,
    setDevOpen,
    autoLockOptions,
    biometricSupported,
    setBiometricEnabled: controller.setBiometricEnabled,
    setAutoLockMinutes: controller.setAutoLockMinutes,
    setShowHomeTutorialCta: controller.setShowHomeTutorialCta,
    lockNow: controller.lockNow,
    resetNow: controller.resetNow,
  };
}
