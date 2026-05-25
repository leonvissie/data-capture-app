import { palettes, type PaletteTones } from '@/foundation/theme';
import { useThemeMode } from './useThemeMode';

export function useTones(): PaletteTones {
  const { effectiveMode } = useThemeMode();
  return palettes[effectiveMode].tones;
}
