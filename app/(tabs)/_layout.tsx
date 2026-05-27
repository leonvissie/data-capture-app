import { Redirect, Tabs } from 'expo-router';

import { AppTabBar } from '@/foundation/components';
import { useAppLock } from '@/foundation/services/security/AppLockProvider';

export default function TabLayout() {
  const { isLocked, requiresPinSetup } = useAppLock();

  if (requiresPinSetup) return <Redirect href="/pin-setup" />;
  if (isLocked) return <Redirect href="/unlock" />;

  return (
    <Tabs tabBar={(props) => <AppTabBar {...props} />} screenOptions={{ headerShown: false }} initialRouteName="home">
      <Tabs.Screen name="insights" options={{ title: 'Insights' }} />
      <Tabs.Screen name="home" options={{ title: 'Capture' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
