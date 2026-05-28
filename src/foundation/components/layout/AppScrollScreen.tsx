import { PropsWithChildren, RefObject } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppScreen } from './AppScreen';
import { componentMetrics, spacing } from '@/foundation/theme';

type AppScrollScreenProps = PropsWithChildren<{
  scrollRef?: RefObject<ScrollView | null>;
}>;

export function AppScrollScreen({ children, scrollRef }: AppScrollScreenProps) {
  const insets = useSafeAreaInsets();
  const tabBarBottomSpace =
    componentMetrics.tabBar.height +
    componentMetrics.tabBar.bottomGap +
    insets.bottom +
    componentMetrics.tabBar.contentBottomClearance;

  return (
    <AppScreen>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: spacing['2xl'] + tabBarBottomSpace }]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
});
