import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { useThemeMode } from '../providers/ThemeModeProvider';

export default function AppStatusBar() {
  const { effectiveMode } = useThemeMode();
  return <StatusBar style={effectiveMode === 'dark' ? 'light' : 'dark'} />;
}
