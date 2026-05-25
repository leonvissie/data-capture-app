import type { PaletteMode } from './colors';

export type ScreenModePreference = 'default' | 'light' | 'dark';

export const resolvePaletteMode = (
  screenMode: ScreenModePreference | undefined,
  systemMode: PaletteMode | null | undefined,
): PaletteMode => {
  if (screenMode === 'light' || screenMode === 'dark') return screenMode;
  return systemMode === 'dark' ? 'dark' : 'light';
};
