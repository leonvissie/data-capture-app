import React, { useEffect } from 'react';
import { Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';

import HomeScreen from '@/screens/HomeScreen';
import { ThemeModeProvider, TourProvider, WatchStateProvider, useWatchState } from '@/providers';

void SplashScreen.preventAutoHideAsync();

const TextComponent = Text as unknown as { defaultProps?: Record<string, unknown> };
TextComponent.defaultProps = TextComponent.defaultProps ?? {};
TextComponent.defaultProps.allowFontScaling = true;
TextComponent.defaultProps.maxFontSizeMultiplier = 2;

const TextInputComponent = TextInput as unknown as { defaultProps?: Record<string, unknown> };
TextInputComponent.defaultProps = TextInputComponent.defaultProps ?? {};
TextInputComponent.defaultProps.allowFontScaling = true;
TextInputComponent.defaultProps.maxFontSizeMultiplier = 2;

export default function App() {
  return (
    <SafeAreaProvider>
      <WatchStateProvider>
        <AppBootstrap />
      </WatchStateProvider>
    </SafeAreaProvider>
  );
}

function AppBootstrap() {
  const { isReady } = useWatchState();

  useEffect(() => {
    if (!isReady) return;
    const timer = setTimeout(() => {
      void SplashScreen.hideAsync();
    }, 1500);

    return () => clearTimeout(timer);
  }, [isReady]);

  return (
    <ThemeModeProvider>
      <TourProvider>
        <HomeScreen />
      </TourProvider>
    </ThemeModeProvider>
  );
}
