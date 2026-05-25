import { useMemo, useState } from 'react';

import { useAppLock } from '@/foundation/services/security/AppLockProvider';

export function usePinUnlockFlow() {
  const { lockoutRemainingMs, unlockWithPin, unlockWithBiometrics, biometricAvailable } = useAppLock();
  const [pin, setPin] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const countdown = useMemo(() => {
    if (!lockoutRemainingMs) return null;
    const seconds = Math.ceil(lockoutRemainingMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }, [lockoutRemainingMs]);

  async function submitPin(nextPin: string) {
    const ok = await unlockWithPin(nextPin);
    if (!ok) {
      setPin('');
      setNotice('Incorrect PIN.');
      return;
    }
    setNotice(null);
  }

  return {
    pin,
    setPin,
    notice,
    countdown,
    biometricAvailable,
    lockoutRemainingMs,
    onComplete: submitPin,
    useBiometrics: unlockWithBiometrics,
  };
}
