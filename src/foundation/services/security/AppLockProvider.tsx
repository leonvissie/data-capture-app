import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { hasPinConfigured, setPin as persistPin, verifyPin } from './pinPolicy';
import { canUseBiometrics, promptBiometricUnlock } from './biometric';

type AppLockContextValue = {
  isLocked: boolean;
  requiresPinSetup: boolean;
  lockoutRemainingMs: number;
  biometricAvailable: boolean;
  setPin: (pin: string) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  unlockWithBiometrics: () => Promise<boolean>;
  lock: () => void;
};

const APP_LOCK_TIMEOUT_MS = 60_000;

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function AppLockProvider({ children }: PropsWithChildren) {
  const [isLocked, setLocked] = useState(true);
  const [requiresPinSetup, setRequiresPinSetup] = useState(false);
  const [lockoutRemainingMs, setLockoutRemainingMs] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(0);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [backgroundedAt, setBackgroundedAt] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      const configured = await hasPinConfigured();
      setRequiresPinSetup(!configured);
      setLocked(configured);
      setBiometricAvailable(await canUseBiometrics());
    })();
  }, []);

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
      if (backgroundedAt && Date.now() - backgroundedAt > APP_LOCK_TIMEOUT_MS) {
        setLocked(true);
      }
      setBackgroundedAt(null);
    });
    return () => sub.remove();
  }, [backgroundedAt]);

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
        const ok = await promptBiometricUnlock();
        if (ok) {
          setLocked(false);
        }
        return ok;
      },
      lock() {
        setLocked(true);
      },
    }),
    [biometricAvailable, isLocked, lockoutRemainingMs, requiresPinSetup],
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
