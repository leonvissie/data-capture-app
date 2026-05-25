import React, { createContext, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { palettes, type PaletteMode } from '@/theme/colors';

export type ScreenModePreference = 'system' | 'light' | 'dark';

type ThemeModeContextValue = {
  screenMode: ScreenModePreference;
  effectiveMode: PaletteMode;
  setScreenMode: (mode: ScreenModePreference) => void;
};

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

function resolvePaletteMode(screenMode: ScreenModePreference, systemScheme: PaletteMode): PaletteMode {
  return screenMode === 'system' ? systemScheme : screenMode;
}

export function ThemeModeProvider({ children }: React.PropsWithChildren) {
  const colorScheme = useColorScheme();
  const systemScheme: PaletteMode = colorScheme === 'dark' ? 'dark' : 'light';
  const [screenMode, setScreenMode] = useState<ScreenModePreference>('dark');

  const value = useMemo<ThemeModeContextValue>(
    () => ({
      screenMode,
      effectiveMode: resolvePaletteMode(screenMode, systemScheme),
      setScreenMode,
    }),
    [screenMode, systemScheme],
  );

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export const useThemeMode = (): ThemeModeContextValue => {
  const ctx = useContext(ThemeModeContext);
  const colorScheme = useColorScheme();
  const systemScheme: PaletteMode = colorScheme === 'dark' ? 'dark' : 'light';

  if (!ctx) {
    return { screenMode: 'dark', effectiveMode: 'dark', setScreenMode: () => {} };
  }
  return ctx;
};

export function useSurfacePalette() {
  const { effectiveMode } = useThemeMode();
  return palettes[effectiveMode];
}
