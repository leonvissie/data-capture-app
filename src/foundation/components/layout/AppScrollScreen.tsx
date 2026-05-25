import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { AppScreen } from './AppScreen';
import { spacing } from '@/foundation/theme';

export function AppScrollScreen({ children }: PropsWithChildren) {
  return (
    <AppScreen>
      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing['2xl'] },
});
