import { Redirect, Tabs } from 'expo-router';

import { useAppLock } from '@/foundation/services/security/AppLockProvider';

export default function TabLayout() {
  const { isLocked, requiresPinSetup } = useAppLock();

  if (requiresPinSetup) return <Redirect href="/pin-setup" />;
  if (isLocked) return <Redirect href="/unlock" />;

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" options={{ title: 'Home/Capture' }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights' }} />
      <Tabs.Screen name="trackers" options={{ title: 'Trackers/Setup' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
