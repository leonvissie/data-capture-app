import type { PaletteMode } from './colors';

export const getShadowColor = (mode: PaletteMode) =>
  mode === 'dark' ? 'rgba(0, 0, 0, 0.55)' : 'rgba(15, 23, 42, 0.15)';

export const getScrimColor = (mode: PaletteMode, opacity = 0.45) =>
  mode === 'dark' ? `rgba(0, 0, 0, ${opacity})` : `rgba(15, 23, 42, ${Math.min(opacity, 0.35)})`;
