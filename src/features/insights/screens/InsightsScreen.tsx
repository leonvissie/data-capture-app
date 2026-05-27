import { AppScrollScreen } from '@/foundation/components/layout/AppScrollScreen';
import { AppText } from '@/foundation/components/layout/AppText';
import { PageHeader } from '@/foundation/components/layout/PageHeader';

export function InsightsScreen() {
  return (
    <AppScrollScreen>
      <PageHeader title="Insights" subtitle="Understand capture patterns over time." />
      <AppText>Day/Week/Month/Year analytics tables will be added in Phase 2.</AppText>
    </AppScrollScreen>
  );
}
