import { Redirect, Stack } from 'expo-router';
import { useLock } from '../../src/providers/LockProvider';

export default function AuthLayout() {
  const { state } = useLock();

  if (state === 'checking') {
    return null;
  }

  if (state === 'unlocked') {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'none',
        freezeOnBlur: true,
        contentStyle: { backgroundColor: 'transparent' },
      }}
    />
  );
}
