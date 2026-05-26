import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { confirmDialog } from '@/foundation/services/dialogs/dialogService';
import { getOrCreateUserPrefs, subscribeUserPrefs } from '@/foundation/services/storage/userPrefsRepository';

import { canUseBiometrics, promptBiometricUnlock } from './biometric';
import { hasPinConfigured, setPin as persistPin, verifyPin } from './pinPolicy';
import { resetAppDataAndCredentials } from './resetAppDataService';

type AppLockContextValue = {
  isLocked: boolean;
  requiresPinSetup: boolean;
  lockoutRemainingMs: number;
  biometricAvailable: boolean;
  setPin: (pin: string) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  unlockWithBiometrics: () => Promise<boolean>;
  requestDestructiveReset: () => Promise<void>;
  lock: () => void;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function AppLockProvider({ children }: PropsWithChildren) {
  const [isLocked, setLocked] = useState(true);
  const [requiresPinSetup, setRequiresPinSetup] = useState(false);
  const [lockoutRemainingMs, setLockoutRemainingMs] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(0);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [lockTimeoutMs, setLockTimeoutMs] = useState(60_000);
  const [backgroundedAt, setBackgroundedAt] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      const [configured, prefs, bioHardwareAvailable] = await Promise.all([
        hasPinConfigured(),
        getOrCreateUserPrefs(),
        canUseBiometrics(),
      ]);

      setRequiresPinSetup(!configured);
      setLocked(configured);
      setBiometricEnabled(prefs.biometricEnabled);
      setBiometricAvailable(bioHardwareAvailable && prefs.biometricEnabled);
      setLockTimeoutMs(Math.max(0, prefs.autoLockMinutes) * 60_000);
    })();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeUserPrefs((prefs) => {
      setBiometricEnabled(prefs.biometricEnabled);
      setLockTimeoutMs(Math.max(0, prefs.autoLockMinutes) * 60_000);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    void (async () => {
      const hardwareAvailable = await canUseBiometrics();
      setBiometricAvailable(hardwareAvailable && biometricEnabled);
    })();
  }, [biometricEnabled]);

  useEffect(() => {
    if (!lockoutUntil) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, lockoutUntil - Date.now());
      setLockoutRemainingMs(remaining);
      if (remaining === 0) {
        setLockoutUntil(0);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutUntil]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        setBackgroundedAt(Date.now());
        return;
      }

      if (backgroundedAt && Date.now() - backgroundedAt > lockTimeoutMs) {
        setLocked(true);
      }
      setBackgroundedAt(null);
    });
    return () => sub.remove();
  }, [backgroundedAt, lockTimeoutMs]);

  const value = useMemo<AppLockContextValue>(
    () => ({
      isLocked,
      requiresPinSetup,
      lockoutRemainingMs,
      biometricAvailable,
      async setPin(pin: string) {
        await persistPin(pin);
        setRequiresPinSetup(false);
        setLocked(false);
      },
      async unlockWithPin(pin: string) {
        const result = await verifyPin(pin);
        if (result.lockedUntil > Date.now()) {
          setLockoutUntil(result.lockedUntil);
          setLockoutRemainingMs(result.lockedUntil - Date.now());
        }
        if (result.success) {
          setLocked(false);
          setLockoutUntil(0);
          setLockoutRemainingMs(0);
          return true;
        }
        return false;
      },
      async unlockWithBiometrics() {
        if (!biometricEnabled) return false;
        const ok = await promptBiometricUnlock();
        if (ok) {
          setLocked(false);
        }
        return ok;
      },
      async requestDestructiveReset() {
        const confirmed = await confirmDialog({
          title: 'Reset app data?',
          message:
            'This will permanently delete all local data and reset your security credentials. This action cannot be undone.',
          confirmText: 'Reset & Delete',
          cancelText: 'Cancel',
        });
        if (!confirmed) return;

        await resetAppDataAndCredentials();
        const prefs = await getOrCreateUserPrefs();

        setBiometricEnabled(prefs.biometricEnabled);
        setBiometricAvailable((await canUseBiometrics()) && prefs.biometricEnabled);
        setLockTimeoutMs(Math.max(0, prefs.autoLockMinutes) * 60_000);
        setLockoutUntil(0);
        setLockoutRemainingMs(0);
        setLocked(true);
        setRequiresPinSetup(true);
      },
      lock() {
        setLocked(true);
      },
    }),
    [biometricAvailable, biometricEnabled, isLocked, lockoutRemainingMs, requiresPinSetup],
  );

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock() {
  const context = useContext(AppLockContext);
  if (!context) {
    throw new Error('useAppLock must be used inside AppLockProvider');
  }
  return context;
}
