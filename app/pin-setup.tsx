import { Redirect } from 'expo-router';

import { PasscodePad } from '@/foundation/components/forms/PasscodePad';
import { AppScreen } from '@/foundation/components/layout/AppScreen';
import { AppText } from '@/foundation/components/layout/AppText';
import { usePinSetupFlow } from '@/foundation/hooks/security/usePinSetupFlow';
import { useAppLock } from '@/foundation/services/security/AppLockProvider';

export default function PinSetupScreen() {
  const { requiresPinSetup } = useAppLock();
  const { step, firstPin, confirmPin, setFirstPin, setConfirmPin, notice, onCreateComplete, onConfirmComplete } = usePinSetupFlow();

  if (!requiresPinSetup) return <Redirect href="/(tabs)/home" />;

  return (
    <AppScreen>
      <AppText variant="pageTitle">Set PIN</AppText>
      <AppText>Create a 6-digit PIN to secure local data.</AppText>
      {notice ? <AppText>{notice}</AppText> : null}

      {step === 'create' ? (
        <>
          <AppText>Enter PIN</AppText>
          <PasscodePad value={firstPin} onChange={setFirstPin} onComplete={onCreateComplete} />
        </>
      ) : (
        <>
          <AppText>Confirm PIN</AppText>
          <PasscodePad value={confirmPin} onChange={setConfirmPin} onComplete={(value) => void onConfirmComplete(value)} />
        </>
      )}
    </AppScreen>
  );
}
