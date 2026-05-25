import type { PaletteMode } from './colors';

export const getShadowColor = (mode: PaletteMode) => (mode === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(2,6,23,0.18)');

export const getScrimColor = (mode: PaletteMode, opacity = 0.45) =>
  mode === 'dark' ? `rgba(2,6,23,${opacity})` : `rgba(15,23,42,${opacity})`;
