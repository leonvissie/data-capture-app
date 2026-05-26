import { Redirect } from 'expo-router';

import { PrimaryButton } from '@/foundation/components/buttons/PrimaryButton';
import { AppScreen } from '@/foundation/components/layout/AppScreen';
import { AppText } from '@/foundation/components/layout/AppText';
import { useAppBootstrap } from '@/foundation/services/bootstrap/AppBootstrapProvider';

export default function OnboardingScreen() {
  const { isReady, hasCompletedOnboarding, completeOnboarding } = useAppBootstrap();

  if (!isReady) return null;
  if (hasCompletedOnboarding) return <Redirect href="/(tabs)/home" />;

  return (
    <AppScreen>
      <AppText variant="pageTitle">Welcome</AppText>
      <AppText>First-load setup goes here. Complete onboarding to continue.</AppText>
      <PrimaryButton label="Complete Onboarding" onPress={() => void completeOnboarding()} />
    </AppScreen>
  );
}
