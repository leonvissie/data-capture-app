import type { SurfacePalette } from './colors';

export function semanticFromPalette(palette: SurfacePalette) {
  return {
    success: palette.text,
    warning: palette.text,
    error: palette.text,
    info: palette.text,
  };
}
