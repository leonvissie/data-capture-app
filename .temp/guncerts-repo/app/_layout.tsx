import * as ScreenCapture from 'expo-screen-capture';
import { Stack } from 'expo-router';
import React, { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LockProvider } from '../src/providers/LockProvider';
import { DevModeProvider, useDevMode } from '../src/providers/DevModeProvider';
import { FeedbackProvider } from '../src/providers/FeedbackProvider';
import { ThemeModeProvider, useThemeMode } from '../src/providers/ThemeModeProvider';
import { initDb } from '../src/data/sqlite';
import { installConsoleProxy, logger, restoreConsoleProxy, setDevModeEnabled } from '@/src/utils/logger';
import { allowScreenCapture } from '../src/config/appConfig';
import { reconcileDemoDatasetState, getDemoDatasetState } from '../src/demo/demoState';
import { DEMO_DATASET_VERSION } from '../src/demo/demoDataset';
import { installDemoDataset } from '../src/demo/installDemoDataset';

export default function RootLayout() {
  useEffect(() => {
    initDb();
    void reconcileDemoDatasetState();
    void ensureCurrentDemoDatasetVersion();
  }, []);

  return (
    <GestureHandlerRootView style={rootStyles.root}>
      <DevModeProvider>
        <LockProvider>
          <FeedbackProvider>
            <ThemeModeProvider>
              <View style={rootStyles.root}>
                <GlobalBackground />
                <ConsoleGate />
                <ScreenCaptureController />
                <Stack
                  initialRouteName="index"
                  screenOptions={{
                    headerShown: false,
                    gestureEnabled: false,
                    animation: 'none',
                    freezeOnBlur: true,
                    contentStyle: { backgroundColor: 'transparent' },
                  }}
                >
                  <Stack.Screen name="index" options={{ gestureEnabled: false }} />
                  <Stack.Screen name="(auth)" options={{ gestureEnabled: false }} />
                  <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
                </Stack>
              </View>
            </ThemeModeProvider>
          </FeedbackProvider>
        </LockProvider>
      </DevModeProvider>
    </GestureHandlerRootView>
  );
}

async function ensureCurrentDemoDatasetVersion() {
  try {
    const state = await getDemoDatasetState();
    if (!state.active) return;
    if (state.version === DEMO_DATASET_VERSION) return;
    await installDemoDataset({
      resetBeforeInstall: false,
      clearEntitiesBeforeInstall: true,
    });
  } catch (error) {
    logger.warn('Unable to reconcile demo dataset version', error);
  }
}

function GlobalBackground() {
  const { effectiveMode } = useThemeMode();

  return (
    <Image
      source={
        effectiveMode === 'dark'
          ? require('../assets/images/background-dark.png')
          : require('../assets/images/background-light.png')
      }
      resizeMode="cover"
      style={rootStyles.background}
      accessibilityIgnoresInvertColors
    />
  );
}

function ConsoleGate() {
  const { devModeEnabled } = useDevMode();
  useEffect(() => {
    setDevModeEnabled(devModeEnabled);
  }, [devModeEnabled]);

  useEffect(() => {
    installConsoleProxy();
    return () => restoreConsoleProxy();
  }, []);

  return null;
}

function ScreenCaptureController() {
  useDevMode();
  const allowCapture = allowScreenCapture();

  useEffect(() => {
    let prevented = false;
    const configureScreenCapture = async () => {
      try {
        const available = ScreenCapture.isAvailableAsync
          ? await ScreenCapture.isAvailableAsync()
          : false;
        if (!available) return;

        if (allowCapture) {
          if (ScreenCapture.allowScreenCaptureAsync) {
            await ScreenCapture.allowScreenCaptureAsync();
          }
          prevented = false;
        } else {
          await ScreenCapture.preventScreenCaptureAsync();
          prevented = true;
        }
      } catch (error) {
        logger.warn('Unable to configure screen capture', error);
      }
    };

    void configureScreenCapture();

    return () => {
      if (prevented && ScreenCapture.allowScreenCaptureAsync) {
        ScreenCapture.allowScreenCaptureAsync().catch(() => {});
      }
    };
  }, [allowCapture]);

  return null;
}

const rootStyles = StyleSheet.create({
  root: {
    flex: 1,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.1 }],
  },
});
