import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeMode } from '../providers/ThemeModeProvider';
import { getScrimColor } from '../theme/effects';
import { useTones } from '../theme/tones';

type ProcessingBlockerProps = {
  visible: boolean;
  opacity?: number;
  label?: string;
  showSpinner?: boolean;
  spinnerSize?: 'small' | 'large' | number;
  spinnerColor?: string;
  delayMs?: number;
};

const ProcessingBlocker: React.FC<ProcessingBlockerProps> = ({
  visible,
  opacity = 0.2,
  label = 'Processing...',
  showSpinner = true,
  spinnerSize = 'large',
  spinnerColor,
  delayMs = 200,
}) => {
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral), [neutral]);
  const { effectiveMode } = useThemeMode();
  const [delayedVisible, setDelayedVisible] = React.useState(false);
  const insets = useSafeAreaInsets();
  const resolvedSpinnerColor = spinnerColor ?? tones.teal.base;

  React.useEffect(() => {
    if (!visible) {
      setDelayedVisible(false);
      return;
    }
    const timer = setTimeout(() => setDelayedVisible(true), Math.max(0, delayMs));
    return () => clearTimeout(timer);
  }, [delayMs, visible]);

  if (!visible && !delayedVisible) return null;
  if (!delayedVisible) return null;
  return (
    <View
      pointerEvents="auto"
      style={[
        styles.root,
        {
          top: -insets.top,
          bottom: -insets.bottom,
        },
      ]}
    >
      <View style={[styles.backdrop, { backgroundColor: getScrimColor(effectiveMode, opacity) }]} />
      <View style={styles.card}>
        {showSpinner ? <ActivityIndicator size={spinnerSize} color={resolvedSpinnerColor} /> : null}
        {label ? <Text style={styles.label}>{label}</Text> : null}
      </View>
    </View>
  );
};

const createStyles = (neutral: ReturnType<typeof useTones>['grey']) =>
  StyleSheet.create({
    root: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    card: {
      marginHorizontal: 24,
      paddingVertical: 14,
      paddingHorizontal: 18,
      borderRadius: 14,
      backgroundColor: neutral.onBase,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: neutral.onSurface,
      textAlign: 'center',
    },
  });

export default ProcessingBlocker;
