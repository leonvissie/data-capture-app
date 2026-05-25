import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { useThemeMode } from '../providers/ThemeModeProvider';
import { getScrimColor } from '../theme/effects';
import { useTones } from '../theme/tones';

type ProcessingOverlayProps = {
  visible: boolean;
  label?: string;
  progressCurrent?: number;
  progressTotal?: number;
  progressDelayMs?: number;
  progressDisplayCutoffRatio?: number;
};

const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({
  visible,
  label = 'Processing…',
  progressCurrent,
  progressTotal,
  progressDelayMs = 5000,
  progressDisplayCutoffRatio = 0.5,
}) => {
  const tones = useTones();
  const neutral = tones.grey;
  const { effectiveMode } = useThemeMode();
  const [showProgress, setShowProgress] = useState(false);
  const [delayElapsed, setDelayElapsed] = useState(false);
  const [allowProgressDisplay, setAllowProgressDisplay] = useState(false);
  const styles = useMemo(() => createStyles(neutral, getScrimColor(effectiveMode, 0.45)), [effectiveMode, neutral]);
  const hasProgress =
    typeof progressCurrent === 'number' &&
    typeof progressTotal === 'number' &&
    progressTotal > 0 &&
    progressCurrent >= 0;
  const progressRatio = hasProgress ? progressCurrent / progressTotal : null;

  useEffect(() => {
    if (!visible) {
      setDelayElapsed(false);
      setShowProgress(false);
      setAllowProgressDisplay(false);
      return;
    }
    const timer = setTimeout(() => {
      setDelayElapsed(true);
    }, Math.max(0, progressDelayMs));
    return () => {
      clearTimeout(timer);
    };
  }, [progressDelayMs, visible]);

  useEffect(() => {
    if (!visible || !delayElapsed) {
      setShowProgress(false);
      return;
    }

    if (hasProgress && !allowProgressDisplay) {
      setAllowProgressDisplay(
        progressCurrent >= progressTotal ||
          (progressRatio !== null && progressRatio < Math.max(0, progressDisplayCutoffRatio))
      );
    }
  }, [
    allowProgressDisplay,
    delayElapsed,
    hasProgress,
    progressCurrent,
    progressDisplayCutoffRatio,
    progressRatio,
    progressTotal,
    visible,
  ]);

  useEffect(() => {
    setShowProgress(Boolean(visible && delayElapsed && hasProgress && allowProgressDisplay));
  }, [allowProgressDisplay, delayElapsed, hasProgress, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ActivityIndicator size="large" color={tones.teal.base} />
          <Text style={styles.label}>{label}</Text>
          {showProgress && hasProgress ? (
            <Text style={styles.progress}>
              {progressCurrent >= progressTotal
                ? 'Finishing up...'
                : `Page ${Math.min(progressCurrent, progressTotal)}/${progressTotal}`}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], scrimColor: string) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: scrimColor,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    card: {
      width: '100%',
      maxWidth: 360,
      borderRadius: 16,
      backgroundColor: neutral.onBase,
      paddingVertical: 20,
      paddingHorizontal: 16,
      alignItems: 'center',
      gap: 12,
    },
    label: {
      color: neutral.onSurface,
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'center',
    },
    progress: {
      color: neutral.base,
      fontSize: 14,
      fontWeight: '500',
      textAlign: 'center',
    },
  });

export default ProcessingOverlay;
