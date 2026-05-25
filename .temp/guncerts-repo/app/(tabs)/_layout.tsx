import { Redirect, Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import { appConfig } from '../../src/config/appConfig';
import { useTones } from '../../src/theme/tones';
import { useLock } from '../../src/providers/LockProvider';

export default function TabsLayout() {
  const { state } = useLock();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tones = useTones();
  const neutral = tones.grey;
  const tabConfig = appConfig.tabs;
  const firearmsTab = tabConfig.firearms ?? {};
  const firearmsTitle = firearmsTab.label ?? 'Firearms';
  const firearmsIcon = firearmsTab.icon ?? 'shield-outline';

  if (state === 'checking') {
    return null;
  }

  if (state !== 'unlocked') {
    return <Redirect href={state === 'needsSetup' ? '/(auth)/signup' : '/(auth)/login'} />;
  }

  const resetTo = (path: string) => {
    router.replace(path as any);
  };

  return (

    <Tabs
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        sceneStyle: {
          backgroundColor: 'transparent',
        },
        tabBarActiveTintColor: tones.blue.base,
        tabBarInactiveTintColor: neutral.base,
        tabBarStyle: {
          height: 58 + Math.max(insets.bottom, 0) + (Platform.OS === 'android' ? 10 : 0),
          paddingBottom:
            Platform.OS === 'android'
              ? Math.max(insets.bottom + 12, 18)
              : Math.max(insets.bottom - 2, 6),
          paddingTop: Platform.OS === 'android' ? 10 : 6,
          backgroundColor: neutral.onBase,
          borderTopColor: neutral.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            resetTo('/(tabs)');
          },
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" color={color} size={size} />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            resetTo('/(tabs)/profile');
          },
        }}
      />

      <Tabs.Screen
        name="firearms"
        options={{
          title: firearmsTitle,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={firearmsIcon as any} color={color} size={size} />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            resetTo('/(tabs)/firearms');
          },
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" color={color} size={size} />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            resetTo('/(tabs)/settings');
          },
        }}
      />

      {/* <Tabs.Screen
        name="archive"
        options={{
          title: 'Archive',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="archive-outline" color={color} size={size} />
          ),
        }}
      /> */}

      <Tabs.Screen
        name="info"
        options={{
          title: 'Info',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="information-circle-outline" color={color} size={size} />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            resetTo('/(tabs)/info');
          },
        }}
      />
    </Tabs>
  );
}
