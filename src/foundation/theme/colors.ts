export const palettes = {
  light: {
    background: '#F8FAFC',
    card: '#FFFFFF',
    text: '#0F172A',
    textMuted: '#64748B',
    border: '#E2E8F0',
    primary: '#0E9384',
    primaryEmphasis: '#0B7569',
    accent: '#2563EB',
    success: '#15803D',
    warning: '#B45309',
    error: '#B91C1C',
    info: '#2563EB',
  },
  dark: {
    background: '#0F172A',
    card: '#1E293B',
    text: '#F8FAFC',
    textMuted: '#CBD5E1',
    border: '#334155',
    primary: '#2DC2BC',
    primaryEmphasis: '#26A299',
    accent: '#5B8EFF',
    success: '#3CCB8B',
    warning: '#F4B740',
    error: '#FF6B6B',
    info: '#79C3F0',
  },
} as const;

export type PaletteMode = keyof typeof palettes;
