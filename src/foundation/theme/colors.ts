export type Tone = {
  base: string;
  emphasis: string;
  onBase: string;
  surface: string;
  onSurface: string;
  border: string;
};

export const palettes = {
  light: {
    background: '#F5F7FB',
    card: '#FFFFFF',
    cardMuted: '#EEF2F8',
    text: '#111827',
    textMuted: '#5B6474',
    border: '#D7DDE8',
    divider: '#E5EAF1',
    tones: {
      teal: { base: '#0E9384', emphasis: '#0B7569', onBase: '#FFFFFF', surface: '#CCF5EF', onSurface: '#0B544C', border: '#5CCFC0' },
      blue: { base: '#2563EB', emphasis: '#1E46D6', onBase: '#FFFFFF', surface: '#DBEAFE', onSurface: '#1E3A8A', border: '#94BFFF' },
      green: { base: '#15803D', emphasis: '#166534', onBase: '#FFFFFF', surface: '#DCFCE7', onSurface: '#166534', border: '#86EFAC' },
      orange: { base: '#B45309', emphasis: '#92400E', onBase: '#FFFFFF', surface: '#FEF3C7', onSurface: '#7A2E0E', border: '#F9C971' },
      red: { base: '#B91C1C', emphasis: '#991B1B', onBase: '#FFFFFF', surface: '#FEE2E2', onSurface: '#7F1D1D', border: '#F87373' },
      grey: { base: '#475467', emphasis: '#1F2937', onBase: '#FFFFFF', surface: '#E4E7EC', onSurface: '#1F2937', border: '#CBD5E1' },
    },
  },
  dark: {
    background: '#0B1120',
    card: '#0F172A',
    cardMuted: '#182235',
    text: '#E5ECF5',
    textMuted: '#9BA9BD',
    border: '#334155',
    divider: '#243044',
    tones: {
      teal: { base: '#2DC2BC', emphasis: '#26A299', onBase: '#042F2D', surface: '#103838', onSurface: '#6FE7E4', border: '#1F6F6C' },
      blue: { base: '#5B8EFF', emphasis: '#396BDD', onBase: '#071226', surface: '#1A2E5E', onSurface: '#9EC2FF', border: '#396BDD' },
      green: { base: '#3CCB8B', emphasis: '#2DA769', onBase: '#071913', surface: '#153727', onSurface: '#82F0BE', border: '#2DA769' },
      orange: { base: '#F4B740', emphasis: '#D08A0D', onBase: '#231300', surface: '#3C2A04', onSurface: '#FBDD8F', border: '#D08A0D' },
      red: { base: '#FF6B6B', emphasis: '#D83C3C', onBase: '#260606', surface: '#3F1414', onSurface: '#FFC2C2', border: '#D83C3C' },
      grey: { base: '#A8B1CF', emphasis: '#7D86A3', onBase: '#0F172A', surface: '#222B3F', onSurface: '#D1D7EB', border: '#7D86A3' },
    },
  },
} as const;

export type PaletteMode = keyof typeof palettes;
export type PaletteTones = (typeof palettes)[PaletteMode]['tones'];
export type ToneKey = keyof PaletteTones;
export type SurfacePalette = Omit<(typeof palettes)[PaletteMode], 'tones'>;
