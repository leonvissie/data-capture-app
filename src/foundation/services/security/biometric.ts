import * as LocalAuthentication from 'expo-local-authentication';

export async function canUseBiometrics(): Promise<boolean> {
  const supported = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return supported && enrolled;
}

export async function promptBiometricUnlock(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock Data Capture App',
    disableDeviceFallback: false,
  });
  return result.success;
}
