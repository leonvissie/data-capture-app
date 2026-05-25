import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, useColorScheme } from 'react-native';

import { ensureUserPrefs, saveUserPrefs } from '../data/repo';
import { listByType } from '../data/sqlite';
import type { Profile } from '../data/types';
import type { PaletteMode } from '../theme/colors';
import { resolvePaletteMode, type ScreenModePreference } from '../theme/screenMode';
import { subscribeThemeModeStorageChange } from '../theme/themeModeEvents';

type ThemeModeContextValue = {
  screenMode: ScreenModePreference;
  effectiveMode: PaletteMode;
  setScreenMode: (mode: ScreenModePreference) => void;
};

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

const getProfileId = (): string | null => {
  const profile = listByType<Profile>('Profile')[0];
  return profile?.id ?? null;
};

const loadStoredScreenMode = (): ScreenModePreference => {
  const profileId = getProfileId();
  if (!profileId) return 'default';
  const prefs = ensureUserPrefs(profileId);
  return prefs.screenMode ?? 'default';
};

export function ThemeModeProvider({ children }: React.PropsWithChildren) {
  const systemScheme = (useColorScheme() ?? 'light') as PaletteMode;
  const [screenMode, setScreenModeState] = useState<ScreenModePreference>('default');

  const refreshFromStorage = useCallback(() => {
    setScreenModeState(loadStoredScreenMode());
  }, []);

  useEffect(() => {
    refreshFromStorage();
  }, [refreshFromStorage]);

  useEffect(() => {
    const unsubscribe = subscribeThemeModeStorageChange(refreshFromStorage);
    return unsubscribe;
  }, [refreshFromStorage]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshFromStorage();
    });
    return () => sub.remove();
  }, [refreshFromStorage]);

  const setScreenMode = useCallback((mode: ScreenModePreference) => {
    setScreenModeState(mode);
    const profileId = getProfileId();
    if (!profileId) return;
    const prefs = ensureUserPrefs(profileId);
    if ((prefs.screenMode ?? 'default') === mode) return;
    saveUserPrefs({ ...prefs, screenMode: mode });
  }, []);

  const value = useMemo<ThemeModeContextValue>(
    () => ({
      screenMode,
      effectiveMode: resolvePaletteMode(screenMode, systemScheme),
      setScreenMode,
    }),
    [screenMode, setScreenMode, systemScheme],
  );

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export const useThemeMode = (): ThemeModeContextValue => {
  const context = useContext(ThemeModeContext);
  const systemScheme = (useColorScheme() ?? 'light') as PaletteMode;
  if (!context) {
    return {
      screenMode: 'default',
      effectiveMode: resolvePaletteMode('default', systemScheme),
      setScreenMode: () => {},
    };
  }
  return context;
};
