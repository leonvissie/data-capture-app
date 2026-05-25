import { AppScreen } from '@/foundation/components/layout/AppScreen';
import { AppText } from '@/foundation/components/layout/AppText';
import { PrimaryButton } from '@/foundation/components/buttons/PrimaryButton';

export function TodayScreen() {
  return (
    <AppScreen>
      <AppText variant="pageTitle">Today/Capture</AppText>
      <AppText>Quick capture and today summary live here.</AppText>
      <PrimaryButton label="Open Quick Add" onPress={() => {}} />
    </AppScreen>
  );
}
