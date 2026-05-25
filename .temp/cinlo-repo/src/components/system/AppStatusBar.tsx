import { StatusBar } from 'expo-status-bar';
import React from 'react';

import { useSurfacePalette, useThemeMode } from '@/providers';

export function AppStatusBar() {
  const { effectiveMode } = useThemeMode();
  const palette = useSurfacePalette();
  return (
    <StatusBar
      style={effectiveMode === 'dark' ? 'light' : 'dark'}
      translucent={false}
      backgroundColor={palette.background}
    />
  );
}
