import { Redirect } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { PasscodePad } from '@/foundation/components/forms/PasscodePad';
import { AppScreen } from '@/foundation/components/layout/AppScreen';
import { AppText } from '@/foundation/components/layout/AppText';
import { usePinUnlockFlow } from '@/foundation/hooks/security/usePinUnlockFlow';
import { useAppLock } from '@/foundation/services/security/AppLockProvider';
import { spacing } from '@/foundation/theme';

export default function UnlockScreen() {
  const { isLocked, requiresPinSetup } = useAppLock();
  const { pin, setPin, notice, countdown, lockoutRemainingMs, biometricAvailable, onComplete, useBiometrics } = usePinUnlockFlow();

  if (requiresPinSetup) return <Redirect href="/pin-setup" />;
  if (!isLocked) return <Redirect href="/(tabs)/home" />;

  return (
    <AppScreen>
      <AppText variant="pageTitle">Unlock</AppText>
      <AppText>Enter your 6-digit PIN.</AppText>
      {countdown ? <AppText>Try again in {countdown}</AppText> : null}
      {notice ? <AppText>{notice}</AppText> : null}

      <PasscodePad value={pin} onChange={setPin} onComplete={(value) => void onComplete(value)} disabled={lockoutRemainingMs > 0} />

      {biometricAvailable ? (
        <Pressable onPress={() => void useBiometrics()} style={styles.bioBtn} accessibilityRole="button">
          <AppText>Use Biometrics</AppText>
        </Pressable>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  bioBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
});
