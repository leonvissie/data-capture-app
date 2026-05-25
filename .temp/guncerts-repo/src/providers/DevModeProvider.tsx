import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ensureUserPrefs, saveUserPrefs } from '../data/repo';
import { getFirstProfile } from '../data/sqlite';
import { logger, setDevModeEnabled as setLoggerDevModeEnabled } from '@/src/utils/logger';

type DevModeContextValue = {
  devModeEnabled: boolean;
  setDevModeEnabled: (enabled: boolean) => void;
  testPaymentEnabled: boolean;
  setTestPaymentEnabled: (enabled: boolean) => void;
};

const DevModeContext = createContext<DevModeContextValue>({
  devModeEnabled: true,
  setDevModeEnabled: () => {},
  testPaymentEnabled: false,
  setTestPaymentEnabled: () => {},
});

function resolveInitialDevMode(): boolean {
  try {
    const profile = getFirstProfile();
    if (!profile) return false;
    const prefs = ensureUserPrefs(profile.id);
    return prefs.devModeEnabled !== false;
  } catch (error) {
    logger.warn('[dev-mode] unable to read initial state', error);
    return true;
  }
}

export function DevModeProvider({ children }: { children: React.ReactNode }) {
  const [devModeEnabled, setDevModeEnabledState] = useState<boolean>(() => resolveInitialDevMode());
  const [testPaymentEnabled, setTestPaymentEnabled] = useState(false);

  useEffect(() => {
    setLoggerDevModeEnabled(devModeEnabled);
  }, [devModeEnabled]);

  const setDevModeEnabled = useCallback((enabled: boolean) => {
    setDevModeEnabledState(enabled);
    setLoggerDevModeEnabled(enabled);
    try {
      const profile = getFirstProfile();
      if (!profile) return;
      const prefs = ensureUserPrefs(profile.id);
      saveUserPrefs({ ...prefs, devModeEnabled: enabled });
    } catch (error) {
      logger.warn('[dev-mode] unable to persist setting', error);
    }
  }, []);

  const value = useMemo(
    () => ({
      devModeEnabled,
      setDevModeEnabled,
      testPaymentEnabled,
      setTestPaymentEnabled,
    }),
    [devModeEnabled, setDevModeEnabled, testPaymentEnabled, setTestPaymentEnabled],
  );

  return <DevModeContext.Provider value={value}>{children}</DevModeContext.Provider>;
}

export function useDevMode() {
  return useContext(DevModeContext);
}
