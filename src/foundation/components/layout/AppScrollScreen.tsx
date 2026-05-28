import { PropsWithChildren, RefObject } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { AppScreen } from './AppScreen';
import { spacing } from '@/foundation/theme';

type AppScrollScreenProps = PropsWithChildren<{
  scrollRef?: RefObject<ScrollView | null>;
}>;

export function AppScrollScreen({ children, scrollRef }: AppScrollScreenProps) {
  return (
    <AppScreen>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        {children}
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing['2xl'] },
});
