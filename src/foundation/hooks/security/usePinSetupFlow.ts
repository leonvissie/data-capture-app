import { useState } from 'react';

import { useAppLock } from '@/foundation/services/security/AppLockProvider';

export function usePinSetupFlow() {
  const { setPin } = useAppLock();
  const [step, setStep] = useState<'create' | 'confirm'>('create');
  const [firstPin, setFirstPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  function onCreateComplete(value: string) {
    setFirstPin(value);
    setConfirmPin('');
    setStep('confirm');
  }

  async function onConfirmComplete(value: string) {
    if (value !== firstPin) {
      setNotice('PINs do not match. Try again.');
      setFirstPin('');
      setConfirmPin('');
      setStep('create');
      return;
    }
    await setPin(value);
  }

  return {
    step,
    firstPin,
    confirmPin,
    setFirstPin,
    setConfirmPin,
    notice,
    onCreateComplete,
    onConfirmComplete,
  };
}
