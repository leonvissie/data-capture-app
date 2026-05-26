import { deleteSecureValue, getSecureValue, setSecureValue } from './secureStore';

const PIN_KEY = 'security.pin';
const FAIL_COUNT_KEY = 'security.failCount';
const LOCKED_UNTIL_KEY = 'security.lockedUntil';

const LOCKOUT_WINDOWS_MINUTES = [1, 5, 15];

export async function hasPinConfigured(): Promise<boolean> {
  const pin = await getSecureValue(PIN_KEY);
  return typeof pin === 'string' && pin.length === 6;
}

export async function setPin(pin: string): Promise<void> {
  if (!/^\d{6}$/.test(pin)) {
    throw new Error('PIN must be exactly 6 digits.');
  }
  await setSecureValue(PIN_KEY, pin);
  await setSecureValue(FAIL_COUNT_KEY, '0');
  await setSecureValue(LOCKED_UNTIL_KEY, '0');
}

export async function clearPinCredentials(): Promise<void> {
  await deleteSecureValue(PIN_KEY);
  await deleteSecureValue(FAIL_COUNT_KEY);
  await deleteSecureValue(LOCKED_UNTIL_KEY);
}

export async function verifyPin(pin: string): Promise<{ success: boolean; lockedUntil: number }> {
  const lockedUntil = Number((await getSecureValue(LOCKED_UNTIL_KEY)) ?? '0');
  const now = Date.now();
  if (lockedUntil > now) {
    return { success: false, lockedUntil };
  }

  const storedPin = await getSecureValue(PIN_KEY);
  if (!storedPin) {
    return { success: false, lockedUntil: 0 };
  }

  if (storedPin === pin) {
    await setSecureValue(FAIL_COUNT_KEY, '0');
    await setSecureValue(LOCKED_UNTIL_KEY, '0');
    return { success: true, lockedUntil: 0 };
  }

  const nextFailCount = Number((await getSecureValue(FAIL_COUNT_KEY)) ?? '0') + 1;
  await setSecureValue(FAIL_COUNT_KEY, String(nextFailCount));

  if (nextFailCount % 5 === 0) {
    const level = Math.min(Math.floor(nextFailCount / 5) - 1, LOCKOUT_WINDOWS_MINUTES.length - 1);
    const nextLockedUntil = now + LOCKOUT_WINDOWS_MINUTES[level] * 60_000;
    await setSecureValue(LOCKED_UNTIL_KEY, String(nextLockedUntil));
    return { success: false, lockedUntil: nextLockedUntil };
  }

  return { success: false, lockedUntil: 0 };
}
