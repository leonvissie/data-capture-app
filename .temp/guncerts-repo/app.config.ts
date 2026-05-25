import 'dotenv/config';
import type { ConfigContext, ExpoConfig } from '@expo/config';

const APP_ENV = process.env.APP_ENV ?? 'dev'; // dev | stage | prod
const APP_VERSION = '2.6';
const ANDROID_VERSION = '2.6';
const BUILD = '1';
const ANDROID_BUILD = 54;
const COMPLIANCE_NOTICE_TRIGGER = 'version'; // version | build | both | always
const IS_PROD = APP_ENV === 'prod';

const NAME = {
  dev: 'GunCerts (Dev)',
  stage: 'GunCerts (Beta)',
  prod: 'GunCerts'
}[APP_ENV as 'dev'|'stage'|'prod'];

const SCHEME_NAME = {
  dev: 'guncerts-dev',
  stage: 'guncerts-stage',
  prod: 'guncerts'
}[APP_ENV as 'dev'|'stage'|'prod'];


const SLUG = 'gun-certs-app';
const BUNDLE = {
  dev: 'com.ureondigital.guncerts.dev',
  stage: 'com.ureondigital.guncerts.stage',
  prod: 'com.ureondigital.guncerts'
}[APP_ENV as 'dev'|'stage'|'prod'];

const ANDROID_PKG = BUNDLE.replace('com.', 'com.');

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: NAME,
  slug: SLUG,
  scheme: SCHEME_NAME,
  version: APP_VERSION,
  orientation: 'portrait', // portrait | landscape | default
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'automatic', // light | dark | automatic
  newArchEnabled: true,
  plugins: (() => {
    const base: (string | [string, any])[] = [
      'expo-router',
      'expo-font',
      'expo-web-browser',
      'expo-secure-store',
      'expo-sqlite',
      [
        'expo-dev-client',
        {
          android: { package: ANDROID_PKG },
          ios: {
            bundleIdentifier: BUNDLE,
            buildNumber: BUILD,
            deploymentTarget: '15.6',
          },
        },
      ],
      ['expo-build-properties', { ios: { deploymentTarget: '15.6', buildReactNativeFromSource: true } }],
      ['./plugins/android-ndk-version.js', { ndkVersion: '28.0.13004108' }],
      './plugins/android-permissions-cleanup.js',
      './plugins/android-release-signing.js',
    ];
    try {
      require.resolve('@react-native-ml-kit/barcode-scanning/app.plugin.js');
      base.push('@react-native-ml-kit/barcode-scanning');
    } catch {
      // Library has no config plugin; rely on React Native autolinking.
    }
    try {
      // Only include OCR plugin if the package ships one.
      require.resolve('expo-mlkit-ocr/app.plugin.js');
      base.push('expo-mlkit-ocr');
    } catch {
      // expo-mlkit-ocr currently exposes only JS APIs; no config plugin to load.
    }
    return base;
  })(),
  updates: { 
    enabled: true,
    url: 'https://u.expo.dev/e61a2265-9431-4874-a066-2dc43b82c3b1'
  },
  ios: ({
    appleTeamId: "6WJR2G5WSK",
    supportsTablet: false,
    bundleIdentifier: BUNDLE,
    buildNumber: BUILD,
    useFrameworks: 'static',
    splash: {
      image: './assets/images/splash-icon-ios.png',
      resizeMode: 'contain',
      backgroundColor: '#f2f4f7',
    },
    infoPlist: {
      NSCameraUsageDescription: 'Capture documents for your application.',
      NSPhotoLibraryUsageDescription: 'Choose existing photos or scanned certificates.',
      NSPhotoLibraryAddUsageDescription: 'Save captured certificates to your photo library.',
      NSFaceIDUsageDescription: 'Unlock the app with Face ID.',
      ITSAppUsesNonExemptEncryption: false
    }
  } as ExpoConfig['ios']),
  android: {
    package: ANDROID_PKG,
    permissions: [],
    edgeToEdgeEnabled: true,
    splash: {
      image: './assets/images/splash-icon-android.png',
      resizeMode: 'contain',
      backgroundColor: '#f2f4f7',
    },
    versionCode: ANDROID_BUILD,   // MUST be higher than the last upload
},
  // Ensure `extra.eas` exists so EAS CLI can write `projectId`
  extra: { 
    APP_ENV,
    complianceNoticeTrigger: COMPLIANCE_NOTICE_TRIGGER,
    tabs: {
      firearms: {
        label: 'Vault',
        icon: 'shield-checkmark-outline',
      },
    },
    router: {},
    eas: {
      projectId: 'e61a2265-9431-4874-a066-2dc43b82c3b1'
    } as any 
  },
  experiments: {
    typedRoutes: true,
  },
  owner: 'leonvissie',
  runtimeVersion: {
    policy: 'appVersion'
  }
});
