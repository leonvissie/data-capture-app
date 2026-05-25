import { AppScreen } from '@/foundation/components/layout/AppScreen';
import { AppText } from '@/foundation/components/layout/AppText';

export function SettingsScreen() {
  return (
    <AppScreen>
      <AppText variant="pageTitle">Settings</AppText>
      <AppText>Security, lock behavior, and export settings will be configured here.</AppText>
    </AppScreen>
  );
}
