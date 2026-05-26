import { Redirect } from 'expo-router';

import { useAppBootstrap } from '@/foundation/services/bootstrap/AppBootstrapProvider';
import { useAppLock } from '@/foundation/services/security/AppLockProvider';

export default function IndexRoute() {
  const { isReady, hasCompletedOnboarding } = useAppBootstrap();
  const { isLocked, requiresPinSetup } = useAppLock();

  if (!isReady) return null;

  if (requiresPinSetup) {
    return <Redirect href="/pin-setup" />;
  }
  if (isLocked) {
    return <Redirect href="/unlock" />;
  }
  if (!hasCompletedOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)/home" />;
}
