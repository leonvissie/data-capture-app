import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { palettes, PaletteMode } from '@/foundation/theme';

export type ScreenModePreference = 'system' | 'light' | 'dark';

type ThemeModeContextValue = {
  screenMode: ScreenModePreference;
  effectiveMode: PaletteMode;
  setScreenMode: (mode: ScreenModePreference) => void;
};

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function ThemeModeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [screenMode, setScreenMode] = useState<ScreenModePreference>('system');

  const value = useMemo<ThemeModeContextValue>(() => {
    const effectiveMode = screenMode === 'system' ? system : screenMode;
    return { screenMode, effectiveMode, setScreenMode };
  }, [screenMode, system]);

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode() {
  const context = useContext(ThemeModeContext);
  if (!context) {
    throw new Error('useThemeMode must be used inside ThemeModeProvider');
  }
  return context;
}

export function useSurfacePalette() {
  const { effectiveMode } = useThemeMode();
  return palettes[effectiveMode];
}
