import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react';

import { useThemeMode } from '@/foundation/hooks/useThemeMode';
import { initializeStorage } from '@/foundation/services/storage/database';
import { getOrCreateUserPrefs, updateUserPrefs, userPrefsConstants } from '@/foundation/services/storage/userPrefsRepository';

type BootstrapState = {
  isReady: boolean;
  hasCompletedOnboarding: boolean;
  shouldRunTour: boolean;
  completeOnboarding: () => Promise<void>;
  completeTour: () => Promise<void>;
};

const BootstrapContext = createContext<BootstrapState | null>(null);

export function AppBootstrapProvider({ children }: PropsWithChildren) {
  const { setScreenMode } = useThemeMode();
  const [isReady, setIsReady] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [shouldRunTour, setShouldRunTour] = useState(false);

  useEffect(() => {
    void (async () => {
      await initializeStorage();
      const prefs = await getOrCreateUserPrefs();
      setScreenMode(prefs.preferredThemeMode);
      setHasCompletedOnboarding(prefs.hasCompletedOnboarding);
      setShouldRunTour(!prefs.hasCompletedTour || prefs.tourVersion < userPrefsConstants.CURRENT_TOUR_VERSION);
      setIsReady(true);
    })();
  }, [setScreenMode]);

  const value = useMemo<BootstrapState>(
    () => ({
      isReady,
      hasCompletedOnboarding,
      shouldRunTour,
      async completeOnboarding() {
        await updateUserPrefs({ hasCompletedOnboarding: true });
        setHasCompletedOnboarding(true);
      },
      async completeTour() {
        await updateUserPrefs({ hasCompletedTour: true, tourVersion: userPrefsConstants.CURRENT_TOUR_VERSION });
        setShouldRunTour(false);
      },
    }),
    [hasCompletedOnboarding, isReady, shouldRunTour],
  );

  return <BootstrapContext.Provider value={value}>{children}</BootstrapContext.Provider>;
}

export function useAppBootstrap() {
  const context = useContext(BootstrapContext);
  if (!context) {
    throw new Error('useAppBootstrap must be used within AppBootstrapProvider');
  }
  return context;
}
