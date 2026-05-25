import { Redirect } from 'expo-router';

import { useAppLock } from '@/foundation/services/security/AppLockProvider';

export default function IndexRoute() {
  const { isLocked, requiresPinSetup } = useAppLock();

  if (requiresPinSetup) {
    return <Redirect href="/pin-setup" />;
  }
  if (isLocked) {
    return <Redirect href="/unlock" />;
  }
  return <Redirect href="/(tabs)/home" />;
}
