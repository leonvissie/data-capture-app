import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTones } from '../theme/tones';
import { useThemeMode } from '../providers/ThemeModeProvider';
import { getScrimColor } from '../theme/effects';
import { IconRoundButton } from './RoundIconButton';
import HelpTopicContent from './HelpTopicContent';
import { getHelpTopic } from '../help/helpContent';

type HelpModalProps = {
  visible: boolean;
  topicKey?: string | null;
  onClose: () => void;
  accessibilityLabel?: string;
  testID?: string;
  disabled?: boolean;
};

const HelpModal: React.FC<HelpModalProps> = ({
  visible,
  topicKey,
  onClose,
  accessibilityLabel = 'Help information',
  testID,
  disabled = false,
}) => {
  const tones = useTones();
  const { effectiveMode } = useThemeMode();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(tones, getScrimColor(effectiveMode, 0.45)), [effectiveMode, tones]);
  const topic = useMemo(() => getHelpTopic(topicKey ?? undefined), [topicKey]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
      hardwareAccelerated
    >
      <View style={styles.overlay}>
        <SafeAreaView style={styles.modalShell} edges={['top']}>
          <View
            style={[
              styles.modalContainer,
              { backgroundColor: tones.grey.onBase, borderColor: tones.grey.border },
            ]}
            accessibilityViewIsModal
            accessibilityLabel={accessibilityLabel}
            testID={testID}
          >
            <View style={[styles.header, { borderBottomColor: tones.grey.border }]}>
              <Text style={[styles.heading, { color: tones.grey.onSurface }]}>
                {topic?.heading ?? 'Help unavailable'}
              </Text>
              <IconRoundButton
                buttonType="close"
                accessibilityLabel="Close help"
                variant="ghost"
                size="sm"
                borderColor={tones.grey.base}
                onPress={onClose}
                hitSlop={12}
              />
            </View>

            <ScrollView
              style={styles.scrollContainer}
              contentContainerStyle={styles.scrollContent}
              bounces={false}
              showsVerticalScrollIndicator={false}
            >
              <HelpTopicContent sections={topic?.sections ?? []} disabled={disabled} />
            </ScrollView>

            <View
              style={[
                styles.footer,
                { borderTopColor: tones.grey.border, paddingBottom: 14 + insets.bottom },
              ]}
            >
              {/* <Text style={[styles.footerLabel, { color: palette.paragraph }]}>
                Last updated: {meta.lastUpdated}
              </Text> */}
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const createStyles = (tones: ReturnType<typeof useTones>, scrimColor: string) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: scrimColor,
      justifyContent: 'flex-start',
    },
    modalShell: {
      flex: 1,
      justifyContent: 'flex-start',
    },
    modalContainer: {
      flex: 1,
      marginTop: Platform.OS === 'ios' ? 54 : 24,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingTop: 24,
      paddingBottom: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    heading: {
      fontSize: 22,
      fontWeight: '800',
      flex: 1,
      marginRight: 12,
    },
    scrollContainer: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 24,
      paddingVertical: 16,
    },
    footer: {
      paddingHorizontal: 24,
      paddingVertical: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    footerLabel: {
      fontSize: 12,
      textAlign: 'center',
    },
  });

export default HelpModal;
