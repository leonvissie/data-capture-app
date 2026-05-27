import { Modal, StyleSheet, View } from 'react-native';

import { AppText } from '@/foundation/components/layout/AppText';
import { useSurfacePalette } from '@/foundation/hooks/useThemeMode';
import { spacing } from '@/foundation/theme';

type AppModalProps = {
  visible: boolean;
  title: string;
  onRequestClose: () => void;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
};

export function AppModal({ visible, title, onRequestClose, children, headerRight }: AppModalProps) {
  const palette = useSurfacePalette();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onRequestClose}>
      <View style={[styles.container, { backgroundColor: palette.background }]}>
        <View style={styles.headerRow}>
          <AppText variant="sectionTitle" style={styles.title}>
            {title}
          </AppText>
          <View style={styles.headerRight}>{headerRight}</View>
        </View>
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  headerRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    flex: 1,
  },
  headerRight: {
    marginLeft: spacing.sm,
    minHeight: 48,
    justifyContent: 'center',
  },
});
