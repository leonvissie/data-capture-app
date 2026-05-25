import type { PaletteMode } from './colors';

const clampOpacity = (value: number) => Math.max(0, Math.min(1, value));

export const getScrimColor = (mode: PaletteMode, opacity = 0.45): string => {
  const alpha = clampOpacity(opacity);
  if (mode === 'dark') return `rgba(3,10,20,${alpha})`;
  return `rgba(0,0,0,${alpha})`;
};

export const getShadowColor = (mode: PaletteMode): string =>
  mode === 'dark' ? 'rgba(3,10,20,0.45)' : 'rgba(0,0,0,0.2)';
