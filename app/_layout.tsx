import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import * as SplashScreen from 'expo-splash-screen';

import { ThemeModeProvider, useSurfacePalette } from '@/foundation/hooks/useThemeMode';
import { AppBootstrapProvider } from '@/foundation/services/bootstrap/AppBootstrapProvider';
import { DialogProvider } from '@/foundation/services/dialogs/DialogProvider';
import { useAppBootstrap } from '@/foundation/services/bootstrap/AppBootstrapProvider';
import { AppLockProvider } from '@/foundation/services/security/AppLockProvider';
import { appConfig } from '@/config/appConfig';

void SplashScreen.preventAutoHideAsync();

function AppNavigator() {
  const palette = useSurfacePalette();
  const { isReady } = useAppBootstrap();

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(palette.background);
  }, [palette.background]);

  useEffect(() => {
    if (!isReady) return;

    if (Platform.OS === 'ios') {
      const timer = setTimeout(() => {
        void SplashScreen.hideAsync();
      }, appConfig.splash.iosMinimumVisibleMs);
      return () => clearTimeout(timer);
    }

    void SplashScreen.hideAsync();
    return;
  }, [isReady]);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="unlock" />
        <Stack.Screen name="pin-setup" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="categories/create" options={{ presentation: 'modal' }} />
        <Stack.Screen name="capture/[categoryId]" />
        <Stack.Screen name="tutorials/capture" />
        {appConfig.features.showDevTools ? <Stack.Screen name="dev/button-lab" /> : null}
        {appConfig.features.showDevTools ? <Stack.Screen name="dev/round-icon-lab" /> : null}
        <Stack.Screen name="modals" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeModeProvider>
        <AppBootstrapProvider>
          <DialogProvider>
            <AppLockProvider>
              <AppNavigator />
            </AppLockProvider>
          </DialogProvider>
        </AppBootstrapProvider>
      </ThemeModeProvider>
    </SafeAreaProvider>
  );
}
