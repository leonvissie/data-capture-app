import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import * as SystemUI from 'expo-system-ui';

import { ThemeModeProvider, useSurfacePalette } from '@/foundation/hooks/useThemeMode';
import { AppLockProvider } from '@/foundation/services/security/AppLockProvider';
import { initializeStorage } from '@/foundation/services/storage/database';

function AppNavigator() {
  const palette = useSurfacePalette();

  useEffect(() => {
    void initializeStorage();
    void SystemUI.setBackgroundColorAsync(palette.background);
  }, [palette.background]);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="modals" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeModeProvider>
        <AppLockProvider>
          <AppNavigator />
        </AppLockProvider>
      </ThemeModeProvider>
    </SafeAreaProvider>
  );
}
