import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react';

import { hasPinConfigured } from './pinPolicy';

type AppLockContextValue = {
  isLocked: boolean;
  setLocked: (value: boolean) => void;
  requiresPinSetup: boolean;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function AppLockProvider({ children }: PropsWithChildren) {
  const [isLocked, setLocked] = useState(true);
  const [requiresPinSetup, setRequiresPinSetup] = useState(false);

  useEffect(() => {
    void hasPinConfigured().then((configured) => {
      setRequiresPinSetup(!configured);
      setLocked(configured);
    });
  }, []);

  const value = useMemo(
    () => ({ isLocked, setLocked, requiresPinSetup }),
    [isLocked, requiresPinSetup],
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
