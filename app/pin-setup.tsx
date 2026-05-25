import { Redirect } from 'expo-router';

import { PasscodePad } from '@/foundation/components/forms/PasscodePad';
import { AppScreen } from '@/foundation/components/layout/AppScreen';
import { AuthPinScreen } from '@/foundation/components/layout/AuthPinScreen';
import { usePinSetupFlow } from '@/foundation/hooks/security/usePinSetupFlow';
import { useAppLock } from '@/foundation/services/security/AppLockProvider';

export default function PinSetupScreen() {
  const { requiresPinSetup } = useAppLock();
  const { step, firstPin, confirmPin, setFirstPin, setConfirmPin, notice, onCreateComplete, onConfirmComplete } = usePinSetupFlow();

  if (!requiresPinSetup) return <Redirect href="/(tabs)/home" />;

  return (
    <AppScreen>
      <AuthPinScreen
        title="Set PIN"
        subtitle="Create a 6-digit PIN to secure local data."
        stepLabel={step === 'create' ? 'Enter PIN' : 'Confirm PIN'}
        notice={notice}
      >
        {step === 'create' ? (
          <PasscodePad value={firstPin} onChange={setFirstPin} onComplete={onCreateComplete} />
        ) : (
          <PasscodePad value={confirmPin} onChange={setConfirmPin} onComplete={(value) => void onConfirmComplete(value)} />
        )}
      </AuthPinScreen>
    </AppScreen>
  );
}
