import { Redirect } from 'expo-router';

import { PasscodePad } from '@/foundation/components/forms/PasscodePad';
import { SecondaryButton } from '@/foundation/components/buttons/SecondaryButton';
import { AppScreen } from '@/foundation/components/layout/AppScreen';
import { AuthPinScreen } from '@/foundation/components/layout/AuthPinScreen';
import { usePinUnlockFlow } from '@/foundation/hooks/security/usePinUnlockFlow';
import { useAppLock } from '@/foundation/services/security/AppLockProvider';

export default function UnlockScreen() {
  const { isLocked, requiresPinSetup } = useAppLock();
  const { pin, setPin, notice, countdown, lockoutRemainingMs, biometricAvailable, onComplete, useBiometrics } = usePinUnlockFlow();

  if (requiresPinSetup) return <Redirect href="/pin-setup" />;
  if (!isLocked) return <Redirect href="/(tabs)/home" />;

  return (
    <AppScreen>
      <AuthPinScreen
        title="Unlock"
        subtitle="Enter your 6-digit PIN."
        notice={countdown ? `Try again in ${countdown}` : notice}
        footer={
          biometricAvailable ? (
            <SecondaryButton label="Use Biometrics" onPress={() => void useBiometrics()} />
          ) : null
        }
      >
        <PasscodePad value={pin} onChange={setPin} onComplete={(value) => void onComplete(value)} disabled={lockoutRemainingMs > 0} />
      </AuthPinScreen>
    </AppScreen>
  );
}
