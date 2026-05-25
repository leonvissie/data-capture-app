import { Modal, StyleSheet, View } from 'react-native';

import { AppText } from '@/foundation/components/layout/AppText';
import { useSurfacePalette } from '@/foundation/hooks/useThemeMode';
import { spacing } from '@/foundation/theme';

type AppModalProps = {
  visible: boolean;
  title: string;
  onRequestClose: () => void;
  children: React.ReactNode;
};

export function AppModal({ visible, title, onRequestClose, children }: AppModalProps) {
  const palette = useSurfacePalette();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onRequestClose}>
      <View style={[styles.container, { backgroundColor: palette.background }]}> 
        <AppText variant="sectionTitle">{title}</AppText>
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
});
