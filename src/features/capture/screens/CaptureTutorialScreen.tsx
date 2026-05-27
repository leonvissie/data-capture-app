import { useRouter } from 'expo-router';

import { ActionCard, AppScrollScreen, AppText, PageHeader } from '@/foundation/components';

export function CaptureTutorialScreen() {
  const router = useRouter();

  return (
    <AppScrollScreen>
      <PageHeader
        title="Capture tutorials"
        subtitle="Learn each capture style before creating entries."
        leftAction={{ buttonType: 'back', accessibilityLabel: 'Go back', onPress: () => router.back() }}
      />

      <ActionCard
        title="Measurement capture"
        subtitle="Track single-value entries like counts and numeric readings."
        tone="teal"
        variant="soft"
        onPress={() => router.back()}
        disabled
      />
      <ActionCard
        title="Time capture"
        subtitle="Track durations and timed activities."
        tone="blue"
        variant="soft"
        onPress={() => router.back()}
        disabled
      />
      <ActionCard
        title="Journal capture"
        subtitle="Track notes and free-text entries over time."
        tone="orange"
        variant="soft"
        onPress={() => router.back()}
        disabled
      />
      <AppText variant="bodySmall">Detailed guided walkthrough steps will be connected to the shared tour model next.</AppText>
    </AppScrollScreen>
  );
}
