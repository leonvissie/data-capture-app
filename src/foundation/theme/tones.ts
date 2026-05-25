import { palettes, type PaletteMode, type PaletteTones } from './colors';

export const getTones = (mode: PaletteMode): PaletteTones => palettes[mode].tones;
