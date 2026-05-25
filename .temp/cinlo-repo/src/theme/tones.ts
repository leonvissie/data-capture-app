import { palettes, type PaletteMode, type PaletteTones } from './colors';
import { useThemeMode } from '@/providers';

export const getTones = (scheme?: PaletteMode): PaletteTones => {
  const resolvedScheme: PaletteMode = scheme ?? 'light';
  return palettes[resolvedScheme].tones;
};

export const useTones = (): PaletteTones => {
  const { effectiveMode } = useThemeMode();
  return palettes[effectiveMode].tones;
};
