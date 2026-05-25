import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { RoundIconButton } from '@/components/primitives';
import { useSurfacePalette } from '@/providers';
import { spacing, typography } from '@/theme';

type AppModalProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
};

export default function AppModal({ visible, onClose, title, children }: AppModalProps) {
  const palette = useSurfacePalette();

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <SafeAreaProvider>
        <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top', 'left', 'right', 'bottom']}>
          <View style={[styles.sheet, { backgroundColor: palette.background, borderColor: palette.border }]}>
            <View style={[styles.header, { borderBottomColor: palette.border }]} accessibilityRole="header">
              <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
              <RoundIconButton buttonType="close" accessibilityLabel={`Close ${title}`} onPress={onClose} size={38} />
            </View>
            <View style={styles.body}>{children}</View>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  sheet: {
    flex: 1,
    width: '100%',
    borderWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    ...typography.sectionTitle,
  },
  body: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
});
